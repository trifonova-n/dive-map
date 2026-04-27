from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+asyncpg://divemap:divemap_dev@localhost:5432/divemap"
    )
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    uploads_dir: str = "/app/uploads"
    uploads_max_bytes: int = 5 * 1024 * 1024  # 5 MB
    uploads_url_prefix: str = "/uploads"

    model_config = {"env_prefix": "DIVEMAP_"}


settings = Settings()
