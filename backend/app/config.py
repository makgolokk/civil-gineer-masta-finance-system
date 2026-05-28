from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Civil-Gineer Masta Export Backend"
    environment: str = "development"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
    logo_path: str = "assets/logo.png"
    default_currency: str = "BWP"
    frontend_origin: str = ""
    additional_allowed_origins: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="CGM_EXPORT_", extra="ignore")

    @property
    def origins(self) -> list[str]:
        values = ",".join([self.allowed_origins, self.frontend_origin, self.additional_allowed_origins])
        return [origin.strip() for origin in values.split(",") if origin.strip()]

    @property
    def resolved_logo_path(self) -> Path:
        return Path(self.logo_path)


@lru_cache
def get_settings() -> Settings:
    return Settings()
