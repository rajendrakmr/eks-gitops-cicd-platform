import json
from decimal import Decimal

import redis

from .config import settings
from .pricing import money

r = redis.Redis.from_url(settings.redis_url, decode_responses=True)


def _key(user_id: str) -> str:
    return f"cart:{user_id}"


def get_items(user_id: str) -> list[dict]:
    raw = r.hgetall(_key(user_id))
    items = []
    for product_id, blob in raw.items():
        data = json.loads(blob)
        data["productId"] = product_id
        items.append(data)
    items.sort(key=lambda i: i["name"].lower())
    return items


def set_item(user_id: str, product_id: str, snapshot: dict) -> None:
    key = _key(user_id)
    pipe = r.pipeline()
    pipe.hset(key, product_id, json.dumps(snapshot))
    pipe.expire(key, settings.cart_ttl_seconds)
    pipe.execute()


def get_item(user_id: str, product_id: str) -> dict | None:
    blob = r.hget(_key(user_id), product_id)
    return json.loads(blob) if blob else None


def remove_item(user_id: str, product_id: str) -> None:
    r.hdel(_key(user_id), product_id)


def clear(user_id: str) -> None:
    r.delete(_key(user_id))


def serialize(user_id: str) -> dict:
    items = get_items(user_id)
    subtotal = sum((money(i["price"]) * i["quantity"] for i in items), Decimal("0"))
    return {
        "items": items,
        "itemCount": sum(i["quantity"] for i in items),
        "subtotal": float(money(subtotal)),
    }
