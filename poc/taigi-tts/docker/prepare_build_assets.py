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
SAMPLES = {
    "demo_01_li_tsiah_pa_be.mp3": "Lí tsia̍h-pá--bē?",
    "demo_02_kin_a_jit_thinn_khi.mp3": "Kin-á-ji̍t thinn-khì tsiok hó.",
    "demo_03_gua_beh_tng_khi_ah.mp3": "Guá beh tńg-khì--ah.",
    "demo_04_li_khi_to_ui.mp3": "Lí khì tó-uī?",
    "demo_05_toh_sia_li.mp3": "To̍h-siā lí.",
}
MAX_REF_SECONDS = 9.8


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

def wav_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as handle:
        return handle.getnframes() / handle.getframerate()


def to_wav(source: Path, target: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
         "-ac", "1", "-ar", "32000", str(target)],
        check=True,
    )


# Concatenate only whole demo clips so the reference transcript matches the
# audio exactly; truncating mid-clip would desynchronise GPT-SoVITS prompting.
chosen: list[Path] = []
transcript: list[str] = []
total = 0.0
for name, text in SAMPLES.items():
    clip = sample_dir / f"{Path(name).stem}.wav"
    to_wav(sample_dir / name, clip)
    seconds = wav_seconds(clip)
    if total + seconds > MAX_REF_SECONDS:
        break
    chosen.append(clip)
    transcript.append(text)
    total += seconds

concat = sample_dir / "concat.txt"
concat.write_text("".join(f"file '{clip}'\n" for clip in chosen), encoding="utf-8")
ref = ROOT / "tw_samples/ref_001.wav"
subprocess.run(
    ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat",
     "-safe", "0", "-i", str(concat), "-c", "copy", str(ref)],
    check=True,
)
duration = wav_seconds(ref)
if not 3.0 <= duration <= 10.0:
    raise RuntimeError(f"derived starter reference is {duration:.2f}s, expected 3-10s")
print(f"starter reference: {len(chosen)} clips, {duration:.2f}s")
(ROOT / "tw_samples/ref_001.txt").write_text(
    "{tw:" + " ".join(transcript) + "}\n", encoding="utf-8"
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
