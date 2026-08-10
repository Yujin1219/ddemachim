# Ddemachim Backend Instructions

Before planning, editing, reviewing, or testing any backend code, read and
follow every rule in `./AGENTS.md`.

`AGENTS.md` is the canonical backend instruction file. If this file and
`AGENTS.md` appear to conflict, follow `AGENTS.md`.

These instructions apply to every file under this `BE/` directory.

When implementing a feature:

1. Inspect the relevant frontend flow under `../FE/` and the existing backend
   code before making assumptions.
2. Follow the domain structure, API response, exception, security, persistence,
   testing, and completion-report rules in `AGENTS.md`.
3. Implement and verify the requested feature when requirements are sufficient.
4. Do not modify frontend code unless the user explicitly requests it.
5. Do not add or change the project's technology stack unless the requested
   feature requires it.
