# PRD Quality Review — OfflineDocs

## Overall verdict

This is a well-structured, honest PRD for a medium-stakes internal tool. The two-component architecture is clearly articulated, FRs have testable consequences, and scope is bounded with explicit non-goals. The main risks are a retrieval strategy that's hand-waved for v1 (keyword matching on chunked markdown with a token cap) and a few FRs that lack the specificity an engineer would need to call them done.

## Decision-readiness — adequate

The PRD makes real decisions: three doc sources for v1, no vector search, no GUI, restart-over-hot-reload. These are stated as decisions with the trade-off visible (e.g., FR-9 explicitly defers vector search, §5 explains why). The Open Questions (§8) are genuinely open — none are rhetorical.

However, Open Question 3 (should tool names mirror Context7 or diverge?) is directly contradicted by an inline assumption at FR-11 that already decides they match. This tension is unresolved — either the assumption is the decision and the OQ should be removed, or the decision hasn't been made and the assumption tag should flag the risk more loudly.

### Findings
- **medium** Tool-name decision inconsistency (§4.3 FR-11 vs §8 OQ-3) — The assumption at FR-11 states tool names match Context7, but OQ-3 asks whether they should. One of these must yield. *Fix:* If the team has decided to match, remove OQ-3 and promote the assumption to a decision. If not, demote FR-11's assumption to a `[NOTE FOR PM]` flagging the open question.
- **low** No explicit decision on config format (§4.1 FR-4) — "YAML or TOML" is still undecided. For an internal tool this is low-stakes, but it blocks implementation. *Fix:* Pick one (YAML is the simpler default) or move to Open Questions.

## Substance over theater — strong

The PRD is lean and free of theater. There are no named personas — the JTBD framing (§2.1) is the right weight for an internal team tool where every user is "developer on this team." Non-goals (§5) do real work: they head off scope creep toward online users, GUI, and real-time sync. The vision (§1) is specific to the airgap problem rather than a generic "better developer experience" statement.

No findings.

## Strategic coherence — strong

The thesis is clear: Claude Code in airgapped environments needs current library docs, and the team's existing airgap-transfer workflow is the transport layer. Every feature group (Fetcher, Bundle, MCP Server, Team Sync) serves this thesis. Success metrics validate the thesis directly — SM-1 measures actual developer usage, SM-2 measures the refresh loop, SM-3 measures onboarding friction. Counter-metrics (SM-C1, SM-C2) are well-chosen and correctly assigned.

The MVP scope kind is problem-solving, and the scope logic matches: ship the minimum that closes the airgap gap, defer enhancements (vector search, auto-discovery, hot-reload).

### Findings
- **low** SM-1 threshold may be arbitrary (§7) — "5 times per day per developer" has no stated basis. For an internal tool this is fine to adjust post-launch, but noting it. *Fix:* Add a sentence explaining the basis (e.g., "matches observed Context7 usage on the online team") or mark as `[ASSUMPTION]`.

## Done-ness clarity — adequate

Most FRs have testable consequences, and they're specific enough to implement against. FR-1, FR-3, FR-5, FR-8, FR-10, FR-11 are solid. However, several FRs have gaps:

### Findings
- **high** FR-9 retrieval behavior is under-specified (§4.3) — "Returns relevant doc sections" with "simple keyword/section-title matching" is the core of the MCP Server's value, but there's no specification of what matching means. Does a query match file titles? Frontmatter tags? Full-text content? How are results ranked? An engineer implementing this FR would need to make significant design decisions. *Fix:* Add 2-3 sentences specifying the matching strategy: which fields are searched, how results are ranked, and what happens when multiple files match.
- **medium** FR-7 chunking strategy is vague (§4.2) — "Chunked markdown files optimized for LLM consumption" with "one or more markdown files" per library doesn't specify who or what does the chunking, or what "optimized" means. The Fetcher presumably chunks during fetch, but this isn't stated. *Fix:* Specify that the Fetcher is responsible for chunking, and define the chunking heuristic (e.g., "split on H2 headings, each file ≤ N tokens").
- **medium** FR-2 GitHub source behavior is under-specified (§4.1) — "Clones/downloads the target path and converts to local markdown" — what is the "target path"? A whole repo? A `docs/` folder? How is target path configured? The config file format (FR-4) doesn't specify fields per source type. *Fix:* Add a consequence specifying the config shape for each source type (e.g., GitHub entries need `repo` and `path` fields).

## Scope honesty — strong

Scope is handled well. Non-goals (§5) are explicit and do real work. MVP scope (§6) clearly separates in/out. The macOS omission is called out in both §6.1 ("Windows and Linux") and §6.2 ("macOS support — deferred"). Assumptions are tagged inline and indexed (§9) with a clean roundtrip. The `[NOTE FOR PM]` callouts (FR-4, §6.2) flag genuine tensions.

### Findings
- **medium** macOS omission may be silent for some readers (§6.1) — §6.1 says "Works on Windows and Linux" without calling this out as a deliberate limitation; the reader has to reach §6.2 to see macOS is deferred. For an internal tool this may be fine, but it could surprise a macOS-using team member. *Fix:* Add `[NON-GOAL for MVP]` inline at §6.1 or mention the omission in §5.

## Downstream usability — adequate

The PRD is well-structured for downstream architecture and stories. Glossary (§3) exists and terms are used consistently. FR IDs are contiguous (FR-1 through FR-13). Cross-references from FRs to UJs are present (e.g., "Realizes UJ-1, UJ-2"). Success metrics reference FRs.

### Findings
- **medium** UJ references are undefined (§4.x) — FRs reference "UJ-1", "UJ-2", "UJ-3" but no User Journeys section exists. The JTBD items (§2.1) are the likely referents but they aren't labeled with IDs. This breaks cross-reference resolution. *Fix:* Add IDs to the JTBD items (UJ-1, UJ-2, UJ-3) or remove UJ references from FR descriptions.
- **low** Feature subsection numbering mixes with FR numbering — §4.1 through §4.4 are feature groups, FRs are FR-1 through FR-13. This is fine but could confuse downstream tooling that expects FRs to be direct children of a single section. No fix needed unless downstream tooling requires it.

## Shape fit — strong

This is an internal tool / single-operator-role product, and the PRD correctly adopts a capability-spec shape. No persona theater — JTBD items replace user journeys, which would be overhead here. Success metrics are operational (usage frequency, setup time, refresh time) rather than user-facing engagement metrics. NFRs are embedded in FR consequences (e.g., startup time in FR-10, cross-OS in FR-5) rather than in a separate boilerplate section. This is the right shape.

No findings.

## Mechanical notes

- **Glossary drift:** None observed. "Doc Bundle," "Registry," "Fetcher," "MCP Server," and "Library ID" are used consistently throughout.
- **ID continuity:** FR-1 through FR-13 are contiguous with no gaps or duplicates. SM-1 through SM-4 plus SM-C1/C2 are clean.
- **Assumptions Index roundtrip:** All 7 inline `[ASSUMPTION]` tags appear in the §9 index. The §9 index entry for "§6.1 — Primary airgapped environments are Windows/Linux" doesn't have a corresponding inline tag in §6.1, but the content is covered by the MVP scope statement. Minor gap.
- **UJ protagonist naming:** N/A — JTBD format is appropriate for this product shape; no UJs to check.
- **Required sections:** All expected sections present for medium-stakes internal tool. No addendum.md required or referenced.
