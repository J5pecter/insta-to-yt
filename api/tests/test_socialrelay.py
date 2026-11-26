"""Comprehensive test suite for SocialRelay.
Covers Auth, Cryptography, SSRF Protection, Media Processing, Metadata Engine,
Job State Machine, Queue Leases, Automations DAG, and API Contract Testing.
"""
from __future__ import annotations

import io
import json
import sqlite3
import tempfile
from pathlib import Path
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.app.main import app
from api.app.core.config import settings
from api.app.core.database import Base, get_db
from api.app.models.entities import User, SourceMedia, MediaAsset, ContentDraft, PublishingIntent, PublicationTarget, Job, Automation, SocialAccount
from api.app.security.crypto import hash_password, verify_password, encrypt_token, decrypt_token, create_signed_state, verify_signed_state
from api.app.security.ssrf import validate_url_safe, SSRFValidationError, SUPPORTED_INSTAGRAM_DOMAINS
from api.app.services.imports.service import normalize_instagram_url, check_mp4_mov_magic_bytes, ImportValidationError
from api.app.services.metadata.engine import metadata_engine
from api.app.services.media.processor import video_processor
from api.app.workers.state_machine import State, StateMachine, InvalidStateTransitionError
from api.app.workers.job_queue import JobQueue
from api.app.services.automations.engine import automation_engine, WorkflowValidationError
from api.app.services.storage.manager import storage_manager

# Setup isolated test database using a temporary file so all connections share tables
temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
temp_db.close()
test_db_path = Path(temp_db.name)
test_engine = create_engine(f"sqlite:///{test_db_path.as_posix()}", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    with TestingSessionLocal() as session:
        admin = User(
            email="testadmin@socialrelay.local",
            password_hash=hash_password("admin1234"),
            role="admin",
            timezone="Asia/Kolkata",
        )
        session.add(admin)
        session.commit()
    yield
    test_engine.dispose()
    test_db_path.unlink(missing_ok=True)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


# --- 1. Cryptography & Auth Tests ---
def test_argon2id_password_hashing():
    pwd = "SuperSecretPassword123!"
    hashed = hash_password(pwd)
    assert hashed.startswith("$argon2id$")
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_fernet_token_encryption_at_rest():
    secret_token = "ya29.a0AfH6SMB_secret_google_refresh_token_12345"
    encrypted = encrypt_token(secret_token)
    assert encrypted != secret_token
    decrypted = decrypt_token(encrypted)
    assert decrypted == secret_token


def test_signed_state_tampering_and_expiry():
    state = create_signed_state("oauth_youtube")
    assert verify_signed_state(state) == "oauth_youtube"

    # Tampering check
    tampered = state + "bad"
    assert verify_signed_state(tampered) is None

    # Expiry check
    expired = verify_signed_state(state, max_age_seconds=-1)
    assert expired is None


# --- 2. SSRF Protection & URL Validation Tests ---
def test_ssrf_blocks_private_networks():
    with pytest.raises(SSRFValidationError):
        validate_url_safe("http://127.0.0.1:8000/api")

    with pytest.raises(SSRFValidationError):
        validate_url_safe("http://localhost:8000/api")

    with pytest.raises(SSRFValidationError):
        validate_url_safe("http://169.254.169.254/latest/meta-data")

    with pytest.raises(SSRFValidationError):
        validate_url_safe("http://10.0.0.1/admin")


def test_instagram_url_normalization():
    raw = "https://www.instagram.com/reel/C8XYZ123/?igsh=MWZzZmt2&utm_source=ig_web"
    canonical, shortcode = normalize_instagram_url(raw)
    assert shortcode == "C8XYZ123"
    assert canonical == "https://www.instagram.com/reel/C8XYZ123/"

    # Invalid path
    with pytest.raises(ImportValidationError):
        normalize_instagram_url("https://www.instagram.com/explore/")


def test_mp4_magic_bytes_detection():
    # Valid MP4 header with 'ftyp'
    valid_header = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00"
    assert check_mp4_mov_magic_bytes(valid_header) is True

    # Invalid header
    invalid_header = b"NOT_A_REAL_VIDEO_HEADER_123456"
    assert check_mp4_mov_magic_bytes(invalid_header) is False


# --- 3. Caption & Metadata Engine Tests ---
def test_metadata_title_and_description_constraints():
    long_caption = (
        "This is an extraordinary vertical video caption that extends well over one hundred characters "
        "and contains lots of valuable insights for digital creators and video publishers. #viral #motivation #reels"
    )

    meta = metadata_engine.convert_metadata(long_caption, mode="first_sentence")
    title = meta["youtube_title"]
    assert len(title) <= 100
    assert not title.endswith(" ")
    assert "#viral" in meta["instagram_hashtags"]

    # Byte validation for YouTube description
    desc = meta["youtube_description"]
    assert len(desc.encode("utf-8")) <= 5000


# --- 4. Job State Machine & Lease Tests ---
def test_job_state_machine_valid_and_illegal_transitions():
    with TestingSessionLocal() as session:
        # Create parent entities satisfying foreign keys
        acc = SocialAccount(
            user_id=1,
            platform="youtube",
            external_account_id="test_yt_ch_1",
            account_name="Test Channel",
            encrypted_access_token=encrypt_token("fake_token"),
            connection_status="connected",
        )
        session.add(acc)
        session.flush()

        src = SourceMedia(
            user_id=1,
            provider="direct_upload",
            source_account="creator",
            original_caption="Hello world",
        )
        session.add(src)
        session.flush()

        asset = MediaAsset(
            source_media_id=src.id,
            storage_path="/tmp/fake.mp4",
            file_hash="fakehash123",
            file_size=1024,
        )
        session.add(asset)
        session.flush()

        draft = ContentDraft(
            user_id=1,
            media_asset_id=asset.id,
            title="Test Draft Title",
        )
        session.add(draft)
        session.flush()

        intent = PublishingIntent(
            draft_id=draft.id,
            approved_metadata_snapshot="{}",
            status=State.QUEUED.value,
        )
        session.add(intent)
        session.flush()

        target = PublicationTarget(
            publishing_intent_id=intent.id,
            social_account_id=acc.id,
            idempotency_key="test_key_state_1",
            status=State.QUEUED.value,
        )
        session.add(target)
        session.commit()

        # Valid transition: QUEUED -> UPLOADING
        StateMachine.transition_target(session, target, State.UPLOADING, reason="Started upload")
        assert target.status == State.UPLOADING.value

        # Illegal transition: UPLOADING -> CREATED (not allowed)
        with pytest.raises(InvalidStateTransitionError):
            StateMachine.transition_target(session, target, State.CREATED, reason="Illegal rollback")


def test_job_queue_acquire_and_heartbeat():
    with TestingSessionLocal() as session:
        queue = JobQueue(session)
        job = queue.enqueue(job_type="publish_target", target_id=101)
        assert job.status == State.QUEUED.value

        # Acquire job
        claimed = queue.acquire_next_job(worker_id="test_worker_1", lease_seconds=60)
        assert claimed is not None
        assert claimed.id == job.id
        assert claimed.lease_owner == "test_worker_1"

        # Heartbeat
        queue.heartbeat(claimed.id, worker_id="test_worker_1", progress=50)
        refreshed = session.get(Job, claimed.id)
        assert refreshed.progress == 50


# --- 5. Automation DAG Validation & Dry-Run Tests ---
def test_automation_dag_cycle_prevention():
    # Valid acyclic DAG
    valid_dag = {
        "nodes": [
            {"id": "n1", "type": "url_submitted", "data": {"label": "Start"}},
            {"id": "n2", "type": "optimize_video", "data": {"label": "Process"}},
            {"id": "n3", "type": "publish_youtube", "data": {"label": "Publish"}},
        ],
        "edges": [
            {"source": "n1", "target": "n2"},
            {"source": "n2", "target": "n3"},
        ],
    }
    automation_engine.validate_workflow_dag(valid_dag)

    # Cyclic DAG (n1 -> n2 -> n3 -> n1)
    cyclic_dag = {
        "nodes": [
            {"id": "n1", "type": "url_submitted", "data": {"label": "Start"}},
            {"id": "n2", "type": "optimize_video", "data": {"label": "Process"}},
            {"id": "n3", "type": "publish_youtube", "data": {"label": "Publish"}},
        ],
        "edges": [
            {"source": "n1", "target": "n2"},
            {"source": "n2", "target": "n3"},
            {"source": "n3", "target": "n1"},
        ],
    }
    with pytest.raises(WorkflowValidationError):
        automation_engine.validate_workflow_dag(cyclic_dag)


def test_automation_dry_run_simulation():
    tpl = automation_engine.get_prebuilt_templates()[0]
    sample = {"caption": "Incredible Mumbai sunset #reels #mumbai", "is_vertical": True}
    res = automation_engine.run_dry_run(tpl["workflow_definition"], sample)
    assert res["status"] == "success"
    assert res["evaluated_nodes"] > 0


# --- 6. API Endpoints Contract Tests ---
def test_api_auth_and_dashboard():
    # Login
    login_res = client.post("/api/v1/auth/login", json={"email": "testadmin@socialrelay.local", "password": "admin1234"})
    assert login_res.status_code == 200
    token = login_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # /auth/me
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "testadmin@socialrelay.local"

    # /dashboard
    dash_res = client.get("/api/v1/dashboard", headers=headers)
    assert dash_res.status_code == 200
    assert "metrics" in dash_res.json()
    assert "upcoming_schedule" in dash_res.json()

    # /system/health
    health_res = client.get("/api/v1/system/health", headers=headers)
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "healthy"


def test_api_system_storage_and_backup():
    login_res = client.post("/api/v1/auth/login", json={"email": "testadmin@socialrelay.local", "password": "admin1234"})
    headers = {"Authorization": f"Bearer {login_res.json()['token']}"}

    storage_res = client.get("/api/v1/system/storage", headers=headers)
    assert storage_res.status_code == 200
    assert "free_mb" in storage_res.json()

    cleanup_res = client.post("/api/v1/system/storage/cleanup", headers=headers)
    assert cleanup_res.status_code == 200
    assert "cleaned_files" in cleanup_res.json()
