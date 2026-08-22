# Session Memory Agent — Project Spec

## One-line description
An agent that logs your coding session across terminal, file edits, and browser tabs, then lets you query "what was I working on" in plain language — so you stop re-explaining context every time you switch tools.

## 1. What it logs
- **Terminal**: every command run in zsh/bash (via shell history hook or a wrapped shell function), timestamped.
- **File edits**: file save events in VS Code (via a lightweight extension or filesystem watcher on the project directory), timestamped, with filename + which project/repo.
- **Browser** (Phase 2, not MVP): active tab titles + URLs while a coding session is active, timestamped. Deferred until terminal + file logging is proven reliable.

## 2. What it does NOT log
- Keystrokes or file *contents* in real time (only save events, not every edit).
- Anything outside the active project directory / outside coding hours.
- Passwords, tokens, or any command output containing secrets (basic filtering: skip commands matching common secret patterns — API keys, `export .*_KEY`, etc.).
- Personal browsing unrelated to the current project (once browser logging is added, it's scoped to a manually-toggled "session active" state, not always-on).
- No cloud sync in MVP — everything stored locally. No multi-user support.

## 3. Storage
- Local SQLite database (`session.db`).
- One table for raw events: `id, timestamp, source (terminal|file|browser), content, project_path`.
- No embeddings/vector store in MVP — session logs are small enough for raw context window retrieval. Revisit only if a real day's log exceeds a reasonable token budget for the query LLM.

## 4. How you query it
- CLI tool: `sessionmem ask "what was I debugging yesterday afternoon"`.
- Under the hood: pull relevant time-windowed events from SQLite → pass as context to LLM API → return plain-language answer.
- **LLM provider**: OpenAI, default model `gpt-4o-mini`. Chosen for cost ($0.15/1M input tokens — a full day's session log costs fractions of a cent to query), API familiarity, and the fact that structured event log recall is factual extraction, not complex reasoning, so a frontier model isn't needed. Configured via `OPENAI_API_KEY` environment variable.
- Web chat UI is explicitly OUT of scope until Phase 3 (demo polish). MVP is CLI-only.

## 5. Definition of "done" (MVP)
Done = for a real, un-cherry-picked coding session you actually worked today, you can run `sessionmem ask` with a natural question about that session (what you debugged, what command failed and how you fixed it, what file you kept returning to) and get a correct, specific answer — using only real logged data, no hardcoded examples, no demo-only fixtures.

## 6. Explicit out-of-scope for entire capstone (not just MVP)
- Mobile app / cross-device sync.
- Multi-user / team features.
- Real-time voice interface.
- Automatic action-taking (e.g., auto-reopening files) — query/recall only, no agentic actions in v1.

## 7. Eval plan (do not skip)
Before calling Phase 2 done, write 8-10 question/expected-answer pairs based on a real logged session (e.g., "what package did I install today" → answer should name the exact package from the actual log). Run these against the agent and record pass/fail. This is the difference between "it works" as a claim and "it works" as a demonstrated fact.
