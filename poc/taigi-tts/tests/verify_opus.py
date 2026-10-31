#!/usr/bin/env python3
"""Download and exercise the real Opus model on one segmented care sentence."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from transformers import MarianMTModel, MarianTokenizer

from taigi_poc.pipeline import translate_opus_text


MODEL = "linguardia/opus-mt-zh-nan"
tokenizer = MarianTokenizer.from_pretrained(MODEL, extra_special_tokens={})
model = MarianMTModel.from_pretrained(MODEL).eval()


def translate_batch(texts: list[str]) -> list[str]:
    inputs = tokenizer(texts, return_tensors="pt", padding=True, truncation=True)
    output = model.generate(**inputs, do_sample=False, num_beams=1)
    return tokenizer.batch_decode(output, skip_special_tokens=True)


source = "水有一點燙，等涼一點再喝，不要喝太快。"
translated = translate_opus_text(source, translate_batch)
assert translated.strip()
assert translated.count("，") == 2
assert translated.endswith("。")
print(f"source: {source}")
print(f"tailo: {translated}")
