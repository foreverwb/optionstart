import asyncio
from datetime import datetime, timezone

from fastapi import WebSocket

from config import get_settings
from services.futu_client import FutuUnavailableError, futu_client


class RealtimeQuoteService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._clients: dict[str, WebSocket] = {}
        self._subscriptions: dict[str, set[str]] = {}
        self._lock = asyncio.Lock()
        self._handler_installed = False

    async def connect(self, client_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients[client_id] = websocket
            self._subscriptions[client_id] = set()

    async def disconnect(self, client_id: str) -> None:
        async with self._lock:
            old_codes = self._subscriptions.pop(client_id, set())
            self._clients.pop(client_id, None)
            still_needed = self._all_subscribed_codes_locked()

        stale_codes = sorted(old_codes - still_needed)
        if stale_codes:
            try:
                await futu_client.unsubscribe_quotes(stale_codes)
            except FutuUnavailableError:
                pass

    async def update_subscription(self, client_id: str, codes: list[str]) -> None:
        clean_codes = self._clean_codes(codes)
        if len(clean_codes) > self.settings.max_snapshot_codes:
            raise ValueError(f"Subscription exceeds {self.settings.max_snapshot_codes} codes")

        async with self._lock:
            previous = self._subscriptions.get(client_id, set())
            requested = set(clean_codes)
            before_all = self._all_subscribed_codes_locked()
            self._subscriptions[client_id] = requested
            after_all = self._all_subscribed_codes_locked()

        to_unsubscribe = sorted(before_all - after_all)
        to_subscribe = sorted(after_all - before_all)
        if to_unsubscribe:
            await futu_client.unsubscribe_quotes(to_unsubscribe)
        if to_subscribe:
            self._ensure_quote_handler()
            await futu_client.subscribe_quotes(to_subscribe)

    async def push_quote(self, quote: dict[str, object]) -> None:
        code = str(quote.get("code", ""))
        if not code:
            return
        payload = {
            "type": "quote",
            "quote": {
                **quote,
                "timestamp": quote.get("timestamp") or datetime.now(timezone.utc).isoformat(),
            },
        }

        async with self._lock:
            targets = [
                websocket
                for client_id, websocket in self._clients.items()
                if code in self._subscriptions.get(client_id, set())
            ]

        for websocket in targets:
            await websocket.send_json(payload)

    async def send_ping(self, client_id: str) -> None:
        async with self._lock:
            websocket = self._clients.get(client_id)
        if websocket is not None:
            await websocket.send_json({"type": "ping", "ts": int(datetime.now(timezone.utc).timestamp() * 1000)})

    async def send_error(self, client_id: str, message: str) -> None:
        async with self._lock:
            websocket = self._clients.get(client_id)
        if websocket is not None:
            await websocket.send_json({"type": "error", "message": message})

    def _all_subscribed_codes_locked(self) -> set[str]:
        all_codes: set[str] = set()
        for codes in self._subscriptions.values():
            all_codes.update(codes)
        return all_codes

    def _ensure_quote_handler(self) -> None:
        if self._handler_installed:
            return
        loop = asyncio.get_running_loop()

        def on_rows(rows: list[dict[str, object]]) -> None:
            for row in rows:
                quote = self._quote_from_row(row)
                loop.call_soon_threadsafe(lambda payload=quote: asyncio.create_task(self.push_quote(payload)))

        futu_client.set_quote_callback(on_rows)
        self._handler_installed = True

    @classmethod
    def _quote_from_row(cls, row: dict[str, object]) -> dict[str, object]:
        return {
            "code": str(row.get("code", "")),
            "lastPrice": cls._maybe_float(row.get("last_price")),
            "bidPrice": cls._maybe_float(row.get("bid_price") or row.get("bid")),
            "askPrice": cls._maybe_float(row.get("ask_price") or row.get("ask")),
            "volume": cls._maybe_int(row.get("volume")),
            "impliedVolatility": cls._maybe_float(row.get("option_implied_volatility") or row.get("implied_volatility")),
            "delta": cls._maybe_float(row.get("delta")),
            "gamma": cls._maybe_float(row.get("gamma")),
            "vega": cls._maybe_float(row.get("vega")),
            "theta": cls._maybe_float(row.get("theta")),
            "rho": cls._maybe_float(row.get("rho")),
        }

    @staticmethod
    def _maybe_float(value: object) -> float | None:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _maybe_int(value: object) -> int | None:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _clean_codes(codes: list[str]) -> list[str]:
        seen: set[str] = set()
        clean: list[str] = []
        for code in codes:
            normalized = code.strip().upper()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            clean.append(normalized)
        return clean


realtime_quote_service = RealtimeQuoteService()
