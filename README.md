# OfflineDocs

Offline documentation server for Claude Code. Fetch library docs while online, query them offline through MCP tools compatible with Context7.

## Quick Start

**Prerequisites:** Node.js >= 22

```bash
npm install
npm run build
```

## Configuration

Create a `libraries.toml` file listing the libraries you want to fetch. Each entry uses one of three source types:

```toml
# llms-txt: Fetch from a site's llms.txt endpoint
[[library]]
id = "react"
name = "React"
sourceType = "llms-txt"
sourceUrl = "https://react.dev/llms.txt"

# llms-txt links to .md, .mdx, and .txt files are followed automatically
[[library]]
id = "express"
name = "Express"
sourceType = "llms-txt"
sourceUrl = "https://expressjs.com/llms.txt"

# github: Fetch markdown files from a GitHub repo folder
# .mdx files are automatically cleaned (JSX imports/components stripped)
[[library]]
id = "tailwindcss"
name = "Tailwind CSS"
sourceType = "github"
sourceUrl = "https://github.com/tailwindlabs/tailwindcss.com/tree/main/src/docs"

# context7: Fetch from Context7 API (requires internet for initial seed)
[[library]]
id = "nextjs"
name = "Next.js"
sourceType = "context7"
sourceUrl = "/vercel/next.js"
```

**Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier for the library |
| `name` | Yes | Human-readable display name |
| `sourceType` | Yes | One of: `llms-txt`, `github`, `context7` |
| `sourceUrl` | Yes | Source URL (varies by type) |

For `llms-txt`, the URL points to a site's `llms.txt` endpoint (a standard for publishing LLM-friendly documentation). Links to `.md`, `.mdx`, and `.txt` files found in the content are automatically followed and fetched. For `github`, the URL points to a repo folder containing markdown files — `.mdx` files are automatically cleaned (JSX imports, export statements, and components are stripped). For `context7`, use the Context7 library ID (e.g., `/vercel/next.js`).

## Environment Variables

The fetcher loads a `.env` file from the current working directory if present.

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub personal access token for `github` source type. Without a token, GitHub API requests are limited to 60/hour and will fail on larger repos. With a token, the limit is 5,000/hour. Create one at GitHub > Settings > Developer settings > Personal access tokens (no special scopes needed). |

Example `.env`:

```
GITHUB_TOKEN=ghp_your_token_here
```

## Fetcher Usage

Fetch documentation from configured sources into a portable Doc Bundle:

```bash
npx offlinedocs-fetch fetch --config libraries.toml
```

**Flags:**

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--config <path>` | Yes | — | Path to `libraries.toml` config file |
| `--bundle-path <path>` | No | `./doc-bundle` | Output directory for the Doc Bundle |
| `--force` | No | `false` | Re-fetch all libraries, ignoring cache |

Without `--force`, unchanged libraries are skipped based on content hash comparison.

**Example output:**

```
[1/3] react ... fetching -> done (23 chunks)
[2/3] express ... fetching -> done (15 chunks)
[3/3] nextjs ... FAILED (RATE_LIMITED) -- skipped

Fetched: 2 | Failed: 1 | Skipped (unchanged): 0 | Duration: 1m 23s
```

The fetcher exits 0 on success or partial success, and 1 only when all libraries fail.

## MCP Server Usage

Start the offline MCP server pointing at a Doc Bundle. Use `npx` from the project root, or `node` with the built output directly:

```bash
npx offlinedocs-server --bundle ./doc-bundle
```

**Flags:**

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--bundle <path>` | Yes | — | Path to the Doc Bundle directory |
| `--skip-integrity` | No | `false` | Skip SHA-256 checksum verification at startup |
| `--stale-threshold-days <n>` | No | `30` | Days before docs are flagged as stale |

The server validates the bundle at startup (schema, file count, checksums) and fails fast if the bundle is corrupt or missing. Use `--skip-integrity` during development to skip checksum verification.

**Tools exposed:**

- `resolve-library-id` — Search for a library by name (partial, case-insensitive matching)
- `query-docs` — Retrieve relevant doc chunks ranked by topic, title, and body relevance

## Claude Code Setup

Add the MCP server to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "offlinedocs": {
      "command": "node",
      "args": [
        "/absolute/path/to/packages/server/dist/cli.js",
        "--bundle",
        "/absolute/path/to/doc-bundle"
      ]
    }
  }
}
```

Replace the paths with the actual locations on your machine. After saving, restart Claude Code. The `resolve-library-id` and `query-docs` tools will be available.

> **Note:** OfflineDocs uses the same tool names as Context7. If you have both configured, they will conflict. Disable one or the other in your settings.

## Airgap Transfer Workflow

1. **Fetch and build** (on an online machine):
   ```bash
   npm install
   npm run build
   npx offlinedocs-fetch fetch --config libraries.toml --bundle-path ./doc-bundle
   ```

2. **Copy** the entire project directory (including `node_modules/` and `doc-bundle/`) to the airgapped machine via USB drive, file share, or any transfer mechanism. The server depends on workspace-linked packages (`@offlinedocs/shared`) that Node resolves relative to the repo structure, so the full directory tree must be preserved. The doc bundle itself is plain markdown files and a JSON registry — no database, no binary blobs — fully inspectable for security review.

3. **Configure** `.claude/settings.json` on the airgapped machine with absolute paths to the server and bundle (see [Claude Code Setup](#claude-code-setup) above). The config uses `node` directly — `npx` will not work without internet access.

4. **Restart** Claude Code. The MCP server loads the bundle automatically at startup.

5. **Verify** by asking Claude Code to resolve a library:
   ```
   Use resolve-library-id to find "react"
   ```

To update docs, repeat steps 1-2 on the online machine and re-copy the project directory. Restart the MCP server to pick up changes.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `registry.json not found at the specified path` | Bundle path is wrong or bundle was not created | Verify the `--bundle` path points to a directory containing `registry.json` |
| `File count mismatch` or `Checksum mismatch` | Bundle was partially copied or corrupted during transfer | Re-copy the entire bundle directory; use `--skip-integrity` temporarily for development |
| `Expected bundle format version 1, got X` | Bundle created with a different version of OfflineDocs | Re-fetch the bundle with the matching fetcher version |
| Stale docs warning in query responses | Library docs are older than the threshold (default 30 days) | Re-run the fetcher on the online machine and transfer the updated bundle |
| `AUTH_REQUIRED` for GitHub sources | GitHub API rate limit (60 req/hour unauthenticated) | Set `GITHUB_TOKEN` in a `.env` file in the project root (see [Environment Variables](#environment-variables)) |
| Tool name collision with Context7 | Both Context7 and OfflineDocs MCP servers are configured | Disable one in `.claude/settings.json` — they use identical tool names (`resolve-library-id`, `query-docs`) and cannot coexist |

## Project Structure

```
packages/
  shared/     # Schemas, types, constants, validation (private package)
  fetcher/    # CLI tool for fetching docs and creating bundles
  server/     # MCP server for offline doc queries
```

## License

ISC
