#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import urllib.request
import wave
import zipfile
from pathlib import Path


ROOT = Path("/opt/GPT-SoVITS")
COMMIT = os.environ["KAEDETAI_COMMIT"]
SAMPLES = [
    "demo_01_li_tsiah_pa_be.mp3",
    "demo_02_kin_a_jit_thinn_khi.mp3",
    "demo_03_gua_beh_tng_khi_ah.mp3",
    "demo_04_li_khi_to_ui.mp3",
    "demo_05_toh_sia_li.mp3",
]


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as response, target.open("wb") as handle:
        handle.write(response.read())


sample_dir = Path("/tmp/taigi-ref")
for name in SAMPLES:
    download(
        f"https://raw.githubusercontent.com/KaedeTai/GPT-SoVITS/{COMMIT}/"
        f"tw_samples/{name}",
        sample_dir / name,
    )

concat = sample_dir / "concat.txt"
concat.write_text(
    "".join(f"file '{sample_dir / name}'\n" for name in SAMPLES),
    encoding="utf-8",
)
ref = ROOT / "tw_samples/ref_001.wav"
subprocess.run(
    [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat),
        "-ac",
        "1",
        "-ar",
        "32000",
        "-t",
        "9.5",
        str(ref),
    ],
    check=True,
)
with wave.open(str(ref), "rb") as handle:
    duration = handle.getnframes() / handle.getframerate()
if not 3.0 <= duration <= 10.0:
    raise RuntimeError(f"derived starter reference is {duration:.2f}s, expected 3-10s")
(ROOT / "tw_samples/ref_001.txt").write_text(
    "{tw:Lí tsia̍h-pá--bē? Kin-á-ji̍t thinn-khì tsiok hó. "
    "Guá beh tńg-khì--ah. Lí khì tó-uī? To̍h-siā lí.}\n",
    encoding="utf-8",
)

# G2PW is not used by the explicit TW route, but pre-populate it so an import
# or accidental Chinese span cannot attempt a network download at runtime.
g2pw_parent = ROOT / "GPT_SoVITS/text"
g2pw_zip = Path("/tmp/G2PWModel_1.1.zip")
download(
    "https://www.modelscope.cn/models/kamiorinn/g2pw/resolve/master/"
    "G2PWModel_1.1.zip",
    g2pw_zip,
)
with zipfile.ZipFile(g2pw_zip) as archive:
    archive.extractall(g2pw_parent)
extracted = g2pw_parent / "G2PWModel_1.1"
target = g2pw_parent / "G2PWModel"
if extracted.exists() and not target.exists():
    extracted.rename(target)

import nltk

for package in ("averaged_perceptron_tagger", "averaged_perceptron_tagger_eng", "cmudict"):
    if not nltk.download(package, download_dir="/usr/local/share/nltk_data", quiet=True):
        raise RuntimeError(f"failed to preload NLTK package: {package}")

import pyopenjtalk

pyopenjtalk.g2p("オフライン確認")

from fast_langdetect import LangDetectConfig, LangDetector

cache = ROOT / "GPT_SoVITS/pretrained_models/fast_langdetect"
cache.mkdir(parents=True, exist_ok=True)
LangDetector(LangDetectConfig(cache_dir=cache, model="full")).detect(
    "offline language model preload", k=1
)
