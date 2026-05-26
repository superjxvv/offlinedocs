---
baseline_commit: 7987a16b823fb4dc32d470c7e12db91dd59a0f68
---

# Story 1.1: Monorepo Scaffold & Build Pipeline

Status: done

## Story

As a developer,
I want a properly configured pnpm monorepo with TypeScript, build tools, and test infrastructure,
So that I have a working foundation to build OfflineDocs components.

## Acceptance Criteria

1. **Given** a fresh clone of the repository, **When** I run `pnpm install`, **Then** all dependencies install without errors **And** the workspace contains three packages: @offlinedocs/shared, @offlinedocs/fetcher, @offlinedocs/server.

2. **Given** the monorepo is installed, **When** I run `pnpm build`, **Then** tsup compiles all three packages with shared building first **And** each package produces output in its dist/ directory.

3. **Given** the monorepo is installed, **When** I run `pnpm test`, **Then** vitest runs across all packages via vitest.workspace.ts with zero errors.

4. **Given** the root package.json, **When** I inspect the engines field, **Then** it requires Node.js >=22 **And** .node-version specifies Node.js 24.

5. **Given** each package's tsconfig.json, **When** I inspect it, **Then** it extends tsconfig.base.json with strict: true, module: NodeNext, moduleResolution: NodeNext.

6. **Given** pnpm-workspace.yaml, **When** I read it, **Then** it declares `packages: ['packages/*']`.

7. **Given** .npmrc, **When** I read it, **Then** it sets shamefully-hoist=false.

8. **Given** each package's package.json, **When** I inspect it, **Then** it has `"type": "module"` and an `exports` field mapping `.` to dist output.

## Tasks / Subtasks

- [x] Task 1: Create root configuration files (AC: #4, #6, #7)
  - [x] 1.1: Create `package.json` with workspace scripts, `engines: { "node": ">=22" }`, `"type": "module"`
  - [x] 1.2: Create `pnpm-workspace.yaml` with `packages: ['packages/*']`
  - [x] 1.3: Create `.npmrc` with `shamefully-hoist=false`
  - [x] 1.4: Create `.node-version` with `24`
  - [x] 1.5: Create `.gitignore` (dist/, node_modules/, *.tgz, .env)
  - [x] 1.6: Create `tsconfig.base.json` (strict, NodeNext, paths mapping)
  - [x] 1.7: Create `vitest.workspace.ts` referencing `packages/*/vitest.config.ts`

- [x] Task 2: Create @offlinedocs/shared package skeleton (AC: #1, #5, #8)
  - [x] 2.1: Create `packages/shared/package.json` (private:true, type:module, exports, workspace deps)
  - [x] 2.2: Create `packages/shared/tsconfig.json` extending base
  - [x] 2.3: Create `packages/shared/tsup.config.ts` (ESM + CJS dual output)
  - [x] 2.4: Create `packages/shared/vitest.config.ts`
  - [x] 2.5: Create `packages/shared/src/index.ts` placeholder barrel export

- [x] Task 3: Create @offlinedocs/fetcher package skeleton (AC: #1, #5, #8)
  - [x] 3.1: Create `packages/fetcher/package.json` (type:module, exports, bin, dep on @offlinedocs/shared workspace:^)
  - [x] 3.2: Create `packages/fetcher/tsconfig.json` extending base
  - [x] 3.3: Create `packages/fetcher/tsup.config.ts` (entry: [cli.ts, index.ts])
  - [x] 3.4: Create `packages/fetcher/vitest.config.ts`
  - [x] 3.5: Create `packages/fetcher/src/index.ts` placeholder barrel export
  - [x] 3.6: Create `packages/fetcher/src/cli.ts` placeholder Commander.js entrypoint

- [x] Task 4: Create @offlinedocs/server package skeleton (AC: #1, #5, #8)
  - [x] 4.1: Create `packages/server/package.json` (type:module, exports, bin, dep on @offlinedocs/shared workspace:^)
  - [x] 4.2: Create `packages/server/tsconfig.json` extending base
  - [x] 4.3: Create `packages/server/tsup.config.ts` (single bundled output)
  - [x] 4.4: Create `packages/server/vitest.config.ts`
  - [x] 4.5: Create `packages/server/src/index.ts` placeholder entrypoint

- [x] Task 5: Install dependencies and verify build pipeline (AC: #1, #2)
  - [x] 5.1: Run `pnpm install` — verify clean install
  - [x] 5.2: Run `pnpm build` — verify shared builds first, then fetcher+server, all produce dist/
  - [x] 5.3: Root build script: `"build": "pnpm --filter @offlinedocs/shared build && pnpm --filter @offlinedocs/{fetcher,server} build"`

- [x] Task 6: Verify test infrastructure (AC: #3)
  - [x] 6.1: Add a trivial passing test in each package (e.g., `expect(true).toBe(true)`)
  - [x] 6.2: Run `pnpm test` — verify vitest runs across all packages with zero errors

## Dev Notes

### Architecture Compliance

This is the **first story** in the project — there is no existing code. All files are NEW.

**Critical patterns from architecture doc:**

- **ESM throughout**: All packages use `"type": "module"`, TypeScript `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`
- **Package-name imports**: Cross-package imports use `@offlinedocs/*`, never relative paths. `tsconfig.base.json` defines `paths: { "@offlinedocs/*": ["./packages/*/src"] }`
- **Barrel exports**: Each package exposes public API via `src/index.ts` only
- **Build order**: shared first, then fetcher + server in parallel. Root script: `"build": "pnpm --filter @offlinedocs/shared build && pnpm --filter @offlinedocs/{fetcher,server} build"`
- **Test co-location**: Unit tests as `*.test.ts` next to source files. Integration tests in `__tests__/integration/`. No `*.spec.ts`.
- **Workspace deps**: Always `"@offlinedocs/shared": "workspace:^"` — never `*` or file paths

### Technical Requirements

**Root tsconfig.base.json** (exact config from architecture):
```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "paths": {
      "@offlinedocs/*": ["./packages/*/src"]
    }
  }
}
```

**Package exports pattern** (each package):
```jsonc
{
  "exports": {
    ".": { "import": "./dist/index.js" }
  }
}
```
Shared gets dual output: `{ ".": { "import": "./dist/index.js", "require": "./dist/index.cjs" } }`

**tsup configuration**:
- Shared: `format: ['esm', 'cjs']`, entry `['src/index.ts']`
- Fetcher: `format: ['esm']`, entry `['src/cli.ts', 'src/index.ts']`
- Server: `format: ['esm']`, entry `['src/index.ts']`, bundle mode

**Dependencies to install**:
- Root devDeps: `typescript`, `tsup`, `vitest`, `@vitest/coverage-v8`, `tsx`
- Shared: `zod` (peer or direct dep)
- Fetcher: `commander`, `@11ty/gray-matter`, `smol-toml`, `@offlinedocs/shared`
- Server: `@modelcontextprotocol/sdk`, `@11ty/gray-matter`, `@offlinedocs/shared`

**Node.js version**: Target 24, minimum 22. `.node-version` = `24`. `engines.node` = `">=22"`.

### Project Structure Notes

All paths match the architecture doc directory tree exactly. This scaffold creates the skeleton — subsequent stories will fill in real implementations.

Key directories to create (even if empty for now):
- `packages/shared/src/schemas/`
- `packages/fetcher/src/adapters/`
- `packages/fetcher/src/chunk-processor/`
- `packages/fetcher/src/bundle-writer/`
- `packages/fetcher/src/config/`
- `packages/server/src/search/`
- `packages/server/src/tools/`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Starter Template Evaluation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Module & Package Configuration Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure]
- [Source: _bmad-output/planning-artifacts/architecture.md#Development Workflow Integration]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1]

## Dev Agent Record

### Agent Model Used

Claude Opus 4

### Debug Log References

None — clean implementation with no issues.

### Completion Notes List

- All 8 acceptance criteria satisfied
- pnpm install succeeds cleanly (4 workspace projects)
- pnpm build succeeds: shared first, then fetcher+server in parallel
- pnpm test succeeds: 3 test files, 3 tests pass across all packages
- All packages use type:module, ESM, NodeNext module resolution
- Directory structure created for subsequent stories (schemas, adapters, etc.)
- esbuild build scripts approved via pnpm approve-builds

### Change Log

- 2026-05-26: Story 1.1 implemented — full monorepo scaffold with build and test pipeline

### File List

- package.json (NEW)
- pnpm-workspace.yaml (NEW)
- .npmrc (NEW)
- .node-version (NEW)
- .gitignore (MODIFIED — added *.tgz)
- tsconfig.base.json (NEW)
- vitest.workspace.ts (NEW)
- packages/shared/package.json (NEW)
- packages/shared/tsconfig.json (NEW)
- packages/shared/tsup.config.ts (NEW)
- packages/shared/vitest.config.ts (NEW)
- packages/shared/src/index.ts (NEW)
- packages/shared/src/index.test.ts (NEW)
- packages/fetcher/package.json (NEW)
- packages/fetcher/tsconfig.json (NEW)
- packages/fetcher/tsup.config.ts (NEW)
- packages/fetcher/vitest.config.ts (NEW)
- packages/fetcher/src/index.ts (NEW)
- packages/fetcher/src/index.test.ts (NEW)
- packages/fetcher/src/cli.ts (NEW)
- packages/server/package.json (NEW)
- packages/server/tsconfig.json (NEW)
- packages/server/tsup.config.ts (NEW)
- packages/server/vitest.config.ts (NEW)
- packages/server/src/index.ts (NEW)
- packages/server/src/index.test.ts (NEW)
- pnpm-lock.yaml (NEW)

## Code Review

**Date:** 2026-05-26
**Reviewer:** Claude Opus 4 (automated)

### Summary

- **Patches applied:** 0
- **Deferred:** 1
- **Dismissed:** 7

All 8 acceptance criteria pass. Build and tests succeed. No bugs, security issues, or spec violations found.

### Deferred Findings

- [ ] **vitest.workspace.ts deprecated** — vitest 3.x warns: "The workspace file is deprecated and will be removed in the next major. Please, use the `test.projects` field in the root config file instead." Not caused by this story (spec AC #3 explicitly requires `vitest.workspace.ts`). Should be addressed before upgrading to vitest 4.x.

### Dismissed Findings

- `globals: true` in vitest configs is redundant (tests use explicit imports) — not harmful
- `allowBuilds` in pnpm-workspace.yaml not in spec — required for pnpm 10+ to allow esbuild build scripts
- Extra tsconfig.base.json options beyond spec (`skipLibCheck`, `esModuleInterop`, etc.) — additive/beneficial
- `clean: true` only on first tsup array entry — correct pattern (clean once, then additive writes)
- Empty scaffold source files produce empty dist — expected for scaffold story
- `dts: true` on CLI entries generates unnecessary type declarations — not harmful
- Build script uses `--filter x --filter y` instead of spec's brace expansion `--filter {x,y}` — functionally equivalent
