from __future__ import annotations

import pytest

import inference_service.tts as tts_module
from inference_service.tts import TtsBackendError, UrllibTtsClient


def test_urllib_client_maps_timeout_without_extra_dependency(
    monkeypatch: pytest.MonkeyPatch,
):
    def timeout(*args, **kwargs):
        del args, kwargs
        raise TimeoutError("timed out")

    monkeypatch.setattr(tts_module, "urlopen", timeout)
    client = UrllibTtsClient("http://taigi-tts:8002", 0.01)

    with pytest.raises(TtsBackendError, match="unavailable"):
        client.synthesize("你好")
