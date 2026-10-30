import httpx
import pytest

from backend.config import Settings
from backend.errors import ProviderError
from backend.providers import RemoteAsrProvider, build_providers


def test_remote_asr_sends_audio_language_and_auth_headers():
    def handler(request: httpx.Request) -> httpx.Response:
        body = request.read()
        assert request.url.path == "/v1/asr"
        assert request.headers["Authorization"] == "Bearer inference-token"
        assert request.headers["CF-Access-Client-Id"] == "client-id"
        assert request.headers["CF-Access-Client-Secret"] == "client-secret"
        assert b'name="language"' in body
        assert b"nan-TW" in body
        assert b'filename="audio.wav"' in body
        assert b"normalized-wav" in body
        return httpx.Response(200, json={"text": "你今天有吃藥無？"})

    provider = make_provider(handler)

    assert provider.transcribe(b"normalized-wav", "nan-TW") == "你今天有吃藥無？"


def test_remote_asr_returns_empty_text_for_pipeline_to_handle():
    provider = make_provider(
        lambda request: httpx.Response(200, json={"text": ""}, request=request)
    )

    assert provider.transcribe(b"wav", "id") == ""


def test_remote_asr_timeout_becomes_provider_error():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    with pytest.raises(ProviderError, match="timed out"):
        make_provider(handler).transcribe(b"wav", "nan-TW")


def test_remote_asr_connection_error_becomes_provider_error():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection failed", request=request)

    with pytest.raises(ProviderError, match="connection failed"):
        make_provider(handler).transcribe(b"wav", "nan-TW")


def test_remote_asr_5xx_becomes_provider_error():
    provider = make_provider(
        lambda request: httpx.Response(503, json={"error": {}}, request=request)
    )

    with pytest.raises(ProviderError, match="HTTP 503"):
        provider.transcribe(b"wav", "nan-TW")


@pytest.mark.parametrize("missing", ["base_url", "token"])
def test_remote_mode_requires_configuration(missing):
    values = {
        "asr_nan_provider": "remote",
        "inference_base_url": "https://inference.example",
        "inference_api_token": "token",
    }
    if missing == "base_url":
        values["inference_base_url"] = None
    else:
        values["inference_api_token"] = None

    with pytest.raises(ValueError, match="is required"):
        build_providers(Settings(**values))


def test_both_remote_asr_providers_share_one_http_client():
    bundle = build_providers(
        Settings(
            asr_nan_provider="remote",
            asr_id_provider="remote",
            inference_base_url="https://inference.example",
            inference_api_token="token",
        )
    )
    try:
        assert bundle.asr["nan-TW"].client is bundle.asr["id"].client
        headers = bundle.asr["nan-TW"].client.headers
        assert "CF-Access-Client-Id" not in headers
        assert "CF-Access-Client-Secret" not in headers
    finally:
        bundle.close()


def make_provider(handler) -> RemoteAsrProvider:
    client = httpx.Client(
        base_url="https://inference.example",
        headers={
            "Authorization": "Bearer inference-token",
            "CF-Access-Client-Id": "client-id",
            "CF-Access-Client-Secret": "client-secret",
        },
        transport=httpx.MockTransport(handler),
    )
    return RemoteAsrProvider(client)
