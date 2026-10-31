from __future__ import annotations

import asyncio
import os
from pathlib import Path
from urllib.parse import unquote

import pytest
from fastapi.testclient import TestClient

from conftest import FakeSynthesizer
from taigi_tts.app import BusyError, RequestGate, create_app
from taigi_tts.cache import DiskLruCache
from taigi_tts.config import Settings


def test_synthesize_loads_once_returns_headers_and_uses_disk_cache(
    settings: Settings,
    tmp_path: Path,
):
    stack = FakeSynthesizer(tmp_path / "generated.mp3")
    app = create_app(settings, synthesizer=stack)
    with TestClient(app) as client:
        first = client.post("/synthesize", json={"text": "  今天吃藥了嗎？ "})
        second = client.post("/synthesize", json={"text": "今天吃藥了嗎？"})
        health = client.get("/health")

    assert first.status_code == 200
    assert first.headers["content-type"].startswith("audio/mpeg")
    assert first.content == b"fake-mp3"
    assert unquote(first.headers["X-Taigi-Han"]) == "你今仔日有食藥無？"
    assert unquote(first.headers["X-Taigi-Romanization"]) == "Lí ū tsia̍h io̍h--bô?"
    assert second.content == first.content
    assert stack.calls == ["今天吃藥了嗎？"]
    assert health.json() == {
        "status": "ok",
        "loaded": True,
        "llama_dtype": "fp16",
        "gpu_memory": {"allocated_bytes": 123, "reserved_bytes": 456},
        "queue": {"pending": 0, "capacity": 1},
    }


@pytest.mark.parametrize("text", ["", "   ", "字" * 201])
def test_synthesize_rejects_invalid_text(
    settings: Settings,
    tmp_path: Path,
    text: str,
):
    app = create_app(
        settings,
        synthesizer=FakeSynthesizer(tmp_path / "generated.mp3"),
    )
    with TestClient(app) as client:
        response = client.post("/synthesize", json={"text": text})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_TEXT"


def test_request_gate_rejects_when_active_slot_and_queue_are_full():
    async def exercise() -> None:
        gate = RequestGate(max_queue=0)
        async with gate.reserve():
            with pytest.raises(BusyError):
                async with gate.reserve():
                    raise AssertionError("unreachable")

    asyncio.run(exercise())


def test_disk_lru_key_changes_with_reference_and_model(
    settings: Settings,
    tmp_path: Path,
):
    first = DiskLruCache(
        tmp_path / "one",
        2,
        settings.ref_audio,
        settings.ref_text,
        "model-one",
    )
    second = DiskLruCache(
        tmp_path / "two",
        2,
        settings.ref_audio,
        settings.ref_text,
        "model-two",
    )
    assert first.key("你好") != second.key("你好")

    settings.ref_audio.write_bytes(b"different-reference")
    third = DiskLruCache(
        tmp_path / "three",
        2,
        settings.ref_audio,
        settings.ref_text,
        "model-one",
    )
    assert first.key("你好") != third.key("你好")


def test_disk_lru_refreshes_hits_and_evicts_oldest(
    settings: Settings,
    tmp_path: Path,
):
    cache = DiskLruCache(
        tmp_path / "lru",
        2,
        settings.ref_audio,
        settings.ref_text,
        "model-one",
    )
    source = tmp_path / "source.mp3"
    source.write_bytes(b"mp3")
    one = cache.put("one", source, "一", "tsi̍t")
    two = cache.put("two", source, "二", "nn̄g")
    os.utime(one.audio_path, ns=(1, 1))
    os.utime(two.audio_path, ns=(2, 2))
    assert cache.get("one") is not None

    cache.put("three", source, "三", "sann")

    assert cache.get("one") is not None
    assert cache.get("two") is None
    assert cache.get("three") is not None
