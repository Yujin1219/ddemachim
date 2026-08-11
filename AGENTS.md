# Project Agent Orchestration

These rules apply to the primary Codex agent working in this repository.

## Domains

- Frontend: `FE/**`; delegate to `frontend_coordinator`.
- Backend: `BE/**`; delegate to `backend_coordinator`.
- Data: `data-pipeline/**`, database schemas, migrations, ingestion, and data contracts; delegate to `data_coordinator`.

## Routing

For repository requests that change, diagnose, review, test, or document code:

1. Determine which domains are affected.
2. Spawn the relevant coordinator agents and wait for their final reports.
3. For cross-domain contract work, run coordinators sequentially in this order: data, backend, frontend.
4. Pass upstream decisions and changed contracts into the next coordinator.
5. Never allow two code-writing agents to edit the workspace concurrently.
6. Consolidate verification results, changed files, and remaining risks in the final response.

Use only the coordinators needed for the request. A coordinator is responsible for running its own context, error, writer, verification, and documentation agents in order.

## Recursion Guard

Only the primary agent starts top-level domain coordination. Spawned coordinators and leaf agents must follow their own developer instructions and must not restart this top-level workflow. Leaf agents must not spawn further agents.

## Repository Rules

- Preserve unrelated user changes in the working tree.
- Follow nested instruction files, especially `BE/AGENTS.md` for backend work.
- Do not inspect or expose `.env` files, secrets, credentials, database dumps, or private data.
- Prefer focused changes and the repository's existing patterns.
- Run relevant tests or builds after implementation and report anything that could not be verified.
