---
title: "Product Brief: Terra Mortis TM Suite"
status: "complete"
created: "2026-03-29"
updated: "2026-03-29"
inputs: [CLAUDE.md, integration_plan.md, index.html, tm_editor.html, schema_v2_proposal.md, user interview]
---

# Product Brief: Terra Mortis TM Suite

## Executive Summary

Terra Mortis is a 30+ player Vampire: The Requiem 2nd Edition LARP that runs on a patchwork of Excel spreadsheets, vibe-coded HTML apps, and manual administration. The Storyteller (ST) manages character data, dice rolling, territory bids, feeding rolls, and downtime actions largely by hand — a workload that scales poorly as the game grows.

The TM Suite is a browser-based platform that consolidates all ST administration and player-facing tools into a single, properly architected application. It replaces the current pair of monolithic single-file HTML apps with a structured, maintainable codebase backed by a single JSON data source. It encodes years of domain-specific data — 203+ merits with prerequisites, 42 devotions, clan banes, bloodline disciplines, and house rules — that no generic RPG tool provides. The immediate goal is to let the ST run the game from an iPad with minimal friction. The longer-term vision is a player portal where each participant can access their character, submit downtime actions, and interact with campaign documentation — with Discord-based authentication gating access.

This is not a greenfield build. Two working applications already exist (~6,000 lines of functional code). The work ahead is taking vibe-coded output and rebuilding it with proper architecture — a deliberate step up in how the project is developed, not just what it produces.

## The Problem

Running a 30+ player LARP generates significant administrative overhead:

- **Character management is fragmented.** Data originated in Excel (one sheet per character with Power Query for PDF generation), was migrated to JSON, and now exists in two slightly different schemas across two separate apps. Edits in one place don't reliably propagate to the other.

- **Live game tooling is clunky.** The ST needs to quickly look up a character, tap an action, and roll dice — contested rolls, feeding rolls, resistance checks. The current ST Suite (index.html) handles much of this and is already mobile/tablet-friendly, but everything lives in one enormous HTML file that's difficult to modify or extend.

- **Player access doesn't exist.** Players have no self-service access to their character sheets, campaign documentation, or downtime submission. Everything flows through the ST manually.

- **The codebase blocks collaboration.** With all CSS, JS, and HTML in single files, two contributors can't work on different features without merge conflicts. There's no separation of concerns, no shared components, no test infrastructure.

- **The visual identity is duplicated.** The same dark gothic theme (colours, fonts, spacing) is copy-pasted across the suite apps and the campaign website, with no single source of truth.

## The Solution

A properly structured, static web application that:

1. **Unifies character data** around a single v2 JSON schema — one file, one truth, used by every view and tool.

2. **Separates concerns** into maintainable modules — shared theme CSS, data layer, UI components, and feature-specific logic (rolling, sheets, editing, territory, tracking) as distinct files.

3. **Runs from an iPad** as the ST's primary game-day tool. The ST Suite is already built mobile/tablet-first; the Editor needs responsive adaptation. Tap a character, tap an action, get results. Automate feeding rolls, territory bids, and contested rolls with pre-loaded dice pools.

4. **Provides a player portal** (future phase) with Discord-based authentication, where players access their own character sheet, campaign documentation, character creation tools, and downtime submission — without exposing other players' data.

5. **Deploys as a static site** via GitHub Pages — no backend server, no database, no accounts to manage, no privacy liability for player data in the ST-only phase. This is a genuine operational advantage for a volunteer-run LARP, not just a cost-saving measure.

6. **Shares a design system** with the Terra Mortis campaign website (terramortislarp-website.netlify.app), ensuring visual consistency through a single shared CSS theme file.

## Who This Serves

**Primary: The Storyteller (Angelus)**
Runs a 30+ player LARP and needs fast, reliable tools at game. Success means spending less time on admin and more time on storytelling. Currently the sole maintainer of the codebase, learning architecture and development practices with collaborator Peter. Every architectural pattern chosen should be teachable — this project is as much a learning environment as it is a product.

**Secondary: Players**
30+ active participants who need access to their character data, campaign information, and downtime systems. Currently have no self-service tooling. Once the portal exists, players checking their own sheets creates a natural data-quality feedback loop — they spot errors the ST might miss.

**Tertiary: Peter (Collaborator)**
Experienced developer contributing to the project and mentoring Angelus. Needs a codebase structure that supports collaborative development without stepping on each other's work. Currently investigating the downtime processing system.

**Future: Other Storytellers**
The suite is built for Terra Mortis, but the architecture should allow other VtR 2e chronicles to fork and adapt it as a reference implementation. This is a secondary consideration — it serves Angelus first.

## What Makes This Different

This isn't a generic RPG tool or a VTT (virtual tabletop). It's purpose-built for one specific chronicle with one specific ruleset (VtR 2e), containing a bespoke data corpus that represents years of domain encoding: 203+ merits with prerequisites and descriptions, 42 devotions (31 general + 11 bloodline-exclusive), clan banes, bloodline disciplines, 26 masks and dirges, and house rules specific to Terra Mortis. That data library is the primary reason this exists rather than using a generic character sheet tool.

The approach is deliberately constrained: static site, no backend, single JSON. This keeps hosting simple (GitHub Pages), keeps the tech stack accessible to a learning developer, and avoids over-engineering. The constraint is a feature.

## Success Criteria

- **ST can run a full game session from iPad** using only the suite — character lookup, dice rolling, contested rolls, feeding, and territory all accessible within taps, without needing to fall back to spreadsheets or manual processes
- **Both contributors can work on features independently** without merge conflicts from monolithic files
- **Players can view their character sheet** via a player-facing portal (future phase)
- **One CSS theme file** powers the suite and is consistent with the campaign website
- **Single v2 JSON** is the sole data source for all character data across all views
- **Codebase is approachable** for a developer learning architecture — clear file structure, sensible naming, patterns that are teachable not just functional
- **Every existing feature still works** after the restructure — no regressions

## Scope

### In (first phase — restructure and integrate)
- Extract CSS, JS, and HTML into separate, well-organised files
- Shared design system / theme CSS consistent with the campaign website
- Merge Editor and ST Suite into a single application
- Unified v2 JSON data layer (resolving the current dual-schema situation)
- Responsive/tablet adaptation for the Editor views
- All existing features preserved: character list, sheet view, editing, dice rolling, resistance checks, territory tracking, session tracker

### Near-term (soft deadline: 8 April 2026)
- Downtime capture and processing system (Peter is currently investigating; Google Form exists as interim solution)

### Out (future phases)
- Discord-based player authentication and portal
- Player-facing character creation wizard
- Automated downtime resolution engine
- Session replay / chronicle logging
- Backend / database (stays static for now)
- Native mobile app (browser-based is sufficient)

## Vision

If this succeeds, Terra Mortis has a single, elegant web app that the ST runs games from and players log into between sessions. The restructured codebase becomes a foundation that can be extended without fear — new features (downtime processing, automated feeding rounds, player notifications) slot in as modules rather than being wedged into a 3,000-line file.

The architecture itself is a learning tool: a real project where Angelus builds genuine development skills alongside a collaborator, moving from vibe-coding to understanding why code is structured the way it is. And if it works well enough, other Storytellers running VtR 2e chronicles can fork it and make it their own.
