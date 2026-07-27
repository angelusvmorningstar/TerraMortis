/* Attributes & Skills tab — edit view rendering and handlers */

import state from '../data/state.js';
import { getAttrVal, getAttrBonus, setAttrVal, getSkillObj, setSkillObj } from '../data/accessors.js';
import { ATTR_MENTAL, ATTR_PHYSICAL, ATTR_SOCIAL, SKILLS_MENTAL, SKILLS_PHYSICAL, SKILLS_SOCIAL } from '../data/constants.js';
import { esc } from '../data/helpers.js';

let _markDirty;
export function registerCallbacks(markDirty) {
  _markDirty = markDirty;
}

/* ── Main tab renderer ── */
export function renderAttrsTab(c) {
  const el = document.getElementById('et-attrs');
  el.innerHTML = `
    <div class="form-section">
      <div class="form-section-title">Attributes</div>
      <div class="attr-grid">
        ${renderAttrGroup('Mental', ATTR_MENTAL, c)}
        ${renderAttrGroup('Physical', ATTR_PHYSICAL, c)}
        ${renderAttrGroup('Social', ATTR_SOCIAL, c)}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Skills</div>
      <div class="skill-grid">
        ${renderSkillGroup('Mental', SKILLS_MENTAL, c)}
        ${renderSkillGroup('Physical', SKILLS_PHYSICAL, c)}
        ${renderSkillGroup('Social', SKILLS_SOCIAL, c)}
      </div>
    </div>
  `;
}

/* ── Attribute rendering ── */
function renderAttrGroup(label, attrs, c) {
  const rows = attrs.map(a => {
    const base = getAttrVal(c, a);
    const bonus = getAttrBonus(c, a);
    return `<div class="attr-row">
      <span class="attr-name">${a}</span>
      <div class="dot-stepper" data-attr="${a}" data-base="${base}" data-bonus="${bonus}">
        ${renderAttrDots(base, bonus, 5, a)}
      </div>
    </div>`;
  }).join('');
  return `<div class="attr-group">
    <div class="attr-group-title">${label}</div>
    ${rows}
  </div>`;
}

function renderAttrDots(base, bonus, max, attr) {
  let html = '';
  const total = base + bonus;
  for (let i = 1; i <= max; i++) {
    if (i <= base) {
      html += `<span class="dot filled" onclick="clickAttrDot('${attr}',${i})">●</span>`;
    } else if (i <= total) {
      html += `<span class="dot bonus" onclick="clickAttrDot('${attr}',${i})">●</span>`;
    } else {
      html += `<span class="dot empty" onclick="clickAttrDot('${attr}',${i})">○</span>`;
    }
  }
  // STM-14 (#1034): the +○/−○ bonus controls are retired — a direct
  // unaudited write to c.attributes[X].bonus. Ad-hoc bonuses now go
  // through the audited st_mods apply affordance on the rendered
  // (non-edit) sheet (editor/st-mod-popover.js applyAffordance). The
  // dot run above still visually reflects any persisted bonus via the
  // 'bonus' dot class.
  return html;
}

/* ── Attribute handlers ── */
export function clickAttrDot(attr, clicked) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const curBase = getAttrVal(c, attr);
  const bonus = getAttrBonus(c, attr);
  // Attributes minimum 1 for vampires
  const newBase = clicked === curBase ? Math.max(1, clicked - 1) : clicked;
  setAttrVal(c, attr, newBase, bonus);
  _markDirty();
  renderAttrsTab(c);
}

/* ── Skill rendering ── */
function renderSkillGroup(label, skills, c) {
  const rows = skills.map(s => {
    const sk = getSkillObj(c, s);
    return renderSkillRow(s, sk, c);
  }).join('');
  return `<div class="skill-group">
    <div class="skill-group-title">${label}</div>
    ${rows}
  </div>`;
}

function renderSkillRow(skill, sk, c) {
  const dots = renderSkillDots(sk.dots, sk.bonus || 0, 5, skill);
  const nineClass = sk.nine_again ? 'on' : '';
  const specVal = esc((sk.specs || []).join(', '));
  const showSpec = sk.dots > 0 || (sk.specs && sk.specs.length);
  return `<div class="skill-row">
    <div class="skill-top">
      <span class="skill-name">${skill}</span>
      <div class="skill-flags">
        <span class="skill-flag ${nineClass}" onclick="toggleNineAgain('${skill}')" title="9-Again">9A</span>
      </div>
      <div class="dot-stepper">
        ${dots}
      </div>
    </div>
    ${showSpec ? `<div class="skill-spec">
      <input class="skill-spec-input" placeholder="Specialisation" value="${specVal}" onchange="updSkillSpec('${skill}',this.value)">
    </div>` : ''}
  </div>`;
}

function renderSkillDots(base, bonus, max, skill) {
  let html = '';
  const total = base + (bonus || 0);
  for (let i = 1; i <= Math.max(max, total); i++) {
    if (i <= base) {
      html += `<span class="dot filled" onclick="clickSkillDot('${skill}',${i})">●</span>`;
    } else if (i <= total) {
      html += `<span class="dot bonus" onclick="clickSkillDot('${skill}',${i})">●</span>`;
    } else if (i <= max) {
      html += `<span class="dot empty" onclick="clickSkillDot('${skill}',${i})">○</span>`;
    }
  }
  return html;
}

/* ── Skill handlers ── */
export function clickSkillDot(skill, clicked) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const sk = getSkillObj(c, skill);
  // Skills can go to 0
  const newDots = clicked === sk.dots ? Math.max(0, clicked - 1) : clicked;
  sk.dots = newDots;
  setSkillObj(c, skill, sk);
  _markDirty();
  renderAttrsTab(c);
}

export function toggleNineAgain(skill) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const sk = getSkillObj(c, skill);
  sk.nine_again = !sk.nine_again;
  setSkillObj(c, skill, sk);
  _markDirty();
  renderAttrsTab(c);
}

// STM-14 (#1034): adjSkillBonus retired — it wrote c.skills[X].bonus
// directly, unaudited. Ad-hoc bonuses now go through the audited
// st_mods apply affordance on the rendered (non-edit) sheet
// (editor/st-mod-popover.js applyAffordance).

export function updSkillSpec(skill, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const sk = getSkillObj(c, skill);
  sk.specs = val ? val.split(/,\s*/).filter(Boolean) : [];
  setSkillObj(c, skill, sk);
  _markDirty();
}
