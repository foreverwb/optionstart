from datetime import date

from fastapi import APIRouter, HTTPException, Query

from models.schemas import Expiry, OptionChainResponse, SnapshotRequest, SnapshotResponse
from services.futu_client import FutuUnavailableError
from services.option_service import OptionServiceError, option_service


router = APIRouter(prefix="/api/options", tags=["options"])


@router.get("/{ticker}/expiries", response_model=list[Expiry])
async def get_expiries(ticker: str) -> list[Expiry]:
    try:
        return await option_service.get_expiries(ticker)
    except FutuUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/{ticker}/chain", response_model=OptionChainResponse)
async def get_chain(ticker: str, expiry: date = Query()) -> OptionChainResponse:
    try:
        return await option_service.get_chain(ticker, expiry)
    except FutuUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except OptionServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/snapshot", response_model=SnapshotResponse)
async def get_snapshot(payload: SnapshotRequest) -> SnapshotResponse:
    try:
        return await option_service.get_snapshot(payload.codes)
    except FutuUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except OptionServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
