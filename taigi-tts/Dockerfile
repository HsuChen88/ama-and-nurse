ARG BASE_IMAGE=taigi-tts-taigi-tts-poc:latest
FROM ${BASE_IMAGE}

ENV PYTHONPATH=/app/src:/app:/opt/GPT-SoVITS:/opt/GPT-SoVITS/GPT_SoVITS \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_DATASETS_OFFLINE=1 \
    TAIGI_TTS_CACHE_DIR=/cache \
    TW_TTS_OUT=/cache/tw-synth

WORKDIR /app
COPY src /app/src

EXPOSE 8002
CMD ["sh", "-c", "cd /opt/GPT-SoVITS && exec python -m uvicorn taigi_tts.app:create_app --factory --host 0.0.0.0 --port 8002"]
