from app.meta import build_description, clean_description, clean_tags, clean_title


def test_title_is_shortened_and_cleaned():
    t = clean_title("ASMR <b>soap</b> " + "cutting " * 30)
    assert len(t) <= 100
    assert "<" not in t and ">" not in t
    assert clean_title("   ") == "Relaxing ASMR"


def test_description_respects_youtube_byte_limit():
    d = clean_description("😌" * 3000)  # 4 bytes each = 12000 bytes
    assert len(d.encode("utf-8")) <= 5000
    assert d == "😌" * (len(d))  # no broken characters


def test_tags_are_deduplicated_and_limited():
    tags = clean_tags(["#ASMR", "asmr", "soap, cutting", "<x>", ""] + [f"tag number {i}" for i in range(100)])
    assert tags[0] == "ASMR"
    assert "asmr" not in tags[1:]
    assert "soap cutting" in tags
    assert "x" in tags
    total = sum(len(t) + (2 if " " in t else 0) for t in tags) + len(tags) - 1
    assert total <= 500


def test_build_description_adds_hashtags_credit_and_footer():
    d = build_description("Relax with soap.", ["#asmr", "#ASMR", "#soap cutting"], "Subscribe!",
                          "https://www.instagram.com/reel/ABCDE12345/", "maker", shorts=True)
    assert d.startswith("Relax with soap.")
    assert "#asmr #soapcutting #shorts" in d
    assert "Original: https://www.instagram.com/reel/ABCDE12345/ (by @maker)" in d
    assert d.endswith("Subscribe!")


def test_build_description_without_credit():
    d = build_description("Calm.", [], "", None, None, shorts=False)
    assert d == "Calm."
