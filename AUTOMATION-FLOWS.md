# Automation Workflows Specification — SocialRelay

SocialRelay includes a native, database-backed DAG (Directed Acyclic Graph) workflow engine that evaluates triggers, conditions, and actions without external automation platforms.

---

## 1. DAG Workflow Engine Principles

1. **Cycle Prevention**: Workflows are verified via Kahn's topological sort algorithm before activation. Circular dependencies are rejected with `WorkflowValidationError`.
2. **Deterministic Evaluation**: Nodes execute sequentially or in parallel branches based on edge definitions.
3. **Dry-Run Mode**: Every workflow can be evaluated safely in simulation mode with mock or test input.
4. **Audit Logging**: Every execution records execution status (`running`, `completed`, `failed`), step logs, and outputs in `automation_runs`.

---

## 2. Pre-Built Production Automation Templates

### Template 1: Instagram to YouTube Automation
Imports an authorized Instagram Reel, validates rights, optimizes to 1080×1920 vertical video, generates a YouTube title, and creates an approved draft.

```mermaid
flowchart LR
    T1["Trigger: URL Submitted"] --> C1{"Condition: Rights Confirmed?"}
    C1 -- Yes --> A1["Action: Import Video & Caption"]
    A1 --> A2["Action: Optimize Vertical 9:16"]
    A2 --> A3["Action: Generate YouTube Title"]
    A3 --> A4["Action: Create Draft for Review"]
```

---

### Template 2: Cross-Platform Publishing
When a video file is uploaded, optimize the video, prepare platform-specific metadata, and publish simultaneously to YouTube Shorts and Instagram Reels.

```mermaid
flowchart TD
    T2["Trigger: File Uploaded"] --> A2_1["Action: Optimize Format"]
    A2_1 --> A2_2["Action: Prepare Metadata"]
    A2_2 --> P1["Action: Publish to YouTube Shorts"]
    A2_2 --> P2["Action: Publish to Instagram Reels"]
    P1 --> V1["Verify YouTube ID"]
    P2 --> V2["Verify Instagram Permalink"]
```

---

### Template 3: Scheduled Distribution
Assigns an approved draft to a designated future time slot in the content calendar.

```mermaid
flowchart LR
    T3["Trigger: Manual / Approved Draft"] --> A3_1["Action: Create Approved Draft"]
    A3_1 --> A3_2["Action: Assign Scheduled Slot"]
    A3_2 --> Q3["Queue Publication at Scheduled Time"]
```

---

### Template 4: Bulk Content Processing
Imports a batch CSV or multiline text block of authorized links, validates each item, and generates individual drafts for review.

```mermaid
flowchart LR
    T4["Trigger: Batch CSV Submitted"] --> A4_1["Action: Validate URLs & Magic Bytes"]
    A4_1 --> A4_2["Action: Generate Draft Queue"]
```

---

### Template 5: Automatic Retry & Notification
Detects temporary network failures during publishing, applies bounded exponential backoff, and alerts the administrator.

```mermaid
flowchart LR
    T5["Trigger: Job Failure Detected"] --> C5{"Condition: Temporary & Attempts < 5?"}
    C5 -- Yes --> A5_1["Action: Apply Exponential Backoff Jitter"]
    C5 -- No --> A5_2["Action: Mark RECONCILIATION_REQUIRED & Alert Admin"]
```

---

### Template 6: Daily Publishing Automation
Evaluates approved drafts at a recurring daily publishing window, verifies account quotas, and publishes the next queued video.

```mermaid
flowchart LR
    T6["Trigger: Daily Schedule Reached (e.g. 18:00)"] --> C6{"Condition: YouTube Quota Available?"}
    C6 -- Yes --> A6_1["Action: Select Next Approved Draft"]
    A6_1 --> A6_2["Action: Publish to YouTube Channel"]
    A6_2 --> A6_3["Action: Update Calendar & History"]
```
