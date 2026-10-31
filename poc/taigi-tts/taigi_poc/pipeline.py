from __future__ import annotations

import csv
import gc
import html
import json
import re
import shutil
import time
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from typing import Callable, Iterable


CLAUSE_RE = re.compile(r"([^，。！？；、,.!?;]+)([，。！？；、,.!?;]*)")
MODEL_STOP_RE = re.compile(r"\[/[^\n]*", re.DOTALL)
TRAILING_PUNCTUATION_RE = re.compile(r"[，。！？；、,.!?;]+$")


@dataclass
class Result:
    id: str
    category: str
    zh_tw: str
    opus_tailo: str = ""
    llama_poj: str = ""
    llama_han: str = ""
    opus_translate_s: str = ""
    llama_translate_s: str = ""
    opus_tts_s: str = ""
    llama_tts_s: str = ""
    opus_error: str = ""
    llama_error: str = ""
    opus_audio: str = ""
    llama_audio: str = ""


def read_sentences(path: Path) -> list[Result]:
    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    expected = {"id", "category", "zh_tw"}
    if not rows or set(rows[0]) != expected:
        raise ValueError(f"sentences CSV columns must be {sorted(expected)}")
    seen: set[str] = set()
    results = []
    for row in rows:
        if not all(row.values()):
            raise ValueError(f"sentence row has an empty value: {row}")
        if row["id"] in seen:
            raise ValueError(f"duplicate sentence id: {row['id']}")
        seen.add(row["id"])
        results.append(Result(**row))
    return results


def split_clauses(text: str) -> list[tuple[str, str]]:
    parts = [(body.strip(), punctuation) for body, punctuation in CLAUSE_RE.findall(text)]
    return [(body, punctuation) for body, punctuation in parts if body]


def translate_opus_text(
    text: str,
    translate_batch: Callable[[list[str]], list[str]],
) -> str:
    parts = split_clauses(text)
    translated = translate_batch([f">>nan<< {body}" for body, _ in parts])
    if len(translated) != len(parts):
        raise RuntimeError("Opus translator returned a different clause count")
    return "".join(
        TRAILING_PUNCTUATION_RE.sub("", output.strip()) + punctuation
        for output, (_, punctuation) in zip(translated, parts, strict=True)
    )


def clean_llama_output(output: str) -> str:
    return MODEL_STOP_RE.split(output, maxsplit=1)[0].strip()


def llama_prompt(source: str, target: str) -> str:
    if target not in {"POJ", "HAN"}:
        raise ValueError(f"unsupported Taigi-Llama target: {target}")
    return f"[TRANS]\n{source}\n[/TRANS]\n[{target}]\n"


def write_results_csv(results: Iterable[Result], path: Path) -> None:
    rows = [asdict(row) for row in results]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=[field.name for field in fields(Result)])
        writer.writeheader()
        writer.writerows(rows)


def write_json(results: Iterable[Result], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps([asdict(row) for row in results], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def read_json(path: Path) -> list[Result]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return [Result(**item) for item in data]


def render_index(results: Iterable[Result], path: Path) -> None:
    rows = []
    for row in results:
        key = html.escape(row.id)
        audios = []
        for provider, audio_path, error in (
            ("opus", row.opus_audio, row.opus_error),
            ("llama", row.llama_audio, row.llama_error),
        ):
            if audio_path:
                player = (
                    f'<audio controls preload="none" src="{html.escape(audio_path)}">'
                    "你的瀏覽器不支援音訊播放。</audio>"
                )
            else:
                player = f'<span class="error">{html.escape(error or "未產生音檔")}</span>'
            audios.append(f'<div><b>{provider}</b>{player}</div>')
        timing = (
            f"翻譯 {html.escape(row.opus_translate_s or '-')}s / "
            f"{html.escape(row.llama_translate_s or '-')}s<br>"
            f"合成 {html.escape(row.opus_tts_s or '-')}s / "
            f"{html.escape(row.llama_tts_s or '-')}s"
        )
        score_groups = []
        for provider in ("opus", "llama"):
            score_groups.append(f"""
            <fieldset data-score="{key}" data-provider="{provider}">
              <legend>{provider}</legend>
              <label><input type="radio" name="understand-{key}-{provider}"
                data-kind="understand" value="聽得懂">聽得懂</label>
              <label><input type="radio" name="understand-{key}-{provider}"
                data-kind="understand" value="部分懂">部分懂</label>
              <label><input type="radio" name="understand-{key}-{provider}"
                data-kind="understand" value="聽不懂">聽不懂</label>
              <label><input type="radio" name="meaning-{key}-{provider}"
                data-kind="meaning" value="意思正確">意思正確</label>
              <label><input type="radio" name="meaning-{key}-{provider}"
                data-kind="meaning" value="錯誤">錯誤</label>
            </fieldset>""")
        score = "".join(score_groups)
        rows.append(
            "<tr>"
            f"<td>{key}</td><td>{html.escape(row.category)}</td>"
            f"<td>{html.escape(row.zh_tw)}</td>"
            f"<td>{html.escape(row.opus_tailo)}</td>"
            f"<td>{html.escape(row.llama_poj)}</td>"
            f"<td>{html.escape(row.llama_han)}</td>"
            f"<td>{''.join(audios)}</td><td>{timing}</td><td>{score}</td>"
            "</tr>"
        )
    template = """<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>台語 TTS 比較試驗</title>
<style>
body{font-family:system-ui,sans-serif;margin:1.25rem;color:#202124}h1{margin-bottom:.3rem}
.instructions{background:#fff4ce;border-left:5px solid #d59b00;padding:1rem;max-width:70rem}
.scroll{overflow:auto}table{border-collapse:collapse;margin-top:1rem;min-width:1400px}
th,td{border:1px solid #bbb;padding:.55rem;vertical-align:top}th{background:#eee;position:sticky;top:0}
audio{display:block;width:250px;margin:.25rem 0 .65rem}.error{color:#a00}fieldset{min-width:180px}
label{display:block;margin:.2rem 0}button{font-size:1rem;padding:.55rem .8rem;margin-top:.8rem}
</style></head><body><h1>台語 TTS 比較試驗</h1>
<section class="instructions"><b>試聽評分說明</b><p>每句依序聽兩個版本，請勾選
「聽得懂／部分懂／聽不懂」與「意思正確／錯誤」。評分只存在這台電腦的
localStorage；完成後請按「匯出評分 CSV」。本頁只協助人工比較，不會對吃藥、
疼痛或跌倒內容作醫療或照護判斷。</p><button id="export">匯出評分 CSV</button></section>
<div class="scroll"><table><thead><tr><th>ID</th><th>類別</th><th>華語原文</th>
<th>Opus 台羅</th><th>Llama POJ</th><th>Llama 台文漢字</th><th>音訊</th>
<th>延遲（Opus / Llama）</th><th>人工評分</th></tr></thead><tbody>
__ROWS__
</tbody></table></div><script>
const storeKey='taigi-tts-poc-scores-v1';
const scores=JSON.parse(localStorage.getItem(storeKey)||'{}');
document.querySelectorAll('fieldset[data-score]').forEach(fs=>{
  const id=fs.dataset.score; const provider=fs.dataset.provider;
  const key=id+'-'+provider; const saved=scores[key]||{};
  fs.querySelectorAll('input').forEach(input=>{
    if(saved[input.dataset.kind]===input.value) input.checked=true;
    input.addEventListener('change',()=>{
      scores[key]=scores[key]||{};
      scores[key][input.dataset.kind]=input.value;
      localStorage.setItem(storeKey,JSON.stringify(scores));
    });
  });
});
function csvCell(value){return '"'+String(value||'').replaceAll('"','""')+'"'}
document.getElementById('export').addEventListener('click',()=>{
  const lines=[['id','provider','understand','meaning']];
  document.querySelectorAll('fieldset[data-score]').forEach(fs=>{
    const key=fs.dataset.score+'-'+fs.dataset.provider;
    const score=scores[key]||{};
    lines.push([fs.dataset.score,fs.dataset.provider,
      score.understand||'',score.meaning||'']);
  });
  const csv='\\ufeff'+lines.map(row=>row.map(csvCell).join(',')).join('\\r\\n');
  const link=document.createElement('a');
  link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  link.download='listening-scores.csv'; link.click(); URL.revokeObjectURL(link.href);
});
</script></body></html>"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(template.replace("__ROWS__", "\n".join(rows)), encoding="utf-8")


def release_cuda(*objects: object) -> None:
    for obj in objects:
        del obj
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except ImportError:
        pass


def timed(call: Callable[[], str]) -> tuple[str, float]:
    started = time.perf_counter()
    value = call()
    return value, time.perf_counter() - started


def copy_audio(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
