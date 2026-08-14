from fastapi import APIRouter, HTTPException, Query

from models.schemas import HistoryRequest, HistoryResponse, SearchResult, StockQuote
from services.futu_client import FutuUnavailableError, futu_client
from services.history_service import history_service


router = APIRouter(prefix="/api", tags=["stock"])


@router.get("/search", response_model=list[SearchResult])
async def search_stock(q: str = Query(min_length=1, max_length=40)) -> list[SearchResult]:
    try:
        rows = await futu_client.search(q)
    except FutuUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return [SearchResult.model_validate(row) for row in rows]


@router.get("/stock/{ticker}", response_model=StockQuote)
async def get_stock(ticker: str) -> StockQuote:
    try:
        row = await futu_client.get_stock_quote(ticker)
    except FutuUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return StockQuote.model_validate(row)


@router.post("/history", response_model=HistoryResponse)
async def get_history(payload: HistoryRequest) -> HistoryResponse:
    try:
        return await history_service.get_history(payload.codes, payload.timeframe)
    except FutuUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
