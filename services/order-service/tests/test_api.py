"""API tests: cart in Redis (real, local), orders in SQLite (in-memory), product service stubbed.

Run with a Redis on REDIS_URL (default redis://localhost:6379); skipped automatically if unreachable.
"""
import httpx
import pytest
import redis as redis_lib
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import cart, main
from app.config import settings
from app.db import Base

try:
    redis_lib.Redis.from_url(settings.redis_url).ping()
except Exception:  # noqa: BLE001
    pytest.skip("redis not available", allow_module_level=True)

PRODUCTS = {
    "p1": {"id": "p1", "name": "Widget", "price": 30.0, "image": "", "stock": 5},
    "p2": {"id": "p2", "name": "Gadget", "price": 80.0, "image": "", "stock": 1},
}
USER = {"X-User-Id": "user-1", "X-User-Role": "user"}
OTHER = {"X-User-Id": "user-2", "X-User-Role": "user"}
ADMIN = {"X-User-Id": "admin-1", "X-User-Role": "admin"}


class FakeResp:
    def __init__(self, status, data):
        self.status_code, self._data = status, data

    def json(self):
        return self._data


@pytest.fixture()
def client(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def _shim_date_trunc(dbapi_conn, _record):  # PostgreSQL's date_trunc('day', ts) for SQLite
        dbapi_conn.create_function("date_trunc", 2, lambda _part, ts: f"{str(ts)[:10]} 00:00:00.000000")

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def override_session():
        with Session() as s:
            yield s

    main.app.dependency_overrides[main.get_session] = override_session
    stock = {k: v["stock"] for k, v in PRODUCTS.items()}
    calls = {"released": []}

    def fake_get(url, timeout=5):
        pid = url.rsplit("/", 1)[-1]
        return FakeResp(200, {**PRODUCTS[pid], "stock": stock[pid]}) if pid in PRODUCTS else FakeResp(404, {})

    def fake_post(url, json=None, timeout=5):
        if url.endswith("/internal/reserve"):
            reserved = []
            for it in json["items"]:
                if stock[it["productId"]] < it["quantity"]:
                    return FakeResp(409, {"error": "insufficient stock"})
                stock[it["productId"]] -= it["quantity"]
                p = PRODUCTS[it["productId"]]
                reserved.append({"productId": it["productId"], "name": p["name"], "price": p["price"], "image": "", "quantity": it["quantity"]})
            return FakeResp(200, {"items": reserved})
        calls["released"].append(json)
        return FakeResp(204, {})

    monkeypatch.setattr(main.httpx, "get", fake_get)
    monkeypatch.setattr(main.httpx, "post", fake_post)
    for u in ("user-1", "user-2"):
        cart.clear(u)
    c = TestClient(main.app)  # no `with`: skip lifespan (init_db needs Postgres)
    c.stock, c.calls = stock, calls
    yield c
    main.app.dependency_overrides.clear()
    for u in ("user-1", "user-2"):
        cart.clear(u)


def test_requires_identity(client):
    assert client.get("/cart").status_code == 401
    assert client.post("/orders").status_code == 401


def test_cart_flow_uses_catalog_price_not_client_price(client):
    r = client.post("/cart/items", json={"productId": "p1", "quantity": 2, "price": 0.01}, headers=USER)
    assert r.status_code == 201
    body = r.json()
    assert body["itemCount"] == 2 and body["subtotal"] == 60.0
    assert client.patch("/cart/items/p1", json={"quantity": 3}, headers=USER).json()["subtotal"] == 90.0
    assert client.delete("/cart/items/p1", headers=USER).json()["itemCount"] == 0


def test_cart_rejects_over_stock_and_unknown_product(client):
    assert client.post("/cart/items", json={"productId": "p2", "quantity": 2}, headers=USER).status_code == 409
    assert client.post("/cart/items", json={"productId": "nope", "quantity": 1}, headers=USER).status_code == 404


def test_carts_are_isolated_per_user(client):
    client.post("/cart/items", json={"productId": "p1", "quantity": 1}, headers=USER)
    assert client.get("/cart", headers=OTHER).json()["itemCount"] == 0


def test_checkout_creates_order_clears_cart_and_computes_totals(client):
    client.post("/cart/items", json={"productId": "p1", "quantity": 2}, headers=USER)  # 60.00 -> shipping applies
    r = client.post("/orders", headers=USER)
    assert r.status_code == 201
    o = r.json()
    assert (o["subtotal"], o["tax"], o["shipping"], o["total"]) == (60.0, 4.8, 7.99, 72.79)
    assert client.get("/cart", headers=USER).json()["itemCount"] == 0
    assert client.stock["p1"] == 3


def test_free_shipping_over_threshold(client):
    client.post("/cart/items", json={"productId": "p1", "quantity": 4}, headers=USER)  # 120
    assert client.post("/orders", headers=USER).json()["shipping"] == 0.0


def test_checkout_empty_cart_is_400(client):
    assert client.post("/orders", headers=USER).status_code == 400


def test_checkout_conflict_when_stock_taken_meanwhile(client):
    client.post("/cart/items", json={"productId": "p2", "quantity": 1}, headers=USER)
    client.stock["p2"] = 0  # someone else buys the last one
    r = client.post("/orders", headers=USER)
    assert r.status_code == 409
    assert client.get("/cart", headers=USER).json()["itemCount"] == 1  # cart kept so the user can adjust


def test_order_access_control(client):
    client.post("/cart/items", json={"productId": "p1", "quantity": 1}, headers=USER)
    oid = client.post("/orders", headers=USER).json()["id"]
    assert client.get(f"/orders/{oid}", headers=USER).status_code == 200
    assert client.get(f"/orders/{oid}", headers=OTHER).status_code == 404
    assert client.get(f"/orders/{oid}", headers=ADMIN).status_code == 200
    assert client.get("/orders", headers=OTHER).json() == []
    assert len(client.get("/orders?all=true", headers=ADMIN).json()) == 1
    assert client.get("/orders?all=true", headers=USER).json()[0]["id"] == oid  # `all` ignored for non-admins


def test_only_admin_can_change_status(client):
    client.post("/cart/items", json={"productId": "p1", "quantity": 1}, headers=USER)
    oid = client.post("/orders", headers=USER).json()["id"]
    assert client.patch(f"/orders/{oid}/status", json={"status": "paid"}, headers=USER).status_code == 403
    assert client.patch(f"/orders/{oid}/status", json={"status": "bogus"}, headers=ADMIN).status_code == 400
    assert client.patch(f"/orders/{oid}/status", json={"status": "shipped"}, headers=ADMIN).json()["status"] == "shipped"


def test_stats_scope(client):
    client.post("/cart/items", json={"productId": "p1", "quantity": 1}, headers=USER)
    client.post("/orders", headers=USER)
    mine = client.get("/orders/stats", headers=USER).json()
    assert mine["scope"] == "user" and mine["orders"] == 1
    assert client.get("/orders/stats", headers=OTHER).json()["orders"] == 0
    assert client.get("/orders/stats", headers=ADMIN).json()["scope"] == "global"
