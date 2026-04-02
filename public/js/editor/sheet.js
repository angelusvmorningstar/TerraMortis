/**
 * Sheet rendering module — all read-only and edit-mode sheet HTML generation.
 * Extracted from tm_editor.html lines 315–1310.
 */
import state from '../data/state.js';
import { CLAN_DISCS, BLOODLINE_DISCS, CORE_DISCS, RITUAL_DISCS, SORCERY_THEMES, CLAN_ATTR_OPTIONS, ATTR_CATS, PRI_LABELS, PRI_BUDGETS, SKILL_PRI_BUDGETS, SKILLS_MENTAL, SKILLS_PHYSICAL, SKILLS_SOCIAL, SKILL_CATS, CLANS, COVENANTS, MASKS_DIRGES, COURT_TITLES, REGENT_TERRITORIES, BLOODLINE_CLANS, BANE_LIST, INFLUENCE_MERIT_TYPES, INFLUENCE_SPHERES, DOMAIN_MERIT_TYPES, ALL_SKILLS, CITY_SVG, OTHER_SVG, BP_SVG, HUM_SVG, HEALTH_SVG, WP_SVG, STAT_SVG } from '../data/constants.js';
import { ICONS } from '../data/icons.js';
import { CLAN_ICON_KEY, COV_ICON_KEY, shDots, shDotsWithBonus, esc, formatSpecs, hasAoE, displayName } from '../data/helpers.js';
import { getAttrVal, getAttrBonus, getSkillObj, calcCityStatus, titleStatusBonus } from '../data/accessors.js';
import { calcHealth, calcWillpowerMax, calcSize, calcSpeed, calcDefence } from '../data/derived.js';
import { xpToDots, xpEarned, xpSpent, xpLeft, xpStarting, xpHumanityDrop, xpOrdeals, xpGame, xpSpentAttrs, xpSpentSkills, xpSpentMerits, xpSpentPowers, xpSpentSpecs, xpSpentSpecial, meritBdRow } from './xp.js';
import { meritBase, meritDotCount, meritLookup, buildMeritOptions, ensureMeritSync, meetsDevPrereqs, devPrereqStr } from './merits.js';
import { applyDerivedMerits } from './mci.js';
import { domMeritTotal, domMeritContrib, domMeritShareable, calcTotalInfluence, calcContactsInfluence, calcMeritInfluence } from './domain.js';
import { DEVOTIONS_DB } from '../data/devotions-db.js';
import { MERITS_DB } from '../data/merits-db-data.js';
import { MAN_DB } from '../data/man-db-data.js';

function _cityStatusDots(base,titleBonus) {
  if(!base&&!titleBonus) return '';
  return '<div class="sh-city-dots">'+'<span class="sh-city-dot crim">\u25CF</span>'.repeat(base)+'<span class="sh-city-dot gold">\u25CF</span>'.repeat(titleBonus)+'</div>';
}
function _cityStatusPip(editMode,base,total,titleBonus) {
  if(editMode) return '<div class="sh-stat-pip sh-stat-pip-edit"><button class="sh-stat-adj" onclick="shStatusDown(\'city\')">&#x25BC;</button><div class="sh-status-shape">'+CITY_SVG+'<span class="sh-status-n">'+total+'</span></div><button class="sh-stat-adj" onclick="shStatusUp(\'city\')">&#x25B2;</button><div class="sh-status-lbl">City</div></div>';
  return '<div class="sh-stat-pip"><div class="sh-status-shape">'+CITY_SVG+'<span class="sh-status-n">'+total+'</span></div><div class="sh-status-lbl">City</div></div>';
}

function _statusPip(editMode,svg,val,lbl,key) {
  if(editMode) return '<div class="sh-stat-pip sh-stat-pip-edit"><button class="sh-stat-adj" onclick="shStatusDown(\''+key+'\')">&#x25BC;</button><div class="sh-status-shape">'+svg+'<span class="sh-status-n">'+val+'</span></div><button class="sh-stat-adj" onclick="shStatusUp(\''+key+'\')">&#x25B2;</button><div class="sh-status-lbl">'+lbl+'</div></div>';
  return '<div class="sh-stat-pip"><div class="sh-status-shape">'+svg+'<span class="sh-status-n">'+val+'</span></div><div class="sh-status-lbl">'+lbl+'</div></div>';
}

export function toggleExp(id) {
  const row=document.getElementById('exp-row-'+id), body=document.getElementById('exp-body-'+id);
  if(!row||!body) return;
  if(state.openExpId&&state.openExpId!==id){
    const pr=document.getElementById('exp-row-'+state.openExpId), pb=document.getElementById('exp-body-'+state.openExpId);
    if(pr) pr.classList.remove('open'); if(pb) pb.classList.remove('visible');
  }
  const isOpen=body.classList.contains('visible');
  row.classList.toggle('open',!isOpen); body.classList.toggle('visible',!isOpen);
  state.openExpId=isOpen?null:id;
}
export function toggleDisc(id) {
  const row=document.getElementById('disc-row-'+id), drawer=document.getElementById('disc-drawer-'+id);
  if(!row||!drawer) return;
  const isOpen=drawer.classList.contains('visible');
  row.classList.toggle('open',!isOpen); drawer.classList.toggle('visible',!isOpen);
}
export function expRow(id,lbl,val,bodyHtml) {
  return '<div class="exp-row" id="exp-row-'+id+'" onclick="toggleExp(\''+id+'\')"><span class="exp-lbl labeled">'+lbl+'</span><span class="exp-val">'+(val||'')+'</span><span class="exp-arr">\u203A</span></div><div class="exp-body" id="exp-body-'+id+'">'+bodyHtml+'</div>';
}

export function shRenderStatsStrip(c) {
  const {editMode}=state;
  const s=(i,v,l)=>'<div class="sh-stat-cell"><div class="sh-stat-icon">'+i+'<span class="sh-stat-n">'+v+'</span></div><div class="sh-stat-lbl">'+l+'</div></div>';
  const sEdit=(i,v,l,fnDown,fnUp)=>'<div class="sh-stat-cell sh-stat-editable"><div class="sh-stat-icon">'+i+'<span class="sh-stat-n">'+v+'</span></div><div class="sh-stat-edit-row"><button class="sh-stat-adj" onclick="'+fnDown+'">&#x25BC;</button><div class="sh-stat-lbl">'+l+'</div><button class="sh-stat-adj" onclick="'+fnUp+'">&#x25B2;</button></div></div>';
  const bp=c.blood_potency||0,hm=c.humanity||0;
  const bpCell=editMode?sEdit(BP_SVG,bp,'BP','shEditBP('+(bp-1)+')','shEditBP('+(bp+1)+')'):s(BP_SVG,bp||1,'BP');
  const humCell=editMode?sEdit(HUM_SVG,hm,'Humanity','shEditHumanity('+(hm-1)+')','shEditHumanity('+(hm+1)+')'):s(HUM_SVG,hm,'Humanity');
  return '<div class="sh-stats-strip">'+bpCell+humCell+s(HEALTH_SVG,calcHealth(c),'Health')+s(WP_SVG,calcWillpowerMax(c),'Willpower')+s(STAT_SVG,calcSize(c),'Size')+s(STAT_SVG,calcSpeed(c),'Speed')+s(STAT_SVG,calcDefence(c),'Defence')+'</div>';
}

export function shRenderAttributes(c,editMode) {
  const ATTR_ROWS=[['Intelligence','Strength','Presence'],['Wits','Dexterity','Manipulation'],['Resolve','Stamina','Composure']];
  const catOrder=['Mental','Physical','Social'], BONUS_SOURCE={Strength:'Vigour',Stamina:'Resilience'};
  // Normalise clan_attribute from attr_creation.free if missing
  if(!c.clan_attribute&&c.attr_creation){const ca=Object.entries(c.attr_creation).find(([,cr])=>(cr.free||0)===2);if(ca)c.clan_attribute=ca[0];}
  let h='<div class="sh-sec"><div class="sh-sec-title">Attributes</div>';
  if(editMode){
    const caOpts=(CLAN_ATTR_OPTIONS[c.clan]||[]).map(a=>'<option'+(c.clan_attribute===a?' selected':'')+'>'+a+'</option>').join('');
    h+='<div class="sh-clan-attr-row">Favoured Attribute <select onchange="shSetClanAttr(this.value)">'+caOpts+'</select></div>';
    const pri=c.attribute_priorities||{};
    if(!pri.Mental&&!pri.Physical&&!pri.Social){pri.Mental='Primary';pri.Physical='Secondary';pri.Social='Tertiary';}
    h+='<div class="sh-attr-col-hdr">';
    catOrder.forEach(cat=>{const curPri=pri[cat]||'Tertiary',budget=PRI_BUDGETS[curPri]||3,usedCP=(ATTR_CATS[cat]||[]).reduce((s,a)=>s+(((c.attr_creation||{})[a]||{}).cp||0),0),rem=budget-usedCP;
      h+='<div class="sh-attr-pri"><select onchange="shSetPriority(\''+cat+'\',this.value)">'+PRI_LABELS.map(p=>'<option'+(curPri===p?' selected':'')+'>'+p+'</option>').join('')+'</select><span class="sh-cp-remaining'+(rem<0?' over':rem===0?' full':'')+'">'+rem+' CP</span></div>';});
    h+='</div>';
  }
  h+='<div class="sh-attr-grid">';
  if(editMode){
    const ATTR_COLS=[ATTR_CATS.Mental,ATTR_CATS.Physical,ATTR_CATS.Social];
    ATTR_COLS.forEach(col=>{h+='<div>';col.forEach(a=>{
      const base=getAttrVal(c,a),bonus=getAttrBonus(c,a),isClan=c.clan_attribute===a;
      h+='<div><div class="attr-cell attr-cell-edit"><div class="attr-name-sh">'+a+(isClan?'<span class="attr-clan-star">\u2605</span>':'')+'</div><div class="attr-dots-sh">'+shDotsWithBonus(base,bonus)+'</div></div>';
      const cr=(c.attr_creation||{})[a]||{cp:0,free:0,xp:0},aE=a.replace(/'/g,"\\'"),baseDots=1+(isClan?1:0),ab=baseDots+(cr.cp||0),xd=xpToDots(cr.xp||0,ab,4),tot=ab+xd;
      h+='<div class="attr-bd-panel"><div class="attr-bd-row"><div class="bd-grp"><span class="bd-lbl">Base</span> <span class="attr-bd-ro">'+baseDots+'</span></div><div class="bd-grp"><span class="bd-lbl">CP</span> <input class="attr-bd-input" type="number" min="0" value="'+(cr.cp||0)+'" onchange="shEditAttrPt(\''+aE+'\',\'cp\',+this.value)"></div><div class="bd-grp"><span class="bd-lbl">XP</span> <input class="attr-bd-input" type="number" min="0" value="'+(cr.xp||0)+'" onchange="shEditAttrPt(\''+aE+'\',\'xp\',+this.value)"></div><div class="bd-eq"><span class="bd-val">'+tot+'</span></div></div>';
      if(bonus>0){const src=BONUS_SOURCE[a]||'';h+='<div class="attr-derived-row"><span class="bd-src">+'+bonus+'</span>'+(src?'<span class="bd-src-lbl">('+src+')</span>':'')+'<div class="bd-eff"><span class="bd-lbl">Eff</span> <span class="bd-val">'+(tot+bonus)+'</span></div></div>';}
      h+='</div></div>';
    });h+='</div>';});
  } else {
    ATTR_ROWS.forEach(row=>row.forEach(a=>{
      const base=getAttrVal(c,a),bonus=getAttrBonus(c,a);
      h+='<div class="attr-cell"><div class="attr-name-sh">'+a+'</div><div class="attr-dots-sh">'+shDotsWithBonus(base,bonus)+'</div></div>';
    }));
  }
  h+='</div></div>';
  return h;
}

export function shRenderSkills(c,editMode) {
  const SKILL_COLS=[SKILLS_MENTAL,SKILLS_PHYSICAL,SKILLS_SOCIAL],skillCatOrder=['Mental','Physical','Social'];
  let h='<div class="sh-sec"><div class="sh-sec-title">Skills</div>';
  if(editMode){
    const sPri=c.skill_priorities||{};
    if(!sPri.Mental&&!sPri.Physical&&!sPri.Social){sPri.Mental='Primary';sPri.Physical='Secondary';sPri.Social='Tertiary';}
    h+='<div class="sh-attr-col-hdr">';
    skillCatOrder.forEach(cat=>{const curPri=sPri[cat]||'Tertiary',budget=SKILL_PRI_BUDGETS[curPri]||4,usedCP=(SKILL_CATS[cat]||[]).reduce((s,sk)=>s+(((c.skill_creation||{})[sk]||{}).cp||0),0),rem=budget-usedCP;
      h+='<div class="sh-attr-pri"><select onchange="shSetSkillPriority(\''+cat+'\',this.value)">'+PRI_LABELS.map(p=>'<option'+(curPri===p?' selected':'')+'>'+p+'</option>').join('')+'</select><span class="sh-cp-remaining'+(rem<0?' over':rem===0?' full':'')+'">'+rem+' CP</span></div>';});
    h+='</div>';
    const totalSpecs=Object.values(c.skills||{}).reduce((s,sk)=>s+((sk&&sk.specs)?sk.specs.length:0),0);
    const ptM=(c.merits||[]).find(m=>m.name==='Professional Training'),ptB=(ptM&&ptM.rating>=3)?2:0,freeS=3+ptB;
    const scCls=totalSpecs>freeS?'sc-over':totalSpecs===freeS?'sc-full':'sc-val';
    const specXP=Math.max(0,totalSpecs-freeS);
    h+='<div class="sh-spec-counter">Specialisations <span class="'+scCls+'">'+totalSpecs+' / '+freeS+' free</span>'+(specXP?' <span style="font-size:8px;color:var(--crim)">('+specXP+' XP for extras)</span>':'')+(ptB?' <span style="font-size:8px;color:var(--txt3)">(incl. '+ptB+' from Prof. Training \u25CF\u25CF\u25CF)</span>':'')+'</div>';
  }
  h+='<div class="skills-3col">';
  if(editMode){
    for(let ri=0;ri<8;ri++){SKILL_COLS.forEach(col=>{
      const s=col[ri];
      const sk=getSkillObj(c,s),d=sk.dots,bn=sk.bonus,sp=(sk.specs||[]).join(', '),na=sk.nine_again,ptNa=c._pt_nine_again_skills&&c._pt_nine_again_skills.has(s),hasDots=d>0||bn>0,dotStr=hasDots?shDotsWithBonus(d,bn):'\u2013';
      h+='<div class="sk-edit-cell"><div class="sh-skill-row sk-edit'+(hasDots?' has-dots':'')+'"><div class="skill-name-wrap"><span class="sh-skill-name">'+s+'</span>'+(sp?'<span class="sh-skill-spec">'+formatSpecs(c,sk.specs)+'</span>':'')+'</div><div class="skill-dots-wrap"><span class="'+(hasDots?'sh-skill-dots':'sh-skill-zero')+'">'+dotStr+'</span>'+(na?'<span class="sh-skill-na">9-Again</span>':ptNa?'<span class="sh-skill-na pt-na">9-Again (PT)</span>':'')+'</div></div>';
      const cr=(c.skill_creation||{})[s]||{cp:0,free:0,xp:0},sE=s.replace(/'/g,"\\'"),sb=(cr.cp||0)+(cr.free||0),sxd=xpToDots(cr.xp||0,sb,2),st2=sb+sxd;
      h+='<div class="sk-bd-panel"><div class="sk-bd-row"><div class="bd-grp"><span class="bd-lbl">CP</span> <input class="attr-bd-input" type="number" min="0" value="'+(cr.cp||0)+'" onchange="shEditSkillPt(\''+sE+'\',\'cp\',+this.value)"></div><div class="bd-grp"><span class="bd-lbl">Fr</span> <input class="attr-bd-input" type="number" min="0" value="'+(cr.free||0)+'" onchange="shEditSkillPt(\''+sE+'\',\'free\',+this.value)"></div><div class="bd-grp"><span class="bd-lbl">XP</span> <input class="attr-bd-input" type="number" min="0" value="'+(cr.xp||0)+'" onchange="shEditSkillPt(\''+sE+'\',\'xp\',+this.value)"></div><div class="bd-eq"><span class="bd-val">'+st2+'</span></div></div>';
      const specs=sk.specs||[];
      h+='<div class="sk-spec-list">';
      specs.forEach((sp2,si)=>{h+='<div class="sk-spec-row"><input class="sk-spec-input" value="'+esc(sp2)+'" onchange="shEditSpec(\''+sE+'\','+si+',this.value)" placeholder="Specialisation">'+(hasAoE(c,sp2)?'<span style="color:rgba(140,200,140,.8);font-size:8px;font-family:var(--fh);white-space:nowrap">+2</span>':'')+'<button class="sk-spec-rm" onclick="shRemoveSpec(\''+sE+'\','+si+')" title="Remove">&times;</button></div>';});
      h+='<button class="sk-spec-add" onclick="shAddSpec(\''+sE+'\')">+ spec</button></div></div></div>';
    });}
  } else {
    for(let ri=0;ri<8;ri++){SKILL_COLS.forEach(col=>{
      const s=col[ri],sk=getSkillObj(c,s),d=sk.dots,bn=sk.bonus,sp=(sk.specs||[]).join(', '),na=sk.nine_again,ptNa=c._pt_nine_again_skills&&c._pt_nine_again_skills.has(s),hasDots=d>0||bn>0,dotStr=hasDots?shDotsWithBonus(d,bn):'\u2013';
      h+='<div class="sh-skill-row'+(hasDots?' has-dots':'')+'"><div class="skill-name-wrap"><span class="sh-skill-name">'+s+'</span>'+(sp?'<span class="sh-skill-spec">'+formatSpecs(c,sk.specs)+'</span>':'')+'</div><div class="skill-dots-wrap"><span class="'+(hasDots?'sh-skill-dots':'sh-skill-zero')+'">'+dotStr+'</span>'+(na?'<span class="sh-skill-na">9-Again</span>':ptNa?'<span class="sh-skill-na pt-na">9-Again (PT)</span>':'')+'</div></div>';
    });}
  }
  h+='</div></div>';
  return h;
}

export function shRenderDisciplines(c,editMode) {
  let h='';
  function renderDiscRow(d,r,nameStyle){
    const dp=(c.powers||[]).filter(p=>p.category==='discipline'&&p.discipline===d),hasPow=dp.length>0,id='disc-'+c.name.replace(/[^a-z]/gi,'')+d.replace(/[^a-z]/gi,'');
    let dr='';dp.forEach(p=>{dr+='<div class="disc-power"><div class="disc-power-name">'+esc(p.name)+'</div>'+(p.stats?'<div class="disc-power-stats">'+esc(p.stats)+'</div>':'')+'<div class="disc-power-effect">'+esc(p.effect||'')+'</div></div>';});
    const nTag=(nameStyle?'<span class="disc-tap-name" style="'+nameStyle+'">':'<span class="disc-tap-name">')+esc(d)+'</span>',dTag=r?'<span class="disc-tap-dots">'+shDots(r)+'</span>':'';
    if(!hasPow) return '<div class="disc-tap-row"><div class="disc-tap-left">'+nTag+dTag+'</div></div>';
    return '<div class="disc-tap-row" id="disc-row-'+id+'" onclick="toggleDisc(\''+id+'\')"><div class="disc-tap-left">'+nTag+dTag+'</div><span class="disc-tap-arr">\u203A</span></div><div class="disc-drawer" id="disc-drawer-'+id+'">'+dr+'</div>';
  }
  function renderDiscEditRow(d,r,isIC,style){
    const cr=(c.disc_creation||{})[d]||{cp:0,free:0,xp:0},dE=d.replace(/'/g,"\\'"),cm=isIC?3:4,db2=(cr.cp||0)+(cr.free||0),xd=xpToDots(cr.xp||0,db2,cm),dt=db2+xd,ns=style?'style="'+style+'"':'';
    let h2='<div class="disc-tap-row disc-edit"><div class="disc-tap-left"><span class="disc-tap-name" '+ns+'>'+esc(d)+'</span>'+(isIC?'<span class="disc-clan-tag">in-clan</span>':'');
    if(r>0) h2+='<span class="disc-tap-dots">'+shDots(r)+'</span>';
    h2+='</div></div><div class="disc-bd-panel"><div class="disc-bd-row"><div class="bd-grp"><span class="bd-lbl">CP</span> <input class="attr-bd-input" type="number" min="0" value="'+(cr.cp||0)+'" onchange="shEditDiscPt(\''+dE+'\',\'cp\',+this.value)"></div><div class="bd-grp"><span class="bd-lbl">Fr</span> <input class="attr-bd-input" type="number" min="0" value="'+(cr.free||0)+'" onchange="shEditDiscPt(\''+dE+'\',\'free\',+this.value)"></div><div class="bd-grp"><span class="bd-lbl">XP</span> <input class="attr-bd-input" type="number" min="0" value="'+(cr.xp||0)+'" onchange="shEditDiscPt(\''+dE+'\',\'xp\',+this.value)"></div><div class="bd-eq"><span class="bd-val">'+dt+'</span></div></div></div>';
    return h2;
  }
  if(editMode){
    const clanD=CLAN_DISCS[c.clan]||[],blD=BLOODLINE_DISCS[c.bloodline]||null,inCL=blD||clanD,dc=c.disc_creation||{};
    const iCP=Object.entries(dc).filter(([d])=>inCL.includes(d)).reduce((s,[,v])=>s+(v.cp||0),0),oCP=Object.entries(dc).filter(([d])=>!inCL.includes(d)).reduce((s,[,v])=>s+(v.cp||0),0),rem=3-iCP-oCP;
    h+='<div class="sh-sec"><div class="sh-sec-title">Disciplines</div><div class="disc-cp-counter"><span class="sh-cp-remaining'+(rem<0?' over':rem===0?' full':'')+'">'+rem+' CP</span><span style="color:'+(iCP>=2?'rgba(140,200,140,.8)':'rgba(200,80,80,.9)')+'">In-clan: '+iCP+' (min 2)</span><span>Out-of-clan: '+oCP+' (max 1)</span></div><div class="disc-list">';
    CORE_DISCS.forEach(d=>{h+=renderDiscEditRow(d,(c.disciplines||{})[d]||0,inCL.includes(d),null);});
    h+='</div></div>';
    const cn=(c.covenant||'').toLowerCase(),showCr=cn.includes('crone')||(c.disciplines||{}).Cruac>0,showTh=cn.includes('lancea')||(c.disciplines||{}).Theban>0;
    if(showCr||showTh){h+='<div class="sh-sec"><div class="sh-sec-title">Blood Sorcery</div><div class="disc-list">';if(showCr)h+=renderDiscEditRow('Cruac',(c.disciplines||{}).Cruac||0,false,'color:rgba(220,160,120,.9)');if(showTh)h+=renderDiscEditRow('Theban',(c.disciplines||{}).Theban||0,false,'color:rgba(220,160,120,.9)');h+='</div></div>';}
    const thD=Object.entries(c.disciplines||{}).filter(([d])=>SORCERY_THEMES.includes(d));
    if(thD.length){h+='<div class="sh-sec"><div class="sh-sec-title">Sorcery Themes</div><div class="disc-list">';thD.forEach(([d,r])=>{h+=renderDiscRow(d,r,'color:rgba(220,160,120,.75)');});h+='</div></div>';}
  } else if(c.disciplines&&Object.keys(c.disciplines).length){
    const de=Object.entries(c.disciplines),core=de.filter(([d])=>CORE_DISCS.includes(d)),rit=de.filter(([d])=>RITUAL_DISCS.includes(d)),thD=de.filter(([d])=>SORCERY_THEMES.includes(d));
    if(core.length){h+='<div class="sh-sec"><div class="sh-sec-title">Disciplines</div><div class="disc-list">';core.forEach(([d,r])=>{h+=renderDiscRow(d,r,null);});h+='</div></div>';}
    if(rit.length||thD.length){h+='<div class="sh-sec"><div class="sh-sec-title">Blood Sorcery</div><div class="disc-list">';rit.forEach(([d,r])=>{h+=renderDiscRow(d,r,'color:rgba(220,160,120,.9)');});if(thD.length){h+='<div class="disc-sub-head">Themes</div>';thD.forEach(([d,r])=>{h+=renderDiscRow(d,r,'color:rgba(220,160,120,.75)');});}h+='</div></div>';}
  }
  // Devotions
  const devP=(c.powers||[]).filter(p=>p.category==='devotion');
  if(editMode||devP.length){
    h+='<div class="sh-sec"><div class="sh-sec-title">Devotions</div><div class="disc-list">';
    devP.forEach((p,i)=>{const gid='dev'+c.name.replace(/[^a-z]/gi,'')+i,db=DEVOTIONS_DB.find(d=>d.n===p.name);
      if(editMode){h+='<div class="disc-tap-row disc-edit" id="disc-row-'+gid+'" onclick="toggleDisc(\''+gid+'\')"><div class="disc-tap-left"><span class="disc-tap-name" style="color:var(--txt2)">'+esc(p.name)+'</span>'+(db?'<span class="dev-xp-tag">'+db.xp+' XP</span>':'')+'</div><div style="display:flex;align-items:center;gap:4px"><span class="disc-tap-arr">\u203A</span><button class="dev-rm-btn" onclick="event.stopPropagation();shRemoveDevotion('+i+')" title="Remove">&times;</button></div></div><div class="disc-drawer" id="disc-drawer-'+gid+'"><div class="disc-power">'+(db?'<div class="dev-prereq">Requires: '+devPrereqStr(db)+'</div>':'')+(p.stats?'<div class="disc-power-stats">'+esc(p.stats)+'</div>':'')+'<div class="disc-power-effect">'+esc(p.effect||'')+'</div></div></div>';}
      else{h+='<div class="disc-tap-row" id="disc-row-'+gid+'" onclick="toggleDisc(\''+gid+'\')"><div class="disc-tap-left"><span class="disc-tap-name" style="color:var(--txt2)">'+esc(p.name)+'</span></div><span class="disc-tap-arr">\u203A</span></div><div class="disc-drawer" id="disc-drawer-'+gid+'"><div class="disc-power">'+(p.stats?'<div class="disc-power-stats">'+esc(p.stats)+'</div>':'')+'<div class="disc-power-effect">'+esc(p.effect||'')+'</div></div></div>';}
    });
    if(editMode){const owned=new Set(devP.map(p=>p.name)),avail=DEVOTIONS_DB.filter(d=>!owned.has(d.n)&&meetsDevPrereqs(c,d));
      h+='<div class="dev-add-row"><select id="dev-add-select" class="dev-add-sel" style="display:none">';if(avail.length)avail.forEach(d=>{h+='<option value="'+esc(d.n)+'">'+esc(d.n)+' ('+devPrereqStr(d)+') \u2014 '+d.xp+' XP</option>';});
      h+='</select><button class="dev-add-btn"'+(avail.length?' onclick="shShowDevSelect(this)"':' disabled style="opacity:.4;cursor:default"')+'>'+(avail.length?'+ Add Devotion ('+avail.length+')':'No devotions available')+'</button></div>';}
    h+='</div></div>';
  }
  // Rites
  const ritP=(c.powers||[]).filter(p=>p.category==='rite');
  if(ritP.length){h+='<div class="sh-sec"><div class="sh-sec-title">Rites</div><div class="disc-list">';ritP.forEach((p,i)=>{const gid='rite'+c.name.replace(/[^a-z]/gi,'')+i;h+='<div class="disc-tap-row" id="disc-row-'+gid+'" onclick="toggleDisc(\''+gid+'\')"><div class="disc-tap-left"><span class="disc-tap-name" style="color:rgba(220,160,120,.9)">'+esc(p.name)+'</span><span class="disc-tap-dots" style="margin-left:6px;color:rgba(220,160,120,.75)">'+shDots(p.level)+'</span><span style="font-family:var(--fh);font-size:10px;color:var(--txt3);margin-left:8px">'+esc(p.tradition)+'</span></div><span class="disc-tap-arr">\u203A</span></div><div class="disc-drawer" id="disc-drawer-'+gid+'"><div class="disc-power">'+(p.stats?'<div class="disc-power-stats">'+esc(p.stats)+'</div>':'')+'<div class="disc-power-effect">'+esc(p.effect||'')+'</div></div></div>';});h+='</div></div>';}
  // Pacts
  const pctP=(c.powers||[]).filter(p=>p.category==='pact');
  if(pctP.length){h+='<div class="sh-sec"><div class="sh-sec-title">Pacts</div><div class="disc-list">';pctP.forEach((p,i)=>{const gid='pact'+c.name.replace(/[^a-z]/gi,'')+i;h+='<div class="disc-tap-row" id="disc-row-'+gid+'" onclick="toggleDisc(\''+gid+'\')"><div class="disc-tap-left"><span class="disc-tap-name" style="color:var(--txt2)">'+esc(p.name)+'</span></div><span class="disc-tap-arr">\u203A</span></div><div class="disc-drawer" id="disc-drawer-'+gid+'"><div class="disc-power">'+(p.stats?'<div class="disc-power-stats">'+esc(p.stats)+'</div>':'')+'<div class="disc-power-effect">'+esc(p.effect||'')+'</div></div></div>';});h+='</div></div>';}
  return h;
}

export function shRenderInfluenceMerits(c,editMode) {
  const inflM=(c.merits||[]).filter(m=>m.category==='influence');
  if(!editMode&&!inflM.length) return '';
  const totalInfl=calcTotalInfluence(c);
  let h='<div class="sh-sec"><div class="sh-sec-subtitle">Influence Merits</div><div class="merit-list">';
  if(editMode){
    // Non-Contacts influence merits
    const nonContacts=inflM.filter(m=>m.name!=='Contacts');
    nonContacts.forEach((m,idx)=>{const inf=calcMeritInfluence(m),tOpts=INFLUENCE_MERIT_TYPES.map(t=>'<option'+(m.name===t?' selected':'')+'>'+t+'</option>').join(''),rIdx=c.merits.indexOf(m),mc=(c.merit_creation&&c.merit_creation[rIdx])||{cp:0,free:0,xp:0},dd=(mc.cp||0)+(mc.free||0)+(mc.xp||0);
      h+='<div class="infl-edit-row"><select class="infl-type" onchange="shEditInflMerit('+idx+',\'name\',this.value);renderSheet(chars[editIdx])">'+tOpts+'</select>'+_inflArea(m,idx,false)+'<span class="infl-dots-derived">'+shDots(dd)+'</span><span class="infl-inf">'+(inf?'<span class="inf-val">'+inf+'</span> inf':'')+'</span><button class="dev-rm-btn" onclick="shRemoveInflMerit('+idx+')" title="Remove">&times;</button></div>';
      h+=meritBdRow(rIdx,mc);});
    // Contacts: single entry with sphere-per-dot
    const contactsEntry=inflM.find(m=>m.name==='Contacts');
    const cInf=calcContactsInfluence(c);
    if(contactsEntry){
      const cIdx=c.merits.indexOf(contactsEntry),rating=contactsEntry.rating||0,spheres=contactsEntry.spheres||[],mciDots=contactsEntry._mci_dots||0,ptDots=contactsEntry._pt_dots||0,baseDots=rating-mciDots-ptDots,spOpts=s=>INFLUENCE_SPHERES.map(sp=>'<option'+(s===sp?' selected':'')+'>'+sp+'</option>').join('');
      h+='<div class="contacts-edit-block"><div class="contacts-edit-hdr">Contacts '+shDots(rating)+(cInf?' \u2014 <span class="inf-val">'+cInf+'</span> inf':'')+'</div>';
      for(let d=0;d<rating;d++){
        const sp=spheres[d]||'';
        let src='';
        if(d<baseDots) src='base';
        else if(d<baseDots+mciDots) src='MCI';
        else src='PT';
        h+='<div class="contacts-dot-row"><span class="contacts-dot-num">\u25CF '+(d+1)+'</span><select class="contacts-sphere-sel" onchange="shEditContactSphere('+cIdx+','+d+',this.value)"><option value="">\u2014 sphere \u2014</option>'+spOpts(sp)+'</select>'+(src!=='base'?'<span class="contacts-dot-src">'+src+'</span>':'')+'</div>';
      }
      h+='</div>';
    }
    h+='<div class="dev-add-row"><button class="dev-add-btn" onclick="shAddInflMerit(\'Allies\')">+ Add Allies / Other</button></div>';
    h+='<div class="infl-total">Total Influence: <span class="inf-n">'+totalInfl+'</span></div>';
  } else {
    inflM.filter(m=>m.name!=='Contacts').forEach((m,idx)=>{const area=m.area?m.area.trim():null,gt=m.name==='Retainer'&&m.ghoul?' (ghoul)':'';h+=shRenderMeritRow((area?m.name+' ('+area+gt+')':m.name+gt)+(m.rating?' '+shDots(m.rating):''),'infl',idx);});
    const ce=inflM.filter(m=>m.name==='Contacts');
    if(ce.length){const td=Math.min(5,ce.reduce((s,m)=>s+(m.rating||0),0));const allSp=[];ce.forEach(m=>{if(m.spheres&&m.spheres.length)allSp.push(...m.spheres);else if(m.area)allSp.push(m.area.trim());else if(m.qualifier)allSp.push(...m.qualifier.split(/,\s*/).filter(Boolean));});const sp=[...new Set(allSp)].join(', ');h+=shRenderMeritRow('Contacts'+(sp?' ('+sp+')':'')+(td?' '+shDots(td):''),'infl','contacts');}
    h+='<div class="infl-total">Total Influence: <span class="inf-n">'+totalInfl+'</span></div>';
  }
  h+='</div></div>';return h;
}
function _inflArea(m,idx,isC) {
  const isN=m.name==='Status'&&m.area&&!INFLUENCE_SPHERES.includes(m.area),spOpts=s=>INFLUENCE_SPHERES.map(sp=>'<option'+(s===sp?' selected':'')+'>'+sp+'</option>').join('');
  if(m.name==='Allies') return '<select class="infl-area" onchange="shEditInflMerit('+idx+',\'area\',this.value)"><option value="">'+(m.area?'':'\u2014 sphere \u2014')+'</option>'+spOpts(m.area)+'</select>';
  if(isC) return '<span class="infl-area-fixed">'+esc(m.area||'\u2014')+'</span>';
  if(m.name==='Resources') return '<span class="infl-area-none"></span>';
  if(m.name==='Mentor') return '<input type="text" class="infl-area" value="'+esc(m.area||'')+'" placeholder="Mentor name" onchange="shEditInflMerit('+idx+',\'area\',this.value)">';
  if(m.name==='Retainer') return '<input type="text" class="infl-area" value="'+esc(m.area||'')+'" placeholder="Description" onchange="shEditInflMerit('+idx+',\'area\',this.value)"><label class="infl-ghoul-lbl"><input type="checkbox"'+(m.ghoul?' checked':'')+' onchange="shEditInflMerit('+idx+',\'ghoul\',this.checked)"> Ghoul</label>';
  if(m.name==='Staff') return '<input type="text" class="infl-area" value="'+esc(m.area||'')+'" placeholder="Area of expertise" onchange="shEditInflMerit('+idx+',\'area\',this.value)">';
  if(m.name==='Status') return '<button class="infl-mode-btn" onclick="shEditStatusMode('+idx+',\''+(!isN?'narrow':'sphere')+'\')" title="'+(isN?'Switch to sphere':'Switch to narrow')+'">'+(isN?'Sphere \u2195':'Narrow \u2195')+'</button>'+(isN?'<input type="text" class="infl-area infl-area-narrow" value="'+esc(m.area||'')+'" placeholder="Narrow status" onchange="shEditInflMerit('+idx+',\'area\',this.value)">':'<select class="infl-area" onchange="shEditInflMerit('+idx+',\'area\',this.value)"><option value="">'+(m.area?'':'\u2014 sphere \u2014')+'</option>'+spOpts(m.area)+'</select>');
  return '<input type="text" class="infl-area" value="'+esc(m.area||'')+'" placeholder="Sphere / scope" onchange="shEditInflMerit('+idx+',\'area\',this.value)">';
}

export function shRenderDomainMerits(c,editMode) {
  const chars=state.chars,domM=(c.merits||[]).filter(m=>m.category==='domain');
  if(!editMode&&!domM.length) return '';
  let h='<div class="sh-sec"><div class="sh-sec-subtitle">Domain Merits</div><div class="merit-list">';
  if(editMode){
    domM.forEach((m,di)=>{const hTk=domM.some((dm,dj)=>dm.name==='Herd'&&dj!==di),tOpts=DOMAIN_MERIT_TYPES.filter(t=>t!=='Herd'||!hTk||m.name==='Herd').map(t=>'<option'+(m.name===t?' selected':'')+'>'+esc(t)+'</option>').join(''),rIdx=c.merits.indexOf(m),mc=(c.merit_creation&&c.merit_creation[rIdx])||{cp:0,free:0,xp:0},dd=(mc.cp||0)+(mc.free||0)+(mc.xp||0),parts=m.shared_with||[],eT=domMeritTotal(c,m.name),avP=chars.filter(ch=>ch.name!==c.name&&!parts.includes(ch.name));
      h+='<div class="dom-edit-block"><div class="infl-edit-row"><select class="infl-type" onchange="shEditDomMerit('+di+',\'name\',this.value)">'+tOpts+'</select><span class="dom-contrib-lbl">My dots: '+shDots(dd)+'</span><span class="dom-total-lbl" title="Total across all contributors">Total: '+shDots(eT)+'</span><button class="dev-rm-btn" onclick="shRemoveDomMerit('+di+')" title="Remove">&times;</button></div>';
      h+=meritBdRow(rIdx,mc);
      if(m.name!=='Herd'&&parts.length){h+='<div class="dom-partners-row">';parts.forEach(pN=>{const p=chars.find(ch=>ch.name===pN),pD=p?domMeritShareable(p,m.name):0;h+='<span class="dom-partner-tag">'+esc(pN)+(pD?' '+shDots(pD):' \u25CB')+'<button class="dom-partner-rm" onclick="shRemoveDomainPartner('+di+',\''+pN.replace(/'/g,"\\'")+'\')">\u00D7</button></span>';});h+='</div>';}
      if(m.name!=='Herd'&&avP.length) h+='<div class="dom-add-partner-row"><select class="dom-partner-sel" onchange="if(this.value){shAddDomainPartner('+di+',this.value);this.value=\'\';}"><option value="">+ Add shared partner\u2026</option>'+avP.map(p=>'<option value="'+esc(p.name)+'">'+esc(p.name)+'</option>').join('')+'</select></div>';
      h+='</div>';});
    h+='<div class="dev-add-row"><button class="dev-add-btn" onclick="shAddDomMerit()">+ Add Domain Merit</button></div>';
  } else {
    domM.forEach(m=>{const dp=m.shared_with&&m.shared_with.length?m.shared_with:null,de=domMeritTotal(c,m.name),dO=domMeritContrib(c,m.name);
      h+='<div class="merit-plain"><div style="flex:1"><div class="merit-name-sh">'+esc(m.name)+'</div>'+(dp?'<div class="merit-sub-sh dom-shared-lbl">Shared \u00B7 '+dp.map(n=>{const p=chars.find(ch=>ch.name===n),pd=p?domMeritShareable(p,m.name):0;return esc(n)+(pd?' '+shDots(pd):'');}).join(', ')+'</div>':'')+'</div><div style="text-align:right">'+(dp?'<div class="dom-total-view">'+shDots(de)+'</div><div class="dom-own-view">mine: '+shDots(dO)+'</div>':'<span class="merit-dots-sh">'+shDots(de)+'</span>')+'</div></div>';});
  }
  h+='</div></div>';return h;
}

export function shRenderStandingMerits(c,editMode) {
  const standM=(c.merits||[]).filter(m=>m.category==='standing');
  if(!editMode&&!standM.length) return '';
  let h='<div class="sh-sec"><div class="sh-sec-subtitle">Standing Merits</div><div class="merit-list">';
  standM.forEach((m,si)=>{const rIdx=c.merits.indexOf(m),mc=(c.merit_creation&&c.merit_creation[rIdx])||{cp:0,free:0,xp:0},dd=(mc.cp||0)+(mc.free||0)+(mc.xp||0);
    if(m.name==='Mystery Cult Initiation') h+=_renderMCI(c,m,si,rIdx,mc,dd,editMode,MERITS_DB);
    else if(m.name==='Professional Training') h+=_renderPT(c,m,si,rIdx,mc,dd,editMode);
    else if(editMode){h+='<div class="infl-edit-row"><input type="text" class="gen-name-input" value="'+esc(m.name)+'" placeholder="Merit name" onchange="shEditStandMerit('+si+',\'name\',this.value)"><span class="infl-dots-derived">'+shDots(dd)+'</span></div>';h+=meritBdRow(rIdx,mc);}
    else{const sub=m.cult_name||m.role||'',assets=m.asset_skills&&m.asset_skills.length?m.asset_skills.join(', '):'';h+='<div class="merit-plain"><div style="flex:1"><div class="merit-name-sh">'+esc(m.name)+'</div>'+(sub?'<div class="merit-sub-sh">'+esc(sub)+'</div>':'')+(assets?'<div class="merit-sub-sh" style="font-style:italic;color:var(--txt3)">Asset Skills: '+esc(assets)+'</div>':'')+'</div><span class="merit-dots-sh">'+shDots(m.rating)+'</span></div>';}
  });
  if(editMode){
    const hasMCI=standM.some(m=>m.name==='Mystery Cult Initiation');
    const hasPT=standM.some(m=>m.name==='Professional Training');
    h+='<div class="dev-add-row">';
    if(!hasMCI) h+='<button class="dev-add-btn" onclick="shAddStandMCI()">+ Add MCI</button>';
    if(!hasPT) h+='<button class="dev-add-btn" onclick="shAddStandPT()">+ Add Prof. Training</button>';
    h+='</div>';
  }
  h+='</div></div>';return h;
}
function _renderMCI(c,m,si,rIdx,mc,dd,editMode,MERITS_DB) {
  const inactive=m.active===false,ben=m.benefits||['','','','',''],eDots=editMode?dd:m.rating,dots=['\u25CF','\u25CF\u25CF','\u25CF\u25CF\u25CF','\u25CF\u25CF\u25CF\u25CF','\u25CF\u25CF\u25CF\u25CF\u25CF'];
  let h='<div class="mci-block'+(inactive?' mci-inactive':'')+'"><div class="mci-header"><div class="mci-title"><span class="merit-name-sh">'+esc(m.name)+'</span>';
  if(editMode) h+='<input type="text" class="stand-name-input" value="'+esc(m.cult_name||'')+'" placeholder="Cult name" onchange="shEditStandMerit('+si+',\'cult_name\',this.value)">';
  else if(m.cult_name) h+='<span class="merit-sub-sh mci-cult-name">'+esc(m.cult_name)+'</span>';
  h+='</div><div class="mci-header-right">';
  if(editMode) h+='<button class="mci-toggle-btn" onclick="shToggleMCI('+si+')" title="'+(inactive?'Activate cult':'Suspend cult')+'">'+(inactive?'Suspended':'Active')+'</button>';
  else if(inactive) h+='<span class="mci-toggle-btn" style="opacity:0.5">Suspended</span>';
  h+='<span class="merit-dots-sh">'+shDots(eDots)+'</span></div></div>';
  if(editMode){
    h+=meritBdRow(rIdx,mc);if(!m.benefit_grants)m.benefit_grants=[null,null,null,null,null];
    for(let d=0;d<5&&d<eDots;d++){const g=m.benefit_grants[d],gN=(g&&g.name)||'',gR=(g&&g.rating)||0,gQ=(g&&g.qualifier)||'',mO=buildMeritOptions(c,gN),b=ben[d]||'',db=gN?MERITS_DB[gN.toLowerCase()]:null,mx=db&&db.rating?parseInt((db.rating+'').split('\u2013').pop().split('\u2014').pop())||5:5;
      h+='<div class="mci-benefit-row"><span class="mci-dot-lbl">'+dots[d]+'</span><div style="flex:1;display:flex;flex-direction:column;gap:3px"><div style="display:flex;gap:4px;align-items:center"><select class="gen-name-select" style="flex:1" onchange="shEditMCIGrant('+si+','+d+',\'name\',this.value)">'+mO+'</select>';
      if(gN) h+='<input class="merit-bd-input" type="number" min="1" max="'+mx+'" value="'+gR+'" style="width:32px" title="Rating (max '+mx+')" onchange="shEditMCIGrant('+si+','+d+',\'rating\',+this.value)"><input type="text" class="mci-benefit-input" style="flex:0.6" value="'+esc(gQ)+'" placeholder="Qualifier" onchange="shEditMCIGrant('+si+','+d+',\'qualifier\',this.value)">';
      h+='</div><input type="text" class="mci-benefit-input" value="'+esc(b)+'" placeholder="Description" onchange="shEditStandMerit('+si+',\'benefit\',\''+d+'|\'+this.value)"></div></div>';}
  } else if(!inactive){const grants=m.benefit_grants||[];
    for(let d=0;d<m.rating;d++){const b=(ben[d]||'').trim(),entry=grants[d],gArr=Array.isArray(entry)?entry:(entry&&entry.name?[entry]:[]),gl=gArr.map(g=>esc(g.name)+(g.qualifier?' ('+esc(g.qualifier)+')':'')+(g.rating?' '+shDots(g.rating):'')).join(', ');
      h+='<div class="mci-benefit-row"><span class="mci-dot-lbl">'+dots[d]+'</span>'+(gl?'<span class="mci-benefit-text"><span class="gen-granted-tag-view" style="margin-right:4px">Grant</span>'+gl+(b?' \u2014 '+esc(b):'')+'</span>':'<span class="mci-benefit-text">'+(b?esc(b):'<span class="mci-benefit-empty">\u2014</span>')+'</span>')+'</div>';}}
  h+='</div>';return h;
}
function _renderPT(c,m,si,rIdx,mc,dd,editMode) {
  const as=m.asset_skills||[],eDots=editMode?dd:m.rating,mx=Math.min(5,Math.max(2,eDots));
  const dots=['\u25CF','\u25CF\u25CF','\u25CF\u25CF\u25CF','\u25CF\u25CF\u25CF\u25CF','\u25CF\u25CF\u25CF\u25CF\u25CF'];
  const PT_BENEFITS=[
    'Networking: 2 dots Contacts ('+(m.role||'field')+')',
    'Continuing Education: 9-again on Asset Skills',
    'Breadth of Knowledge: third Asset Skill + 2 Specialisations',
    'On the Job Training: +1 Skill dot in an Asset Skill',
    'The Routine: spend WP for rote quality on an Asset Skill'
  ];
  let h='<div class="pt-block"><div class="pt-header"><span class="merit-name-sh">'+esc(m.name)+'</span>';
  if(editMode) h+='<input type="text" class="stand-name-input" value="'+esc(m.role||'')+'" placeholder="Role" onchange="shEditStandMerit('+si+',\'role\',this.value)">';
  else if(m.role) h+='<span class="merit-sub-sh">'+esc(m.role)+'</span>';
  h+='<span class="merit-dots-sh">'+shDots(eDots)+'</span></div>';
  if(editMode){h+=meritBdRow(rIdx,mc);h+='<div class="pt-skills-edit">';for(let s=0;s<mx;s++){const cur=as[s]||'';h+='<select class="pt-skill-sel" onchange="shEditStandAssetSkill('+si+','+s+',this.value)"><option value="">'+(cur?'':'\u2014 skill \u2014')+'</option>'+ALL_SKILLS.map(sk=>'<option'+(cur===sk?' selected':'')+'>'+sk+'</option>').join('')+'</select>';}h+='</div>';}
  else {
    if(as.filter(Boolean).length) h+='<div class="pt-assets">'+as.filter(Boolean).map(s=>'<span class="pt-skill-tag">'+esc(s)+'</span>').join('')+'</div>';
    for(let d=0;d<eDots&&d<5;d++){
      h+='<div class="mci-benefit-row"><span class="mci-dot-lbl">'+dots[d]+'</span><span class="mci-benefit-text">'+esc(PT_BENEFITS[d])+'</span></div>';
    }
  }
  h+='</div>';return h;
}

export function shRenderGeneralMerits(c,editMode) {
  const oM=(c.merits||[]).filter(m=>m.category==='general');
  if(!editMode&&!oM.length) return '';
  let h='<div class="sh-sec"><div class="sh-sec-title">Merits</div><div class="merit-list">';
  if(editMode){
    oM.forEach((m,gi)=>{const rIdx=c.merits.indexOf(m),mc=(c.merit_creation&&c.merit_creation[rIdx])||{cp:0,free:0,xp:0},dd=(mc.cp||0)+(mc.free||0)+(mc.xp||0),isAoE=m.name==='Area of Expertise',isIS=m.name==='Interdisciplinary Specialty',nSp=isAoE||isIS,cSp=Object.values(c.skills||{}).flatMap(sk=>sk.specs||[]);
      if(m.granted_by){const pf=m.prereq_failed;h+='<div class="gen-edit-row gen-granted-row'+(pf?' merit-prereq-fail':'')+'"><span class="gen-granted-name">'+esc(m.name)+(m.qualifier?' ('+esc(m.qualifier)+')':'')+'</span><span class="infl-dots-derived">'+shDots(m.rating)+'</span><span class="gen-granted-tag" title="Granted by '+esc(m.granted_by)+'">'+esc(m.granted_by)+'</span>'+(pf?'<span class="merit-prereq-fail-tag" title="Prereqs not met">Invalid</span>':'')+'</div>';}
      else{h+='<div class="gen-edit-row"><select class="gen-name-select" onchange="shEditGenMerit('+gi+',\'name\',this.value)">'+buildMeritOptions(c,m.name||'')+'</select>';
        if(nSp&&cSp.length) h+='<select class="gen-qual-input" onchange="shEditGenMerit('+gi+',\'qualifier\',this.value)"><option value="">'+(m.qualifier||'\u2014 spec \u2014')+'</option>'+cSp.map(sp=>'<option'+(m.qualifier===sp?' selected':'')+'>'+esc(sp)+'</option>').join('')+'</select>';
        else h+='<input type="text" class="gen-qual-input" value="'+esc(m.qualifier||'')+'" placeholder="Qualifier" onchange="shEditGenMerit('+gi+',\'qualifier\',this.value)">';
        h+='<span class="infl-dots-derived">'+shDots(dd)+'</span><button class="dev-rm-btn" onclick="shRemoveGenMerit('+gi+')" title="Remove">&times;</button></div>';h+=meritBdRow(rIdx,mc);}});
    h+='<div class="dev-add-row"><button class="dev-add-btn" onclick="shAddGenMerit()">+ Add Merit</button></div>';
  } else {
    oM.forEach((m,i)=>{const qual=m.qualifier?' ('+m.qualifier+')':'';
      if(m.granted_by){const gb=m.granted_by==='Mystery Cult Initiation'?'MCI':m.granted_by==='Professional Training'?'PT':m.granted_by,pf=m.prereq_failed;h+='<div class="merit-plain'+(pf?' merit-prereq-fail':'')+'"><div style="flex:1"><div class="merit-name-sh">'+esc(m.name)+esc(qual)+'</div></div><span class="gen-granted-tag-view" title="Granted by '+esc(m.granted_by)+'">'+esc(gb)+'</span>'+(pf?'<span class="merit-prereq-fail-tag" title="Prereqs not met">Invalid</span>':'')+'<span class="merit-dots-sh" style="margin-left:4px">'+shDots(m.rating)+'</span></div>';}
      else h+=shRenderMeritRow(m.name+qual+(m.rating?' '+shDots(m.rating):''),'merit',i);});
  }
  h+='</div></div>';return h;
}

export function shRenderManoeuvres(c) {
  const manM=(c.merits||[]).filter(m=>m.category==='manoeuvre');
  if(!manM.length) return '';
  let h='<div class="sh-sec"><div class="sh-sec-title">Manoeuvres</div><div class="man-list">';
  manM.forEach((m,i)=>{const rn=m.rank_name||'',db=rn?MAN_DB[rn.toLowerCase()]:null,id2='man'+i,body=db?'<div class="man-exp-body"><div class="man-style">'+esc(db.style)+' \u2014 Rank '+esc(db.rank)+'</div><div>'+esc(db.effect||'')+'</div>'+(db.prereq?'<div class="man-prereq">Prerequisite: '+esc(db.prereq)+'</div>':'')+'</div>':'<div>'+esc(rn)+'</div>',mgb=m.granted_by,mgs=mgb?(mgb==='Mystery Cult Initiation'?'MCI':mgb==='Professional Training'?'PT':mgb==='Oath of the Hard Motherfucker'?'Oath HM':mgb):'';
    h+='<div class="exp-row" id="exp-row-'+id2+'" onclick="toggleExp(\''+id2+'\')"><div style="flex:1;min-width:0"><div class="merit-name-sh">'+esc(rn)+(mgb?' <span class="gen-granted-tag-view" title="Granted by '+esc(mgb)+'">'+esc(mgs)+'</span>':'')+'</div><div class="merit-sub-sh">'+esc(m.name)+' \u2014 Rank '+m.rating+'</div></div><span class="exp-arr">\u203A</span></div><div class="exp-body" id="exp-body-'+id2+'">'+body+'</div>';});
  h+='</div></div>';return h;
}

export function shRenderMeritRow(m,idPrefix,i) {
  const b2=meritBase(m),dc=meritDotCount(m),ds=dc?shDots(dc):'',pm=b2.match(/^([^(]+?)\s*\((.+)\)$/),mn=pm?pm[1].trim():b2,sn=pm?pm[2].trim():null;
  const nh=sn?'<div class="merit-name-sh">'+esc(mn)+'</div><div class="merit-sub-sh">'+esc(sn)+'</div>':'<div class="merit-name-sh">'+esc(mn)+'</div>';
  const db=meritLookup(m),dt=ds?'<span class="merit-dots-sh">'+ds+'</span>':'';
  if(db&&db.desc){const id2=idPrefix+i,body='<div>'+esc(db.desc)+'</div>'+(db.prereq?'<div style="margin-top:5px;font-style:italic;color:var(--txt3)">Prerequisite: '+esc(db.prereq)+'</div>':'');
    return '<div class="exp-row" id="exp-row-'+id2+'" onclick="toggleExp(\''+id2+'\')"><div style="flex:1;min-width:0">'+nh+'</div>'+dt+'<span class="exp-arr">\u203A</span></div><div class="exp-body" id="exp-body-'+id2+'">'+body+'</div>';}
  return '<div class="merit-plain"><div style="flex:1;min-width:0">'+nh+'</div>'+dt+'</div>';
}

/* ── renderSheet orchestrator ── */

export function renderSheet(c) {
  const {editMode,chars,editIdx}=state;
  state.openExpId=null;
  const el=document.getElementById('sh-content');
  if(!c){el.innerHTML='';return;}
  applyDerivedMerits(c); ensureMeritSync(c);
  const bl=c.bloodline&&c.bloodline!=='\u00AC'?c.bloodline:'',st=c.status||{},wp=c.willpower||{};
  const clanImg=ICONS[CLAN_ICON_KEY[c.clan]||'']||'',covImg=ICONS[COV_ICON_KEY[c.covenant]||'']||'';
  const allB=c.banes||[],curseIdx=allB.findIndex(b=>b.name.toLowerCase().includes('curse')),curse=curseIdx>=0?allB[curseIdx]:null,regB=allB.filter((_,i)=>i!==curseIdx);
  let h='';
  // Desktop layout hint — admin CSS uses this for 3-col grid
  const isDesktop = el.closest('.cd-sheet');
  if (isDesktop) h += '<div class="sh-desktop'+(editMode?' sh-editing':'')+'"><div class="sh-dcol sh-dcol-left">';
  // Header
  h+='<div class="sh-char-hdr"><div class="sh-namerow"><div class="sh-char-name">'+(editMode?'<input class="sh-edit-input" value="'+esc(c.name)+'" onchange="shEdit(\'name\',this.value);document.getElementById(\'edit-charname\').textContent=this.value">':esc(displayName(c)))+'</div>';
  if(editMode){h+='<div style="display:flex;gap:8px;margin-top:2px"><div style="flex:1"><input class="sh-edit-input" value="'+esc(c.honorific||'')+'" onchange="shEdit(\'honorific\',this.value||null)" placeholder="Honorific (e.g. Lord, Lady)" style="font-size:12px"></div><div style="flex:1"><input class="sh-edit-input" value="'+esc(c.moniker||'')+'" onchange="shEdit(\'moniker\',this.value||null)" placeholder="Moniker (overrides display name)" style="font-size:12px"></div></div>';}
  h+='<div class="sh-player-row"><span class="sh-char-player">'+(editMode?'<input class="sh-edit-input" value="'+esc(c.player||'')+'" onchange="shEdit(\'player\',this.value)" placeholder="Player">':esc(c.player||''))+'</span><span class="sh-xp-badge">XP '+xpLeft(c)+'/'+xpEarned(c)+'</span></div></div>';
  if(editMode){const eT=xpEarned(c),sT=xpSpent(c);
    h+='<div class="sh-xp-breakdown"><table><tr><th colspan="2">XP Earned</th><th colspan="2">XP Spent</th></tr><tr><td>Starting</td><td>'+xpStarting()+'</td><td>Attributes</td><td>'+xpSpentAttrs(c)+'</td></tr><tr><td>Humanity Drop</td><td>'+xpHumanityDrop(c)+'</td><td>Skills</td><td>'+xpSpentSkills(c)+'</td></tr><tr><td>Ordeals</td><td>'+xpOrdeals(c)+'</td><td>Merits</td><td>'+xpSpentMerits(c)+'</td></tr><tr><td>Game</td><td>'+xpGame(c)+'</td><td>Powers</td><td>'+xpSpentPowers(c)+'</td></tr><tr><td></td><td></td><td>Specs</td><td>'+xpSpentSpecs(c)+'</td></tr><tr><td></td><td></td><td>Special</td><td>'+xpSpentSpecial(c)+'</td></tr><tr class="xp-total-row"><td>Total Earned</td><td>'+eT+'</td><td>Total Spent</td><td>'+sT+'</td></tr><tr class="xp-total-row"><td colspan="3" style="text-align:right;padding-right:8px">Available</td><td>'+(eT-sT)+'</td></tr></table></div>';
    const ords=c.ordeals||[];if(ords.length){h+='<div class="sh-ordeals">';ords.forEach(o=>{h+='<span class="sh-ordeal'+(o.complete?' done':'')+'"><span class="sh-ordeal-dot">'+(o.complete?'\u25CF':'\u25CB')+'</span><span class="sh-ordeal-label">'+esc(o.name)+'</span></span>';});h+='</div>';}}
  h+='<div class="sh-char-body"><div class="sh-char-left">';
  if(editMode||c.concept) h+='<div class="sh-char-concept">'+(editMode?'<input class="sh-edit-input" value="'+esc(c.concept||'')+'" onchange="shEdit(\'concept\',this.value)" placeholder="Concept">':esc(c.concept))+'</div>';
  if(editMode||c.pronouns) h+='<div class="sh-char-concept">'+(editMode?'<input class="sh-edit-input" value="'+esc(c.pronouns||'')+'" onchange="shEdit(\'pronouns\',this.value)" placeholder="Pronouns">':esc(c.pronouns))+'</div>';
  if(editMode){h+='<div class="exp-row"><span class="exp-lbl labeled">Mask</span><select class="sh-edit-select" style="flex:1;margin:0 6px" onchange="shEdit(\'mask\',this.value)"><option value="">(none)</option>'+MASKS_DIRGES.map(m2=>'<option'+(c.mask===m2?' selected':'')+'>'+esc(m2)+'</option>').join('')+'</select></div>';}
  else if(c.mask){h+=expRow('mask','Mask',esc(c.mask),(wp.mask_1wp?'<div><span class="exp-wp-lbl">1 WP</span> '+esc(wp.mask_1wp)+'</div>':'')+(wp.mask_all?'<div style="margin-top:5px"><span class="exp-wp-lbl">All WP</span> '+esc(wp.mask_all)+'</div>':''));}
  if(editMode){h+='<div class="exp-row"><span class="exp-lbl labeled">Dirge</span><select class="sh-edit-select" style="flex:1;margin:0 6px" onchange="shEdit(\'dirge\',this.value)"><option value="">(none)</option>'+MASKS_DIRGES.map(m2=>'<option'+(c.dirge===m2?' selected':'')+'>'+esc(m2)+'</option>').join('')+'</select></div>';}
  else if(c.dirge){h+=expRow('dirge','Dirge',esc(c.dirge),(wp.dirge_1wp?'<div><span class="exp-wp-lbl">1 WP</span> '+esc(wp.dirge_1wp)+'</div>':'')+(wp.dirge_all?'<div style="margin-top:5px"><span class="exp-wp-lbl">All WP</span> '+esc(wp.dirge_all)+'</div>':''));}
  if(curse) h+=expRow('curse','Curse',esc(curse.name),'<div>'+esc(curse.effect||'')+'</div>');
  if(editMode){regB.forEach((b,bi)=>{const ri=allB.indexOf(b);h+='<div class="exp-row" style="flex-direction:column;align-items:stretch;padding:8px 10px"><div class="sh-bane-edit-row"><span class="exp-lbl" style="min-width:36px">Bane</span><select class="sh-edit-select" style="flex:1" onchange="shEditBaneName('+ri+',this.value)"><option value="">(select)</option>'+BANE_LIST.map(bn=>'<option'+(b.name===bn?' selected':'')+'>'+esc(bn)+'</option>').join('')+'</select><button class="sh-bane-rm" onclick="shRemoveBane('+ri+')" title="Remove">&times;</button></div><input class="sh-edit-input" value="'+esc(b.effect||'')+'" onchange="shEditBaneEffect('+ri+',this.value)" placeholder="Effect text" style="margin-top:4px;font-size:11px"></div>';});h+='<button class="sh-bane-add" onclick="shAddBane()">+ Add Bane</button>';}
  else regB.forEach((b,i)=>{h+=expRow('bane'+i,'Bane',esc(b.name),'<div>'+esc(b.effect||'')+'</div>');});
  // Features (read-only display)
  if(c.features) h+='<div class="sh-features"><span class="exp-lbl labeled">Features</span><span class="sh-features-text">'+esc(c.features)+'</span></div>';
  // Touchstones
  const ts=c.touchstones||[];
  if(editMode){
    h+='<div class="sh-touchstones-edit"><div class="sh-sec-title" style="font-size:11px;margin:8px 0 4px">Touchstones</div>';
    ts.forEach((t,i)=>{h+='<div class="sh-ts-edit-row"><select class="sh-ts-hum" onchange="shEditTouchstone('+i+',\'humanity\',+this.value)">';for(let n=1;n<=10;n++)h+='<option'+(t.humanity===n?' selected':'')+'>'+n+'</option>';h+='</select><input class="sh-edit-input" value="'+esc(t.name||'')+'" onchange="shEditTouchstone('+i+',\'name\',this.value)" placeholder="Name" style="flex:2"><input class="sh-edit-input" value="'+esc(t.desc||'')+'" onchange="shEditTouchstone('+i+',\'desc\',this.value)" placeholder="Description" style="flex:3"><button class="sh-bane-rm" onclick="shRemoveTouchstone('+i+')" title="Remove">&times;</button></div>';});
    h+='<button class="sh-bane-add" onclick="shAddTouchstone()">+ Add Touchstone</button></div>';
  } else if(ts.length){const hum=c.humanity||0;h+=expRow('touchstones','Touchstones','',ts.map(t=>{const att=hum>=t.humanity;return '<div class="exp-ts-row"><span class="exp-ts-hum">Humanity '+t.humanity+' \u2014 <span style="color:'+(att?'rgba(140,200,140,.9)':'var(--txt3)')+';font-style:normal">'+(att?'Attached':'Detached')+'</span></span><span class="exp-ts-name">'+esc(t.name)+(t.desc?' <span class="exp-ts-desc">('+esc(t.desc)+')</span>':'')+'</span></div>';}).join(''));}
  h+='</div>'; // end left
  // Right panel
  h+='<div class="sh-hdr-right">';
  const tOpts=COURT_TITLES.map(t=>'<option'+(c.court_title===t?' selected':'')+'>'+esc(t||'(none)')+'</option>').join(''),trOpts=REGENT_TERRITORIES.map(t=>'<option'+(c.regent_territory===t?' selected':'')+'>'+esc(t)+'</option>').join('');
  h+='<div class="sh-hdr-row"><div class="sh-icon-slot"></div><div class="sh-faction-text">';
  if(editMode){h+='<select class="sh-edit-select" onchange="shEdit(\'court_title\',this.value===\'(none)\'?null:this.value)">'+tOpts+'</select>';h+='<select class="sh-edit-select" style="margin-top:3px;font-size:10px" onchange="shEdit(\'regent_territory\',this.value||null)"><option value="">(no territory)</option>'+trOpts+'</select>';}
  else{h+='<div class="sh-faction-label">'+esc(c.court_title||'\u2014')+'</div>';if(c.regent_territory)h+='<div class="sh-faction-bloodline">Regent \u2014 '+esc(c.regent_territory)+'</div>';}
  const cityBase=st.city||0,titleBonus=titleStatusBonus(c),cityTotal=cityBase+titleBonus;
  h+='<div class="sh-faction-sub">Title</div>'+_cityStatusDots(cityBase,titleBonus)+'</div>'+_cityStatusPip(editMode,cityBase,cityTotal,titleBonus)+'</div>';
  const covRow=(img,editH,viewH,sub,svg,sVal,sLbl,sKey)=>{h+='<div class="sh-hdr-row">'+(img?'<div class="sh-faction-icon"><img src="'+img+'"></div>':'<div class="sh-icon-slot"></div>')+'<div class="sh-faction-text">'+(editMode?editH:viewH)+'<div class="sh-faction-sub">'+sub+'</div></div>'+_statusPip(editMode,svg,sVal,sLbl,sKey)+'</div>';};
  covRow(covImg,'<select class="sh-edit-select" onchange="shEdit(\'covenant\',this.value);renderSheet(chars[editIdx])">'+COVENANTS.map(cv=>'<option'+(c.covenant===cv?' selected':'')+'>'+cv+'</option>').join('')+'</select>','<div class="sh-faction-label">'+esc(c.covenant||'\u2014')+'</div>','Covenant',OTHER_SVG,st.covenant||0,'Cov.','covenant');
  if(editMode){const cOpts=CLANS.map(cl=>'<option'+(c.clan===cl?' selected':'')+'>'+cl+'</option>').join(''),bls=(BLOODLINE_CLANS[c.clan]||[]).slice().sort(),blO=bls.map(b=>'<option'+(c.bloodline===b?' selected':'')+'>'+b+'</option>').join('');
    covRow(clanImg,'<select class="sh-edit-select" onchange="shEdit(\'clan\',this.value)">'+cOpts+'</select><select class="sh-edit-select" style="margin-top:3px;font-size:10px" onchange="shEdit(\'bloodline\',this.value||null);renderSheet(chars[editIdx])"><option value="">(no bloodline)</option>'+blO+'</select>','','Clan / Bloodline',OTHER_SVG,st.clan||0,'Clan','clan');}
  else covRow(clanImg,'','<div class="sh-faction-label">'+esc(c.clan||'\u2014')+'</div>'+(bl?'<div class="sh-faction-bloodline">'+esc(bl)+'</div>':''),'Clan',OTHER_SVG,st.clan||0,'Clan','clan');
  h+='</div></div></div>'; // end right, body, hdr
  // Covenant strip
  const covLbls=['Carthian','Crone','Invictus','Lance'],covSM={'Carthian Movement':'Carthian','Circle of the Crone':'Crone','Invictus':'Invictus','Lancea et Sanctum':'Lance'},pLbl=covSM[c.covenant]||c.covenant;
  const covS=covLbls.filter(l=>l!==pLbl).map(l=>({label:l,status:(c.covenant_standings||{})[l]||0}));
  if(covS.length){h+='<div class="cov-strip">';covS.forEach(cs=>{const a=cs.status>0;h+='<div class="cov-strip-cell"><span class="cov-strip-name'+(a?' active':'')+'">'+esc(cs.label)+'</span><span class="cov-strip-dot'+(a?' active':'')+'">'+(a?'\u25CB':'\u2013')+'</span></div>';});h+='</div>';}
  h+=shRenderStatsStrip(c);
  if (isDesktop) {
    h+='<div class="sh-body">'+shRenderAttributes(c,editMode)+shRenderSkills(c,editMode)+'</div>';
    h+='</div>'; // end sh-dcol-left
    h+='<div class="sh-dcol sh-dcol-mid"><div class="sh-body">'+shRenderGeneralMerits(c,editMode)+shRenderInfluenceMerits(c,editMode)+shRenderDomainMerits(c,editMode)+shRenderStandingMerits(c,editMode)+shRenderManoeuvres(c)+'</div></div>';
    h+='<div class="sh-dcol sh-dcol-right"><div class="sh-body">'+shRenderDisciplines(c,editMode)+'</div></div>';
    h+='</div>'; // end sh-desktop
  } else {
    h+='<div class="sh-body">'+shRenderAttributes(c,editMode)+shRenderSkills(c,editMode)+shRenderDisciplines(c,editMode)+shRenderGeneralMerits(c,editMode)+shRenderInfluenceMerits(c,editMode)+shRenderDomainMerits(c,editMode)+shRenderStandingMerits(c,editMode)+shRenderManoeuvres(c)+'</div>';
  }
  const _scrollEl=el.closest('.sh-wrap')||el.parentElement||document.documentElement,_scrollTop=_scrollEl.scrollTop;
  el.innerHTML=h;_scrollEl.scrollTop=_scrollTop;
}
