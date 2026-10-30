from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    asr_nan_provider: str = "mock"
    asr_id_provider: str = "mock"
    translate_provider: str = "mock"
    tts_id_provider: str = "mock"
    tts_nan_provider: str = "mock"
    audio_ttl_seconds: int = 3600
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    ffmpeg_binary: str = "ffmpeg"
    ffprobe_binary: str = "ffprobe"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.lstrip().startswith("["):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
