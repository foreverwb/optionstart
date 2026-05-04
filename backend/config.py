from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "OptionStrat Build API"
    api_prefix: str = "/api"

    futu_host: str = Field(default="127.0.0.1", alias="FUTU_HOST")
    futu_port: int = Field(default=11111, alias="FUTU_PORT")
    futu_connect_on_startup: bool = Field(default=False, alias="FUTU_CONNECT_ON_STARTUP")

    redis_url: str = Field(default="redis://127.0.0.1:6379/0", alias="REDIS_URL")
    redis_enabled: bool = Field(default=False, alias="REDIS_ENABLED")

    database_url: str = Field(default="sqlite:///./optionstart.db", alias="DATABASE_URL")

    cors_origins: list[str] = Field(
        default=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:5188", "http://127.0.0.1:5189"],
        alias="CORS_ORIGINS",
    )

    option_chain_ttl_seconds: int = 300
    snapshot_ttl_seconds: int = 30
    max_expiry_span_days: int = 30
    max_snapshot_codes: int = 400

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        populate_by_name=True,
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
