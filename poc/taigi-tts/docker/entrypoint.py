#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path("/opt/GPT-SoVITS")
MODELS = Path("/models")
EXPECTED_COMMIT = os.environ["KAEDETAI_COMMIT"]


def volume_commit(git_dir: Path) -> str | None:
    head = (git_dir / "HEAD").read_text(encoding="utf-8").strip()
    if not head.startswith("ref: "):
        return head
    ref = head.removeprefix("ref: ")
    loose = git_dir / ref
    if loose.exists():
        return loose.read_text(encoding="utf-8").strip()
    packed = git_dir / "packed-refs"
    if packed.exists():
        for line in packed.read_text(encoding="utf-8").splitlines():
            if line and not line.startswith(("#", "^")):
                commit, name = line.split(" ", 1)
                if name == ref:
                    return commit
    return None


def link(source: Path, target: Path) -> None:
    if not source.exists():
        raise FileNotFoundError(f"required model asset is missing: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_symlink():
        target.unlink()
    if target.exists():
        raise RuntimeError(f"refusing to replace non-symlink directory: {target}")
    target.symlink_to(source, target_is_directory=source.is_dir())


source_git = MODELS / "GPT-SoVITS-src/.git"
if not source_git.exists():
    raise FileNotFoundError("/models/GPT-SoVITS-src/.git is missing")
actual_commit = volume_commit(source_git)
if actual_commit != EXPECTED_COMMIT:
    raise RuntimeError(
        "GPT-SoVITS source mismatch: volume has "
        f"{actual_commit or 'unknown'}, image expects {EXPECTED_COMMIT}"
    )

links = {
    MODELS / "gpt-sovits-tw/s1_trilingual.ckpt": ROOT / "models/s1_trilingual.ckpt",
    MODELS / "gpt-sovits-tw/s2_r4_e15.pth": ROOT / "models/s2_r4_e15.pth",
    MODELS / "lj1995/s1v3.ckpt": ROOT / "GPT_SoVITS/pretrained_models/s1v3.ckpt",
    MODELS / "lj1995/chinese-roberta-wwm-ext-large":
        ROOT / "GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large",
    MODELS / "lj1995/chinese-hubert-base":
        ROOT / "GPT_SoVITS/pretrained_models/chinese-hubert-base",
    MODELS / "lj1995/v2Pro/s2Gv2Pro.pth":
        ROOT / "GPT_SoVITS/pretrained_models/v2Pro/s2Gv2Pro.pth",
    MODELS / "lj1995/v2Pro/s2Dv2Pro.pth":
        ROOT / "GPT_SoVITS/pretrained_models/v2Pro/s2Dv2Pro.pth",
    MODELS / "lj1995/sv": ROOT / "GPT_SoVITS/pretrained_models/sv",
}
for source, target in links.items():
    link(source, target)

subprocess.run(
    [sys.executable, "-c", "from tw_inference import tw_synth; print('TTS paths OK')"],
    cwd=ROOT,
    check=True,
    env=os.environ,
)
os.chdir("/app")
os.execvp(sys.argv[1], sys.argv[1:])
