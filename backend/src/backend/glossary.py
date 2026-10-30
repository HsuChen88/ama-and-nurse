import json
import re
from html import escape, unescape
from pathlib import Path
from typing import Any

_SPAN_TAG = re.compile(r"</?span(?:\s[^>]*)?>", re.IGNORECASE)
_SPAN_OPEN = r"<span(?:\s[^>]*)?>"
_SPACE_BEFORE_SPAN = re.compile(rf"\s+(?={_SPAN_OPEN})", re.IGNORECASE)
_SPACE_AFTER_SPAN = re.compile(r"(</span>)\s+", re.IGNORECASE)
_SPACE_BEFORE_PUNCTUATION_AFTER_SPAN = re.compile(
    r"(</span>)\s+(?=[,\.?!;:，。？！；：、．])", re.IGNORECASE
)


class TranslationGlossary:
    """Protect configured terms from machine translation in either direction."""

    def __init__(self, entries: list[dict[str, list[str]]] | None = None):
        self._directions: dict[
            tuple[str, str], tuple[re.Pattern[str], dict[str, str]]
        ] = {}
        self._build(entries or [])

    @classmethod
    def from_file(cls, path: str | Path) -> "TranslationGlossary":
        with Path(path).expanduser().open(encoding="utf-8") as glossary_file:
            data = json.load(glossary_file)
        if not isinstance(data, dict) or not isinstance(data.get("entries"), list):
            raise ValueError("Translation glossary must contain an entries list")
        return cls(data["entries"])

    def prepare(self, text: str, source: str, target: str) -> str:
        escaped_text = escape(text, quote=False)
        direction = self._directions.get((source, target))
        if direction is None:
            return escaped_text

        pattern, replacements = direction

        def replace(match: re.Match[str]) -> str:
            target_term = replacements[match.group(0).casefold()]
            return f'<span translate="no">{target_term}</span>'

        return pattern.sub(replace, escaped_text)

    @staticmethod
    def restore(translated_html: str, target: str | None = None) -> str:
        cleaned = _SPACE_BEFORE_PUNCTUATION_AFTER_SPAN.sub(r"\1", translated_html)
        if target and target.startswith("zh"):
            cleaned = _SPACE_BEFORE_SPAN.sub("", cleaned)
            cleaned = _SPACE_AFTER_SPAN.sub(r"\1", cleaned)
        return unescape(_SPAN_TAG.sub("", cleaned))

    def _build(self, entries: list[dict[str, list[str]]]) -> None:
        mappings: dict[tuple[str, str], dict[str, str]] = {}
        for entry_index, entry in enumerate(entries):
            normalized = _validate_entry(entry, entry_index)
            for source, source_terms in normalized.items():
                for target, target_terms in normalized.items():
                    if source == target:
                        continue
                    direction = mappings.setdefault((source, target), {})
                    target_term = escape(target_terms[0], quote=False)
                    for source_term in source_terms:
                        escaped_source = escape(source_term, quote=False)
                        key = escaped_source.casefold()
                        existing = direction.get(key)
                        if existing is not None and existing != target_term:
                            raise ValueError(
                                f"Glossary term {source_term!r} has conflicting targets"
                            )
                        direction[key] = target_term

        for (source, target), replacements in mappings.items():
            alternatives = sorted(replacements, key=len, reverse=True)
            expression = "|".join(re.escape(term) for term in alternatives)
            if not source.startswith("zh"):
                expression = rf"(?<!\w)(?:{expression})(?!\w)"
            self._directions[(source, target)] = (
                re.compile(expression, re.IGNORECASE),
                replacements,
            )


def _validate_entry(entry: Any, index: int) -> dict[str, list[str]]:
    if not isinstance(entry, dict) or len(entry) < 2:
        raise ValueError(f"Glossary entry {index} must define at least two languages")
    normalized: dict[str, list[str]] = {}
    for language, terms in entry.items():
        if (
            not isinstance(language, str)
            or not isinstance(terms, list)
            or not terms
            or not all(isinstance(term, str) and term for term in terms)
        ):
            raise ValueError(
                f"Glossary entry {index} language values must be non-empty string lists"
            )
        normalized[language] = terms
    return normalized
