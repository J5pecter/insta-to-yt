# User Journeys & Interface Flows — SocialRelay

This document details the primary user workflows across the 31 functional screens of SocialRelay.

---

## 1. Onboarding & First-Time Setup Journey

```mermaid
flowchart TD
    Start["User Launches start.bat"] --> Login["Screen 01: Administrator Login (admin1234)"]
    Login --> Setup["Screen 02: Initial System Setup"]
    Setup --> Accounts["Screen 24: Connect YouTube & Instagram"]
    Accounts --> Dashboard["Screen 03: Executive Dashboard Ready"]
```

---

## 2. New Post Creation & Cross-Publishing Flow

The 4-stage interfacial flow for creating and publishing content:

```mermaid
flowchart LR
    subgraph Step1 ["Step 1: Import"]
        I1["Paste Reel URL or Upload MP4"]
        I2["Rights Confirmation Checkbox"]
    end

    subgraph Step2 ["Step 2: Content Studio"]
        E1["Inspect 9:16 Video Preview"]
        E2["Select Metadata Rule (First Sentence, Cleanup, AI)"]
        E3["Review Character (≤100) and Byte (≤5000) Counters"]
    end

    subgraph Step3 ["Step 3: Channels & Settings"]
        C1["Select Destination Accounts"]
        C2["Configure Privacy (Private/Unlisted/Public)"]
        C3["Set Schedule Date/Time or Immediate"]
    end

    subgraph Step4 ["Step 4: Dispatch & Verification"]
        D1["Enqueue Idempotent Publication Targets"]
        D2["Track Real-Time Progress"]
        D3["Verify Returned Platform URLs"]
    end

    Step1 --> Step2
    Step2 --> Step3
    Step3 --> Step4
```

---

## 3. Rescheduling via Content Calendar Flow

1. Open **Calendar** from navigation.
2. Select **Month**, **Week**, or **Day** view.
3. Click any scheduled video card to open the **Publication Modal**.
4. Adjust date/time or click **Cancel Schedule** to restore to draft.
5. Published posts display verified platform links and cannot be altered as drafts.

---

## 4. Failed Job Recovery & Reconciliation Flow

```mermaid
flowchart TD
    Fail["Upload Fails or Network Times Out"] --> Check{"Was Byte Transfer Uncertain?"}
    Check -- Yes --> Reconcile["Status: RECONCILIATION_REQUIRED"]
    Check -- No --> Retry["Status: RETRY_PENDING (Exponential Backoff)"]
    Reconcile --> Dialog["Admin Inspects Remote Platform Status in UI"]
    Dialog -- Video Exists --> MarkPub["Mark Reconciled -> PUBLISHED"]
    Dialog -- Video Missing --> SafeRetry["Re-queue for Clean Upload"]
```
