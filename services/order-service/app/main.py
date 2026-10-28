from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, func, select
from sqlalchemy.orm import Session

from . import cart
from .config import settings
from .db import ORDER_STATUSES, Order, OrderItem, get_session, init_db
from .pricing import compute_totals


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ShopStream Order Service", lifespan=lifespan)
Instrumentator(should_group_status_codes=False, excluded_handlers=["/metrics", "/health", "/ready"]).instrument(
    app
).expose(app, include_in_schema=False)


# ---------------------------------------------------------------- auth context
class User(BaseModel):
    id: str
    role: str = "user"

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def current_user(x_user_id: str | None = Header(default=None), x_user_role: str = Header(default="user")) -> User:
    """Identity is injected by the API gateway after it has verified the JWT."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return User(id=x_user_id, role=x_user_role)


def require_admin(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------------------------------------------------------------- helpers
def _fetch_product(product_id: str) -> dict:
    try:
        resp = httpx.get(f"{settings.product_service_url}/products/{product_id}", timeout=5)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Product service unavailable")
    if resp.status_code == 404 or resp.status_code == 400:
        raise HTTPException(status_code=404, detail="Product not found")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Product service error")
    return resp.json()


def _release_stock(items: list[dict]) -> None:
    try:
        httpx.post(f"{settings.product_service_url}/internal/release", json={"items": items}, timeout=5)
    except httpx.HTTPError:
        print("WARNING: could not release stock, manual reconciliation needed", flush=True)


def _order_dict(o: Order) -> dict:
    return {
        "id": o.id,
        "userId": o.user_id,
        "status": o.status,
        "subtotal": float(o.subtotal),
        "tax": float(o.tax),
        "shipping": float(o.shipping),
        "total": float(o.total),
        "createdAt": o.created_at.isoformat(),
        "items": [
            {"productId": i.product_id, "name": i.name, "image": i.image, "price": float(i.price), "quantity": i.quantity}
            for i in o.items
        ],
    }


# ---------------------------------------------------------------- health
@app.get("/health", include_in_schema=False)
def health():
    return {"status": "ok", "service": "order-service"}


@app.get("/ready", include_in_schema=False)
def ready(db: Session = Depends(get_session)):
    try:
        db.execute(select(1))
        cart.r.ping()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"not ready: {exc.__class__.__name__}")
    return {"status": "ready"}


# ---------------------------------------------------------------- cart (Redis)
class AddItem(BaseModel):
    productId: str = Field(min_length=1, max_length=64)
    quantity: int = Field(default=1, ge=1, le=99)


class UpdateItem(BaseModel):
    quantity: int = Field(ge=1, le=99)


@app.get("/cart")
def get_cart(user: User = Depends(current_user)):
    return cart.serialize(user.id)


@app.post("/cart/items", status_code=201)
def add_to_cart(body: AddItem, user: User = Depends(current_user)):
    # Name, price and image come from the catalog, never from the client.
    product = _fetch_product(body.productId)
    existing = cart.get_item(user.id, body.productId)
    quantity = min((existing["quantity"] if existing else 0) + body.quantity, 99)
    if quantity > product["stock"]:
        raise HTTPException(status_code=409, detail=f"Only {product['stock']} left in stock")
    cart.set_item(
        user.id,
        body.productId,
        {"name": product["name"], "price": product["price"], "image": product.get("image", ""), "quantity": quantity},
    )
    return cart.serialize(user.id)


@app.patch("/cart/items/{product_id}")
def update_cart_item(product_id: str, body: UpdateItem, user: User = Depends(current_user)):
    existing = cart.get_item(user.id, product_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Item not in cart")
    existing["quantity"] = body.quantity
    cart.set_item(user.id, product_id, existing)
    return cart.serialize(user.id)


@app.delete("/cart/items/{product_id}")
def remove_cart_item(product_id: str, user: User = Depends(current_user)):
    cart.remove_item(user.id, product_id)
    return cart.serialize(user.id)


@app.delete("/cart", status_code=204)
def clear_cart(user: User = Depends(current_user)):
    cart.clear(user.id)


# ---------------------------------------------------------------- orders (Postgres)
@app.post("/orders", status_code=201)
def checkout(user: User = Depends(current_user), db: Session = Depends(get_session)):
    items = cart.get_items(user.id)
    if not items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # 1. Atomically reserve stock; the product service returns authoritative prices.
    request_items = [{"productId": i["productId"], "quantity": i["quantity"]} for i in items]
    try:
        resp = httpx.post(f"{settings.product_service_url}/internal/reserve", json={"items": request_items}, timeout=10)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Product service unavailable")
    if resp.status_code == 409:
        raise HTTPException(status_code=409, detail=resp.json().get("error", "Insufficient stock"))
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Could not reserve stock")
    reserved = resp.json()["items"]

    # 2. Persist the order; compensate by releasing stock if the database write fails.
    totals = compute_totals(
        reserved, settings.tax_rate, settings.free_shipping_threshold, settings.shipping_fee
    )
    try:
        order = Order(user_id=user.id, status="pending", **totals)
        order.items = [
            OrderItem(product_id=i["productId"], name=i["name"], image=i.get("image", ""), price=i["price"], quantity=i["quantity"])
            for i in reserved
        ]
        db.add(order)
        db.commit()
    except Exception:
        db.rollback()
        _release_stock(request_items)
        raise HTTPException(status_code=500, detail="Could not create order")

    cart.clear(user.id)
    return _order_dict(order)


@app.get("/orders")
def list_orders(
    all: bool = Query(default=False, description="Admins only: list every user's orders"),
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(current_user),
    db: Session = Depends(get_session),
):
    stmt = select(Order).order_by(Order.created_at.desc()).limit(limit)
    if not (all and user.is_admin):
        stmt = stmt.where(Order.user_id == user.id)
    return [_order_dict(o) for o in db.scalars(stmt).all()]


# Declared before /orders/{order_id} so "stats" is not parsed as an id.
@app.get("/orders/stats")
def order_stats(user: User = Depends(current_user), db: Session = Depends(get_session)):
    """Dashboard numbers: global for admins, personal for everyone else."""
    scope = [] if user.is_admin else [Order.user_id == user.id]
    count, revenue = db.execute(
        select(func.count(Order.id), func.coalesce(func.sum(Order.total), 0)).where(*scope, Order.status != "cancelled")
    ).one()
    by_status = dict(db.execute(select(Order.status, func.count(Order.id)).where(*scope).group_by(Order.status)).all())

    since = datetime.now(timezone.utc) - timedelta(days=6)
    day = func.date_trunc("day", Order.created_at, type_=DateTime(timezone=True))
    rows = db.execute(
        select(day, func.count(Order.id), func.coalesce(func.sum(Order.total), 0))
        .where(*scope, Order.created_at >= since.replace(hour=0, minute=0, second=0, microsecond=0), Order.status != "cancelled")
        .group_by(day)
    ).all()
    per_day = {d.date().isoformat(): (c, float(t)) for d, c, t in rows}
    daily = []
    for n in range(6, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=n)).date().isoformat()
        c, t = per_day.get(d, (0, 0.0))
        daily.append({"date": d, "orders": c, "revenue": t})

    return {
        "scope": "global" if user.is_admin else "user",
        "orders": count,
        "revenue": float(revenue),
        "byStatus": {s: by_status.get(s, 0) for s in ORDER_STATUSES},
        "daily": daily,
    }


@app.get("/orders/{order_id}")
def get_order(order_id: str, user: User = Depends(current_user), db: Session = Depends(get_session)):
    order = db.get(Order, order_id)
    if not order or (order.user_id != user.id and not user.is_admin):
        raise HTTPException(status_code=404, detail="Order not found")
    return _order_dict(order)


class StatusUpdate(BaseModel):
    status: str


@app.patch("/orders/{order_id}/status")
def update_status(order_id: str, body: StatusUpdate, _admin: User = Depends(require_admin), db: Session = Depends(get_session)):
    if body.status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {', '.join(ORDER_STATUSES)}")
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.status = body.status
    db.commit()
    return _order_dict(order)
