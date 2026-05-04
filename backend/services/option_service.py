from datetime import date, datetime, timezone

from config import get_settings
from models.schemas import Expiry, OptionChainResponse, OptionContract, SnapshotQuote, SnapshotResponse
from services.cache_service import cache_service
from services.futu_client import FutuUnavailableError, futu_client, normalize_ticker


class OptionServiceError(ValueError):
    pass


class OptionService:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def get_expiries(self, ticker: str) -> list[Expiry]:
        rows = await futu_client.get_expiries(ticker)
        today = date.today()
        expiries: list[Expiry] = []
        for row in rows:
            raw = row.get("strike_time") or row.get("expiration_date") or row.get("time") or row.get("date")
            expiry = self._parse_date(raw)
            if expiry is None:
                continue
            expiries.append(Expiry(date=expiry, days_to_expiry=(expiry - today).days))
        return sorted(expiries, key=lambda item: item.date)

    async def get_chain(self, ticker: str, expiry: date) -> OptionChainResponse:
        key = f"option_chain:{normalize_ticker(ticker)}:{expiry.isoformat()}"

        async def load() -> list[dict[str, object]]:
            rows = await futu_client.get_option_chain(ticker, expiry.isoformat(), expiry.isoformat())
            return [contract.model_dump(mode="json") for contract in self._contracts_from_rows(ticker, rows)]

        cached_value, cached = await cache_service.get_or_set_json(
            key,
            self.settings.option_chain_ttl_seconds,
            load,
        )
        contracts = [OptionContract.model_validate(item) for item in cached_value]
        contracts = await self._enrich_contracts_with_quotes(contracts)
        return OptionChainResponse(ticker=ticker.upper(), expiry=expiry, contracts=contracts, cached=cached)

    async def get_snapshot(self, codes: list[str]) -> SnapshotResponse:
        if len(codes) > self.settings.max_snapshot_codes:
            raise OptionServiceError(f"Snapshot request exceeds {self.settings.max_snapshot_codes} codes")
        normalized = [normalize_ticker(code) if "." not in code else code.strip().upper() for code in codes]
        key = "snapshot:" + ",".join(sorted(normalized))

        async def load() -> list[dict[str, object]]:
            rows = await futu_client.get_market_snapshot(normalized)
            return [quote.model_dump(mode="json") for quote in self._quotes_from_rows(rows)]

        cached_value, cached = await cache_service.get_or_set_json(
            key,
            self.settings.snapshot_ttl_seconds,
            load,
        )
        quotes = [SnapshotQuote.model_validate(item) for item in cached_value]
        return SnapshotResponse(quotes=quotes, cached=cached)

    def _contracts_from_rows(self, ticker: str, rows: list[dict[str, object]]) -> list[OptionContract]:
        contracts: list[OptionContract] = []
        for row in rows:
            code = str(row.get("code") or row.get("stock_child_name") or "")
            expiry = self._parse_date(row.get("strike_time") or row.get("expiry") or row.get("option_expiry_date"))
            option_type = str(row.get("option_type") or row.get("type") or "").lower()
            if option_type not in {"call", "put"}:
                if "C" in code.rsplit(".", 1)[-1]:
                    option_type = "call"
                elif "P" in code.rsplit(".", 1)[-1]:
                    option_type = "put"
            if expiry is None or option_type not in {"call", "put"}:
                continue
            contracts.append(
                OptionContract(
                    code=code,
                    ticker=ticker.upper(),
                    option_type=option_type,
                    strike_price=self._float(row.get("strike_price") or row.get("strike")),
                    expiry=expiry,
                    lot_size=max(1, self._int(row.get("lot_size") or row.get("lotSize"))),
                    last_price=self._maybe_float(row.get("last_price") or row.get("last")),
                    bid_price=self._maybe_float(row.get("bid_price") or row.get("bid")),
                    ask_price=self._maybe_float(row.get("ask_price") or row.get("ask")),
                    volume=self._maybe_int(row.get("volume")),
                    open_interest=self._maybe_int(row.get("open_interest")),
                    implied_volatility=self._maybe_volatility(row.get("implied_volatility") or row.get("option_implied_volatility")),
                    delta=self._maybe_float(row.get("delta")),
                    gamma=self._maybe_float(row.get("gamma")),
                    vega=self._maybe_float(row.get("vega")),
                    theta=self._maybe_float(row.get("theta")),
                    rho=self._maybe_float(row.get("rho")),
                )
            )
        return contracts

    def _quotes_from_rows(self, rows: list[dict[str, object]]) -> list[SnapshotQuote]:
        return [
            SnapshotQuote(
                code=str(row.get("code", "")),
                last_price=self._maybe_float(row.get("last_price")),
                bid_price=self._maybe_float(row.get("bid_price") or row.get("bid")),
                ask_price=self._maybe_float(row.get("ask_price") or row.get("ask")),
                volume=self._maybe_int(row.get("volume")),
                turnover=self._maybe_float(row.get("turnover")),
                implied_volatility=self._maybe_volatility(row.get("implied_volatility") or row.get("option_implied_volatility")),
                delta=self._maybe_float(row.get("delta")),
                gamma=self._maybe_float(row.get("gamma")),
                vega=self._maybe_float(row.get("vega")),
                theta=self._maybe_float(row.get("theta")),
                rho=self._maybe_float(row.get("rho")),
                updated_at=datetime.now(timezone.utc),
            )
            for row in rows
        ]

    async def _enrich_contracts_with_quotes(self, contracts: list[OptionContract]) -> list[OptionContract]:
        codes = [contract.code for contract in contracts if contract.code]
        if not codes:
            return contracts

        quote_rows: list[dict[str, object]] = []
        try:
            for idx in range(0, len(codes), self.settings.max_snapshot_codes):
                quote_rows.extend(await futu_client.get_market_snapshot(codes[idx:idx + self.settings.max_snapshot_codes]))
        except FutuUnavailableError:
            return contracts

        quotes = {quote.code: quote for quote in self._quotes_from_rows(quote_rows)}
        enriched: list[OptionContract] = []
        for contract in contracts:
            quote = quotes.get(contract.code)
            if quote is None:
                enriched.append(contract)
                continue

            updates: dict[str, object] = {}
            for field in (
                "last_price",
                "bid_price",
                "ask_price",
                "volume",
                "implied_volatility",
                "delta",
                "gamma",
                "vega",
                "theta",
                "rho",
            ):
                value = getattr(quote, field)
                if value is not None:
                    updates[field] = value
            enriched.append(contract.model_copy(update=updates))
        return enriched

    @staticmethod
    def _parse_date(value: object) -> date | None:
        if isinstance(value, date):
            return value
        if not isinstance(value, str) or not value:
            return None
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None

    @staticmethod
    def _float(value: object) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    @classmethod
    def _maybe_float(cls, value: object) -> float | None:
        if value in (None, ""):
            return None
        return cls._float(value)

    @classmethod
    def _maybe_volatility(cls, value: object) -> float | None:
        vol = cls._maybe_float(value)
        if vol is None:
            return None
        return vol / 100 if vol > 3 else vol

    @staticmethod
    def _int(value: object) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    @classmethod
    def _maybe_int(cls, value: object) -> int | None:
        if value in (None, ""):
            return None
        return cls._int(value)


option_service = OptionService()
