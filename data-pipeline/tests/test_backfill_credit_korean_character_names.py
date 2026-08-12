from scripts.backfill_credit_korean_character_names import transliterate_korean_character_name


def test_transliterates_romanized_korean_character_name() -> None:
    assert transliterate_korean_character_name("Oh Woo-ri") == "오우리"
    assert transliterate_korean_character_name("Lee Kang-jae") == "이강재"
    assert transliterate_korean_character_name("Maeng Jang-hyeon") == "맹장현"
    assert transliterate_korean_character_name("Ji Hwa-ja") == "지화자"


def test_keeps_general_english_role() -> None:
    assert transliterate_korean_character_name("The Jade Emperor") is None
    assert transliterate_korean_character_name("Chief Secretary Lim") is None


def test_transliterates_only_korean_part_of_mixed_role() -> None:
    assert transliterate_korean_character_name("Raphael / Kim Bok-rae") == "Raphael / 김복래"
