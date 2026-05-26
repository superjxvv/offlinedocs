---
title: OfflineDocs — Airgapped Library Documentation for Claude Code
status: final
created: 2026-05-26
updated: 2026-05-26
---

# PRD: OfflineDocs

## 0. Document Purpose

This PRD defines OfflineDocs — a two-part system that gives Claude Code in airgapped environments the same library-documentation superpowers as Context7, without requiring internet access at query time. The development team serves as both operators (anyone can refresh docs) and consumers (Claude Code uses the docs). The system comprises an **Online Fetcher** (pulls and packages docs) and an **Offline MCP Server** (serves docs locally to Claude Code). Architecture and implementation stories derive from this PRD.

## 1. Vision

Developers in airgapped environments lose access to Context7 and live documentation lookups, forcing Claude Code to rely on potentially stale training data. The result: outdated syntax suggestions, missed API changes, and wasted time verifying answers against local copies of docs.

OfflineDocs closes this gap. A team member periodically runs the Online Fetcher on an internet-connected machine to pull the latest documentation for dozens of libraries, producing a portable doc bundle. The team transfers that bundle into the airgapped environment via their existing mechanism (USB, file share, approved transfer). The Offline MCP Server then exposes the docs to every developer's Claude Code instance through the same resolve-then-query workflow they would get from Context7.

Claude Code offline then knows the latest syntax and features, the team stays current without bespoke workarounds, and anyone can refresh the docs — no specialized knowledge required.

## 2. Target User

### 2.1 Jobs To Be Done

- **When I'm coding offline**, I want Claude Code to know the current API surface of my libraries so I don't get outdated suggestions.
- **When a library releases a new version**, I want someone on the team to easily pull the updated docs and share them so everyone benefits.
- **When I join the team**, I want the doc setup to just work on my machine without configuring dozens of sources manually.

### 2.2 Key User Journeys

- **UJ-1. Dev asks Claude Code about a library API while offline.**
  Dev is writing code in an airgapped environment. They ask Claude Code "how do I use useEffect cleanup in React 19?" Claude Code calls `resolve-library-id` to find the React library, then `query-docs` to retrieve the relevant section. Claude Code answers with current syntax drawn from the local Doc Bundle.

- **UJ-2. Team member refreshes the Doc Bundle.**
  A developer on the online side runs the Fetcher CLI, which reads the library config and pulls updated docs for all listed libraries. The Fetcher reports what changed. The developer transfers the updated Doc Bundle to the airgapped environment via the team's standard mechanism and notifies the team.

- **UJ-3. New developer sets up OfflineDocs on their machine.**
  A new team member receives the Doc Bundle directory and drops it into a known path. They add the MCP Server entry to their Claude Code settings, pointing at the bundle path. On next Claude Code session, the tools are available — no further config needed.

### 2.3 Non-Users (v1)

- Users who have reliable internet access — Context7 already serves them.
- Users who need real-time, always-up-to-date docs (sub-daily freshness).

## 3. Glossary

- **Doc Bundle** — A portable directory containing all fetched library documentation and a registry file. The unit of airgap transfer.
- **Registry** — A manifest file within the Doc Bundle that lists every library, its version, source, and fetch date. Used by both the Fetcher and the MCP Server.
- **Fetcher** — The Online Fetcher CLI tool that pulls documentation from the internet and produces or updates a Doc Bundle.
- **MCP Server** — The Offline MCP Server that reads a Doc Bundle and exposes library docs to Claude Code via the MCP protocol.
- **Library ID** — A unique identifier for a library within the Registry (e.g., `react`, `express`, `prisma`). [ASSUMPTION: Simple slugs are sufficient; no need for Context7-style `/org/project` namespacing given the team manages their own curated list.]

## 4. Features

### 4.1 Online Fetcher

**Description:** A CLI tool run on an internet-connected machine that pulls library documentation from various sources, converts it to a consistent markdown format, and writes it into a Doc Bundle. The Fetcher is the only component that requires internet access. Any team member can run it. Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-1: Fetch docs from a library list

The Fetcher reads a configuration file listing libraries and their documentation sources, fetches the docs, and writes them into the Doc Bundle.

**Consequences (testable):**
- Given a config listing 3 libraries with valid sources, the Fetcher produces a Doc Bundle containing docs for all 3.
- Each library's docs are stored as markdown files within a library-specific subdirectory.
- The Fetcher creates or updates the Registry with each library's name, version, source URL, and fetch timestamp.

#### FR-2: Support multiple documentation sources

The Fetcher pulls docs from three source types: llms.txt endpoints, GitHub repository doc folders (raw markdown), and Context7's API (for initial seeding). [ASSUMPTION: These three sources cover the majority of libraries the team uses. Additional sources like HTML scraping can be added later.]

**Consequences (testable):**
- A library configured with an llms.txt source fetches and stores the resolved doc content.
- A library configured with a GitHub source clones or downloads the target path and converts it to local markdown.
- A library configured with a Context7 source queries Context7's API for comprehensive docs and stores the result.

#### FR-3: Incremental updates

The Fetcher updates an existing Doc Bundle without re-fetching unchanged libraries.

**Consequences (testable):**
- Running the Fetcher twice with no source changes produces no file modifications for unchanged libraries.
- Adding a new library to the config and re-running fetches only the new library.
- A `--force` flag re-fetches all libraries regardless of cache state.

#### FR-4: Configurable library list

Any team member can edit the library list — a human-readable config file (YAML or TOML) — to add, remove, or update library sources.

**Consequences (testable):**
- Any text editor can open and modify the config file.
- Adding a new entry with a name and source URL is sufficient to fetch a new library on the next run.
- Invalid entries produce clear error messages naming the problematic entry.

**Notes:**
- [NOTE FOR PM] Consider whether the Fetcher should auto-discover popular libraries or if a curated list is always the right approach for a team managing dozens of libs.

### 4.2 Doc Bundle Format

**Description:** The Doc Bundle is a self-contained, copyable directory containing all library docs and the Registry manifest. It serves as the airgap transfer unit. Realizes UJ-2, UJ-3.

**Functional Requirements:**

#### FR-5: Portable directory structure

The Doc Bundle is a single directory with a predictable, cross-platform structure.

**Consequences (testable):**
- The bundle is a plain directory (no database, no binary blobs) copyable via USB, file share, or any file-transfer mechanism.
- All file paths within the bundle use OS-safe characters and stay under 200 characters.
- The bundle format uses only plain files and OS-safe paths, so it is inherently portable across operating systems. MVP testing targets Windows and Linux.

#### FR-6: Registry manifest

The Doc Bundle contains a Registry file that lists all available libraries and their metadata.

**Consequences (testable):**
- A single JSON or YAML file at the bundle root serves as the Registry.
- Each entry contains: library ID, display name, version (if known), source type, source URL, fetch date, and a summary description.
- The MCP Server uses the Registry for library resolution without scanning the filesystem.

#### FR-7: Doc chunk structure

At fetch time, the Fetcher splits each library's documentation into topic-based markdown files — one per API area, getting-started guide, or configuration section — rather than by fixed token count. [ASSUMPTION: Chunking by section/topic rather than fixed token count provides better retrieval quality and is simpler to implement.]

**Consequences (testable):**
- Each library has a subdirectory containing one or more markdown files produced during the fetch step.
- Each file has a clear filename reflecting its content (e.g., `getting-started.md`, `api-reference.md`, `hooks.md`).
- Each file includes YAML frontmatter with: `title`, `library` (Library ID), and `topics` (keyword tags relevant to the file's content). The MCP Server uses these frontmatter fields for search.
- No single chunk file exceeds 50KB. If a source section is larger, the Fetcher splits it into numbered parts (e.g., `api-reference-1.md`, `api-reference-2.md`).

### 4.3 Offline MCP Server

**Description:** A local MCP server that reads the Doc Bundle and exposes two tools to Claude Code: one to find libraries, one to query their docs. It runs on each developer's machine with no internet required. Realizes UJ-1, UJ-3.

**Functional Requirements:**

#### FR-8: Library resolution tool

The MCP Server exposes a `resolve-library-id` tool that searches the Registry for libraries matching a given name or query.

**Consequences (testable):**
- Querying "react" returns the React library entry with its ID and description.
- Partial matches work (e.g., "next" matches "Next.js").
- If no match is found, the response states this and lists available libraries.

#### FR-9: Documentation query tool

The MCP Server exposes a `query-docs` tool that retrieves relevant documentation chunks for a given library and query. It searches three fields in priority order: (1) frontmatter `topics` tags (exact and partial keyword match), (2) frontmatter `title` (substring match), (3) markdown content body (keyword occurrence). A topics-tag hit outranks a body-only hit. [ASSUMPTION: Simple keyword/section-title matching is sufficient for v1. Vector search can be added later if retrieval quality is insufficient.]

**Consequences (testable):**
- Querying library "react" with query "useEffect cleanup" returns doc chunks whose `topics` include "useEffect" or "cleanup", or whose title or body contains those terms.
- When multiple chunks match, they are returned in ranked order: topics match first, then title match, then body match.
- The server returns results as concatenated markdown text, capped at a configurable token limit (default 5000). It includes whole chunks until the limit is reached; partial chunks are not returned.
- If no chunks match the query, the response returns the library's top-level overview chunk (e.g., `getting-started.md`) as a fallback.
- If the library ID is not found, the response returns an error with available library IDs.

#### FR-10: Zero-configuration startup

The MCP Server points at a Doc Bundle path and runs — no database setup, no indexing step, no environment variables beyond the bundle path.

**Consequences (testable):**
- Starting the server with `--bundle /path/to/docs` is sufficient.
- The server serves queries within 5 seconds of startup for a bundle with 50 libraries.
- The server runs without internet access.

#### FR-11: Claude Code integration

Developers install the MCP Server as a Claude Code MCP server via standard configuration.

**Consequences (testable):**
- Adding the server to `.claude/settings.json` MCP config enables the tools in Claude Code.
- The tools appear and function identically to Context7's tools. [ASSUMPTION: The tool names match Context7's (`resolve-library-id`, `query-docs`) so existing prompts/rules referencing Context7 work without modification.]

### 4.4 Team Sync Workflow

**Description:** The workflow for keeping offline Doc Bundles current. Anyone can perform it without specialized knowledge. Realizes UJ-2.

**Functional Requirements:**

#### FR-12: Shareable library config

The library list config file lives alongside the Doc Bundle (or in version control), giving the team a single source of truth for which libraries to track.

**Consequences (testable):**
- The config file lives at a well-known path within or alongside the Doc Bundle.
- Two team members editing the config and running the Fetcher produce consistent results.

#### FR-13: Bundle merge safety

A developer can safely replace their local Doc Bundle with an updated copy in a single atomic operation.

**Consequences (testable):**
- Copying an updated bundle over an existing one never leaves partial state.
- Restarting the MCP Server picks up changes without reconfiguration. [ASSUMPTION: A simple restart-to-reload model is acceptable; live hot-reload is not needed for weekly updates.]

## 5. Non-Goals (Explicit)

- **Not a Context7 replacement for online users** — if you have internet, use Context7.
- **Not a documentation authoring tool** — this consumes existing docs, not creates them.
- **Not a real-time sync system** — freshness is weekly via manual airgap transfer, not continuous.
- **Not a full-text search engine** — v1 uses simple matching; semantic/vector search is a future enhancement.
- **No web UI or GUI** — CLI and MCP tools only.
- **No automatic doc discovery** — the team curates which libraries to track.

## 6. MVP Scope

### 6.1 In Scope

- Fetcher CLI that pulls docs from llms.txt, GitHub markdown, and Context7 API
- YAML/TOML config file for the library list
- Portable Doc Bundle directory format with Registry manifest
- Offline MCP Server with `resolve-library-id` and `query-docs` tools
- Works on Windows and Linux
- Documentation for setup, config, and the airgap workflow

### 6.2 Out of Scope for MVP

- Vector/semantic search — deferred to v2 if keyword matching proves insufficient
- HTML doc site scraping — deferred; llms.txt and GitHub markdown cover most cases
- Auto-discovery of libraries from project dependencies (package.json, requirements.txt) — v2 [NOTE FOR PM] This would be very compelling for onboarding; revisit early
- Hot-reload of Doc Bundle without MCP Server restart — deferred
- macOS support — deferred unless team need surfaces
- Versioned doc bundles (keeping multiple versions of a library's docs) — v2

## 7. Success Metrics

**Primary**
- **SM-1:** Each developer uses OfflineDocs queries at least 5 times per day within 2 weeks of deployment. Validates FR-8, FR-9, FR-11.
- **SM-2:** A full Doc Bundle refresh (fetch + airgap transfer + restart) completes in under 15 minutes for 50 libraries. Validates FR-1, FR-3, FR-5.

**Secondary**
- **SM-3:** A new team member sets up the Offline MCP Server in under 5 minutes using only the README. Validates FR-10, FR-11.
- **SM-4:** The team tracks 30+ libraries within the first month. Validates FR-4, FR-12.

**Counter-metrics (do not optimize)**
- **SM-C1:** Bundle size — do not optimize storage at the cost of doc completeness. Counterbalances SM-2.
- **SM-C2:** Number of supported sources — do not chase source integrations at the cost of reliability of existing ones. Counterbalances SM-4.

## 8. Open Questions

1. Should the Fetcher support pulling docs from PyPI/npm package READMEs as a lightweight source?
2. What airgap transfer mechanism does the team use — USB, file share, approved pipeline? This affects whether bundle packaging (tar/zip) is needed.
3. ~~Should the MCP Server tool names exactly mirror Context7?~~ **Resolved:** Yes — tool names match Context7 (`resolve-library-id` / `query-docs`) for drop-in compatibility with existing prompts and rules. In environments where both are configured, only one should be active.
4. Is there a maximum acceptable Doc Bundle size for the transfer mechanism?
5. Should the library config support pinning to specific library versions, or always fetch latest?

## 9. Assumptions Index

- **§3 Library ID** — Simple slugs are sufficient; no need for Context7-style `/org/project` namespacing given the team manages their own curated list.
- **§4.1 FR-2** — llms.txt, GitHub markdown, and Context7 API cover the majority of libraries the team uses.
- **§4.2 FR-7** — Chunking by section/topic rather than fixed token count provides better retrieval quality and is simpler to implement.
- **§4.3 FR-9** — Simple keyword/section-title matching is sufficient for v1.
- **§4.3 FR-11** — Tool names match Context7's so existing prompts/rules work without modification.
- **§4.4 FR-13** — Restart-to-reload model is acceptable; live hot-reload is not needed for weekly updates.
- **§6.1** — Primary airgapped environments are Windows/Linux; macOS deferred.
