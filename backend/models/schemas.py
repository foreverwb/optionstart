from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


OptionType = Literal["call", "put"]
PositionSide = Literal["long", "short"]
SavedTradeStatus = Literal["active", "expired", "closed"]
HistoryTimeframe = Literal["1d", "1w", "2w", "1m", "3m", "all"]


class ErrorResponse(BaseModel):
    detail: str


class SearchResult(BaseModel):
    ticker: str
    name: str
    market: str = "US"


class StockQuote(BaseModel):
    ticker: str
    code: str
    name: str | None = None
    last_price: float = Field(ge=0)
    open_price: float | None = None
    high_price: float | None = None
    low_price: float | None = None
    prev_close_price: float | None = None
    volume: int | None = None
    turnover: float | None = None
    updated_at: datetime


class HistoryBar(BaseModel):
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int = 0


class HistorySeries(BaseModel):
    code: str
    interval: str
    bars: list[HistoryBar]


class HistoryRequest(BaseModel):
    codes: list[str] = Field(min_length=1, max_length=20)
    timeframe: HistoryTimeframe

    @field_validator("codes")
    @classmethod
    def normalize_codes(cls, value: list[str]) -> list[str]:
        codes = list(dict.fromkeys(code.strip().upper() for code in value if code.strip()))
        if not codes:
            raise ValueError("At least one non-empty code is required")
        return codes


class HistoryResponse(BaseModel):
    timeframe: HistoryTimeframe
    series: list[HistorySeries]
    cached: bool


class Expiry(BaseModel):
    date: date
    days_to_expiry: int


class OptionContract(BaseModel):
    code: str
    ticker: str
    option_type: OptionType
    strike_price: float
    expiry: date
    lot_size: int = Field(gt=0)
    last_price: float | None = None
    bid_price: float | None = None
    ask_price: float | None = None
    volume: int | None = None
    open_interest: int | None = None
    implied_volatility: float | None = None
    delta: float | None = None
    gamma: float | None = None
    vega: float | None = None
    theta: float | None = None
    rho: float | None = None


class OptionChainResponse(BaseModel):
    ticker: str
    expiry: date
    contracts: list[OptionContract]
    cached: bool


class SnapshotRequest(BaseModel):
    codes: list[str] = Field(min_length=1, max_length=400)

    @field_validator("codes")
    @classmethod
    def strip_codes(cls, value: list[str]) -> list[str]:
        codes = [code.strip() for code in value if code.strip()]
        if not codes:
            raise ValueError("At least one non-empty code is required")
        return codes


class SnapshotQuote(BaseModel):
    code: str
    last_price: float | None = None
    bid_price: float | None = None
    ask_price: float | None = None
    volume: int | None = None
    turnover: float | None = None
    implied_volatility: float | None = None
    delta: float | None = None
    gamma: float | None = None
    vega: float | None = None
    theta: float | None = None
    rho: float | None = None
    updated_at: datetime


class SnapshotResponse(BaseModel):
    quotes: list[SnapshotQuote]
    cached: bool


class StrategyLeg(BaseModel):
    id: str
    contract_code: str | None = None
    option_type: OptionType
    direction: PositionSide
    quantity: int = Field(ge=1)
    strike_price: float
    expiry: date
    cost_basis: float = Field(ge=0)
    lot_size: int = Field(gt=0)
    excluded: bool = False


class StrategyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    ticker: str = Field(min_length=1, max_length=20)
    stock_price: float = Field(ge=0)
    legs: list[StrategyLeg]


class StrategyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    ticker: str | None = Field(default=None, min_length=1, max_length=20)
    stock_price: float | None = Field(default=None, ge=0)
    legs: list[StrategyLeg] | None = None


class StrategyResponse(BaseModel):
    id: int
    name: str
    ticker: str
    stock_price: float
    legs: list[StrategyLeg]
    created_at: datetime
    updated_at: datetime


class SavedTradeLeg(BaseModel):
    id: str
    option_type: OptionType
    direction: PositionSide
    quantity: int = Field(ge=1)
    strike: float
    expiry: date
    cost_basis: float = Field(ge=0)
    iv: float = Field(ge=0)
    lot_size: int = Field(gt=0)
    excluded: bool = False


class SavedTradeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    ticker: str = Field(max_length=20)
    strategy_name: str = Field(min_length=1, max_length=120)
    legs: list[SavedTradeLeg]
    stock_price: float = Field(ge=0)
    expiry: date | None = None
    status: SavedTradeStatus
    cost_basis: float
    max_profit: float | None = None
    max_loss: float | None = None
    unrealized_pnl: float
    return_pct: float


class SavedTradeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    ticker: str | None = Field(default=None, max_length=20)
    strategy_name: str | None = Field(default=None, min_length=1, max_length=120)
    legs: list[SavedTradeLeg] | None = None
    stock_price: float | None = Field(default=None, ge=0)
    expiry: date | None = None
    status: SavedTradeStatus | None = None
    cost_basis: float | None = None
    max_profit: float | None = None
    max_loss: float | None = None
    unrealized_pnl: float | None = None
    return_pct: float | None = None


class SavedTradeResponse(BaseModel):
    id: str
    name: str
    ticker: str
    strategy_name: str
    legs: list[SavedTradeLeg]
    stock_price: float
    expiry: date | None
    status: SavedTradeStatus
    cost_basis: float
    max_profit: float | None
    max_loss: float | None
    unrealized_pnl: float
    return_pct: float
    created_at: datetime
    updated_at: datetime
