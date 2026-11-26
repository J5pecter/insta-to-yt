"""SocialRelay V2 automated tests: OAuth credential wizards, readiness, presets, real workflow execution, and scoped media."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.app.core.database import Base
from api.app.models.entities import Automation, PublishingPreset, SocialAccount, User
from api.app.security.crypto import create_signed_state, encrypt_token, hash_password, verify_signed_state
from api.app.services.accounts.credentials import (
    get_google_credential_status,
    get_instagram_credential_status,
    save_google_credentials,
    save_instagram_credentials,
    validate_google_client_json,
)
from api.app.services.automations.engine import automation_engine


@pytest.fixture
def v2_db():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    engine = create_engine(f"sqlite:///{tmp.name}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    user = User(email="v2@socialrelay.local", password_hash=hash_password("pass1234"), role="admin")
    session.add(user)
    session.commit()
    session.refresh(user)

    yield session, user

    session.close()
    engine.dispose()
    Path(tmp.name).unlink(missing_ok=True)


def test_google_client_json_validation_and_masking(v2_db):
    db, user = v2_db

    # Reject invalid JSON
    with pytest.raises(ValueError, match="Invalid JSON"):
        validate_google_client_json("{bad json")

    # Reject non-Google auth_uri
    bad_payload = json.dumps({
        "web": {
            "client_id": "12345.apps.googleusercontent.com",
            "client_secret": "GOCSPX-fake-test-secret",
            "auth_uri": "https://evil.example.com/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    })
    with pytest.raises(ValueError, match="Untrusted auth_uri"):
        validate_google_client_json(bad_payload)

    # Accept valid Google OAuth JSON and never expose secret in status
    valid_payload = json.dumps({
        "web": {
            "client_id": "999999999-abc123.apps.googleusercontent.com",
            "client_secret": "GOCSPX-super-secret-value",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost:8000/api/v1/accounts/youtube/callback"],
            "project_id": "socialrelay-test",
        }
    })
    saved = save_google_credentials(db, valid_payload, user_id=user.id)
    assert saved["configured"] is True
    assert "GOCSPX-super-secret-value" not in json.dumps(saved)
    assert saved["client_id_masked"].endswith(".apps.googleusercontent.com")

    status = get_google_credential_status(db)
    assert status["configured"] is True
    assert "GOCSPX-super-secret-value" not in json.dumps(status)


def test_instagram_credentials_encrypted_and_masked(v2_db):
    db, user = v2_db

    with pytest.raises(ValueError, match="numeric"):
        save_instagram_credentials(db, "not-numeric", "secret12345678901234", user_id=user.id)

    saved = save_instagram_credentials(
        db,
        app_id="123456789012345",
        app_secret="abcdef1234567890abcdef",
        login_mode="instagram_login",
        user_id=user.id,
    )
    assert saved["configured"] is True
    assert saved["login_mode"] == "instagram_login"
    assert "abcdef1234567890abcdef" not in json.dumps(saved)

    status = get_instagram_credential_status(db)
    assert status["configured"] is True
    assert status["app_id_masked"] == "1234...2345"


def test_publishing_preset_creation(v2_db):
    db, user = v2_db
    preset = PublishingPreset(
        user_id=user.id,
        name="Instagram to YouTube + Instagram",
        visibility="private",
        is_default=True,
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)

    assert preset.id is not None
    assert preset.is_default is True
    assert preset.visibility == "private"


def test_real_automation_workflow_execution(v2_db):
    db, user = v2_db
    wf_def = {
        "nodes": [
            {"id": "n1", "type": "manual_execution", "data": {"label": "Manual Trigger"}},
            {"id": "n2", "type": "rights_confirmed", "data": {"label": "Verify Rights"}},
            {"id": "n3", "type": "generate_title", "data": {"label": "Generate Title"}},
        ],
        "edges": [
            {"source": "n1", "target": "n2"},
            {"source": "n2", "target": "n3"},
        ],
    }
    auto = Automation(
        user_id=user.id,
        name="Real Metadata Test Workflow",
        workflow_definition=json.dumps(wf_def),
        enabled=True,
    )
    db.add(auto)
    db.commit()
    db.refresh(auto)

    result = automation_engine.execute_real_workflow(
        db,
        auto,
        user.id,
        {"rights_confirmed": True, "caption": "My awesome test reel! #shorts #tech"},
    )
    assert result["mode"] == "real_execution"
    assert result["status"] == "completed"
    assert result["executed_nodes"] == 3
    assert result["result_context"]["title"].startswith("My awesome test reel")


def test_scoped_media_signed_token():
    token = create_signed_state("media_42")
    assert verify_signed_state(token, max_age_seconds=900) == "media_42"
    assert verify_signed_state(token + "tampered", max_age_seconds=900) is None
