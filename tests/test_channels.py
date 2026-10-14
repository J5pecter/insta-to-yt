"""Tests for multi-channel management and channel selection."""
import pytest
from fastapi.testclient import TestClient

from app.db import Database
from app.main import create_app
from tests.conftest import Harness

PASSWORD = "test-password-123"


def test_channel_db_operations(tmp_path):
    db = Database(tmp_path / "app.db")
    assert db.list_channels() == []
    assert db.get_active_channel() is None

    # Add first channel -> becomes active automatically
    db.save_channel("UC_1", "Channel One", "@ch1", "https://img/1.jpg", '{"token": "t1"}')
    ch1 = db.get_channel("UC_1")
    assert ch1 is not None
    assert ch1["title"] == "Channel One"
    assert ch1["is_active"] == 1

    active = db.get_active_channel()
    assert active["channel_id"] == "UC_1"

    # Add second channel without set_active -> remains inactive
    db.save_channel("UC_2", "Channel Two", "@ch2", "https://img/2.jpg", '{"token": "t2"}')
    channels = db.list_channels()
    assert len(channels) == 2
    assert db.get_active_channel()["channel_id"] == "UC_1"

    # Switch active channel to Channel Two
    assert db.set_active_channel("UC_2") is True
    assert db.get_active_channel()["channel_id"] == "UC_2"
    assert db.get_channel("UC_1")["is_active"] == 0
    assert db.get_channel("UC_2")["is_active"] == 1

    # Delete Channel Two -> Channel One becomes active automatically
    db.delete_channel("UC_2")
    assert len(db.list_channels()) == 1
    assert db.get_active_channel()["channel_id"] == "UC_1"


def test_channel_api_and_add_video_selection(tmp_path):
    h = Harness(tmp_path)
    # Add two channels to db
    h.db.save_channel("UC_A", "Channel Alpha", "@alpha", "", '{"token": "a"}', set_active=True)
    h.db.save_channel("UC_B", "Channel Beta", "@beta", "", '{"token": "b"}', set_active=False)

    app = create_app(h.settings, db=h.db, youtube=h.youtube, pipeline=h.pipeline, start_worker=False)
    client = TestClient(app)
    assert client.post("/api/login", json={"password": PASSWORD}).status_code == 200

    # List channels via API
    res = client.get("/api/channels")
    assert res.status_code == 200
    ch_list = res.json()["channels"]
    assert len(ch_list) == 2
    assert ch_list[0]["channel_id"] == "UC_A"

    # Select Channel Beta via API
    sel_res = client.post("/api/channels/UC_B/select")
    assert sel_res.status_code == 200
    active = h.db.get_active_channel()
    assert active["channel_id"] == "UC_B"

    # Add video without explicit channel_id -> picks current active (Channel Beta)
    body = {
        "links": "https://www.instagram.com/reel/TEST000001/",
        "privacy": "private",
        "auto_upload": True,
        "rights_confirmed": True,
    }
    add_res = client.post("/api/videos", json=body)
    assert add_res.status_code == 200
    v1 = h.db.get_by_shortcode("TEST000001")
    assert v1["channel_id"] == "UC_B"
    assert v1["channel_title"] == "Channel Beta"

    # Add video with explicit channel_id (Channel Alpha)
    body2 = {
        "links": "https://www.instagram.com/reel/TEST000002/",
        "privacy": "unlisted",
        "auto_upload": False,
        "rights_confirmed": True,
        "channel_id": "UC_A",
    }
    add_res2 = client.post("/api/videos", json=body2)
    assert add_res2.status_code == 200
    v2 = h.db.get_by_shortcode("TEST000002")
    assert v2["channel_id"] == "UC_A"
    assert v2["channel_title"] == "Channel Alpha"

    # Save client secret
    cs_res = client.post("/api/client-secret", json={
        "content": '{"web": {"client_id": "123", "client_secret": "abc"}}'
    })
    assert cs_res.status_code == 200

    # Invalid client secret
    bad_cs = client.post("/api/client-secret", json={"content": '{"invalid": 1}'})
    assert bad_cs.status_code == 400
