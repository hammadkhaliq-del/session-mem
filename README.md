# sessionmem

> **Your coding session memory agent.** Automatically logs your terminal commands and file saves, then lets you query *"what was I working on?"* in plain language — so you stop re-explaining context every time you switch tools or start a new AI chat.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.13.0-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](package.json)
[![Evaluation Pass Rate](https://img.shields.io/badge/evals-100%25%20(10%2F10)-success.svg)](evals/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🎬 Demo Video

> **[▶ Watch the 3–5 minute live demo (YouTube — unlisted)](https://youtu.be/ydSqTmJWi-A)**
>
> Shows: full setup → real-time ingestion → secret redaction → natural language recall → automated eval benchmark, with voice narration explaining each design decision and one key limitation.

---

## What It Does & Who It's For

**The problem:** Every time you switch between your editor, terminal, browser, and AI chat, you lose context. You forget which file you were editing, what command failed, or what package you installed two hours ago. You waste time re-explaining your session to every new tool.

**The solution:** `sessionmem` runs silently in the background, recording your terminal commands and file saves into a local SQLite database. When you need context, you ask in plain English:

```powershell
sessionmem ask "what was I debugging yesterday afternoon?"
sessionmem ask "what packages did I install today?"
sessionmem ask "what was the curl command I used to test the endpoint?"
```

**Who it's for:**
- **Solo developers** who context-switch between multiple projects and tools throughout the day.
- **Developers using AI coding assistants** who need to quickly feed their session history into a new chat without manually reconstructing what they did.
- **Anyone who has ever opened their laptop in the morning and thought:** *"Wait, where was I?"*

**What it is NOT:**
- Not a keylogger (only captures completed commands and file save events, not keystrokes).
- Not a cloud service (everything is stored locally in SQLite — only the LLM query touches the network).
- Not a team tool (single-user, local-only by design).

---

## How It Works

```
 ┌──────────────────────┐      ┌──────────────────────┐
 │  PowerShell Hook     │      │  File Watcher        │
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
   - Auto-redacts API keys, tokens & passwords
   - All timestamps unified in UTC ISO 8601
            │
            ▼
   sessionmem ask "<question>"
   - Natural language time extraction ("yesterday afternoon", "last 2 hours")
   - Time-windowed SQLite event retrieval
   - Streaming plain-language answer via OpenAI gpt-4o-mini
```

---

## ⚡ Setup (Reproducible from Scratch)

A complete stranger should be able to go from zero to a working `sessionmem` installation by following these steps exactly.

### Prerequisites

| Requirement | Why |
|---|---|
| **Node.js ≥ 22.13.0** | Uses built-in `node:sqlite` and native `fetch` — **zero npm dependencies** |
| **Windows with PowerShell** | Shell hook is PowerShell-specific (bash/zsh hooks are planned, not yet implemented) |
| **OpenAI API Key** | Required for `sessionmem ask` — the LLM query command |

```powershell
# Verify Node.js version
node --version   # must print >= v22.13.0
```

> **Don't have Node 22?** Download from [nodejs.org](https://nodejs.org/en/download/) or use `nvm install 22`.

### Step 1: Clone & Link

```powershell
git clone https://github.com/hammadkhaliq-del/session-mem.git
cd session-mem

# Link the CLI binary globally (makes `sessionmem` available everywhere)
npm link
```

### Step 2: Initialize the Database

```powershell
sessionmem init-db
# Output: ✅ Database initialized successfully.
# Creates: ~/.sessionmem/session.db
```

### Step 3: Configure Your API Key

Create a `.env` file in the repository root (or in `~/.sessionmem/.env`):

```ini
OPENAI_API_KEY=sk-proj-your-api-key-here
# Optional: override the default model
SESSIONMEM_MODEL=gpt-4o-mini
```

> **Security note:** `.env` is in `.gitignore` and will never be committed.

### Step 4: Install the Shell Hook

```powershell
# Print the hook snippet
sessionmem hook show

# Or auto-append to your PowerShell profile:
sessionmem hook show | Out-File -Append -Encoding utf8 $PROFILE
. $PROFILE
```

### Step 5: Verify Everything Works

```powershell
sessionmem doctor
```

Expected output:
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

## 💻 Usage Examples

### 1. Start Watching File Edits

```powershell
sessionmem watch
# Logs file creates and saves in real-time
# Automatically ignores .git, node_modules, build artifacts
```

### 2. Code Normally

Every command you run in PowerShell is automatically appended to your event queue via the shell hook. No extra steps needed.

### 3. Flush Events to SQLite

```powershell
sessionmem flush
# Output: ✅ Flushed 12 events (0 skipped, 1 redacted).
```

> Events are also auto-flushed before any query.

### 4. Query Your Session Memory

```powershell
# Natural language questions — no query syntax to learn
sessionmem ask "what was I debugging yesterday afternoon?"

# Package installation recall
sessionmem ask "what packages did I install today?"

# Exact command recall
sessionmem ask "what was the curl command I used to test the endpoint?"

# Explicit time window
sessionmem ask "what files did I edit?" --time "last 2 hours"

# Verbose mode — see token counts, model info, event counts
sessionmem ask "summarize my morning session" --verbose
```

### Example Output

```
$ sessionmem ask "what was the curl command I ran to test the endpoint?"

The curl command you ran to test the endpoint was: `curl localhost:3000/api/health`.
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

| Flag | Description | Default |
|---|---|---|
| `--time "<hint>"` | Explicit time window (e.g. `"today"`, `"yesterday afternoon"`, `"last 2 hours"`) | Auto-extracted from question |
| `--model <name>` | Override LLM model | `gpt-4o-mini` (env: `SESSIONMEM_MODEL`) |
| `--project <path>` | Filter events to a specific project directory | All projects |
| `--limit <n>` | Maximum context events sent to the LLM | `200` |
| `--verbose` | Show token consumption, event count, and timing after the answer | Off |

### Context Options (`sessionmem context`)

| Flag | Description | Default |
|---|---|---|
| `--time "<hint>"` | Time window filter | All time |
| `--source <type>` | Filter by source: `terminal`, `file`, `browser` | All sources |
| `--project <path>` | Filter by project directory | All projects |
| `--limit <n>` | Maximum events to return | `50` |

---

## 🏗️ Architecture

### Project Structure

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
│   ├── demo.js                # Interactive demo runner (npm run demo)
│   └── init-db.js             # Database initializer
├── src/
│   ├── db/                    # SQLite database layer (node:sqlite)
│   ├── filters/               # Tier-1 secret redaction engine
│   ├── llm/                   # Streaming OpenAI client & prompt builder
│   ├── retrieval/             # Natural language time parser & context retriever
│   ├── terminal/              # Atomic queue flusher and transaction batching
│   ├── utils/                 # Project root resolver, .env loader & doctor engine
│   └── watcher/               # Recursive filesystem change watcher
├── site/                      # Developer portfolio & engineering build-log
├── .env.example               # Configuration template
├── SPEC.md                    # Project specification & scope decisions
├── EXECUTION_PLAN.md          # Module-by-module build plan
├── README.md                  # This file
└── LICENSE                    # MIT License
```

### Data Flow Diagram

```
 User types command              User saves file in editor
       │                                    │
       ▼                                    ▼
 ┌─────────────────┐              ┌─────────────────┐
 │  PowerShell     │              │  fs.watch()     │
 │  Prompt Hook    │              │  Recursive      │
 │  (sub-ms sync   │              │  File Watcher   │
 │   append to     │              │                 │
 │   queue.jsonl)  │              │                 │
 └────────┬────────┘              └────────┬────────┘
          │                                │
          └──────────┬─────────────────────┘
                     ▼
     ~/.sessionmem/queue.jsonl
     (Owner-only file permissions)
                     │
                     ▼
          ┌─────────────────────┐
          │  sessionmem flush   │
          │  ─────────────────  │
          │  1. Read queue      │
          │  2. Redact secrets  │
          │  3. Batch INSERT    │
          │  4. Truncate queue  │
          └─────────┬───────────┘
                    │
                    ▼
     ~/.sessionmem/session.db
     (SQLite — single events table)
     ┌──────────────────────────┐
     │ id | timestamp | source  │
     │    | content   | project │
     └──────────┬───────────────┘
                │
                ▼
     ┌──────────────────────────────────────┐
     │     sessionmem ask "<question>"      │
     │  ──────────────────────────────────  │
     │  1. Extract time hint from question  │
     │     ("yesterday" → UTC range)        │
     │  2. Query SQLite with time window    │
     │  3. Build grounded prompt            │
     │  4. Stream answer via OpenAI API     │
     └──────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| **Zero npm dependencies** | Node.js 22 ships with `node:sqlite`, native `fetch`, and `fs.watch`. Eliminating third-party deps means no supply-chain risk, no `npm install` wait, and no native compilation issues. |
| **SQLite over vector DB** | Session logs are small (a heavy day is ~500 events, ~50KB). Full-text time-windowed retrieval is fast enough — vector embeddings add complexity with no measurable benefit at this scale. |
| **gpt-4o-mini over larger models** | Session recall is factual extraction, not complex reasoning. `gpt-4o-mini` at $0.15/1M input tokens means a full day's session costs fractions of a cent to query. |
| **Queue file + flush over direct insert** | The shell hook must complete in sub-millisecond time (it runs on every prompt). Spawning a Node process per command would add 100–500ms latency. Instead, the hook does a single file append, and a separate `flush` command batches inserts into SQLite. |
| **Regex-based secret redaction** | High-precision, low-recall by design. Only well-known patterns (`sk-...`, `ghp_...`, `AKIA...`, `Bearer ...`, `*_KEY=...`) are redacted. This avoids false positives on git SHAs, npm hashes, and UUIDs. |

---

## 🧪 Evaluation Results (v2 Benchmark)

The eval suite seeds an **isolated temporary SQLite database** with a realistic multi-day developer session (20 events across 3 days), runs 10 question-answer scenarios through the full retrieval → prompt → LLM pipeline, and validates answers against ground-truth criteria.

### Running the Eval Suite

```powershell
# Standard run
npm run eval

# Verbose mode (shows full answers and failure reasons)
npm run eval -- --verbose
```

### Results: 10/10 (100% Pass Rate)

| ID | Category | Question | Result | Latency |
|---|---|---|---|---|
| E01 | Package Installation | *What package did I install during my setup?* | ✅ PASS | 1.26s |
| E02 | File Modification Recall | *Which database files were created or edited in the db directory?* | ✅ PASS | 0.89s |
| E03 | Time Discrimination | *What files or tasks was I working on yesterday afternoon?* | ✅ PASS | 1.07s |
| E04 | Absence / Anti-Hallucination | *Did I edit any Python or CSS files in this session?* | ✅ PASS | 0.90s |
| E05 | Exact Command Recall | *What was the curl command I ran to test the endpoint?* | ✅ PASS | 0.86s |
| E06 | Git Commit Message Recall | *What was the commit message when I finished the API docs?* | ✅ PASS | 0.78s |
| E07 | Secret Redaction Integrity | *What API key did I export, and is the secret visible?* | ✅ PASS | 0.80s |
| E08 | Relative Duration Filtering | *What documentation did I write in the last 2 hours?* | ✅ PASS | 0.88s |
| E09 | Repeated Workflow Detection | *What test command did I run multiple times?* | ✅ PASS | 1.19s |
| E10 | Multi-Source Synthesis | *Give a brief summary of how the express server was built and tested.* | ✅ PASS | 2.79s |

### Aggregate Metrics

| Metric | Value |
|---|---|
| **Model** | `gpt-4o-mini` |
| **Total Cases** | 10 |
| **Pass Rate** | 100% (10/10) |
| **Total Duration** | 11.43s |
| **Avg Latency** | 1.14s per query |
| **Tokens Used** | 6,086 total (5,646 prompt + 440 completion) |
| **Est. Cost** | < $0.001 per full benchmark run |

### Eval Methodology

Each test case uses three validation layers:

1. **`mustInclude`** — case-insensitive substrings that must appear in the answer (e.g., `"express"` for the package install question).
2. **`mustNotInclude`** — substrings that must NOT appear, catching hallucinations (e.g., `"react"`, `"vue"` for the same question).
3. **`customValidator`** — programmatic checks for semantic correctness (e.g., verifying the agent says secrets are "redacted" without echoing raw key patterns).

> **Reproducibility:** The eval suite uses a fixed reference timestamp (`EVAL_NOW = 2026-08-22T15:00:00Z`) so "today", "yesterday", and "last 2 hours" always resolve to the same UTC windows regardless of when or where the tests run.

---

## ⚠️ Limitations

These are known constraints — some by design, some awaiting future work:

| # | Limitation | Impact | Mitigation / Future Plan |
|---|---|---|---|
| 1 | **Windows/PowerShell only** | Shell hook requires PowerShell `prompt` function. Bash/zsh users cannot use terminal logging. | Bash/zsh hooks are planned for v2. File watching and `sessionmem ask` work cross-platform. |
| 2 | **Requires OpenAI API key** | The `ask` command sends your time-windowed event slice to OpenAI's API. Without a key, you can still log and flush — but not query. | Future: local LLM support (e.g., Ollama) to eliminate network dependency entirely. |
| 3 | **No command output capture** | Only the command *you typed* is logged, not its stdout/stderr. If `npm test` failed, the agent knows you ran it but not *what* the error was. | By design: capturing output would require wrapping every command in a subshell, adding latency and complexity. |
| 4 | **Regex-only secret redaction** | Only covers known secret patterns (`sk-...`, `ghp_...`, `AKIA...`, `Bearer ...`, `*_KEY=...`). Custom or uncommon secret formats may pass through unredacted. | Tier-2 high-entropy detection is deferred due to false-positive risk with git SHAs and UUIDs. |
| 5 | **No multi-project disambiguation** | If you work on 3 projects in one session, all events are mixed unless you explicitly use `--project <path>` to filter. | Future: auto-detect active project from `cwd` at query time. |
| 6 | **~12K token context budget** | Very long sessions (500+ events) are truncated to the most recent events. Older events may be dropped from context. | By design: keeps LLM costs low. Future: semantic chunking or summarization of older events. |
| 7 | **No browser tab logging** | Spec includes browser logging as Phase 2, but it is not implemented in this version. | Deferred until terminal + file logging is proven reliable (per SPEC.md). |
| 8 | **Single-user, local-only** | No multi-user, no cloud sync, no team features. | Explicitly out of scope for the entire capstone (per SPEC.md §6). |

---

## 🧪 Running Tests

### Full Test Suite (M1–M8)

Runs all unit, integration, and packaging assertions:

```powershell
npm test
```

### Evaluation Benchmark (M7)

Runs 10 realistic developer scenarios against an isolated session dataset:

```powershell
npm run eval

# With verbose output:
npm run eval -- --verbose
```

### Interactive Demo

Runs an interactive terminal walkthrough simulating ingestion, redaction, recall, and eval:

```powershell
# Step-by-step interactive mode
npm run demo

# Auto-playing walkthrough
node scripts/demo.js --auto
```

---

## 🔒 Security & Privacy

1. **Owner-Only File Permissions**: `~/.sessionmem/queue.jsonl` is created with strict owner-only ACLs on Windows and `0o600` on POSIX.
2. **Tier-1 Secret Redaction**: All terminal commands pass through a regex sanitizer before being persisted. Covers: OpenAI keys, GitHub PATs, AWS Access Keys, Slack tokens, Bearer/Basic auth, database connection strings, and environment variable assignments.
3. **100% Local Storage**: Session logs live strictly in your local SQLite database. Only the relevant time-windowed event slice is sent to the LLM when you explicitly run `sessionmem ask`.

---

## 📄 License

MIT License. Built with ❤️ for developers who hate re-explaining context.
