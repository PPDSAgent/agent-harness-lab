# Agent Harness Lab: Harness Run Observatory

**Live demo:** https://ppdsagent.github.io/agent-harness-lab/ (session logs are synthetic; the run
records are the build team's own)

A dashboard over AI agent run logs. It reads Claude Code and Codex session logs, plus the run
records of the agent team that built it, and answers three questions, each with its source and
sample size:

1. Which skill fails most often?
2. What does each scheduled run cost?
3. Which claims carry no evidence?

Unknown values stay unknown. When a run's cost was never recorded, the page says "not
recorded" rather than estimating it.

## How it was built

The code was written by a scheduled team of AI agents (a lead, a test engineer, a builder,
a reviewer, a design critic, a red team and others), working under rules the owner set:
acceptance tests are frozen before any code is written, a reviewer in a fresh context grades
the agents' changes, and the owner approves what merges.

This repository is a public snapshot. The build history, pull requests, reviews and the
team's operating rules stay in a private repo. The snapshot is exported from an allow-list
of paths and scanned for secrets and personal data before it is published.

## Run it

Requires Node (version in `.nvmrc`).

```bash
npm ci
npm run dev        # local dev server
npm test           # unit and component tests (Vitest)
npm run build      # production build
```

## What's here

- `src/`: the app (TypeScript, React, Vite, Tailwind CSS, Recharts)
- `fixtures/`: synthetic Claude Code and Codex session logs
- `runs/` and `schemas/`: the build team's own run records (not synthetic) and their JSON Schema
- `tests/`: Vitest unit and component tests
- `scripts/`: fixture generators and build helpers
