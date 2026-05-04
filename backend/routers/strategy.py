from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.db_models import Strategy, get_db
from models.schemas import StrategyCreate, StrategyResponse, StrategyUpdate


router = APIRouter(prefix="/api/strategies", tags=["strategy"])


def to_response(strategy: Strategy) -> StrategyResponse:
    return StrategyResponse(
        id=strategy.id,
        name=strategy.name,
        ticker=strategy.ticker,
        stock_price=strategy.stock_price,
        legs=strategy.legs,
        created_at=strategy.created_at,
        updated_at=strategy.updated_at,
    )


@router.get("", response_model=list[StrategyResponse])
def list_strategies(db: Session = Depends(get_db)) -> list[StrategyResponse]:
    rows = db.query(Strategy).order_by(Strategy.updated_at.desc()).all()
    return [to_response(row) for row in rows]


@router.post("", response_model=StrategyResponse, status_code=201)
def create_strategy(payload: StrategyCreate, db: Session = Depends(get_db)) -> StrategyResponse:
    strategy = Strategy(
        name=payload.name,
        ticker=payload.ticker.upper(),
        stock_price=payload.stock_price,
        legs=[leg.model_dump(mode="json") for leg in payload.legs],
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return to_response(strategy)


@router.get("/{strategy_id}", response_model=StrategyResponse)
def get_strategy(strategy_id: int, db: Session = Depends(get_db)) -> StrategyResponse:
    strategy = db.get(Strategy, strategy_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return to_response(strategy)


@router.put("/{strategy_id}", response_model=StrategyResponse)
def update_strategy(
    strategy_id: int,
    payload: StrategyUpdate,
    db: Session = Depends(get_db),
) -> StrategyResponse:
    strategy = db.get(Strategy, strategy_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        strategy.name = updates["name"]
    if "ticker" in updates and updates["ticker"] is not None:
        strategy.ticker = updates["ticker"].upper()
    if "stock_price" in updates:
        strategy.stock_price = updates["stock_price"]
    if payload.legs is not None:
        strategy.legs = [leg.model_dump(mode="json") for leg in payload.legs]

    db.commit()
    db.refresh(strategy)
    return to_response(strategy)


@router.delete("/{strategy_id}", status_code=204)
def delete_strategy(strategy_id: int, db: Session = Depends(get_db)) -> None:
    strategy = db.get(Strategy, strategy_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    db.delete(strategy)
    db.commit()
