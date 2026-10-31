from __future__ import annotations

import io
import json
import sys
import types
from collections import OrderedDict
from pathlib import Path

import torch

from taigi_poc.s2_convert import ensure_inference_s2


def test_convert_synthetic_training_checkpoint_once(
    tmp_path: Path,
    monkeypatch,
) -> None:
    source = tmp_path / "s2_full.pth"
    destination = tmp_path / "cache/s2_infer.pth"
    config_path = tmp_path / "s2_config.json"
    state = OrderedDict(
        {
            "enc_p.text_embedding.weight": torch.ones(1033, 2),
            "dec.example.weight": torch.ones(2, 2),
            "enc_q.example.weight": torch.ones(1),
        }
    )
    torch.save({"model": state, "opt_g": {"unused": True}, "epoch": 15}, source)
    config_path.write_text(
        json.dumps(
            {
                "version": "v2Pro",
                "train": {"segment_size": 20480},
                "data": {"sampling_rate": 32000},
                "model": {"version": "v2Pro"},
            }
        ),
        encoding="utf-8",
    )

    package = types.ModuleType("GPT_SoVITS")
    process_ckpt = types.ModuleType("GPT_SoVITS.process_ckpt")

    def detect(path: str):
        assert Path(path).read_bytes()[:2] == b"05"
        return ["v2", "v2Pro", False]

    process_ckpt.get_sovits_version_from_path_fast = detect
    monkeypatch.setitem(sys.modules, "GPT_SoVITS", package)
    monkeypatch.setitem(sys.modules, "GPT_SoVITS.process_ckpt", process_ckpt)

    assert ensure_inference_s2(source, destination, config_path) == destination
    encoded = destination.read_bytes()
    assert encoded[:2] == b"05"
    payload = torch.load(
        io.BytesIO(b"PK" + encoded[2:]),
        map_location="cpu",
        weights_only=False,
    )
    assert set(payload) == {"weight", "config", "info"}
    assert "enc_q.example.weight" not in payload["weight"]
    assert payload["weight"]["dec.example.weight"].dtype == torch.float16
    assert payload["config"]["version"] == "v2ProTw"
    assert payload["config"]["model"]["version"] == "v2ProTw"

    def unexpected_load(*_args, **_kwargs):
        raise AssertionError("cache hit must not load the training checkpoint")

    monkeypatch.setattr(torch, "load", unexpected_load)
    assert ensure_inference_s2(source, destination, config_path) == destination
