import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from .config import settings

engine = create_engine(settings.database_url, pool_size=10, max_overflow=10, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

ORDER_STATUSES = ("pending", "paid", "shipped", "delivered", "cancelled")


class Base(DeclarativeBase):
    pass


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    tax: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    shipping: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (Index("ix_orders_user_created", "user_id", "created_at"),)


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(255))
    image: Mapped[str] = mapped_column(String(512), default="")
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    quantity: Mapped[int] = mapped_column(Integer)

    order: Mapped[Order] = relationship(back_populates="items")


def init_db(retries: int = 30) -> None:
    for attempt in range(1, retries + 1):
        try:
            with engine.begin() as conn:
                # Advisory lock so concurrently starting replicas don't race on create_all.
                conn.execute(text("SELECT pg_advisory_xact_lock(7003)"))
                Base.metadata.create_all(conn)
            return
        except OperationalError as exc:
            print(f"waiting for postgres ({attempt}/{retries}): {exc.__class__.__name__}", flush=True)
            time.sleep(2)
    raise RuntimeError("postgres not reachable")


def get_session():
    with SessionLocal() as session:
        yield session


__all__ = ["Order", "OrderItem", "Session", "SessionLocal", "init_db", "get_session", "ORDER_STATUSES"]
