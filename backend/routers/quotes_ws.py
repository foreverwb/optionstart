import asyncio
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.futu_client import FutuUnavailableError
from services.realtime_quote_service import realtime_quote_service


router = APIRouter(tags=["quotes-websocket"])


def parse_codes(message: object) -> list[str]:
    if not isinstance(message, dict):
        return []
    codes = message.get("codes")
    if not isinstance(codes, list):
        return []
    return [code for code in codes if isinstance(code, str)]


async def heartbeat(client_id: str) -> None:
    while True:
        await asyncio.sleep(30)
        await realtime_quote_service.send_ping(client_id)


@router.websocket("/ws/quotes")
async def quotes_socket(websocket: WebSocket) -> None:
    client_id = str(uuid.uuid4())
    await realtime_quote_service.connect(client_id, websocket)
    heartbeat_task = asyncio.create_task(heartbeat(client_id))

    try:
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict):
                await realtime_quote_service.send_error(client_id, "Invalid message")
                continue

            action = message.get("action")
            if action == "subscribe":
                try:
                    await realtime_quote_service.update_subscription(client_id, parse_codes(message))
                    await websocket.send_json({"type": "subscribed", "codes": parse_codes(message)})
                except (FutuUnavailableError, ValueError) as exc:
                    await realtime_quote_service.send_error(client_id, str(exc))
            elif action == "pong":
                continue
            elif action == "ping":
                await websocket.send_json({"type": "pong", "ts": message.get("ts")})
            else:
                await realtime_quote_service.send_error(client_id, "Unsupported action")
    except WebSocketDisconnect:
        pass
    finally:
        heartbeat_task.cancel()
        await realtime_quote_service.disconnect(client_id)
