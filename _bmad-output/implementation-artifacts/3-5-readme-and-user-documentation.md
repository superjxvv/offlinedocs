---
baseline_commit: 46341a46c2a8e43b90ae2eeaf02bdef4875c0f79
---

> **NOTE (Story 4.1):** This artifact references pnpm throughout. The project migrated to npm in Story 4.1. The actual README and package.json use npm commands. Treat pnpm references below as historical.

# Story 3.5: README & User Documentation

Status: done

## Story

As a new team member,
I want clear documentation for setting up and using OfflineDocs,
so that I can onboard in under 5 minutes following the README alone.

## Acceptance Criteria

1. **Given** the README, **When** I read the quick-start section, **Then** it explains prerequisites (Node.js >=22), installation (`pnpm install`), and building (`pnpm build`).

2. **Given** the README, **When** I read the configuration section, **Then** it documents the libraries.toml format with examples for all 3 source types (llms-txt, github, context7).

3. **Given** the README, **When** I read the fetcher usage section, **Then** it explains how to run the Fetcher CLI with common flags: `--config`, `--force`, `--bundle-path`.

4. **Given** the README, **When** I read the airgap transfer workflow section, **Then** it explains the complete transfer process step by step: fetch on online machine → copy bundle to airgapped machine → restart MCP Server.

5. **Given** the README, **When** I read the Claude Code setup section, **Then** it shows the exact `.claude/settings.json` MCP server configuration block with the correct command and args.

6. **Given** the README, **When** I read the troubleshooting section, **Then** it covers: missing or corrupt bundle errors, stale docs warning, tool name collision with Context7 (mutual exclusivity guidance).

7. **Given** a new team member following only the README, **When** they complete all steps (copy bundle, configure settings.json, start Claude Code), **Then** the MCP Server runs and both tools are available in Claude Code.

## Tasks / Subtasks

- [x] Task 1: Create README.md at project root (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] Write project title, one-line description, and overview paragraph
  - [x] Write Quick Start section: prerequisites (Node.js >=22, pnpm), `pnpm install`, `pnpm build`
  - [x] Write Configuration section: `libraries.toml` format with `[[library]]` entries for all 3 source types
  - [x] Write Fetcher Usage section: `offlinedocs-fetch fetch --config libraries.toml` with `--force`, `--bundle-path` flags
  - [x] Write Airgap Transfer Workflow section: numbered steps (fetch → copy → configure → restart)
  - [x] Write Claude Code Setup section: exact `.claude/settings.json` MCP server config block
  - [x] Write Troubleshooting section: corrupt bundle, stale docs warning, Context7 tool collision
  - [x] Write section headers for MCP Server usage: `--bundle`, `--skip-integrity`, `--stale-threshold-days`

## Dev Notes

### Content Requirements (from Architecture & PRD)

This story creates a **single file**: `README.md` at the project root. No code changes.

#### Quick Start Section Content

Prerequisites:
- Node.js >= 22 (target: 24)
- pnpm (auto-detected version via `packageManager` field)

Commands:
```bash
pnpm install
pnpm build
```

Build order is handled automatically: shared first, then fetcher + server in parallel.

#### Configuration Section Content

The fetcher reads a `libraries.toml` file using smol-toml. Format uses TOML `[[library]]` array-of-tables. Each entry requires:
- `id` — unique identifier (e.g., "react")
- `name` — human-readable name (e.g., "React")
- `sourceType` — one of: `"llms-txt"`, `"github"`, `"context7"`
- `sourceUrl` — source URL varies by type

Example entries for all 3 source types:

```toml
[[library]]
id = "react"
name = "React"
sourceType = "llms-txt"
sourceUrl = "https://react.dev/llms.txt"

[[library]]
id = "express"
name = "Express"
sourceType = "github"
sourceUrl = "https://github.com/expressjs/expressjs.com/tree/gh-pages/en"

[[library]]
id = "nextjs"
name = "Next.js"
sourceType = "context7"
sourceUrl = "/vercel/next.js"
```

For `github` type, the URL points to a folder of markdown files in a repo.
For `context7` type, the `sourceUrl` is the Context7 library ID (e.g., `/vercel/next.js`).

#### Fetcher CLI Section Content

Binary name: `offlinedocs-fetch` (from `packages/fetcher/package.json` `bin` field)

Commands and flags:
```
offlinedocs-fetch fetch --config <path>           # Required: path to libraries.toml
                        --bundle-path <path>       # Optional: output dir (default: ./doc-bundle)
                        --force                    # Optional: re-fetch all, ignore cache
```

Output shows per-library progress:
```
[1/3] react ... fetching → done (23 chunks)
[2/3] express ... fetching → done (15 chunks)
[3/3] nextjs ... FAILED (RATE_LIMITED) — skipped

Fetched: 2 | Failed: 1 | Skipped (unchanged): 0 | Duration: 1m 23s
```

Exit codes: 0 = success/partial, 1 = total failure.

#### Server CLI Section Content

Binary name: `offlinedocs-server` (from `packages/server/package.json` `bin` field)

```
offlinedocs-server --bundle <path>                # Required: path to doc bundle
                   --skip-integrity               # Optional: skip SHA-256 verification
                   --stale-threshold-days <n>      # Optional: staleness warning threshold (default: 30)
```

The server communicates over stdio (MCP protocol). stdout is reserved for JSON-RPC; all logs go to stderr.

#### Claude Code Setup Section Content

The exact `.claude/settings.json` block:

```json
{
  "mcpServers": {
    "offlinedocs": {
      "command": "node",
      "args": ["path/to/packages/server/dist/cli.js", "--bundle", "path/to/doc-bundle"]
    }
  }
}
```

Key points to document:
- `command` is `node` (not the binary name directly, since it ships as a compiled .js file)
- `args[0]` is the path to `packages/server/dist/cli.js`
- `args` includes `--bundle` followed by the absolute or relative path to the doc bundle
- Tools registered: `resolve-library-id` and `query-docs` — same names as Context7
- **Mutual exclusivity**: If Context7 MCP is also configured, tool names will collide. Disable one.

#### Airgap Transfer Workflow Section Content

Step-by-step:
1. On the online machine: run `offlinedocs-fetch fetch --config libraries.toml`
2. Copy the entire `doc-bundle/` directory to the airgapped machine (USB, file share, any mechanism)
3. On the airgapped machine: configure `.claude/settings.json` with the bundle path
4. Start/restart Claude Code — the MCP server loads the bundle automatically
5. Verify: use `resolve-library-id` in Claude Code to confirm tools are available

Bundle is a plain directory (no database, no binary blobs) — fully inspectable for security review.

#### Troubleshooting Section Content

| Issue | Cause | Fix |
|-------|-------|-----|
| "registry.json not found" | Bundle path incorrect or bundle not created | Verify `--bundle` path points to directory containing `registry.json` |
| "File count mismatch" / "Checksum mismatch" | Bundle partially copied or corrupted | Re-copy the entire bundle directory; use `--skip-integrity` for dev |
| "bundleFormatVersion mismatch" | Bundle created with different version of OfflineDocs | Re-fetch with matching fetcher version |
| Stale docs warning in responses | Library docs older than threshold (default 30 days) | Re-run fetcher on online machine and transfer updated bundle |
| Tool name collision with Context7 | Both Context7 and OfflineDocs configured | Disable one in `.claude/settings.json`; they use identical tool names |

### Previous Story Learnings (from Stories 3.1-3.4)

- Co-locate tests with source files (`.test.ts` next to `.ts`)
- Import from `@offlinedocs/shared` for schemas and constants
- All 257 tests currently passing across 33 test files
- Server uses `@modelcontextprotocol/sdk@^1.29.0` with stdio transport
- The server validates the bundle at startup and fails fast on errors
- `--skip-integrity` skips only SHA-256 checksums, not schema validation
- `--stale-threshold-days` defaults to 30 (from `STALE_THRESHOLD_DAYS` constant)

### Project Structure Notes

- README.md goes at project root `/workspace/README.md`
- No other files created or modified
- No code changes, no test changes

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Distribution, CLI, MCP Server]
- [Source: packages/fetcher/src/cli.ts — Commander.js CLI definition]
- [Source: packages/server/src/cli.ts — Commander.js CLI definition]
- [Source: packages/server/src/mcp-server.ts — MCP tool registration]
- [Source: packages/shared/src/constants.ts — STALE_THRESHOLD_DAYS, DEFAULT_MAX_TOKENS]

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Debug Log References

### Completion Notes List

- Created comprehensive README.md at project root covering all 7 acceptance criteria
- Quick Start: prerequisites (Node.js >=22, pnpm), install and build commands
- Configuration: libraries.toml format with examples for all 3 source types (llms-txt, github, context7)
- Fetcher Usage: CLI command with --config, --bundle-path, --force flags, example output, exit codes
- MCP Server Usage: CLI with --bundle, --skip-integrity, --stale-threshold-days flags
- Claude Code Setup: exact .claude/settings.json config block with node command and args
- Airgap Transfer Workflow: 5-step numbered guide (fetch → copy → configure → restart → verify)
- Troubleshooting: 5 common issues with causes and fixes (corrupt bundle, stale docs, Context7 collision)
- Added project structure overview and license
- No code changes, no test changes — documentation only
- Full regression suite: 257 tests passing across 33 files

### File List

- README.md (NEW)
