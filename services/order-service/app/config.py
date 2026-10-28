import os


class Settings:
    port: int = int(os.getenv("PORT", "4003"))
    database_url: str = os.getenv(
        "DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/orders_db"
    )
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    product_service_url: str = os.getenv("PRODUCT_SERVICE_URL", "http://localhost:4002")
    tax_rate: str = os.getenv("TAX_RATE", "0.08")
    free_shipping_threshold: str = os.getenv("FREE_SHIPPING_THRESHOLD", "100")
    shipping_fee: str = os.getenv("SHIPPING_FEE", "7.99")
    cart_ttl_seconds: int = int(os.getenv("CART_TTL_SECONDS", str(7 * 24 * 3600)))


settings = Settings()
