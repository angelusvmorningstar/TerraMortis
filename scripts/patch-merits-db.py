#!/usr/bin/env python3
"""
patch-merits-db.py
Apply all audit-derived corrections to MERITS_DB in merits-db-data.js.

Run once, then delete (or keep for reference).
"""
import re, json
from pathlib import Path

JS = Path(__file__).parent.parent / 'public/js/data/merits-db-data.js'

text = JS.read_text(encoding='utf-8')
m = re.search(r'(export const MERITS_DB\s*=\s*)(\{.+\});', text, re.DOTALL)
if not m:
    raise RuntimeError('MERITS_DB not found')

prefix = m.group(1)
db = json.loads(m.group(2))

# ─── 1. Remove ────────────────────────────────────────────────────
REMOVE = [
    'oath of the true knight',   # errata: removed from play
    'independent study',          # Ordo Dracul — not a playable covenant
]
for k in REMOVE:
    if k in db:
        del db[k]
        print(f'  Removed: {k}')

# ─── 2. Rating fixes ──────────────────────────────────────────────
RATING_FIXES = {
    'hobbyist clique': '2',        # CoD source and SSOT both say 2; DB had 1
}
for k, v in RATING_FIXES.items():
    if k in db:
        old = db[k].get('rating', '(none)')
        db[k]['rating'] = v
        print(f'  Rating: {k}  {old} -> {v}')

# ─── 3. Prereq fixes ─────────────────────────────────────────────
PREREQ_FIXES = {
    # Errata changed CotC requirement from Status 1 to Status 2
    'secret society junkie': 'Crone Status 2 or Invictus Status 2',
    # Mutual exclusion constraints missing from DB
    'atrocious':  'Cannot have Cutthroat or Enticing',
    'cutthroat':  'Cannot have Atrocious or Enticing',
    'enticing':   'Cannot have Atrocious or Cutthroat',
    # Social restriction missing from DB
    'anonymity':  'Cannot have Fame',
    # Wrong prereq in DB (Resolve 3); CoD source says Wits 3 or Composure 3
    'tolerance for biology': 'Wits 3 or Composure 3',
    # Missing prereqs
    'oath of serfdom':  'Composure 3, Resolve 3',
    'iron skin':        'Brawl 2, Stamina 3',
}
for k, v in PREREQ_FIXES.items():
    if k in db:
        old = db[k].get('prereq', '(none)')
        db[k]['prereq'] = v
        print(f'  Prereq: {k}  "{old}" -> "{v}"')

# ─── 4. Add missing merits ────────────────────────────────────────
ADD = {
    # Physical / General
    'fast reflexes': {
        'desc':   '+1 Initiative per dot.',
        'prereq': 'Wits 3 or Dexterity 3',
        'rating': '1-3',
        'type':   'Physical',
    },
    'unseen sense': {
        'desc':   'Sixth sense for a chosen supernatural creature type; once per chapter accept Spooked Condition to pinpoint location. Human characters only.',
        'prereq': 'Human character (not Kindred)',
        'rating': '2',
        'type':   'Mental',
    },
    # Social Style merits
    'etiquette': {
        'desc':   'Social Manoeuvring Style. ●: words always defensible — use Socialise instead of Resolve+Composure for starting Doors. ●●: 8-again and +2 when insulting verbally, impression drops one step. ●●●: apply one Status or Fame to contest Social interactions. ●●●●: on good impression, ignore subject\'s Resolve+Composure on first roll. ●●●●●: when all Doors open, choose which of three Conditions your character receives.',
        'prereq': 'Composure 3, Socialise 2',
        'rating': '1-5',
        'type':   'Style',
    },
    'fast-talking': {
        'desc':   'Social Manoeuvring Style. ●: mark suffers -1 to Resolve or Composure on contested Social rolls. ●●: apply any one Speciality to any Social roll. ●●●: reroll one failed Subterfuge roll per scene. ●●●●: spend Willpower to immediately open a second Door when opening one. ●●●●●: open a Door when target regains Willpower from Vice or Dirge while you are present.',
        'prereq': 'Manipulation 3, Subterfuge 2',
        'rating': '1-5',
        'type':   'Style',
    },
    # Fighting Style merits (from Hurt Locker / errata)
    'armed restraint': {
        'desc':   'Grapple with a catch pole or shepherd\'s crook at -3; on success immediately apply Hold. Opponent\'s subsequent grapple rolls are penalised by the weapon\'s damage rating.',
        'prereq': 'Staff Fighting 3',
        'rating': '2',
        'type':   'Style',
    },
    'boot party': {
        'desc':   'When attacking a prone opponent, make an additional unarmed attack at -3. Any damage inflicted is lethal.',
        'prereq': 'Brawl 2',
        'rating': '2',
        'type':   'Style',
    },
    'clinch strike': {
        'desc':   'Inflict standard Brawl damage when initiating a grapple instead of forgoing damage to grab.',
        'prereq': 'Brawl 2',
        'rating': '1',
        'type':   'Style',
    },
    'ground and pound': {
        'desc':   'When striking a prone opponent with Brawl, gain rote benefit (reroll failures). Automatically fall prone afterwards; if grappled, opponent breaks free automatically.',
        'prereq': 'Brawl 2',
        'rating': '2',
        'type':   'Style',
    },
    'ground fighter': {
        'desc':   'Attacks against your prone character do not gain the +2 bonus. ●Stand Up: perform the Stand Up manoeuvre while still grappling an opponent.',
        'prereq': 'Wits 3, Dexterity 3, Brawl 2',
        'rating': '2',
        'type':   'Style',
    },
    'headbutt': {
        'desc':   'New grapple manoeuvre: Headbutt inflicts the Stunned Tilt without requiring a called shot to the head. Declare before rolling.',
        'prereq': 'Brawl 2',
        'rating': '1',
        'type':   'Style',
    },
    'phalanx fighter': {
        'desc':   'Transfer a Brawl-based fighting manoeuvre (up to ●●●) to a Weaponry-based Style, or vice versa. Must know the manoeuvre in its original form; repurchase at the same cost.',
        'prereq': 'Intelligence 2, Wits 3',
        'rating': '1',
        'type':   'Style',
    },
    'retain weapon': {
        'desc':   'When an opponent attempts to disarm you or use Control Weapon, reduce their successes by your Brawl dots.',
        'prereq': 'Wits 2, Brawl 2',
        'rating': '2',
        'type':   'Style',
    },
    'trunk squeeze': {
        'desc':   'Bear hug grapple manoeuvre: inflicts 1 bashing damage and a cumulative -1 penalty to the opponent\'s grapple rolls each round it is maintained. Does not work against targets that do not breathe or with Size 2+ greater than attacker.',
        'prereq': 'Brawl 2',
        'rating': '2',
        'type':   'Style',
    },
}

for k, v in ADD.items():
    if k in db:
        print(f'  Skip (exists): {k}')
    else:
        db[k] = v
        print(f'  Added: {k}')

# ─── Write back ───────────────────────────────────────────────────
new_text = text[:m.start()] + prefix + json.dumps(db, ensure_ascii=False, separators=(',', ':')) + ';' + text[m.end():]
JS.write_text(new_text, encoding='utf-8')
print(f'\nDone. {len(db)} entries in MERITS_DB.')
