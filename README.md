# sessionmem

> **Your coding session memory agent.** Automatically logs your terminal commands and file saves, and lets you query *"what was I working on?"* in plain language — so you stop re-explaining context every time you switch tools or start a new AI chat.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.13.0-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](package.json)
[![Evaluation Pass Rate](https://img.shields.io/badge/evals-100%25%20(10%2F10)-success.svg)](evals/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## How It Works

```
 ┌──────────────────────┐      ┌──────────────────────┐
 │  PowerShell Hook     │      │  File Watcher (M3)   │
 │  (powershell-hook)   │      │  (sessionmem watch)  │
 └──────────┬───────────┘      └──────────┬───────────┘
            │                             │
            ▼                             ▼
   ~/.sessionmem/queue.jsonl (Owner-only R/W permissions)
            │
            ▼
      sessionmem flush
            │
            ▼
   ~/.sessionmem/session.db (Local SQLite storage)
   - Auto-redacts API keys, tokens & passwords (M4)
   - All timestamps unified in UTC ISO 8601 (M5)
            │
            ▼
   sessionmem ask "<question>" (M6)
   - Natural language time extraction ("yesterday afternoon", "last 2 hours")
   - Time-windowed SQLite event retrieval (M5)
   - Streaming plain-language answer via OpenAI gpt-4o-mini
```

---

## ⚡ Quickstart in 60 Seconds

### 1. Prerequisites

- **Node.js ≥ 22.13.0** (uses built-in `node:sqlite` and native `fetch` — **zero npm dependencies**).
- **OpenAI API Key** (for `sessionmem ask`).

```powershell
node --version # verify >= v22.13.0
```

### 2. Install & Link Globally

```powershell
# Clone the repository
git clone https://github.com/hammadkhaliq-del/session-mem.git
cd session-mem

# Link binary globally
npm link

# Initialize database (~/.sessionmem/session.db)
sessionmem init-db
```

### 3. Configure API Key

Create `.env` in the repository or in `~/.sessionmem/.env`:

```ini
OPENAI_API_KEY=sk-proj-your-api-key-here
SESSIONMEM_MODEL=gpt-4o-mini
```

### 4. Enable Shell Hook

```powershell
# Print hook instructions
sessionmem hook show

# Or directly append the hook to your PowerShell profile:
sessionmem hook show | Out-File -Append -Encoding utf8 $PROFILE
. $PROFILE
```

### 5. Verify Setup

```powershell
sessionmem doctor
```

Output:
```
🩺 sessionmem Doctor — System Diagnostic
═════════════════════════════════════════════════════════════════
[✅ PASS] Node.js Runtime : Node.js v22.18.0 (meets >= 22.13.0 requirement)
[✅ PASS] SQLite Database : Database connected
[✅ PASS] Event Queue     : Queue ready
[✅ PASS] OpenAI API Key  : API Key active (sk-proj...) · Model: gpt-4o-mini
[✅ PASS] Shell Hook      : PowerShell prompt hook is active
═════════════════════════════════════════════════════════════════
✨ All essential components are healthy and ready to use.
```

---

## 💻 Daily Usage & Workflow

### 1. Start Watching File Edits (in your project directory)
```powershell
sessionmem watch
```
Logs file creates and saves in real-time, automatically ignoring `.git`, `node_modules`, build artifacts, and database files.

### 2. Code Normally in Terminal
Every command you run in PowerShell is appended sub-millisecond to your queue with UTC timestamps.

### 3. Flush to SQLite (or auto-flushed before query)
```powershell
sessionmem flush
```

### 4. Query Your Session Memory
```powershell
# Ask questions in natural language
sessionmem ask "what was I debugging yesterday afternoon?"

# Ask about package installations or setup steps
sessionmem ask "what packages did I install today?"

# Ask about specific commands or errors
sessionmem ask "what was the curl command I used to test the endpoint?"

# Filter with explicit time windows
sessionmem ask "what files did I edit?" --time "last 2 hours"

# Inspect verbose token metrics and prompt details
sessionmem ask "summarize my morning session" --verbose
```

---

## 📖 CLI Command Reference

| Command | Description |
|---|---|
| `sessionmem init-db` | Creates and migrates `~/.sessionmem/session.db` |
| `sessionmem doctor` | Runs system health checks (Node, DB, Queue, API key, Shell Hook) |
| `sessionmem watch [dir]` | Watches directory for file saves and appends to event queue |
| `sessionmem flush` | Batches queued terminal and file events into SQLite with secret redaction |
| `sessionmem context [options]` | Directly inspects retrieved SQLite event slices |
| `sessionmem ask "<question>"` | Queries session history with natural language via `gpt-4o-mini` |
| `sessionmem hook show` | Displays the shell hook snippet for installation |
| `sessionmem --version, -v` | Prints installed CLI version |
| `sessionmem --help, -h` | Displays help message and available flags |

### Query Options (`sessionmem ask`)

- `--time "<hint>"`: Overrides or explicitly sets time window (`"today"`, `"yesterday afternoon"`, `"last 3 hours"`, `"last 7 days"`).
- `--model <name>`: Overrides model (default: `gpt-4o-mini`, env: `SESSIONMEM_MODEL`).
- `--project <path>`: Filters events to a specific repository or project directory.
- `--verbose`: Displays token consumption, event count, and model timing after the answer.

---

## 🔒 Security & Privacy Guarantees

1. **Owner-Only File Permissions (`icacls` & `0o600`)**:
   `~/.sessionmem/queue.jsonl` is created with strict owner-only ACLs on Windows and `0o600` on POSIX. Non-admin users cannot read your transient event stream.
2. **Tier-1 Secret Redaction**:
   All terminal commands pass through a deterministic regex sanitizer before being persisted to SQLite. Patterns include:
   - OpenAI keys (`sk-...`)
   - GitHub PATs (`ghp_...`, `github_pat_...`)
   - AWS Access Key IDs (`AKIA...`)
   - Slack tokens (`xoxb-...`, `xoxp-...`)
   - Authorization headers (`Bearer ...`, `Basic ...`)
   - Database connection strings with embedded passwords (`postgres://user:pass@host`)
   - Environment assignments (`export API_KEY=...`, `$env:SECRET_KEY=...`)
3. **100% Local Storage**:
   Your session logs reside strictly in your local SQLite database (`~/.sessionmem/session.db`). Only the relevant time-windowed event slice for a question is sent to the LLM when you explicitly run `sessionmem ask`.

---

## 🧪 Testing & Evaluation Benchmark

### Full Test Suite (M1–M6)
Runs all unit and integration assertions across ingestion, filtering, retrieval, and LLM formatting:
```powershell
npm test
```

### Evaluation Benchmark Suite (M7)
Runs 10 realistic developer benchmark scenarios against an isolated session dataset:
```powershell
npm run eval

# Or with verbose reasoning:
npm run eval -- --verbose
```

---

## 📂 Project Architecture

```
session-mem/
├── bin/
│   └── sessionmem.js          # CLI entrypoint and command router
├── evals/
│   ├── dataset.js             # Realistic multi-day benchmark session fixtures
│   └── runner.js              # Deterministic evaluation runner
├── hooks/
│   └── powershell-hook.ps1    # Sub-millisecond PowerShell prompt hook
├── scripts/
│   ├── eval.js                # Evaluation CLI runner (npm run eval)
│   ├── init-db.js             # Database initializer
│   ├── migrate-timestamps-to-utc.js # UTC migration utility
│   ├── verify-m1.js ... m6.js # Module test suites
│   └── verify-m8.js           # CLI packaging verification suite
├── src/
│   ├── db/                    # SQLite database layer (node:sqlite)
│   ├── filters/               # Tier-1 secret redaction engine
│   ├── llm/                   # Native streaming OpenAI client & prompt builder
│   ├── retrieval/             # Natural language time parser & context retriever
│   ├── terminal/              # Atomic queue flusher and transaction batching
│   ├── utils/                 # Project root resolver, .env loader & doctor engine
│   └── watcher/               # Recursive filesystem change watcher
├── .env.example               # Configuration template
├── EXECUTION_PLAN.md          # Technical milestone roadmap
└── SPEC.md                    # Core project specification
```

---

## 📄 License

MIT License. Built with ❤️ for developers who hate re-explaining context.
