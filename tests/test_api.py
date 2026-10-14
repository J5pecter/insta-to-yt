"""The web API: login, adding links, duplicate answers, review actions."""
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import Harness

PASSWORD = "test-password-123"


@pytest.fixture
def setup(tmp_path):
    h = Harness(tmp_path)
    app = create_app(h.settings, db=h.db, youtube=h.youtube, pipeline=h.pipeline, start_worker=False)
    client = TestClient(app)
    return h, client


def login(client):
    assert client.post("/api/login", json={"password": PASSWORD}).status_code == 200


def add(client, links, **extra):
    body = {"links": links, "privacy": "private", "auto_upload": True, "rights_confirmed": True, **extra}
    return client.post("/api/videos", json=body)


def test_everything_needs_login(setup):
    _, client = setup
    assert client.get("/api/videos").status_code == 401
    assert client.get("/api/status").status_code == 401
    assert add(client, "https://www.instagram.com/reel/REEL000001/").status_code == 401
    page = client.get("/", follow_redirects=False)
    assert page.status_code == 303 and page.headers["location"] == "/login"


def test_wrong_password_and_lockout(setup):
    _, client = setup
    for _ in range(5):
        assert client.post("/api/login", json={"password": "nope"}).status_code == 401
    assert client.post("/api/login", json={"password": PASSWORD}).status_code == 429


def test_add_links_reports_added_invalid_and_duplicate(setup):
    h, client = setup
    login(client)
    res = add(client, "https://www.instagram.com/reel/REEL000001/\nhttps://example.com/x\n"
                      "instagram.com/reels/REEL000001")
    outcomes = [r["outcome"] for r in res.json()["results"]]
    assert outcomes == ["added", "invalid", "duplicate"]

    h.drain()
    again = add(client, "https://www.instagram.com/reel/REEL000001/?igsh=abc").json()["results"][0]
    assert again["outcome"] == "duplicate"
    assert "Already on YouTube" in again["message"]
    assert again["youtube_url"] == "https://youtu.be/YT000000001"
    assert len(h.youtube.uploads) == 1

    data = client.get("/api/videos").json()
    assert data["stats"]["uploaded"] == 1
    assert data["stats"]["duplicates_blocked"] == 2
    assert "file_path" not in data["videos"][0]


def test_rights_must_be_confirmed(setup):
    _, client = setup
    login(client)
    res = add(client, "https://www.instagram.com/reel/REEL000001/", rights_confirmed=False)
    assert res.status_code == 400


def test_review_upload_twice_is_rejected(setup):
    h, client = setup
    login(client)
    add(client, "https://www.instagram.com/reel/REEL000001/", auto_upload=False)
    h.drain()
    vid = client.get("/api/videos").json()["videos"][0]["id"]

    body = {"title": "Edited title", "description": "d", "tags": ["a"], "privacy": "unlisted"}
    assert client.post(f"/api/videos/{vid}/upload", json=body).status_code == 200
    assert client.post(f"/api/videos/{vid}/upload", json=body).status_code == 409
    h.drain()
    assert len(h.youtube.uploads) == 1
    assert h.youtube.uploads[0]["privacy"] == "unlisted"


def test_status_and_security_headers(setup):
    _, client = setup
    login(client)
    res = client.get("/api/status")
    assert res.json()["youtube"]["channel_title"] == "Test ASMR Channel"
    assert "frame-ancestors 'none'" in res.headers["content-security-policy"]
    assert client.get("/api/videos/999/thumb").status_code == 404


def test_status_reports_local_ai_not_running(tmp_path):
    h = Harness(tmp_path, ai_provider="local", ollama_url="http://127.0.0.1:1")
    client = TestClient(create_app(h.settings, db=h.db, youtube=h.youtube, pipeline=h.pipeline,
                                   start_worker=False))
    login(client)
    ai = client.get("/api/status").json()["ai"]
    assert ai["provider"] == "local" and ai["ready"] is False
    assert "isn't running" in ai["message"]
