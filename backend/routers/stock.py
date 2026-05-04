from fastapi import APIRouter, HTTPException, Query

from models.schemas import SearchResult, StockQuote
from services.futu_client import FutuUnavailableError, futu_client


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
