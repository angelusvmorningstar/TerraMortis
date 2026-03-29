---
status: approved
version: "1.0"
date: "2026-03-29"
author: Winston (Architect)
projectContext: brownfield
---

# TM Suite -- Brownfield Enhancement Architecture

## Introduction

This document is the guiding architectural blueprint for the TM Suite brownfield restructure. It supplements existing project knowledge (captured in `CLAUDE.md`, `HANDOVER_v4.md`, and `integration_plan.md`) with formal architectural decisions and module boundaries that enable AI-agent-driven development and parallel contribution.

**Relationship to existing system:** The existing monolithic apps are the reference implementation. This architecture describes how to decompose them into a maintainable module structure without regression. Every new file/module has a direct ancestor in the current codebase.

## Sharded Document Index

| Document | Purpose |
|---|---|
| [Tech Stack](architecture/tech-stack.md) | Technology choices, rationale, constraints |
| [Data Models](architecture/data-models.md) | v2 schema, localStorage layout, accessor layer |
| [Unified Project Structure](architecture/unified-project-structure.md) | Target file tree, module boundaries, naming conventions |
| [Coding Standards](architecture/coding-standards.md) | Style rules, patterns, British English, accessibility |
| [Testing Strategy](architecture/testing-strategy.md) | Manual testing, test characters, edge cases |

## Existing Project Analysis

### Current State

| Field | Value |
|---|---|
| Primary purpose | LARP administration platform (character management, dice rolling, territory tracking) for 30+ player VtR 2e campaign |
| Current tech stack | Vanilla HTML5/CSS3/JS, inline, no framework, no build step |
| Architecture style | Two monolithic single-file SPAs sharing design language but not code or schema |
| Deployment | GitHub Pages, `public/` directory, GitHub Actions on push to `main` |
| Data persistence | localStorage (`tm_chars_db` for v2, `tm_tracker_<name>` per tracker) |

### Available Documentation

- `CLAUDE.md` -- project conventions, architecture notes, XP cost rates, known data issues
- `HANDOVER_v4.md` -- current file inventory, full v2 schema detail, editor architecture, MCI/UP systems
- `integration_plan.md` -- accessor function API, ~25 refactor points, phase plan (1a/1b/1c/1d)
- `data/chars_v2.schema.json` -- formal JSON Schema Draft 2020-12 for v2 character data
- `specs/prd.md` + `specs/prd/epic-*.md` -- product requirements and epic scope

### Identified Constraints

- No build step: edit file, refresh browser. No webpack, bundler, or transpilation.
- No backend: static site only. GitHub Pages serves files, nothing else.
- No framework: vanilla JS throughout. ES modules (`<script type="module">`) are acceptable.
- Single data source: one `chars_v2.json` file is the sole source of truth.
- Inline CSS/JS in HTML is the starting point; the target is separate files.
- Active production use: restructure must be incremental, each sub-phase deployable.

## Enhancement Scope and Integration Strategy

**Enhancement Type:** Brownfield restructure -- decomposition of existing monoliths into modular SPA

**Scope:** Epic 1 (MVP) -- file separation, shared theme, v2 data unification, single SPA merge

**Integration Impact:** High internal (refactoring ~6,000 lines); zero external (same features, same data, same URL)

### Integration Approach

**Code integration:** Extract-and-isolate pattern. JS logic is cut from inline `<script>` blocks into module files. HTML retains only structure and import tags. Each module has one clear responsibility.

**Data integration:** The Suite's ~25 direct data access points are replaced with calls to `js/data/accessors.js`. The old-format JSON (`tm_characters.json`) is retired once the Suite reads v2 natively.

**UI integration:** The two apps merge into a single SPA. A shared top-level nav switches between Editor mode (desktop, between-games) and Suite mode (tablet/mobile, live-game). CSS is unified under a single `css/theme.css` token file.

### Compatibility Requirements

- **Existing localStorage:** Key `tm_chars_db` (v2 JSON array) and `tm_tracker_<name>` are preserved unchanged.
- **v2 schema:** `data/chars_v2.schema.json` is the contract. No schema changes in Epic 1.
- **UI/UX consistency:** Output rendered by modular code must be visually identical to the monolith output.
- **Performance:** No interaction may become slower. Tab switching and character lookup remain near-instant.

## Change Log

| Change | Date | Version | Description | Author |
|---|---|---|---|---|
| Initial draft | 2026-03-29 | 1.0 | Brownfield architecture from HANDOVER_v4 + integration_plan context | Winston |
