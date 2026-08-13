from scripts.backfill_person_korean_names import select_korean_alias


def test_select_korean_alias_prefers_hangul_only_alias() -> None:
    payload = {"also_known_as": ["Kim Tae-yun", "김태윤", "Kim Tae Yoon"]}

    assert select_korean_alias(payload) == "김태윤"


def test_select_korean_alias_does_not_guess_without_hangul_alias() -> None:
    payload = {"also_known_as": ["Kim Tae-yun", "Kim Tae Yoon"]}

    assert select_korean_alias(payload) is None


def test_select_korean_alias_ignores_mixed_latin_alias() -> None:
    payload = {"also_known_as": ["김태윤 Kim Tae-yun", "김태윤"]}

    assert select_korean_alias(payload) == "김태윤"


def test_select_korean_alias_collapses_accidental_duplicate() -> None:
    payload = {"also_known_as": ["조성희조성희"]}

    assert select_korean_alias(payload) == "조성희"
