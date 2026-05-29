# Agent Task Execution Protocol (ATEP)

## Overview

Agent executes tasks with a "report plan first, then execute" workflow.
User can intercept and redirect at any step before execution.

## Flow

```
User sends task
  → Agent thinks → reports plan (with level)
  → Server waits based on level
  → User approves / modifies / rejects
  → Agent executes
  → Agent reports next plan
  → ... repeat until done
  → Agent reports completion
```

## 4 Levels

| Level | Wait | Trigger | Example |
|-------|------|---------|---------|
| 1 | 0s (auto continue) | Certainty | Format, rename, comment, style |
| 2 | 3~5s | Daily dev | Write func, new file, fix bug, add API |
| 3 | 15~20s | Risky ops | Delete, overwrite, DB schema, core logic |
| 4 | Forever (must confirm) | Irreversible | Architecture, tech stack, prod env, data loss |

Agent rule: **when in doubt, go one level up**.

## Report Format

Agent → Server:

```json
{
  "task_id": "task-123",
  "step": 3,
  "level": 2,
  "summary": "Login module completed",
  "plan": {
    "action": "Add registration page",
    "files": ["pages/register.vue", "api/user.js"],
    "approach": "Reuse login layout, add email field",
    "risk": "None"
  }
}
```

## Server Response

```json
// Continue (no change)
{ "status": "continue" }

// Redirect (user modified the plan)
{ "status": "redirect", "command": "Use MongoDB instead of MySQL" }

// Abort
{ "status": "abort", "reason": "User cancelled" }
```

## Server Logic

```
On receive report:

  Push to user immediately (show plan + level + countdown)

  Level 1:
    Return continue immediately

  Level 2:
    Wait 5s
    If user responded → return user's response
    Else → return continue

  Level 3:
    Wait 20s
    If user responded → return user's response
    Else → return continue

  Level 4:
    Wait forever (with periodic reminder every 60s)
    Until user responds → return user's response
```

## User Interface

```
┌──────────────────────────────────────────────┐
│  Task: User Management System                │
│  Agent: AI Engineer                          │
│──────────────────────────────────────────────│
│  Done:                                       │
│  ✅ Requirements analysis                     │
│  ✅ Login page                               │
│                                              │
│  🤖 Plan (L2, auto in 3s):                   │
│  Add registration page                       │
│  Files: register.vue, user.js                │
│  Approach: Reuse login layout + email        │
│                                              │
│  [✅ OK]  [✏️ Modify]  [⏭️ Skip]              │
│──────────────────────────────────────────────│
│  🤖 Plan (L4, waiting for you):              │
│  ⚠️ Rebuild database with new schema          │
│  Risk: Existing data will be migrated        │
│                                              │
│  [✅ Confirm]  [✏️ Modify]  [❌ Cancel]        │
└──────────────────────────────────────────────┘
```

## System Prompt Template

```
You are executing a task. Follow this protocol:

After each step, report your next plan to the server:
POST {report_url}

Include:
- step number
- level (1-4)
- summary of what's done
- plan for next step (action, files, approach, risk)

Level rules:
- Level 1: Formatting, renaming, comments, style tweaks → auto approved
- Level 2: New functions, files, APIs, bug fixes → short wait
- Level 3: Deletions, overwrites, schema changes, core logic → longer wait  
- Level 4: Architecture changes, tech stack, production, irreversible → must confirm
- When unsure, go one level UP

After reporting, wait for server response:
- continue → execute the plan
- redirect → adjust plan based on command, then report new plan
- abort → stop and summarize progress

When task is complete, report with:
{ "step": "done", "summary": "full summary of what was done" }
```

## Files Structure (Implementation)

```
agent-control-server/
├── server.py          # Server: report endpoint + user command endpoint + WS push
├── client.html        # User dashboard: view progress, send commands
└── README.md          # This file
```

## Comparison

| | Poll (original) | Report-then-execute (this) |
|---|---|---|
| Timing | After execution | Before execution |
| User control | Post-correction | Pre-interception |
| Waste | High (empty polls) | Minimal (only real reports) |
| User visibility | Low | High (every step visible) |

---

Protocol version: 1.0
Date: 2026-05-29
