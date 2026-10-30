from functools import lru_cache
from typing import Annotated

from pydantic import Field, SecretStr, field_validator
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
    inference_base_url: str | None = None
    inference_api_token: SecretStr | None = None
    inference_cf_access_client_id: str | None = None
    inference_cf_access_client_secret: SecretStr | None = None
    inference_timeout_seconds: float = Field(default=120, gt=0)
    google_translate_credentials: str | None = None
    google_tts_credentials: str | None = None
    google_timeout_seconds: float = Field(default=15, gt=0)
    tts_id_voice: str = "id-ID-Chirp3-HD-Pulcherrima"
    tts_id_speaking_rate: float = Field(default=0.9, ge=0.25, le=2.0)
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
