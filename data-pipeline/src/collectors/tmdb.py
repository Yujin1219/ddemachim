from __future__ import annotations

import time
from typing import Any, Literal

import requests

from src.utils.http import get_with_retry
from src.utils.logging import get_logger

logger = get_logger(__name__)

BASE_URL = "https://api.themoviedb.org/3"

MediaKind = Literal["movie", "tv"]


class TmdbAuthError(RuntimeError):
    """TMDB 인증(Bearer/api_key 모두)이 실패했을 때."""


def _is_bearer_token(api_key: str) -> bool:
    """TMDB Read Access Token(v4, JWT형)인지 판별한다.

    v4 토큰은 'eyJ'로 시작하는 JWT 형태이고 길이가 훨씬 길다(150자+).
    v3 api_key는 32자리 hex 문자열이다. .env의 TMDB_API_KEY 값 자체는 로그에 남기지 않고
    형식(길이/접두사)만으로 판단한다.
    """
    return api_key.startswith("eyJ") or len(api_key) > 40


def _get(url: str, api_key: str, params: dict[str, Any], use_bearer: bool) -> requests.Response:
    if use_bearer:
        headers = {"Authorization": f"Bearer {api_key}", "accept": "application/json"}
        # get_with_retry는 헤더를 지원하지 않으므로 여기서는 requests를 직접 쓰되
        # 동일한 재시도/백오프 정책을 적용한다.
        last_exc: Exception | None = None
        for attempt in range(1, 4):
            try:
                response = requests.get(url, params=params, headers=headers, timeout=15)
            except requests.RequestException as exc:
                last_exc = exc
                logger.warning(f"TMDB 요청 실패({attempt}/3): {exc}")
                time.sleep(2.0 * attempt)
                continue
            if response.status_code == 429:
                logger.warning(f"TMDB 429 rate limit ({attempt}/3), {2.0 * attempt}초 대기")
                time.sleep(2.0 * attempt)
                continue
            if response.status_code == 401:
                raise TmdbAuthError(f"TMDB 인증 실패(401, Bearer 방식): {response.text[:200]}")
            response.raise_for_status()
            return response
        raise RuntimeError(f"3회 재시도 후에도 TMDB 요청 실패: {url}") from last_exc
    else:
        params = {**params, "api_key": api_key}
        try:
            return get_with_retry(url, params=params)
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 401:
                raise TmdbAuthError(f"TMDB 인증 실패(401, api_key 방식): {exc.response.text[:200]}") from exc
            raise


class TmdbClient:
    """TMDB search/movie, search/tv 클라이언트.

    .env의 TMDB_API_KEY 형식을 보고 Bearer(v4 Read Access Token) 또는
    api_key 쿼리파라미터(v3) 방식을 선택한다. 선택한 방식이 401로 실패하면
    한 번은 다른 방식으로 자동 폴백을 시도한다(안 되면 명확히 예외를 올린다).
    """

    def __init__(self, api_key: str, request_delay: float = 0.15) -> None:
        self.api_key = api_key
        self.request_delay = request_delay
        self._use_bearer = _is_bearer_token(api_key)
        self._verified = False

    def _search(self, kind: MediaKind, query: str) -> list[dict[str, Any]]:
        url = f"{BASE_URL}/search/{kind}"
        params = {"query": query, "language": "ko-KR", "include_adult": "false", "page": 1}

        try:
            response = _get(url, self.api_key, params, use_bearer=self._use_bearer)
        except TmdbAuthError as first_exc:
            if self._verified:
                raise
            logger.warning(f"1차 인증 방식({'Bearer' if self._use_bearer else 'api_key'}) 실패, 반대 방식으로 재시도: {first_exc}")
            self._use_bearer = not self._use_bearer
            response = _get(url, self.api_key, params, use_bearer=self._use_bearer)

        self._verified = True
        if self.request_delay:
            time.sleep(self.request_delay)

        payload = response.json()
        return payload.get("results", [])

    def search_movie(self, query: str) -> list[dict[str, Any]]:
        return self._search("movie", query)

    def search_tv(self, query: str) -> list[dict[str, Any]]:
        return self._search("tv", query)

    def get_credits(self, kind: MediaKind, tmdb_id: int) -> dict[str, Any]:
        """movie/{id}/credits 또는 tv/{id}/credits. 응답: {"cast": [...], "crew": [...], "id": ...}."""
        url = f"{BASE_URL}/{kind}/{tmdb_id}/credits"
        params = {"language": "ko-KR"}

        try:
            response = _get(url, self.api_key, params, use_bearer=self._use_bearer)
        except TmdbAuthError as first_exc:
            if self._verified:
                raise
            logger.warning(f"1차 인증 방식({'Bearer' if self._use_bearer else 'api_key'}) 실패, 반대 방식으로 재시도: {first_exc}")
            self._use_bearer = not self._use_bearer
            response = _get(url, self.api_key, params, use_bearer=self._use_bearer)

        self._verified = True
        if self.request_delay:
            time.sleep(self.request_delay)

        return response.json()

    def get_person_details(self, tmdb_person_id: int) -> dict[str, Any]:
        """인물 상세와 TMDB에 등록된 다국어 별칭을 조회한다."""
        url = f"{BASE_URL}/person/{tmdb_person_id}"
        params = {"language": "ko-KR"}

        try:
            response = _get(url, self.api_key, params, use_bearer=self._use_bearer)
        except TmdbAuthError as first_exc:
            if self._verified:
                raise
            logger.warning(f"1차 인증 방식({'Bearer' if self._use_bearer else 'api_key'}) 실패, 반대 방식으로 재시도: {first_exc}")
            self._use_bearer = not self._use_bearer
            response = _get(url, self.api_key, params, use_bearer=self._use_bearer)

        self._verified = True
        if self.request_delay:
            time.sleep(self.request_delay)

        return response.json()
