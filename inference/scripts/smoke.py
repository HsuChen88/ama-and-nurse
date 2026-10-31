#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from inference_service.media import audio_content_type


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke-test a running inference service")
    parser.add_argument(
        "audio",
        type=Path,
        help="webm/opus, mp4/aac, ogg/opus, or 16 kHz mono WAV file",
    )
    parser.add_argument("--url", default="http://127.0.0.1:8001")
    parser.add_argument("--token", required=True, help="INFERENCE_API_TOKEN value")
    parser.add_argument("--language", choices=("nan-TW", "id"), required=True)
    parser.add_argument("--cf-access-client-id")
    parser.add_argument("--cf-access-client-secret")
    return parser.parse_args()


def multipart_body(audio: Path, language: str) -> tuple[bytes, str]:
    boundary = f"----ama-inference-{uuid.uuid4().hex}"
    mime = audio_content_type(audio)
    chunks = [
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="language"\r\n\r\n',
        language.encode(),
        b"\r\n",
        f"--{boundary}\r\n".encode(),
        (
            f'Content-Disposition: form-data; name="audio"; filename="{audio.name}"\r\n'
        ).encode(),
        f"Content-Type: {mime}\r\n\r\n".encode(),
        audio.read_bytes(),
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return b"".join(chunks), boundary


def main() -> int:
    args = parse_args()
    body, boundary = multipart_body(args.audio, args.language)
    headers = {
        "Authorization": f"Bearer {args.token}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    if args.cf_access_client_id:
        headers["CF-Access-Client-Id"] = args.cf_access_client_id
    if args.cf_access_client_secret:
        headers["CF-Access-Client-Secret"] = args.cf_access_client_secret

    request = Request(f"{args.url.rstrip('/')}/v1/asr", body, headers, method="POST")
    started = time.perf_counter()
    try:
        with urlopen(request, timeout=600) as response:
            payload = json.load(response)
    except HTTPError as exc:
        print(exc.read().decode())
        return 1
    except URLError as exc:
        print(f"request failed: {exc}")
        return 1

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"request_ms={elapsed_ms}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
