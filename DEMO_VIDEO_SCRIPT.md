# sessionmem — 3–5 Minute Demo Video Script

## Recording Setup
- **Tool**: OBS Studio (or Loom free tier)
- **Resolution**: 1920×1080, 30fps
- **Terminal**: Windows Terminal with dark theme, font size 16+
- **Microphone**: Clear voice, moderate pace
- **Upload**: Unlisted YouTube link

---

## Pre-Recording Checklist

```powershell
# 1. Make sure sessionmem is linked and working
sessionmem doctor

# 2. Clear any existing demo data (optional — for a clean run)
# Back up your real session.db first if needed

# 3. Have your .env configured with a valid OPENAI_API_KEY

# 4. Open Windows Terminal in the session-mem project directory
```

---

## Video Script (Target: 4 minutes)

### [0:00 – 0:30] ACT 1: The Problem & Introduction

**VISUAL**: Terminal open, cursor blinking.

**NARRATION** (speak while typing):
> "Hey everyone. I'm going to show you sessionmem — a coding session memory agent I built.
>
> Here's the problem it solves: every developer has had this moment where you close your laptop at the end of the day, open it the next morning, and think — 'wait, what was I actually working on?' You forget which file you were editing, what command failed, or what package you installed.
>
> And it gets worse with AI tools — every time you open a new AI chat, you have to re-explain your entire context from scratch.
>
> sessionmem fixes this. It silently logs your terminal commands and file saves, stores everything locally in SQLite, and lets you query your session history in plain English."

**ACTIONS**:
```powershell
# Show the system health check
sessionmem doctor
```
> "Let me first show you that everything is set up. `sessionmem doctor` runs 5 health checks — Node.js version, database connection, event queue, API key, and shell hook. All green."

---

### [0:30 – 1:15] ACT 2: Zero-Friction Ingestion & Secret Redaction

**NARRATION**:
> "The key design decision here is *zero friction*. You don't change how you work. The shell hook captures every command automatically. Let me show you."

**ACTIONS**:
```powershell
# Run some real commands
echo "building the API routes"
npm --version
git status

# Now let's simulate a dangerous one — a command with an API key
$env:DEMO_SECRET_KEY = "sk-proj-this-is-a-fake-key-12345"

# Flush events to the database
sessionmem flush
```

**NARRATION** (after flush):
> "Notice the output: 'Flushed 4 events, 0 skipped, 1 redacted.' That '1 redacted' is the command where I set the environment variable with an API key pattern.
>
> **This is a guardrail I want to highlight.** sessionmem uses regex-based Tier-1 secret redaction. It catches known patterns like OpenAI keys, GitHub PATs, AWS access keys, Bearer tokens, and anything matching `*_KEY=`, `*_SECRET=`, or `*_PASSWORD=`. The secret is replaced with `[REDACTED]` *before* it ever touches the database.
>
> **The limitation here** — and I want to be honest about this — is that it's regex-only. If you have a custom secret format that doesn't match any of these patterns, it will pass through unredacted. I deliberately chose not to add high-entropy generic detection because it would false-positive on git SHAs, npm hashes, and UUIDs."

---

### [1:15 – 2:00] ACT 3: File Watching (Live Demo)

**NARRATION**:
> "sessionmem also watches file changes. Let me start the watcher."

**ACTIONS**:
```powershell
# Start file watcher (in one terminal pane)
sessionmem watch

# In another pane or after Ctrl+C, show some file edits
# Edit a file, save it — the watcher logs the event

# Flush again
sessionmem flush
```

**NARRATION**:
> "The file watcher uses Node's built-in `fs.watch` recursively. It ignores `.git`, `node_modules`, and build artifacts automatically. Every save event gets timestamped and queued."

---

### [2:00 – 3:15] ACT 4: Natural Language Recall & Streaming

**NARRATION**:
> "Now for the fun part — querying your memory."

**ACTIONS**:
```powershell
# Ask about recent work
sessionmem ask "what commands did I run recently?" --verbose

# Ask about specific things
sessionmem ask "what files did I edit?" --time "last 2 hours"

# Ask a specific factual question
sessionmem ask "what was the curl command I used to test the endpoint?"
```

**NARRATION** (while answers stream):
> "Notice how the answer streams in real-time. Under the hood, it extracts time hints from your question — if I say 'yesterday afternoon', it resolves that to a UTC time window, queries SQLite for just those events, builds a grounded prompt with those events as context, and streams the answer through OpenAI's gpt-4o-mini.
>
> I chose gpt-4o-mini because this is factual extraction, not complex reasoning. It costs fractions of a cent per query. With the `--verbose` flag you can see exactly how many tokens were used.
>
> **A design decision worth calling out**: I use SQLite for storage instead of a vector database. Why? Because a developer's daily session is maybe 200-500 events — that's 20-50KB of text. Time-windowed SQL queries are more than fast enough. Vector embeddings would add complexity with zero measurable benefit at this scale."

---

### [3:15 – 4:15] ACT 5: Automated Eval Benchmark & Wrap-Up

**NARRATION**:
> "Finally, I don't just claim this works — I prove it with an automated benchmark."

**ACTIONS**:
```powershell
npm run eval -- --verbose
```

**NARRATION** (while eval runs):
> "This eval suite seeds an isolated temporary database with a realistic 3-day developer session — 20 events covering terminal commands, file edits, git commits, and secret redactions. It then runs 10 benchmark scenarios testing factual recall, time window discrimination, anti-hallucination checks, secret redaction integrity, and multi-source synthesis.
>
> All 10 pass. 100% pass rate. Total cost: less than a tenth of a cent.
>
> The key thing about these evals: they use a fixed reference timestamp, so 'today', 'yesterday', and 'last 2 hours' always resolve to the same UTC windows. The tests are deterministic and reproducible no matter when you run them.
>
> That's sessionmem. Zero npm dependencies, local-only SQLite storage, automatic secret redaction, and natural language recall — all in a single CLI tool. Stop re-explaining context, and just build. Thanks for watching."

---

## Post-Recording

1. Upload to YouTube as **unlisted**
2. Title: `sessionmem — Coding Session Memory Agent (Live Demo)`
3. Description: Include GitHub repo link
4. Copy the unlisted YouTube URL
5. Replace `YOUR_YOUTUBE_LINK_HERE` in README.md with the actual link
6. Submit both the README and the video link via the portal
