#!/usr/bin/env python3
"""Fail-fast compatibility patches for KaedeTai commit 8195985.

The public commit documents TW inference but omits its local tts_long router.
These narrow edits make the maintained TTS_infer_pack path accept an explicit
"tw" language and retain the 1033-token v2ProTw checkpoint variant.
"""
import os
from pathlib import Path


ROOT = Path(os.environ.get("GPT_SOVITS_ROOT", "/opt/GPT-SoVITS"))


def replace(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    if old not in source:
        raise RuntimeError(f"upstream patch context changed in {path}: {old[:80]!r}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


tts = ROOT / "GPT_SoVITS/TTS_infer_pack/TTS.py"
replace(
    tts,
    'v2_languages: list = ["auto", "auto_yue", "en", "zh", "ja", "yue", "ko", "all_zh", "all_ja", "all_yue", "all_ko"]',
    'v2_languages: list = ["auto", "auto_yue", "en", "zh", "ja", "yue", "ko", "tw", "all_zh", "all_ja", "all_yue", "all_ko"]',
)
replace(
    tts,
    '''        elif dict_s2["weight"]["enc_p.text_embedding.weight"].shape[0] == 322:
            hps["model"]["version"] = "v1"
        else:
            hps["model"]["version"] = "v2"''',
    '''        elif dict_s2["weight"]["enc_p.text_embedding.weight"].shape[0] == 322:
            hps["model"]["version"] = "v1"
        elif dict_s2["weight"]["enc_p.text_embedding.weight"].shape[0] == 1033:
            hps["model"]["version"] = "v2tw"
        else:
            hps["model"]["version"] = "v2"''',
)
replace(
    tts,
    '''            else:
                hps["model"]["version"] = model_version
        else:
            hps["model"]["version"] = model_version''',
    '''            else:
                if version == "v2tw" and model_version in {"v2Pro", "v2ProPlus"}:
                    model_version = model_version + "Tw"
                hps["model"]["version"] = model_version
        else:
            hps["model"]["version"] = model_version''',
)
replace(
    tts,
    'self.is_v2pro = model_version in {"v2Pro", "v2ProPlus"}',
    'self.is_v2pro = model_version in {"v2Pro", "v2ProPlus", "v2ProTw", "v2ProPlusTw"}',
)

preprocessor = ROOT / "GPT_SoVITS/TTS_infer_pack/TextPreprocessor.py"
replace(
    preprocessor,
    '''            elif language == "en":
                langlist.append("en")
                textlist.append(text)
            elif language == "auto":''',
    '''            elif language == "en":
                langlist.append("en")
                textlist.append(text)
            elif language == "tw":
                langlist.append("tw")
                textlist.append(text)
            elif language == "auto":''',
)
