from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, JSON, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from config import get_settings


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Strategy(Base):
    __tablename__ = "strategies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    stock_price: Mapped[float] = mapped_column(Float, nullable=False)
    legs: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )


class SavedTrade(Base):
    __tablename__ = "saved_trades"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    strategy_name: Mapped[str] = mapped_column(String(120), nullable=False)
    legs: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False, default=list)
    stock_price: Mapped[float] = mapped_column(Float, nullable=False)
    expiry: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    cost_basis: Mapped[float] = mapped_column(Float, nullable=False)
    max_profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    unrealized_pnl: Mapped[float] = mapped_column(Float, nullable=False)
    return_pct: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
