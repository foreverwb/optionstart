import asyncio
import re
from datetime import datetime, timezone
from collections.abc import Callable
from typing import Protocol

from config import get_settings
from services.search_service import compact_ticker, rank_search_rows

try:
    from moomoo import AuType, KLType, Market, OpenQuoteContext, OptionType as FutuOptionType, RET_OK, StockQuoteHandlerBase, SubType
except ImportError:  # pragma: no cover - dependency may be absent in local compile checks
    AuType = None
    KLType = None
    Market = None
    OpenQuoteContext = None
    FutuOptionType = None
    RET_OK = 0
    StockQuoteHandlerBase = None
    SubType = None


class DataFrameLike(Protocol):
    def to_dict(self, orient: str) -> list[dict[str, object]]:
        ...


class FutuUnavailableError(RuntimeError):
    pass


if StockQuoteHandlerBase is not None:
    class QuoteHandler(StockQuoteHandlerBase):
        def __init__(self, on_rows: Callable[[list[dict[str, object]]], None]) -> None:
            super().__init__()
            self.on_rows = on_rows

        def on_recv_rsp(self, rsp_pb: object) -> tuple[int, object]:
            ret, data = super().on_recv_rsp(rsp_pb)
            if ret == RET_OK:
                self.on_rows(FutuClient._rows_or_raise(ret, data))
            return ret, data
else:
    QuoteHandler = None


def normalize_ticker(ticker: str) -> str:
    symbol = ticker.strip().upper()
    return symbol if "." in symbol else f"US.{symbol}"


class FutuClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.quote_ctx: object | None = None

    def is_available(self) -> bool:
        return OpenQuoteContext is not None

    async def connect(self) -> None:
        if not self.settings.futu_connect_on_startup:
            return
        self.ensure_context()

    async def close(self) -> None:
        if self.quote_ctx is not None and hasattr(self.quote_ctx, "close"):
            self.quote_ctx.close()
        self.quote_ctx = None

    def ensure_context(self) -> object:
        if OpenQuoteContext is None:
            raise FutuUnavailableError("moomoo SDK is not installed")
        if self.quote_ctx is None:
            self.quote_ctx = OpenQuoteContext(host=self.settings.futu_host, port=self.settings.futu_port)
        return self.quote_ctx

    async def search(self, query: str) -> list[dict[str, object]]:
        ctx = self.ensure_context()
        if Market is None:
            raise FutuUnavailableError("moomoo Market enum is unavailable")
        all_rows: list[dict[str, object]] = []
        for sec_type in ("STOCK", "ETF"):
            ret, data = await asyncio.to_thread(ctx.get_stock_basicinfo, Market.US, sec_type)
            all_rows.extend(self._rows_or_raise(ret, data))
        return rank_search_rows(all_rows, query)

    async def get_stock_quote(self, ticker: str) -> dict[str, object]:
        code = normalize_ticker(ticker)
        quotes = await self.get_market_snapshot([code])
        if not quotes:
            raise FutuUnavailableError(f"No quote returned for {code}")
        row = quotes[0]
        return {
            "ticker": compact_ticker(code),
            "code": code,
            "name": row.get("name"),
            "last_price": self._float(row.get("last_price")),
            "open_price": self._maybe_float(row.get("open_price")),
            "high_price": self._maybe_float(row.get("high_price")),
            "low_price": self._maybe_float(row.get("low_price")),
            "prev_close_price": self._maybe_float(row.get("prev_close_price")),
            "volume": self._maybe_int(row.get("volume")),
            "turnover": self._maybe_float(row.get("turnover")),
            "updated_at": datetime.now(timezone.utc),
        }

    async def get_expiries(self, ticker: str) -> list[dict[str, object]]:
        ctx = self.ensure_context()
        code = normalize_ticker(ticker)
        ret, data = await asyncio.to_thread(ctx.get_option_expiration_date, code=code)
        rows = self._rows_or_raise(ret, data)
        return rows

    async def get_option_chain(self, ticker: str, start: str, end: str) -> list[dict[str, object]]:
        ctx = self.ensure_context()
        code = normalize_ticker(ticker)
        option_type = FutuOptionType.ALL if FutuOptionType is not None else None
        ret, data = await asyncio.to_thread(ctx.get_option_chain, code=code, start=start, end=end, option_type=option_type)
        return self._rows_or_raise(ret, data)

    async def get_market_snapshot(self, codes: list[str]) -> list[dict[str, object]]:
        ctx = self.ensure_context()
        ret, data = await asyncio.to_thread(ctx.get_market_snapshot, codes)
        return self._rows_or_raise(ret, data)

    async def get_history_kline(
        self,
        code: str,
        start: str,
        end: str,
        interval: str,
        max_count: int,
    ) -> list[dict[str, object]]:
        ctx = self.ensure_context()
        if KLType is None or AuType is None:
            raise FutuUnavailableError("moomoo history enums are unavailable")
        ktype = getattr(KLType, interval, None)
        if ktype is None:
            raise FutuUnavailableError(f"Unsupported history interval: {interval}")
        autype = AuType.NONE if self._is_option_code(code) else AuType.QFQ
        ret, data, _ = await asyncio.to_thread(
            ctx.request_history_kline,
            code=code,
            start=start,
            end=end,
            ktype=ktype,
            autype=autype,
            max_count=max_count,
            extended_time=False,
        )
        return self._rows_or_raise(ret, data)

    async def subscribe_quotes(self, codes: list[str]) -> None:
        ctx = self.ensure_context()
        if SubType is None:
            raise FutuUnavailableError("moomoo SubType enum is unavailable")
        ret, data = await asyncio.to_thread(ctx.subscribe, codes, [SubType.QUOTE], True)
        self._rows_or_raise(ret, data)

    async def unsubscribe_quotes(self, codes: list[str]) -> None:
        if not codes or self.quote_ctx is None:
            return
        if SubType is None:
            raise FutuUnavailableError("moomoo SubType enum is unavailable")
        ret, data = await asyncio.to_thread(self.quote_ctx.unsubscribe, codes, [SubType.QUOTE])
        self._rows_or_raise(ret, data)

    def set_quote_callback(self, on_rows: Callable[[list[dict[str, object]]], None]) -> None:
        ctx = self.ensure_context()
        if QuoteHandler is None:
            raise FutuUnavailableError("moomoo StockQuoteHandlerBase is unavailable")
        ctx.set_handler(QuoteHandler(on_rows))

    @staticmethod
    def _rows_or_raise(ret: int, data: object) -> list[dict[str, object]]:
        if ret != RET_OK:
            raise FutuUnavailableError(str(data))
        if hasattr(data, "to_dict"):
            return data.to_dict("records")
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        return []

    @staticmethod
    def _float(value: object) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    @classmethod
    def _maybe_float(cls, value: object) -> float | None:
        if value is None:
            return None
        return cls._float(value)

    @staticmethod
    def _maybe_int(value: object) -> int | None:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _is_option_code(code: str) -> bool:
        symbol = code.rsplit(".", 1)[-1]
        return re.fullmatch(r"[A-Z.]+\d{6}[CP]\d+", symbol) is not None


futu_client = FutuClient()
