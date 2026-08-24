# sessionmem — Execution Plan

**How to use this doc:** Each module below is self-contained. When starting a new chat session, paste the relevant module's section (not the whole doc) plus current STATUS. That's enough context to resume work without re-explaining the project. Update STATUS as you go — this doc is the source of truth, not the chat history.

**Full project spec:** see SPEC.md in repo root. Don't re-derive scope decisions in a new chat — they're already made there. If a new chat questions something already decided in SPEC.md, point it there instead of relitigating.

---

## PHASE 1 — Core Logging Pipeline

### M1: Repo scaffolding + DB schema
- **Goal**: Set up project structure and SQLite schema for event storage.
- **Depends on**: Nothing. Start here.
- **Language/runtime**: Node.js, minimum v22.13.0 (required for `node:sqlite` without experimental flag warnings).
- **DB access**: Built-in `node:sqlite` module (`DatabaseSync`) — no third-party dependency, no native compile step.
- **Deliverable**: Repo with `/src`, `/db`, `package.json`, `README.md` stub; `session.db` created with `events` table: `id, timestamp, source, content, project_path`.
- **Done-check**: Can manually insert a row and query it back via a script.
- **Status**: ✅ DONE

### M2: Terminal command logger
- **Goal**: Capture every shell command run, with timestamp, written to `events` table with `source='terminal'`.
- **Depends on**: M1 (schema must exist).
- **Primary shell**: PowerShell (Windows) — this is the actual test environment. Bash/zsh hooks are a later target (post-M2), not a parallel deliverable.
- **Architecture**: Shell hook appends raw events to a flat file queue (`~/.sessionmem/queue.jsonl`) synchronously (sub-millisecond, no process spawn). A separate Node.js flusher batches those lines into SQLite. No per-command Node/process overhead.
- **Deliverable**: PowerShell prompt hook (manually installed in `$PROFILE`) + `sessionmem flush` CLI command.
- **Done-check**: Run 10 real commands in a normal session, run `sessionmem flush`, confirm all 10 appear correctly in `session.db` with correct timestamps.
- **Status**: ✅ DONE

### M3: File-save event logger
- **Goal**: Capture file save events in VS Code for the active project, `source='file'`.
- **Depends on**: M1.
- **Deliverable**: VS Code extension OR filesystem watcher (e.g. `watchdog` in Python / `chokidar` in Node) monitoring the project directory for save events.
- **Done-check**: Edit and save 5 files in a real coding session, confirm all 5 logged with correct filename + timestamp.
- **Status**: ✅ DONE

### M4: Secret filtering
- **Goal**: Prevent secrets (API keys, tokens, passwords) from being written to the log.
- **Depends on**: M2 (filters terminal commands before insert).
- **Deliverable**: A filter function run on every command/content string before DB insert — regex patterns for common secret formats (`_KEY=`, `Bearer `, `sk-`, etc.), redact or skip matching lines.
- **Status**: ✅ DONE

---

## PHASE 2 — Query / Reasoning Layer

### M5: Time-windowed context retrieval
- **Goal**: Given a natural language question, pull the relevant slice of events from SQLite (e.g. "yesterday afternoon" → filter by timestamp range).
- **Depends on**: M1–M4 (needs real logged data to test against).
- **Deliverable**: A function `get_context(query, time_hint=None) -> list[events]` that returns a reasonably-sized, relevant event slice — not the entire DB dumped in.
- **Done-check**: Given a known logged session, retrieval returns the correct subset of events for at least 3 test time-ranges.
- **Status**: ✅ DONE

### M6: LLM query CLI (`sessionmem ask`)
- **Goal**: Wire retrieval → LLM API → plain-language answer, exposed as a CLI command.
- **Depends on**: M5.
- **Deliverable**: `sessionmem ask "<question>"` — sends retrieved context + question to LLM API, prints answer.
- **Done-check**: Matches SPEC.md Section 5 "Definition of done" — real session, real question, correct specific answer.
- **Status**: ✅ DONE

### M7: Eval suite
- **Goal**: Prove the agent works, not just claim it.
- **Depends on**: M6.
- **Deliverable**: 8-10 question/expected-answer pairs (per SPEC.md Section 7) built from a real logged session, plus a script that runs all of them and reports pass/fail.
- **Done-check**: Eval script runs end-to-end and produces a pass rate. Doesn't need 100% — needs to be honest.
- **Status**: ✅ DONE

---

## PHASE 3 — Demo-Ready Polish

### M8: CLI packaging
- **Goal**: A stranger can install and run this without your help.
- **Depends on**: M6, M7.
- **Deliverable**: `pip install -e .` or `npm link` style install, clear README with setup steps, API key config via `.env`.
- **Done-check**: A friend (or you, on a clean VM/directory) installs from scratch using only the README and successfully runs `sessionmem ask`.
- **Status**: ✅ DONE

### M9: Demo script/recording
- **Goal**: A 60-second demo that proves it works.
- **Depends on**: M8.
- **Deliverable**: Short screen recording — real question, real answer, no cuts hiding failures.
- **Done-check**: Watch it back — would a stranger believe this is real and understand the value in 60 seconds?
- **Status**: ✅ DONE

---

## PHASE 4 — Brand + Website (runs parallel to Phase 1-3, not after)

### M10: Website skeleton
- **Goal**: One-line identity + space for the artifact + space for posts.
- **Depends on**: Nothing technical — can start anytime, ideally week 1.
- **Deliverable**: Simple site (even a single well-designed page) with: who you are (one line, not a bio essay), link to sessionmem repo/demo, blog/posts section.
- **Done-check**: A stranger lands on it and can state back what you do in one sentence.
- **Status**: ✅ DONE

### M11: Build-log posts (write DURING build, not after)
- **Goal**: 3-5 posts documenting real decisions made in Phase 1-2.
- **Depends on**: Whatever module you're currently writing about (e.g. write the "why SQLite not a vector DB" post right after M5, while the reasoning is fresh).
- **Deliverable**: Posts published incrementally, not batched at the end.
- **Done-check**: Each post describes a real tradeoff you actually faced, not a generic tutorial.
- **Status**: ✅ DONE (4 published in site/posts/posts.js)

---

## PHASE 5 — Ship

### M12: Launch + retro
- **Goal**: Public launch post + honest retrospective.
- **Depends on**: M9, M10, M11.
- **Deliverable**: Launch post (repo link, demo, what it does), retro post (what you'd change, what broke, what you're not proud of).
- **Done-check**: Retro contains at least one real failure or regret, not just wins.
- **Status**: NOT STARTED

---

## Current overall status
**Active module**: M5
**Last updated**: 2026-08-16
