"""The full flow, with fake Instagram / AI / YouTube."""
import pytest

from app.pipeline import ActionError
from tests.conftest import Harness


def test_happy_path_uploads_once_with_ai_text(harness):
    vid = harness.add("REEL000001")
    harness.drain()

    row = harness.db.get(vid)
    assert row["status"] == "uploaded"
    assert row["youtube_id"] == "YT000000001"
    assert len(harness.youtube.uploads) == 1
    up = harness.youtube.uploads[0]
    assert up["title"] == "ASMR Soap Cutting Crunchy Cubes"  # < > removed
    assert "#asmr" in up["description"] and "#shorts" in up["description"]
    assert "Original: https://www.instagram.com/reel/REEL000001/ (by @soapmaker)" in up["description"]
    assert up["tags"] == ["asmr", "soap cutting", "satisfying"]
    assert row["is_asmr"] is True and row["asmr_triggers"] == ["soap cutting", "crunching"]
    assert row["file_path"] is None  # downloaded file cleaned up
    assert (harness.settings.thumbs_dir / f"{vid}.jpg").exists()


def test_same_link_twice_is_never_uploaded_twice(harness):
    first = harness.add("REEL000001")
    harness.drain()
    second = harness.add("REEL000001")
    harness.drain()
    assert first == second
    assert len(harness.youtube.uploads) == 1
    assert harness.instagram.calls == ["REEL000001"]  # not even downloaded again


def test_same_video_under_a_new_link_is_caught(harness):
    harness.instagram.files = {"REEL000001": b"same bytes", "REEL000002": b"same bytes"}
    a = harness.add("REEL000001")
    harness.drain()
    b = harness.add("REEL000002")
    harness.drain()
    assert harness.db.get(a)["status"] == "uploaded"
    dup = harness.db.get(b)
    assert dup["status"] == "duplicate"
    assert dup["duplicate_of"] == a
    assert len(harness.youtube.uploads) == 1
    assert harness.db.stats()["duplicates_blocked"] == 1


def test_not_asmr_waits_for_review_then_uploads_once(harness):
    harness.ai.is_asmr = False
    vid = harness.add("REEL000001")
    harness.drain()
    row = harness.db.get(vid)
    assert row["status"] == "review"
    assert "NOT an ASMR" in row["error"]
    assert harness.youtube.uploads == []

    harness.pipeline.save_edits(vid, title="My own title", tags=["calm"])
    harness.pipeline.approve(vid)
    with pytest.raises(ActionError):
        harness.pipeline.approve(vid)  # double-click
    harness.drain()
    assert harness.db.get(vid)["status"] == "uploaded"
    assert [u["title"] for u in harness.youtube.uploads] == ["My own title"]


def test_auto_upload_off_waits_for_review(harness):
    vid = harness.add("REEL000001", auto_upload=False)
    harness.drain()
    assert harness.db.get(vid)["status"] == "review"
    assert harness.youtube.uploads == []


def test_ai_failure_falls_back_to_instagram_caption(harness):
    harness.ai.fail = True
    vid = harness.add("REEL000001")
    harness.drain()
    row = harness.db.get(vid)
    assert row["status"] == "review"
    assert "AI step failed" in row["error"]
    assert row["title"] == "ASMR Soap Cutting | Soap cutting so satisfying"  # free-mode guess
    assert row["is_asmr"] is True


def test_free_mode_uploads_automatically_when_caption_says_asmr(tmp_path):
    h = Harness(tmp_path, ai_provider="free")
    vid = h.add("REEL000001")
    h.drain()
    assert h.ai.calls == 0  # no paid AI used
    row = h.db.get(vid)
    assert row["status"] == "uploaded"
    assert row["is_asmr"] is True and row["asmr_confidence"] == "high"
    assert h.youtube.uploads[0]["title"] == "ASMR Soap Cutting | Soap cutting so satisfying"


def test_free_mode_holds_videos_with_no_asmr_words(tmp_path):
    h = Harness(tmp_path, ai_provider="free")
    h.instagram.caption = "Our trip to the beach #holiday"
    vid = h.add("REEL000001")
    h.drain()
    row = h.db.get(vid)
    assert row["status"] == "review"
    assert "No ASMR words" in row["error"]
    assert h.youtube.uploads == []


def test_free_mode_can_skip_the_asmr_check(tmp_path):
    h = Harness(tmp_path, ai_provider="free", hold_non_asmr=False)
    h.instagram.caption = ""
    vid = h.add("REEL000001")
    h.drain()
    assert h.db.get(vid)["status"] == "uploaded"
    assert h.youtube.uploads[0]["title"] == "Relaxing ASMR Sounds"


def test_youtube_not_connected_waits(harness):
    harness.youtube.connected = False
    vid = harness.add("REEL000001")
    harness.drain()
    assert harness.db.get(vid)["status"] == "review"
    with pytest.raises(ActionError):
        harness.pipeline.approve(vid)


def test_upload_failure_then_retry(harness):
    harness.youtube.fail_next = 1
    vid = harness.add("REEL000001")
    harness.drain()
    row = harness.db.get(vid)
    assert row["status"] == "failed"
    assert "limit" in row["error"]

    assert harness.pipeline.retry(vid) == "upload"
    harness.drain()
    assert harness.db.get(vid)["status"] == "uploaded"
    assert len(harness.youtube.uploads) == 1
    assert harness.instagram.calls == ["REEL000001"]  # retry reused the file


def test_download_failure_then_retry(harness):
    harness.instagram.fail.add("REEL000001")
    vid = harness.add("REEL000001")
    harness.drain()
    assert harness.db.get(vid)["status"] == "failed"
    assert "Download failed" in harness.db.get(vid)["error"]

    harness.instagram.fail.clear()
    assert harness.pipeline.retry(vid) == "process"
    harness.drain()
    assert harness.db.get(vid)["status"] == "uploaded"


def test_crash_during_upload_is_marked_interrupted_not_failed(harness, monkeypatch):
    vid = harness.add("REEL000001", auto_upload=False)
    harness.drain()

    def crash(video_id):
        harness.db.update(video_id, status="uploading")
        raise RuntimeError("power cut")

    monkeypatch.setattr(harness.pipeline, "_upload", crash)
    harness.pipeline.run_job("upload", vid)
    row = harness.db.get(vid)
    assert row["status"] == "interrupted"
    assert "Check YouTube" in row["error"]


def test_uploaded_records_cannot_be_deleted(harness):
    vid = harness.add("REEL000001")
    harness.drain()
    with pytest.raises(ActionError):
        harness.pipeline.delete(vid)


def test_mark_uploaded_by_hand(harness):
    vid = harness.add("REEL000001", auto_upload=False)
    harness.drain()
    harness.pipeline.mark_uploaded(vid, "dQw4w9WgXcQ")
    row = harness.db.get(vid)
    assert row["status"] == "uploaded" and row["youtube_id"] == "dQw4w9WgXcQ"

    other = harness.add("REEL000002", auto_upload=False)
    harness.drain()
    with pytest.raises(ActionError):
        harness.pipeline.mark_uploaded(other, "dQw4w9WgXcQ")  # same YouTube video twice
