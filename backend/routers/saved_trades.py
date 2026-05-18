from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.db_models import SavedTrade, get_db
from models.schemas import SavedTradeCreate, SavedTradeResponse, SavedTradeUpdate


router = APIRouter(prefix="/api/saved-trades", tags=["saved-trades"])


def to_response(trade: SavedTrade) -> SavedTradeResponse:
    return SavedTradeResponse(
        id=trade.id,
        name=trade.name,
        ticker=trade.ticker,
        strategy_name=trade.strategy_name,
        legs=trade.legs,
        stock_price=trade.stock_price,
        expiry=trade.expiry,
        status=trade.status,
        cost_basis=trade.cost_basis,
        max_profit=trade.max_profit,
        max_loss=trade.max_loss,
        unrealized_pnl=trade.unrealized_pnl,
        return_pct=trade.return_pct,
        created_at=trade.created_at,
        updated_at=trade.updated_at,
    )


@router.get("", response_model=list[SavedTradeResponse])
def list_saved_trades(db: Session = Depends(get_db)) -> list[SavedTradeResponse]:
    rows = db.query(SavedTrade).order_by(SavedTrade.updated_at.desc()).all()
    return [to_response(row) for row in rows]


@router.post("", response_model=SavedTradeResponse, status_code=201)
def create_saved_trade(payload: SavedTradeCreate, db: Session = Depends(get_db)) -> SavedTradeResponse:
    trade = SavedTrade(
        id=str(uuid4()),
        name=payload.name,
        ticker=payload.ticker.upper(),
        strategy_name=payload.strategy_name,
        legs=[leg.model_dump(mode="json") for leg in payload.legs],
        stock_price=payload.stock_price,
        expiry=payload.expiry.isoformat() if payload.expiry else None,
        status=payload.status,
        cost_basis=payload.cost_basis,
        max_profit=payload.max_profit,
        max_loss=payload.max_loss,
        unrealized_pnl=payload.unrealized_pnl,
        return_pct=payload.return_pct,
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return to_response(trade)


@router.patch("/{trade_id}", response_model=SavedTradeResponse)
def update_saved_trade(
    trade_id: str,
    payload: SavedTradeUpdate,
    db: Session = Depends(get_db),
) -> SavedTradeResponse:
    trade = db.get(SavedTrade, trade_id)
    if trade is None:
        raise HTTPException(status_code=404, detail="Saved trade not found")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        trade.name = updates["name"]
    if "ticker" in updates:
        trade.ticker = updates["ticker"].upper()
    if "strategy_name" in updates:
        trade.strategy_name = updates["strategy_name"]
    if payload.legs is not None:
        trade.legs = [leg.model_dump(mode="json") for leg in payload.legs]
    if "stock_price" in updates:
        trade.stock_price = updates["stock_price"]
    if "expiry" in updates:
        expiry = updates["expiry"]
        trade.expiry = expiry.isoformat() if expiry else None
    if "status" in updates:
        trade.status = updates["status"]
    if "cost_basis" in updates:
        trade.cost_basis = updates["cost_basis"]
    if "max_profit" in updates:
        trade.max_profit = updates["max_profit"]
    if "max_loss" in updates:
        trade.max_loss = updates["max_loss"]
    if "unrealized_pnl" in updates:
        trade.unrealized_pnl = updates["unrealized_pnl"]
    if "return_pct" in updates:
        trade.return_pct = updates["return_pct"]

    db.commit()
    db.refresh(trade)
    return to_response(trade)


@router.delete("/{trade_id}", status_code=204)
def delete_saved_trade(trade_id: str, db: Session = Depends(get_db)) -> None:
    trade = db.get(SavedTrade, trade_id)
    if trade is None:
        raise HTTPException(status_code=404, detail="Saved trade not found")
    db.delete(trade)
    db.commit()
