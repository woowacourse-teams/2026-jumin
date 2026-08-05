---
name: commit-and-pr
description: Prepare and submit a reviewed commit and pull request for this repository. Use when asked to commit changes, create a pull request, or check a change set against the team's Git Flow, task-ID, AngularJS commit, and PR-review conventions.
---

# Commit and PR

Follow the repository's collaboration rules. Read `docs/team-conventions.md` and `.github/pull_request_template.md` before preparing a commit or pull request.

## Workflow

1. Inspect `git status` and the complete diff. Keep unrelated user changes out of the commit.
2. Confirm the current feature branch follows `feature/<TASK-ID>-<short-description>` and was based on `develop`. Do not commit directly to `main` or `develop`.
3. Run the relevant tests, lint, type checks, or build. State explicitly when no validation command exists.
4. Choose an AngularJS Conventional Commit message: `<type>(<optional-scope>): <summary>`.
5. Before committing, summarize changed files and ask for confirmation if the commit scope is ambiguous or includes user-owned unrelated edits.
6. Create a PR targeting `develop` with the repository template. Include the task ID, major changes, related issue or document, and reviewer notes.
7. Request review. Do not merge the PR until review is complete and required checks pass.

## Guardrails

- Never include credentials, local environment files, or unrelated work in commits.
- If no task ID exists, ask for one before creating a feature branch or PR.
- If GitHub issue use becomes mandatory, update `docs/team-conventions.md` and this skill together.
