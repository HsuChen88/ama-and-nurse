FROM ghcr.io/astral-sh/uv:0.12.3 AS uv

FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

# The GPU server runs driver 535 (CUDA 12.2). CUDA 12.x minor-version compatibility
# lets this 12.8 runtime run on it, so skip the container toolkit's cuda>=12.8 check.
ENV NVIDIA_DISABLE_REQUIRE=1

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates python3.12 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /bin/

WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
RUN uv sync --frozen --no-dev

EXPOSE 8001
CMD ["uv", "run", "uvicorn", "inference_service.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8001"]
