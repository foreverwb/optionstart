import asyncio
import logging

from services.futu_client import FutuUnavailableError, futu_client


logger = logging.getLogger(__name__)


async def collect_quotes(codes: list[str], interval_seconds: float = 30.0) -> None:
    while True:
        try:
            await futu_client.get_market_snapshot(codes)
        except FutuUnavailableError as exc:
            logger.warning("quote collection skipped: %s", exc)
        await asyncio.sleep(interval_seconds)
