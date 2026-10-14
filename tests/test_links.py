import pytest

from app.links import InvalidLink, parse_instagram_link, parse_youtube_id


@pytest.mark.parametrize("raw, code, url", [
    ("https://www.instagram.com/reel/C9abcDEF123/?igsh=MWx1", "C9abcDEF123", "https://www.instagram.com/reel/C9abcDEF123/"),
    ("instagram.com/reels/C9abcDEF123", "C9abcDEF123", "https://www.instagram.com/reel/C9abcDEF123/"),
    ("https://www.instagram.com/p/C9abcDEF123/", "C9abcDEF123", "https://www.instagram.com/p/C9abcDEF123/"),
    ("https://m.instagram.com/tv/C9abc_EF-23", "C9abc_EF-23", "https://www.instagram.com/tv/C9abc_EF-23/"),
    ("https://www.instagram.com/some.user_1/reel/C9abcDEF123/", "C9abcDEF123", "https://www.instagram.com/reel/C9abcDEF123/"),
    ("  HTTPS://WWW.INSTAGRAM.COM/reel/C9abcDEF123#x  ", "C9abcDEF123", "https://www.instagram.com/reel/C9abcDEF123/"),
])
def test_valid_instagram_links(raw, code, url):
    link = parse_instagram_link(raw)
    assert link.shortcode == code
    assert link.url == url


@pytest.mark.parametrize("raw", [
    "",
    "hello",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://instagram.com.evil.com/reel/C9abcDEF123/",
    "https://evil.com/instagram.com/reel/C9abcDEF123/",
    "javascript:alert(1)",
    "ftp://instagram.com/reel/C9abcDEF123/",
    "https://user:pw@instagram.com/reel/C9abcDEF123/",
    "https://instagram.com:8080/reel/C9abcDEF123/",
    "https://www.instagram.com/someuser/",
    "https://www.instagram.com/reel/abc/",
    "https://www.instagram.com/reel/C9abc/../../etc/",
    "https://www.instagram.com/stories/user/123456789/",
])
def test_invalid_instagram_links(raw):
    with pytest.raises(InvalidLink):
        parse_instagram_link(raw)


@pytest.mark.parametrize("raw", [
    "dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
    "youtube.com/shorts/dQw4w9WgXcQ",
    "https://studio.youtube.com/video/dQw4w9WgXcQ/edit",
])
def test_youtube_ids(raw):
    assert parse_youtube_id(raw) == "dQw4w9WgXcQ"


@pytest.mark.parametrize("raw", ["", "https://evil.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/short", "not a link"])
def test_bad_youtube_ids(raw):
    with pytest.raises(InvalidLink):
        parse_youtube_id(raw)
