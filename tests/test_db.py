from app.db import Database


def make_db(tmp_path):
    return Database(tmp_path / "app.db")


def test_same_link_is_only_stored_once(tmp_path):
    db = make_db(tmp_path)
    first, created1 = db.add_link("ABCDE12345", "https://www.instagram.com/reel/ABCDE12345/", True, "private")
    second, created2 = db.add_link("ABCDE12345", "https://www.instagram.com/reel/ABCDE12345/", True, "public")
    assert created1 is True and created2 is False
    assert first["id"] == second["id"]
    assert second["duplicate_hits"] == 1
    assert second["privacy"] == "private"  # the repeat changed nothing
    assert len(db.list_all()) == 1


def test_claim_only_succeeds_once(tmp_path):
    db = make_db(tmp_path)
    v, _ = db.add_link("ABCDE12345", "u", True, "private")
    db.update(v["id"], status="review")
    assert db.claim(v["id"], ("review",), "upload_queued") is True
    assert db.claim(v["id"], ("review",), "upload_queued") is False  # double-click does nothing


def test_restart_never_reuploads_an_interrupted_upload(tmp_path):
    db = make_db(tmp_path)
    a, _ = db.add_link("AAAAA11111", "u1", True, "private")
    b, _ = db.add_link("BBBBB22222", "u2", True, "private")
    c, _ = db.add_link("CCCCC33333", "u3", True, "private")
    d, _ = db.add_link("DDDDD44444", "u4", True, "private")
    db.update(a["id"], status="uploading")
    db.update(b["id"], status="downloading")
    db.update(c["id"], status="upload_queued")
    db.update(d["id"], status="uploaded", youtube_id="YT000000001")

    jobs = db.recover_after_restart()

    assert db.get(a["id"])["status"] == "interrupted"
    assert db.get(b["id"])["status"] == "queued"
    assert db.get(d["id"])["status"] == "uploaded"
    assert jobs == [("process", b["id"]), ("upload", c["id"])]


def test_stats(tmp_path):
    db = make_db(tmp_path)
    a, _ = db.add_link("AAAAA11111", "u1", True, "private")
    b, _ = db.add_link("BBBBB22222", "u2", True, "private")
    db.add_link("AAAAA11111", "u1", True, "private")  # pasted again
    db.update(a["id"], status="uploaded", youtube_id="YT000000001")
    db.update(b["id"], status="duplicate")
    s = db.stats()
    assert s["total"] == 2
    assert s["uploaded"] == 1
    assert s["duplicates_blocked"] == 2  # one repeated link + one repeated file


def test_json_fields_round_trip(tmp_path):
    db = make_db(tmp_path)
    v, _ = db.add_link("AAAAA11111", "u1", True, "private")
    db.update(v["id"], tags=["asmr", "soap"], asmr_triggers=["tapping"], is_asmr=True)
    row = db.get(v["id"])
    assert row["tags"] == ["asmr", "soap"]
    assert row["asmr_triggers"] == ["tapping"]
    assert row["is_asmr"] is True
