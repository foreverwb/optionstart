from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from models.db_models import init_db
from routers import options, quotes_ws, stock, strategy
from services.cache_service import cache_service
from services.futu_client import futu_client


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()
    await cache_service.connect()
    await futu_client.connect()
    yield
    await futu_client.close()
    await cache_service.close()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stock.router)
app.include_router(options.router)
app.include_router(strategy.router)
app.include_router(quotes_ws.router)


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "database": "sqlite" if settings.database_url.startswith("sqlite") else settings.database_url,
        "futu_sdk_available": futu_client.is_available(),
    }
