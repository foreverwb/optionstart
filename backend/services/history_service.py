from datetime import datetime, timedelta, timezone
import re
from zoneinfo import ZoneInfo

from config import get_settings
from models.schemas import HistoryBar, HistoryResponse, HistorySeries, HistoryTimeframe
from services.cache_service import cache_service
from services.futu_client import FutuUnavailableError, futu_client, normalize_ticker


TIMEFRAME_CONFIG: dict[HistoryTimeframe, tuple[int, str, int, int | None]] = {
    "1d": (7, "K_5M", 500, 1),
    "1w": (12, "K_30M", 500, 5),
    "2w": (24, "K_60M", 500, 10),
    "1m": (45, "K_120M", 500, 22),
    "3m": (110, "K_DAY", 180, 66),
    "all": (1460, "K_DAY", 1000, None),
}


class HistoryService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.market_timezone = ZoneInfo("America/New_York")

    async def get_history(self, codes: list[str], timeframe: HistoryTimeframe) -> HistoryResponse:
        series: list[HistorySeries] = []
        cache_hits: list[bool] = []
        last_error: FutuUnavailableError | None = None
        for raw_code in codes:
            code = self._normalize_code(raw_code)
            try:
                item, cached = await self._get_series(code, timeframe)
                series.append(item)
                cache_hits.append(cached)
            except FutuUnavailableError as exc:
                last_error = exc
                series.append(HistorySeries(code=code, interval=self._interval_for(code, timeframe), bars=[]))
                cache_hits.append(False)

        if not any(item.bars for item in series) and last_error is not None:
            raise last_error
        return HistoryResponse(timeframe=timeframe, series=series, cached=bool(cache_hits) and all(cache_hits))

    async def _get_series(self, code: str, timeframe: HistoryTimeframe) -> tuple[HistorySeries, bool]:
        interval = self._interval_for(code, timeframe)
        key = f"history:{code}:{timeframe}:{interval}"

        async def load() -> dict[str, object]:
            days, _, max_count, trading_days = TIMEFRAME_CONFIG[timeframe]
            end_date = datetime.now(timezone.utc).date()
            start_date = end_date - timedelta(days=days)
            rows = await futu_client.get_history_kline(
                code,
                start_date.isoformat(),
                end_date.isoformat(),
                interval,
                max_count,
            )
            bars = self._bars_from_rows(rows, trading_days)
            return HistorySeries(code=code, interval=interval, bars=bars).model_dump(mode="json")

        value, cached = await cache_service.get_or_set_json(
            key,
            self.settings.history_ttl_seconds,
            load,
        )
        return HistorySeries.model_validate(value), cached

    def _bars_from_rows(self, rows: list[dict[str, object]], trading_days: int | None) -> list[HistoryBar]:
        bars: list[HistoryBar] = []
        for row in rows:
            timestamp = self._parse_timestamp(row.get("time_key"))
            if timestamp is None:
                continue
            open_price = self._float(row.get("open"))
            high = self._float(row.get("high"))
            low = self._float(row.get("low"))
            close = self._float(row.get("close"))
            if min(open_price, high, low, close) < 0:
                continue
            extrema = (open_price, high, low, close)
            bars.append(
                HistoryBar(
                    timestamp=timestamp,
                    open=open_price,
                    high=max(extrema),
                    low=min(extrema),
                    close=close,
                    volume=max(0, self._int(row.get("volume"))),
                )
            )
        bars.sort(key=lambda bar: bar.timestamp)
        if trading_days is None or not bars:
            return bars
        dates = list(dict.fromkeys(bar.timestamp.astimezone(self.market_timezone).date() for bar in bars))
        keep_dates = set(dates[-trading_days:])
        return [bar for bar in bars if bar.timestamp.astimezone(self.market_timezone).date() in keep_dates]

    def _parse_timestamp(self, value: object) -> datetime | None:
        if not isinstance(value, str) or not value:
            return None
        try:
            local = datetime.strptime(value[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=self.market_timezone)
        except ValueError:
            return None
        return local.astimezone(timezone.utc)

    @staticmethod
    def _normalize_code(code: str) -> str:
        normalized = code.strip().upper()
        return normalized if "." in normalized else normalize_ticker(normalized)

    @staticmethod
    def _is_option_code(code: str) -> bool:
        symbol = code.rsplit(".", 1)[-1]
        return re.fullmatch(r"[A-Z.]+\d{6}[CP]\d+", symbol) is not None

    def _interval_for(self, code: str, timeframe: HistoryTimeframe) -> str:
        if self._is_option_code(code):
            return "K_DAY"
        return TIMEFRAME_CONFIG[timeframe][1]

    @staticmethod
    def _float(value: object) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _int(value: object) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0


history_service = HistoryService()
