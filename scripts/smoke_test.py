#!/usr/bin/env python3
"""End-to-end smoke test against a running stack (docker compose or Kubernetes).

    BASE_URL=http://localhost ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=Admin@12345 python3 scripts/smoke_test.py

Exercises: public catalog (Mongo + Redis cache), register/login/refresh (Postgres + Redis),
cart (Redis), checkout (Postgres + stock reservation), admin-only routes and header-spoofing defence.
Exit code is non-zero if any check fails. Standard library only.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE = os.getenv("BASE_URL", "http://localhost").rstrip("/")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@12345")
failures = []


def call(method, path, body=None, token=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None), dict(r.headers)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else None, dict(e.headers)
        except ValueError:
            return e.code, raw.decode(errors="replace"), dict(e.headers)


def check(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail and not ok else ""))
    if not ok:
        failures.append(name)


def wait_ready(timeout=120):
    print(f"Waiting for {BASE}/api/products ...")
    end = time.time() + timeout
    while time.time() < end:
        try:
            if call("GET", "/api/products")[0] == 200:
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(3)
    return False


def main():
    if not wait_ready():
        print("Stack did not become ready in time")
        return 2

    print("Catalog")
    s, body, h1 = call("GET", "/api/products?limit=5")
    check("list products is public", s == 200 and body["items"], s)
    s, _, h2 = call("GET", "/api/products?limit=5")
    check("second identical list is a cache HIT", h2.get("X-Cache") == "HIT", h2.get("X-Cache"))
    product = body["items"][0]
    s, one, _ = call("GET", f"/api/products/{product['id']}")
    check("get product by id", s == 200 and one["id"] == product["id"], s)
    s, cats, _ = call("GET", "/api/categories")
    check("categories", s == 200 and len(cats) > 0, s)

    print("Auth")
    email = f"smoke-{uuid.uuid4().hex[:8]}@example.com"
    s, reg, _ = call("POST", "/api/auth/register", {"name": "Smoke Test", "email": email, "password": "Passw0rd123"})
    check("register", s == 201 and reg.get("accessToken"), s)
    s, _, _ = call("POST", "/api/auth/register", {"name": "Smoke Test", "email": email, "password": "Passw0rd123"})
    check("duplicate email -> 409", s == 409, s)
    s, _, _ = call("POST", "/api/auth/login", {"email": email, "password": "wrong-password1"})
    check("bad password -> 401", s == 401, s)
    s, login, _ = call("POST", "/api/auth/login", {"email": email, "password": "Passw0rd123"})
    check("login", s == 200 and login.get("accessToken"), s)
    token, refresh = login["accessToken"], login["refreshToken"]
    s, me, _ = call("GET", "/api/auth/me", token=token)
    check("me", s == 200 and me["user"]["email"] == email, s)
    s, rot, _ = call("POST", "/api/auth/refresh", {"refreshToken": refresh})
    check("refresh rotates tokens", s == 200 and rot.get("refreshToken") != refresh, s)
    s, _, _ = call("POST", "/api/auth/refresh", {"refreshToken": refresh})
    check("old refresh token is single-use -> 401", s == 401, s)
    token = rot["accessToken"]

    print("Access control")
    check("cart without token -> 401", call("GET", "/api/cart")[0] == 401)
    s, _, _ = call("POST", "/api/products", {"name": "x", "price": 1, "category": "c"}, token=token)
    check("normal user cannot create product -> 403", s == 403, s)
    s, spoof, _ = call("GET", "/api/orders/stats", token=token, headers={"X-User-Role": "admin", "X-User-Id": "someone-else"})
    check("spoofed X-User-* headers are ignored", s == 200 and spoof["scope"] == "user", spoof)
    check("/internal is not reachable via the gateway", call("POST", "/api/internal/reserve", {"items": []}, token=token)[0] in (403, 404))

    print("Cart + checkout")
    s, c, _ = call("POST", "/api/cart/items", {"productId": product["id"], "quantity": 2}, token=token)
    check("add to cart", s == 201 and c["itemCount"] == 2, s)
    s, c, _ = call("GET", "/api/cart", token=token)
    check("cart persisted", s == 200 and c["itemCount"] == 2, s)
    stock_before = one["stock"]
    s, order, _ = call("POST", "/api/orders", token=token)
    check("checkout", s == 201 and order["status"] == "pending", (s, order))
    s, c, _ = call("GET", "/api/cart", token=token)
    check("cart cleared after checkout", s == 200 and c["itemCount"] == 0, s)
    s, orders, _ = call("GET", "/api/orders", token=token)
    check("order listed", s == 200 and any(o["id"] == order["id"] for o in orders), s)
    s, after, _ = call("GET", f"/api/products/{product['id']}")
    check("stock decreased and cache invalidated", s == 200 and after["stock"] == stock_before - 2, (stock_before, after.get("stock")))
    s, _, _ = call("POST", "/api/orders", token=token)
    check("checkout with empty cart -> 400", s == 400, s)

    print("Admin")
    s, adm, _ = call("POST", "/api/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    check("admin login", s == 200 and adm["user"]["role"] == "admin", s)
    if s == 200:
        atoken = adm["accessToken"]
        s, created, _ = call("POST", "/api/products", {"name": "Smoke Item", "description": "d", "price": 9.99, "category": "Smoke", "stock": 3, "image": ""}, token=atoken)
        check("admin creates product", s == 201, (s, created))
        if s == 201:
            s, lst, _ = call("GET", "/api/products?category=Smoke")
            check("new product visible immediately (cache invalidated)", s == 200 and lst["total"] >= 1, s)
            check("admin deletes product", call("DELETE", f"/api/products/{created['id']}", token=atoken)[0] == 204)
        s, st, _ = call("GET", "/api/orders/stats", token=atoken)
        check("admin sees global stats", s == 200 and st["scope"] == "global", s)
        s, upd, _ = call("PATCH", f"/api/orders/{order['id']}/status", {"status": "shipped"}, token=atoken)
        check("admin updates order status", s == 200 and upd["status"] == "shipped", s)

    print()
    if failures:
        print(f"{len(failures)} check(s) FAILED: {', '.join(failures)}")
        return 1
    print("All checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
