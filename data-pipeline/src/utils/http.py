from __future__ import annotations

import time
from typing import Any

import requests

from src.utils.logging import get_logger

logger = get_logger(__name__)


def get_with_retry(
    url: str,
    params: dict[str, Any],
    timeout: int = 15,
    max_retries: int = 3,
    backoff_seconds: float = 2.0,
) -> requests.Response:
    """timeout/네트워크 오류/429는 재시도, 그 외 HTTP 오류는 즉시 예외를 올린다."""
    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            response = requests.get(url, params=params, timeout=timeout)
        except requests.RequestException as exc:
            last_exc = exc
            logger.warning(f"요청 실패({attempt}/{max_retries}): {exc}")
            time.sleep(backoff_seconds * attempt)
            continue

        if response.status_code == 429:
            logger.warning(f"429 rate limit ({attempt}/{max_retries}), {backoff_seconds * attempt}초 대기")
            time.sleep(backoff_seconds * attempt)
            continue

        response.raise_for_status()
        return response

    raise RuntimeError(f"{max_retries}회 재시도 후에도 요청 실패: {url}") from last_exc
