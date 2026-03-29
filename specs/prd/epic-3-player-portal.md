# Epic 3: Player Portal

**Status:** Backlog
**Priority:** Vision
**Phase:** 3 (Player-Facing)

## Goal

Remove the ST as the bottleneck for player information access. Players can view their own character, submit downtime actions and feeding choices, and track their territory holdings -- without needing to contact the ST.

## Prerequisites

Epic 1 and Epic 2 complete. Stable v2 schema. GitHub-hosted data as single source of truth.

## Functional Requirements

### FR-3-01: Discord Authentication

- FR-3-01a: Player can log in to the portal using their Discord account (OAuth2)
- FR-3-01b: System maps Discord user ID to character record(s) in the data
- FR-3-01c: Player can only access their own character data; other characters are not visible
- FR-3-01d: ST accounts can access all character data
- FR-3-01e: Sessions persist across browser refreshes (token storage with secure handling)
- FR-3-01f: Player can log out

### FR-3-02: Player Character Sheet (read-only)

- FR-3-02a: Player can view their character sheet: attributes, skills, disciplines, merits, powers, touchstones, banes, aspirations
- FR-3-02b: Player can view their derived stats (size, speed, defence, health, willpower max, vitae max)
- FR-3-02c: Player can view their XP total, XP spent, and XP remaining
- FR-3-02d: Player cannot edit any character data
- FR-3-02e: Sheet is mobile-friendly (primary access device is a smartphone)

### FR-3-03: Territory Visibility

- FR-3-03a: Player can view their own domain and territory holdings
- FR-3-03b: Player can view their influence generation from merits and territory assets
- FR-3-03c: Player cannot see other characters' holdings unless explicitly shared (domain partners)

### FR-3-04: Downtime Submission

- FR-3-04a: Player can submit their feeding approach for the upcoming game (choice from available options based on character build)
- FR-3-04b: Player can submit downtime actions (text + category, e.g., investigation, influence use, XP request)
- FR-3-04c: Player can view the status of their submitted downtime (pending / in progress / resolved)
- FR-3-04d: Submissions are timestamped and associated with the character
- FR-3-04e: Submission window opens and closes on ST-controlled dates
- FR-3-04f: Player receives confirmation after successful submission

### FR-3-05: Character Creation Wizard (optional, post-portal)

- FR-3-05a: New player can create a character using a guided wizard
- FR-3-05b: Wizard enforces VtR 2e creation rules (attribute/skill/merit point budgets, clan discipline prerequisites)
- FR-3-05c: Completed character is submitted to ST for review before being added to the live data

## Non-Functional Requirements (portal-specific)

- Portal must use HTTPS (GitHub Pages provides this automatically)
- Discord OAuth2 client secret must never be in the repository or client-side code; requires a minimal server-side component or GitHub Action
- Player data access must be strictly scoped -- no player can access another player's character data, even via direct API calls
- Mobile-first: all portal views must render correctly on a 375px-wide screen

## Acceptance Criteria

1. Player logs in with Discord and sees only their own character
2. Player submits feeding choice and downtime actions; ST sees submission in processing dashboard (Epic 2)
3. Player views their territory holdings without ST involvement
4. Authentication is secure -- no credentials or tokens in the repository
5. All portal views render correctly on iPhone SE (375px width)

## Technical Notes

- Discord OAuth2 requires a redirect URI and a server-side token exchange (client secret cannot be in browser JS). Options: minimal Cloudflare Worker, GitHub Actions-based token broker, or Netlify Function. This is the one place the "no backend" constraint is relaxed -- it is a single endpoint, not a full server.
- The player portal is explicitly out of scope for MVP. Do not let Phase 3 features influence Phase 1 architecture decisions unless they naturally align.
- "Forkable for other VtR 2e chronicles" is a vision-level aspiration: the data model and architecture should not be so Terra Mortis-specific that it could not be adapted, but active generalisation work is post-Phase 3.
