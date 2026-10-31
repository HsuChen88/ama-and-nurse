from __future__ import annotations

import gc
import json
import os
from collections import OrderedDict
from copy import deepcopy
from pathlib import Path
from typing import Any


EXPECTED_SYMBOLS = 1033
EXPECTED_HEADER = b"05"
EXPECTED_VERSION = ("v2", "v2Pro", False)
CACHE_SCHEMA = 1


def inference_config(config: dict[str, Any], symbol_count: int) -> dict[str, Any]:
    """Return the v2ProTw inference config after validating the TW vocab."""
    if symbol_count != EXPECTED_SYMBOLS:
        raise ValueError(
            "unexpected S2 text embedding size: "
            f"{symbol_count}; expected {EXPECTED_SYMBOLS} for v2ProTw"
        )
    converted = deepcopy(config)
    if not all(key in converted for key in ("train", "data", "model")):
        raise ValueError("S2 config must contain train, data, and model sections")
    converted["version"] = "v2ProTw"
    converted["model"]["version"] = "v2ProTw"
    converted["model"]["semantic_frame_rate"] = "25hz"
    return converted


def _source_identity(source: Path) -> dict[str, int]:
    stat = source.stat()
    return {"source_size": stat.st_size, "source_mtime_ns": stat.st_mtime_ns}


def _cache_is_valid(source: Path, destination: Path, metadata: Path) -> bool:
    if not destination.is_file() or not metadata.is_file():
        return False
    try:
        saved = json.loads(metadata.read_text(encoding="utf-8"))
        expected = {
            "schema": CACHE_SCHEMA,
            "symbols": EXPECTED_SYMBOLS,
            **_source_identity(source),
        }
        with destination.open("rb") as handle:
            header = handle.read(2)
        return all(saved.get(key) == value for key, value in expected.items()) and (
            header == EXPECTED_HEADER
        )
    except (OSError, ValueError, json.JSONDecodeError):
        return False


def ensure_inference_s2(
    source: Path,
    destination: Path,
    config_path: Path,
) -> Path:
    """Convert a trusted full training checkpoint once, at runtime on titan.

    Loading is intentionally lazy so Mac tests never deserialize the external
    checkpoint. The source is the user-approved KaedeTai model volume.
    """
    source = source.resolve()
    destination = destination.resolve()
    config_path = config_path.resolve()
    metadata = destination.with_suffix(destination.suffix + ".json")
    if _cache_is_valid(source, destination, metadata):
        print(f"[s2] using cached inference checkpoint: {destination}", flush=True)
        return destination
    if not source.is_file():
        raise FileNotFoundError(f"S2 training checkpoint not found: {source}")
    if not config_path.is_file():
        raise FileNotFoundError(f"S2 v2Pro config not found: {config_path}")

    import torch

    print(f"[s2] converting trusted training checkpoint: {source}", flush=True)
    print("[s2] torch.load(map_location='cpu', weights_only=False)", flush=True)
    full = torch.load(source, map_location="cpu", weights_only=False)
    if not isinstance(full, dict) or "model" not in full:
        raise ValueError("S2 training checkpoint must contain a top-level 'model'")
    state = full["model"]
    del full
    gc.collect()
    embedding_key = "enc_p.text_embedding.weight"
    if embedding_key not in state:
        raise KeyError(f"S2 state dict is missing {embedding_key}")
    symbol_count = int(state[embedding_key].shape[0])
    print(f"[s2] detected {symbol_count} text symbols (v2ProTw)", flush=True)

    raw_config = json.loads(config_path.read_text(encoding="utf-8"))
    config = inference_config(raw_config, symbol_count)
    weights = OrderedDict(
        (key, value.half())
        for key, value in state.items()
        if not key.startswith("enc_q.")
    )
    del state
    if any(key.startswith("enc_q.") for key in weights):
        raise RuntimeError("enc_q weights remained after inference conversion")
    payload = OrderedDict(
        weight=weights,
        config=config,
        info="GPT-SoVITS-TW-r4-e15-converted-for-inference",
    )

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
    try:
        torch.save(payload, temporary)
        with temporary.open("r+b") as handle:
            if handle.read(2) != b"PK":
                raise RuntimeError("torch.save did not produce the expected ZIP header")
            handle.seek(0)
            handle.write(EXPECTED_HEADER)

        # This is the same header-based check used by GPT-SoVITS before load.
        from GPT_SoVITS.process_ckpt import get_sovits_version_from_path_fast

        detected = tuple(get_sovits_version_from_path_fast(str(temporary)))
        if detected != EXPECTED_VERSION:
            raise RuntimeError(
                f"converted S2 was detected as {detected}, expected {EXPECTED_VERSION}"
            )
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)

    cache_data = {
        "schema": CACHE_SCHEMA,
        "symbols": symbol_count,
        "detected_version": list(EXPECTED_VERSION),
        **_source_identity(source),
    }
    metadata.write_text(
        json.dumps(cache_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    del payload, weights
    gc.collect()
    print(f"[s2] wrote inference checkpoint: {destination}", flush=True)
    return destination
