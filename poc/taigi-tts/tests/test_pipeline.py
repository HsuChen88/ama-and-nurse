from __future__ import annotations

import csv
from pathlib import Path

import pytest

from taigi_poc.pipeline import (
    Result,
    clean_llama_output,
    llama_prompt,
    read_sentences,
    render_index,
    split_clauses,
    translate_opus_text,
    write_results_csv,
)


ROOT = Path(__file__).parents[1]


def test_sentence_set_has_30_unique_categorized_rows() -> None:
    rows = read_sentences(ROOT / "sentences.csv")
    assert len(rows) == 30
    assert len({row.id for row in rows}) == 30
    assert all(row.category and row.zh_tw for row in rows)
    assert sum(row.zh_tw.count("，") >= 2 for row in rows) >= 3


def test_clause_split_preserves_punctuation_and_prefixes_every_clause() -> None:
    calls: list[list[str]] = []

    def fake_translate(texts: list[str]) -> list[str]:
        calls.append(texts)
        return [f"T{index}" for index, _ in enumerate(texts, 1)]

    assert split_clauses("先坐好，把腳抬起來，我幫你量血壓。") == [
        ("先坐好", "，"),
        ("把腳抬起來", "，"),
        ("我幫你量血壓", "。"),
    ]
    translated = translate_opus_text(
        "先坐好，把腳抬起來，我幫你量血壓。", fake_translate
    )
    assert translated == "T1，T2，T3。"
    assert calls == [[">>nan<< 先坐好", ">>nan<< 把腳抬起來", ">>nan<< 我幫你量血壓"]]


def test_llama_prompt_and_stop_extraction() -> None:
    assert llama_prompt("請喝水。", "POJ") == (
        "[TRANS]\n請喝水。\n[/TRANS]\n[POJ]\n"
    )
    assert clean_llama_output("Lí hó.\n[/POJ]\nnoise") == "Lí hó."
    with pytest.raises(ValueError):
        llama_prompt("請喝水。", "TAILO")


def test_report_generation_with_fake_data(tmp_path: Path) -> None:
    result = Result(
        id="01",
        category="日常",
        zh_tw="請喝水。",
        opus_tailo="Tshíng lim tsuí.",
        llama_poj="Chhiáⁿ lim chúi.",
        llama_han="請啉水。",
        opus_translate_s="0.100",
        llama_translate_s="0.200",
        opus_tts_s="0.300",
        llama_tts_s="0.400",
        opus_audio="audio/01_opus.mp3",
        llama_audio="audio/01_llama.mp3",
    )
    csv_path = tmp_path / "results.csv"
    html_path = tmp_path / "index.html"
    write_results_csv([result], csv_path)
    render_index([result], html_path)

    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    page = html_path.read_text(encoding="utf-8")
    assert rows[0]["llama_han"] == "請啉水。"
    assert 'src="audio/01_opus.mp3"' in page
    assert 'src="audio/01_llama.mp3"' in page
    assert "localStorage" in page
    assert "匯出評分 CSV" in page
    assert "data-provider=\"opus\"" in page
    assert "data-provider=\"llama\"" in page
