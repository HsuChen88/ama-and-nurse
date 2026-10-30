import json
from types import SimpleNamespace

from backend.glossary import TranslationGlossary
from backend.providers import GoogleTranslateProvider


ENTRIES = [
    {
        "id": ["Nenek"],
        "zh-TW": ["阿嬤", "阿媽", "阿罵"],
    }
]


def test_indonesian_terms_are_case_insensitive_and_use_word_boundaries():
    glossary = TranslationGlossary(ENTRIES)

    protected = glossary.prepare(
        "nenek, NENEKku dan Nenek.", source="id", target="zh-TW"
    )

    assert protected == (
        '<span translate="no">阿嬤</span>, NENEKku dan '
        '<span translate="no">阿嬤</span>.'
    )


def test_all_chinese_aliases_map_to_canonical_indonesian_term():
    glossary = TranslationGlossary(ENTRIES)

    protected = glossary.prepare(
        "阿嬤、阿媽和阿罵", source="zh-TW", target="id"
    )

    assert protected == (
        '<span translate="no">Nenek</span>、'
        '<span translate="no">Nenek</span>和'
        '<span translate="no">Nenek</span>'
    )


def test_html_special_characters_survive_prepare_and_restore():
    glossary = TranslationGlossary(ENTRIES)

    protected = glossary.prepare("Nenek < sehat & aman", "id", "zh-TW")
    restored = glossary.restore(protected)

    assert protected == (
        '<span translate="no">阿嬤</span> &lt; sehat &amp; aman'
    )
    assert restored == "阿嬤 < sehat & aman"


def test_empty_glossary_only_escapes_and_restores_html():
    glossary = TranslationGlossary()

    protected = glossary.prepare("Nenek < sehat & aman", "id", "zh-TW")

    assert protected == "Nenek &lt; sehat &amp; aman"
    assert glossary.restore(protected) == "Nenek < sehat & aman"


def test_glossary_loads_from_configurable_json_file(tmp_path):
    path = tmp_path / "custom-glossary.json"
    path.write_text(json.dumps({"entries": ENTRIES}), encoding="utf-8")

    glossary = TranslationGlossary.from_file(path)

    assert '<span translate="no">阿嬤</span>' in glossary.prepare(
        "Nenek sakit", "id", "zh-TW"
    )


def test_google_provider_sends_protected_html_and_removes_span_from_response():
    class FakeClient:
        def __init__(self):
            self.request = None

        def translate_text(self, *, request, timeout):
            self.request = request
            return SimpleNamespace(
                translations=[
                    SimpleNamespace(
                        translated_text='<span translate="no">阿嬤</span>哪裡痛？'
                    )
                ]
            )

    client = FakeClient()
    provider = GoogleTranslateProvider(
        client,
        "project",
        glossary=TranslationGlossary(ENTRIES),
    )

    result = provider.translate("Nenek sakit di mana?", "id", "zh-TW")

    assert client.request["contents"] == [
        '<span translate="no">阿嬤</span> sakit di mana?'
    ]
    assert client.request["mime_type"] == "text/html"
    assert result == "阿嬤哪裡痛？"


def test_google_provider_applies_glossary_from_chinese_to_indonesian():
    class FakeClient:
        def __init__(self):
            self.request = None

        def translate_text(self, *, request, timeout):
            self.request = request
            return SimpleNamespace(
                translations=[
                    SimpleNamespace(
                        translated_text='<span translate="no">Nenek</span> sudah makan?'
                    )
                ]
            )

    client = FakeClient()
    provider = GoogleTranslateProvider(
        client,
        "project",
        glossary=TranslationGlossary(ENTRIES),
    )

    result = provider.translate("阿罵食飽未？", "zh-TW", "id")

    assert client.request["contents"] == [
        '<span translate="no">Nenek</span>食飽未？'
    ]
    assert result == "Nenek sudah makan?"
