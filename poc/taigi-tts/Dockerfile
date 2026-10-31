FROM alpine/git:2.49.1 AS source

ARG KAEDETAI_COMMIT=81959852f75c972a0a78364f8ea6b14133a11f4a
RUN git clone https://github.com/KaedeTai/GPT-SoVITS.git /src \
    && git -C /src checkout "$KAEDETAI_COMMIT" \
    && test "$(git -C /src rev-parse HEAD)" = "$KAEDETAI_COMMIT"

FROM python:3.11

ARG KAEDETAI_COMMIT=81959852f75c972a0a78364f8ea6b14133a11f4a
ENV KAEDETAI_COMMIT=${KAEDETAI_COMMIT} \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_DATASETS_OFFLINE=1 \
    NLTK_DATA=/usr/local/share/nltk_data \
    TW_TTS_OUT=/out/.tts-cache \
    PYTHONPATH=/app:/opt/GPT-SoVITS:/opt/GPT-SoVITS/GPT_SoVITS

COPY --from=source /src /opt/GPT-SoVITS
COPY docker/patch_upstream.py /tmp/build/patch_upstream.py
COPY docker/prepare_build_assets.py /tmp/build/prepare_build_assets.py
COPY docker/tts_long.py /opt/GPT-SoVITS/tts_long.py
COPY docker/entrypoint.py /usr/local/bin/taigi-poc-entrypoint

# Separate layer so a later failure does not re-download the ~2.5 GB torch wheels.
RUN python -m pip install --no-cache-dir cmake==3.31.6 imageio-ffmpeg==0.6.0 \
    && python -m pip install --no-cache-dir \
      torch==2.5.1+cu121 torchaudio==2.5.1+cu121 \
      --index-url https://download.pytorch.org/whl/cu121

# Upstream forces `--no-binary=opencc`, whose source build fails here; the
# prebuilt manylinux wheel works, so drop that line along with torchaudio.
RUN sed -e '/^torchaudio$/d' -e '/^--no-binary/d' /opt/GPT-SoVITS/requirements.txt \
      > /tmp/requirements-no-torchaudio.txt \
    && python -m pip install --no-cache-dir \
      -r /tmp/requirements-no-torchaudio.txt \
      accelerate==1.2.1 sacremoses==0.1.1 imageio-ffmpeg==0.6.0 \
      fast-langdetect==1.1.0 \
    && ln -s "$(python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')" \
      /usr/local/bin/ffmpeg \
    && python /tmp/build/patch_upstream.py \
    && KAEDETAI_COMMIT="$KAEDETAI_COMMIT" \
      python /tmp/build/prepare_build_assets.py \
    && python -m compileall -q /opt/GPT-SoVITS \
    && chmod +x /usr/local/bin/taigi-poc-entrypoint

WORKDIR /app
COPY pyproject.toml run.py sentences.csv /app/
COPY taigi_poc /app/taigi_poc

ENTRYPOINT ["python", "/usr/local/bin/taigi-poc-entrypoint"]
CMD ["python", "/app/run.py"]
