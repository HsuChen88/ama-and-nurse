from backend.storage import AudioStore


def test_audio_expires_at_ttl():
    store = AudioStore(ttl_seconds=0)

    audio_id = store.put(b"audio", "audio/wav")

    assert store.get(audio_id) is None
