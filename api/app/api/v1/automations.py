"""Automation rules and workflow builder endpoints for SocialRelay."""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...core.database import get_db
from ...models.entities import Automation, AutomationRun, User
from ...schemas.schemas import AutomationCreateRequest, AutomationDryRunRequest
from ...services.automations.engine import WorkflowValidationError, automation_engine

router = APIRouter(prefix="/automations", tags=["Automations"])


@router.get("")
def list_automations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all saved automations."""
    stmt = select(Automation).order_by(desc(Automation.updated_at))
    automations = db.execute(stmt).scalars().all()
    results = []
    for a in automations:
        results.append({
            "id": a.id,
            "name": a.name,
            "description": a.description,
            "enabled": a.enabled,
            "workflow_definition": json.loads(a.workflow_definition) if a.workflow_definition else {},
            "created_at": a.created_at.isoformat(),
            "updated_at": a.updated_at.isoformat(),
        })
    return {"total": len(results), "items": results}


@router.get("/templates")
def get_templates():
    """Retrieve 6 pre-built production automation templates."""
    return automation_engine.get_prebuilt_templates()


@router.post("")
def create_automation(
    body: AutomationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create and validate a new automation workflow."""
    try:
        automation_engine.validate_workflow_dag(body.workflow_definition)
    except WorkflowValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    auto = Automation(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        workflow_definition=json.dumps(body.workflow_definition),
        enabled=body.enabled,
    )
    db.add(auto)
    db.commit()
    db.refresh(auto)
    return {"status": "success", "automation_id": auto.id, "name": auto.name}


@router.get("/{id}")
def get_automation(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve details and execution run history for an automation."""
    auto = db.execute(select(Automation).where(Automation.id == id)).scalars().first()
    if not auto:
        raise HTTPException(status_code=404, detail="Automation not found.")

    runs = db.execute(
        select(AutomationRun).where(AutomationRun.automation_id == auto.id).order_by(desc(AutomationRun.started_at)).limit(10)
    ).scalars().all()

    return {
        "id": auto.id,
        "name": auto.name,
        "description": auto.description,
        "enabled": auto.enabled,
        "workflow_definition": json.loads(auto.workflow_definition) if auto.workflow_definition else {},
        "runs": [
            {
                "id": r.id,
                "status": r.execution_status,
                "started_at": r.started_at.isoformat(),
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "logs": json.loads(r.log_output) if r.log_output else [],
            }
            for r in runs
        ],
        "created_at": auto.created_at.isoformat(),
        "updated_at": auto.updated_at.isoformat(),
    }


@router.post("/validate")
def validate_workflow(body: AutomationDryRunRequest):
    """Validate a DAG definition for cycle freedom and valid node connections."""
    try:
        automation_engine.validate_workflow_dag(body.workflow_definition)
        return {"valid": True, "message": "Workflow DAG structure is valid and acyclic."}
    except WorkflowValidationError as e:
        return {"valid": False, "error": str(e)}


@router.post("/dry-run")
def execute_dry_run(body: AutomationDryRunRequest):
    """Execute a dry-run simulation of an automation workflow."""
    sample = body.sample_input or {
        "caption": "Morning motivation in Mumbai! Never give up. #motivation #reels",
        "duration": 25.0,
        "is_vertical": True,
        "rights_confirmed": True,
    }
    try:
        res = automation_engine.run_dry_run(body.workflow_definition, sample)
        return res
    except WorkflowValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{id}/run")
def execute_real_automation(
    id: int,
    sample_input: Optional[dict] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Execute a saved automation workflow through real registered backend handlers and persistent job queue."""
    auto = db.execute(select(Automation).where(Automation.id == id)).scalars().first()
    if not auto:
        raise HTTPException(status_code=404, detail="Automation not found.")
    try:
        res = automation_engine.execute_real_workflow(db, auto, current_user.id, sample_input or {"rights_confirmed": True})
        return res
    except WorkflowValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Workflow execution failed: {e}")


@router.post("/{id}/enable")
def enable_automation(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Enable an automation workflow."""
    auto = db.execute(select(Automation).where(Automation.id == id)).scalars().first()
    if not auto:
        raise HTTPException(status_code=404, detail="Automation not found.")
    auto.enabled = True
    db.commit()
    return {"status": "success", "enabled": True}


@router.post("/{id}/disable")
def disable_automation(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Disable an automation workflow."""
    auto = db.execute(select(Automation).where(Automation.id == id)).scalars().first()
    if not auto:
        raise HTTPException(status_code=404, detail="Automation not found.")
    auto.enabled = False
    db.commit()
    return {"status": "success", "enabled": False}


@router.delete("/{id}")
def delete_automation(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete an automation workflow."""
    auto = db.execute(select(Automation).where(Automation.id == id)).scalars().first()
    if not auto:
        raise HTTPException(status_code=404, detail="Automation not found.")
    db.delete(auto)
    db.commit()
    return {"status": "success", "message": "Automation deleted."}
