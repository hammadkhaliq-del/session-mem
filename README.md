# sessionmem

An agent that logs your coding session across terminal, file edits, and browser tabs, then lets you query "what was I working on" in plain language — so you stop re-explaining context every time you switch tools.

## Prerequisites

- **Node.js ≥ 22.13.0** — required for the built-in `node:sqlite` module.

```bash
node --version  # must be v22.13.0 or higher
```

## Quick Start

```bash
# Clone the repo
git clone https://github.com/hammadkhaliq-del/session-mem.git
cd session-mem

# Install (no runtime dependencies in M1, but sets up the project)
npm install

# Initialize the database
npm run init-db
# → Creates ~/.sessionmem/session.db with the events table

# Run verification tests
npm test
```

## Database

Events are stored in a local SQLite database at `~/.sessionmem/session.db`.

Override the location with the `SESSIONMEM_DB_PATH` environment variable:

```bash
SESSIONMEM_DB_PATH=/path/to/custom.db npm run init-db
```

### Schema

| Column       | Type    | Description                                    |
|-------------|---------|------------------------------------------------|
| id          | INTEGER | Auto-increment primary key                     |
| timestamp   | TEXT    | ISO 8601 timestamp                             |
| source      | TEXT    | Event source: `terminal`, `file`, or `browser` |
| content     | TEXT    | The logged content (command, filename, etc.)    |
| project_path| TEXT    | Absolute path to the project directory          |

## Project Structure

```
session-mem/
├── bin/
│   └── sessionmem.js          # CLI entrypoint
├── scripts/
│   ├── init-db.js              # Database initialization
│   └── verify-m1.js            # M1 verification tests
├── src/
│   └── db/
│       ├── database.js         # SQLite wrapper (node:sqlite)
│       ├── index.js            # Barrel exports
│       └── schema.sql          # SQL schema definition
├── .gitignore
├── EXECUTION_PLAN.md
├── package.json
├── README.md
└── SPEC.md
```

## Full Spec

See [SPEC.md](SPEC.md) for scope decisions, privacy boundaries, and the definition of "done."

See [EXECUTION_PLAN.md](EXECUTION_PLAN.md) for the module-by-module build plan.
<!-- M3 manual test -->
