/**
 * Sheet rendering module — all read-only and edit-mode sheet HTML generation.
 * Extracted from tm_editor.html lines 315–1310.
 */
import state from '../data/state.js';
import { CLAN_DISCS, BLOODLINE_DISCS, CORE_DISCS, RITUAL_DISCS, SORCERY_THEMES, CLAN_ATTR_OPTIONS, ATTR_CATS, PRI_LABELS, PRI_BUDGETS, SKILL_PRI_BUDGETS, SKILLS_MENTAL, SKILLS_PHYSICAL, SKILLS_SOCIAL, SKILL_CATS, CLANS, COVENANTS, MASKS_DIRGES, COURT_TITLES, REGENT_TERRITORIES, BLOODLINE_CLANS, BANE_LIST, INFLUENCE_MERIT_TYPES, INFLUENCE_SPHERES, DOMAIN_MERIT_TYPES, ALL_SKILLS, CITY_SVG, OTHER_SVG, BP_SVG, HUM_SVG, HEALTH_SVG, WP_SVG, STAT_SVG , STYLE_TAGS } from '../data/constants.js';
import { ICONS } from '../data/icons.js';
import { CLAN_ICON_KEY, COV_ICON_KEY, shDots, shDotsWithBonus, esc, formatSpecs, hasAoE, displayName } from '../data/helpers.js';
import { getAttrVal, getAttrBonus, getSkillObj, calcCityStatus, titleStatusBonus } from '../data/accessors.js';
import { calcHealth, calcWillpowerMax, calcSize, calcSpeed, calcDefence } from '../data/derived.js';
import { xpToDots, xpEarned, xpSpent, xpLeft, xpStarting, xpHumanityDrop, xpOrdeals, xpGame, xpSpentAttrs, xpSpentSkills, xpSpentMerits, xpSpentPowers, xpSpentSpecial, setDevotionsDB, meritBdRow } from './xp.js';
import { meritBase, meritDotCount, meritLookup, meritFixedRating, meritQualifies, buildMeritOptions, buildFThiefOptions, ensureMeritSync, meetsDevPrereqs, devPrereqStr } from './merits.js';
import { applyDerivedMerits, getPoolTotal, getPoolUsed, getPoolsForCategory, mciPoolTotal, getMCIPoolUsed } from './mci.js';
import { domMeritTotal, domMeritContrib, domMeritShareable, calcTotalInfluence, calcContactsInfluence, calcMeritInfluence, hasViralMythology, vmHerdPool, vmAlliesUsed, ssjHerdBonus, flockHerdBonus, hasLorekeeper, lorekeeperPool, lorekeeperUsed, hasOHM, ohmUsed, hasInvested, investedPool, investedUsed } from './domain.js';
import { DEVOTIONS_DB } from '../data/devotions-db.js';
import { MERITS_DB } from '../data/merits-db-data.js';
import { MAN_DB } from '../data/man-db-data.js';
setDevotionsDB(DEVOTIONS_DB);

/** Render a prereq warning if character doesn't meet the merit's prerequisites. */
function _prereqWarn(c, meritName) {
  const entry = meritLookup(meritName);
  if (!entry || !entry.prereq || entry.prereq === '-') return '';
  if (meritQualifies(c, entry.prereq)) return '';
  return '<div class="merit-prereq-warn">\u26A0 Prerequisites not met: <span class="merit-prereq-txt">'+esc(entry.prereq)+'</span></div>';
}

/** Render grant pool counters for a merit category. Handles single and multi-target pools. */
function _renderPoolCounters(c,category) {
  const pools=getPoolsForCategory(c,category);
  // Also include 'any' category pools (MCI general pool) in the general merits section
  const anyPools=category==='general'?(c._grant_pools||[]).filter(p=>p.category==='any'):[];
  // Also include 'vm' category pools (VM Allies bonus) in the influence section
  const vmPools=category==='influence'?(c._grant_pools||[]).filter(p=>p.category==='vm'):[];
  // Also include 'ohm' category pools (OHM grants) in the influence section
  const ohmPools=category==='influence'?(c._grant_pools||[]).filter(p=>p.category==='ohm'):[];
  // Also include 'inv' pools (Invested) in both domain and influence sections
  const invPools=(category==='domain'||category==='influence')?(c._grant_pools||[]).filter(p=>p.category==='inv'):[];
  const allPools=[...pools,...anyPools,...vmPools,...ohmPools,...invPools];
  if(!allPools.length) return '';
  let h='<div class="grant-pools">';
  const seen=new Set();
  allPools.forEach(p=>{
    const label=p.names?p.names.join('/'):(p.category==='any'?'any merit':p.category==='vm'?'Allies (VM bonus)':p.category==='ohm'?'OHM: auto Contacts+Resources, pick Allies sphere':p.category==='inv'?'Herd/Mentor/Resources/Retainer (Invested)':p.name);
    const key=p.source+'|'+label;
    if(seen.has(key)) return;
    seen.add(key);
    let pTotal,pUsed;
    if(p.category==='any'){pTotal=p.amount;pUsed=getMCIPoolUsed(c);}
    else if(p.category==='vm'){pTotal=p.amount;pUsed=vmAlliesUsed(c);}
    else if(p.category==='lk'){pTotal=p.amount;pUsed=lorekeeperUsed(c);}
    else if(p.category==='ohm'){pTotal=p.amount;pUsed=ohmUsed(c);}
    else if(p.category==='inv'){pTotal=p.amount;pUsed=investedUsed(c);}
    else{const lookupName=p.names?p.names[0]:p.name;pTotal=getPoolTotal(c,lookupName);pUsed=getPoolUsed(c,lookupName);}
    const cls=pUsed>pTotal?'sc-over':pUsed===pTotal?'sc-full':'sc-val';
    h+='<div class="grant-pool-row"><span style="color:var(--gold2)">'+esc(p.source)+'</span>: '+esc(label)+' free dots <span class="'+cls+'">'+pUsed+'/'+pTotal+'</span></div>';
  });
  h+='</div>';return h;
}

/** Render a small red or yellow alert badge for a section title (edit mode only). */
function _alertBadge(lvl) {
  if(!lvl) return '';
  return lvl==='red'?'<span class="sh-sec-alert red" title="Data error">!</span>':'<span class="sh-sec-alert yellow" title="Unspent pool dots">&#9679;</span>';
}

/** Render merit dots split into purchased (full gold) and bonus (empty circle). */
function shDotsMixed(purchased,bonus) {
  if(!purchased&&!bonus) return '';
  return '<span class="merit-dots-sh">'+'\u25CF'.repeat(purchased)+'\u25CB'.repeat(bonus)+'</span>';
}
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
  // Safe Word: combined WP when mutually linked (both have the oath pointing to each other)
  const _swPact=(c.powers||[]).find(p=>p.category==='pact'&&(p.name||'').toLowerCase()==='oath of the safe word');
  const _swPartner=_swPact&&_swPact.partner?(state.chars||[]).find(ch=>ch.name===_swPact.partner):null;
  const _swActive=_swPartner&&((_swPartner.powers||[]).some(p=>p.category==='pact'&&(p.name||'').toLowerCase()==='oath of the safe word'&&p.partner===c.name));
  const _wpBase=calcWillpowerMax(c);
  const _wpVal=_swActive?_wpBase+calcWillpowerMax(_swPartner):_wpBase;
  const _wpLbl=_swActive?'WP (shared)':'Willpower';
  return '<div class="sh-stats-strip">'+bpCell+humCell+s(HEALTH_SVG,calcHealth(c),'Health')+s(WP_SVG,_wpVal,_wpLbl)+s(STAT_SVG,calcSize(c),'Size')+s(STAT_SVG,calcSpeed(c),'Speed')+s(STAT_SVG,calcDefence(c),'Defence')+'</div>';
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
    const ptMSpec=(c.merits||[]).find(m=>m.name==='Professional Training');
    const ptFreeSpec=(ptMSpec&&ptMSpec.rating>=3)?2:0;
    const ptAssetSet=new Set((ptMSpec&&ptMSpec.rating>=3&&ptMSpec.asset_skills)?(ptMSpec.asset_skills||[]).filter(Boolean):[]);
    let _assetSp=0,_nonAssetSp=0;
    Object.entries(c.skills||{}).forEach(([sk,skillObj])=>{const cnt=(skillObj&&skillObj.specs)?skillObj.specs.length:0;if(ptAssetSet.has(sk))_assetSp+=cnt;else _nonAssetSp+=cnt;});
    const ptFreeCov=Math.min(ptFreeSpec,_assetSp),paidSp=_nonAssetSp+Math.max(0,_assetSp-ptFreeCov);
    const specXP=Math.max(0,paidSp-3),scCls=paidSp>3?'sc-over':paidSp===3?'sc-full':'sc-val';
    h+='<div class="sh-spec-counter">Specialisations <span class="'+scCls+'">'+paidSp+' / 3 free</span>'+(ptFreeSpec?' + <span style="font-size:10px;color:var(--gold2)">'+ptFreeCov+' / '+ptFreeSpec+' PT (asset skills)</span>':'')+(specXP?' <span style="font-size:8px;color:var(--crim)">('+specXP+' XP)</span>':'')+'</div>';
  }
  h+='<div class="skills-3col">';
  if(editMode){
    for(let ri=0;ri<8;ri++){SKILL_COLS.forEach(col=>{
      const s=col[ri];
      const sk=getSkillObj(c,s),d=sk.dots,bn=sk.bonus,sp=(sk.specs||[]).join(', '),na=sk.nine_again,ptNa=c._pt_nine_again_skills&&c._pt_nine_again_skills.has(s),ohmNa=c._ohm_nine_again_skills&&c._ohm_nine_again_skills.has(s),ptBn=c._pt_dot4_bonus_skills&&c._pt_dot4_bonus_skills.has(s)?1:0,hasDots=d>0||bn>0||ptBn>0,dotStr=hasDots?shDotsWithBonus(d,bn+ptBn):'\u2013';
      h+='<div class="sk-edit-cell"><div class="sh-skill-row sk-edit'+(hasDots?' has-dots':'')+'"><div class="skill-name-wrap"><span class="sh-skill-name">'+s+'</span>'+(sp?'<span class="sh-skill-spec">'+formatSpecs(c,sk.specs)+'</span>':'')+'</div><div class="skill-dots-wrap"><span class="'+(hasDots?'sh-skill-dots':'sh-skill-zero')+'">'+dotStr+'</span>'+(na?'<span class="sh-skill-na">9-Again</span>':ptNa?'<span class="sh-skill-na pt-na">9-Again (PT)</span>':ohmNa?'<span class="sh-skill-na pt-na">9-Again (OHM)</span>':'')+'</div></div>';
      const cr=(c.skill_creation||{})[s]||{cp:0,free:0,xp:0},sE=s.replace(/'/g,"\\'"),sb=(cr.cp||0)+(cr.free||0),sxd=xpToDots(cr.xp||0,sb,2),st2=sb+sxd;
      const sFr=cr.free||0;
      h+='<div class="sk-bd-panel"><div class="sk-bd-row"><div class="bd-grp"><span class="bd-lbl" style="color:var(--gold2)">Fr</span> <span class="attr-bd-ro" style="color:var(--gold2)">'+sFr+'</span></div><div class="bd-grp"><span class="bd-lbl">CP</span> <input class="attr-bd-input" type="number" min="0" value="'+(cr.cp||0)+'" onchange="shEditSkillPt(\''+sE+'\',\'cp\',+this.value)"></div><div class="bd-grp"><span class="bd-lbl">XP</span> <input class="attr-bd-input" type="number" min="0" value="'+(cr.xp||0)+'" onchange="shEditSkillPt(\''+sE+'\',\'xp\',+this.value)"></div><div class="bd-eq"><span class="bd-val">'+st2+'</span></div></div>';
      const specs=sk.specs||[];
      h+='<div class="sk-spec-list">';
      specs.forEach((sp2,si)=>{h+='<div class="sk-spec-row"><input class="sk-spec-input" value="'+esc(sp2)+'" onchange="shEditSpec(\''+sE+'\','+si+',this.value)" placeholder="Specialisation">'+(hasAoE(c,sp2)?'<span style="color:rgba(140,200,140,.8);font-size:8px;font-family:var(--fh);white-space:nowrap">+2</span>':'')+'<button class="sk-spec-rm" onclick="shRemoveSpec(\''+sE+'\','+si+')" title="Remove">&times;</button></div>';});
      h+='<button class="sk-spec-add" onclick="shAddSpec(\''+sE+'\')">+ spec</button></div></div></div>';
    });}
  } else {
    for(let ri=0;ri<8;ri++){SKILL_COLS.forEach(col=>{
      const s=col[ri],sk=getSkillObj(c,s),d=sk.dots,bn=sk.bonus,sp=(sk.specs||[]).join(', '),na=sk.nine_again,ptNa=c._pt_nine_again_skills&&c._pt_nine_again_skills.has(s),ohmNa=c._ohm_nine_again_skills&&c._ohm_nine_again_skills.has(s),ptBn=c._pt_dot4_bonus_skills&&c._pt_dot4_bonus_skills.has(s)?1:0,hasDots=d>0||bn>0||ptBn>0,dotStr=hasDots?shDotsWithBonus(d,bn+ptBn):'\u2013';
      h+='<div class="sh-skill-row'+(hasDots?' has-dots':'')+'"><div class="skill-name-wrap"><span class="sh-skill-name">'+s+'</span>'+(sp?'<span class="sh-skill-spec">'+formatSpecs(c,sk.specs)+'</span>':'')+'</div><div class="skill-dots-wrap"><span class="'+(hasDots?'sh-skill-dots':'sh-skill-zero')+'">'+dotStr+'</span>'+(na?'<span class="sh-skill-na">9-Again</span>':ptNa?'<span class="sh-skill-na pt-na">9-Again (PT)</span>':ohmNa?'<span class="sh-skill-na pt-na">9-Again (OHM)</span>':'')+'</div></div>';
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
    const cr=(c.disc_creation||{})[d]||{cp:0,free:0,xp:0},dE=d.replace(/'/g,"\\'"),cm=isIC?3:4,db2=(cr.cp||0),xd=xpToDots(cr.xp||0,db2,cm),dt=db2+xd,ns=style?'style="'+style+'"':'';
    let h2='<div class="disc-tap-row disc-edit"><div class="disc-tap-left"><span class="disc-tap-name" '+ns+'>'+esc(d)+'</span>'+(isIC?'<span class="disc-clan-tag">in-clan</span>':'');
    if(r>0) h2+='<span class="disc-tap-dots">'+shDots(r)+'</span>';
    h2+='</div></div><div class="disc-bd-panel"><div class="disc-bd-row"><div class="bd-grp"><span class="bd-lbl">CP</span> <input class="attr-bd-input" type="number" min="0" value="'+(cr.cp||0)+'" onchange="shEditDiscPt(\''+dE+'\',\'cp\',+this.value)"></div><div class="bd-grp"><span class="bd-lbl">XP</span> <input class="attr-bd-input" type="number" min="0" value="'+(cr.xp||0)+'" onchange="shEditDiscPt(\''+dE+'\',\'xp\',+this.value)"></div><div class="bd-eq"><span class="bd-val">'+dt+'</span></div></div></div>';
    return h2;
  }
  if(editMode){
    const clanD=CLAN_DISCS[c.clan]||[],blD=BLOODLINE_DISCS[c.bloodline]||null,inCL=blD||clanD,dc=c.disc_creation||{};
    const iCP=Object.entries(dc).filter(([d])=>inCL.includes(d)).reduce((s,[,v])=>s+(v.cp||0),0),oCP=Object.entries(dc).filter(([d])=>!inCL.includes(d)).reduce((s,[,v])=>s+(v.cp||0),0),rem=3-iCP-oCP;
    h+='<div class="sh-sec"><div class="sh-sec-title">Disciplines'+_alertBadge(iCP<2||oCP>1||rem!==0?'red':null)+'</div><div class="disc-cp-counter"><span class="sh-cp-remaining'+(rem<0?' over':rem===0?' full':'')+'">'+rem+' CP</span><span style="color:'+(iCP>=2?'rgba(140,200,140,.8)':'rgba(200,80,80,.9)')+'">In-clan: '+iCP+' (min 2)</span><span style="color:'+(oCP<=1?'rgba(140,200,140,.8)':'rgba(200,80,80,.9)')+'">Out-of-clan: '+oCP+' (max 1)</span></div><div class="disc-list">';
    CORE_DISCS.forEach(d=>{h+=renderDiscEditRow(d,(c.disciplines||{})[d]||0,inCL.includes(d),null);});
    h+='</div></div>';
    const cn=(c.covenant||'').toLowerCase(),showCr=cn.includes('crone')||(c.disciplines||{}).Cruac>0,showTh=cn.includes('lancea')||(c.disciplines||{}).Theban>0;
    if(showCr||showTh){h+='<div class="sh-sec"><div class="sh-sec-title">Blood Sorcery</div><div class="disc-list">';if(showCr)h+=renderDiscEditRow('Cruac',(c.disciplines||{}).Cruac||0,false,'color:rgba(220,160,120,.9)');if(showTh)h+=renderDiscEditRow('Theban',(c.disciplines||{}).Theban||0,false,'color:rgba(220,160,120,.9)');h+='</div></div>';}
  } else if(c.disciplines&&Object.keys(c.disciplines).length){
    const de=Object.entries(c.disciplines),core=de.filter(([d])=>CORE_DISCS.includes(d)),rit=de.filter(([d])=>RITUAL_DISCS.includes(d));
    if(core.length){h+='<div class="sh-sec"><div class="sh-sec-title">Disciplines</div><div class="disc-list">';core.forEach(([d,r])=>{h+=renderDiscRow(d,r,null);});h+='</div></div>';}
    if(rit.length){h+='<div class="sh-sec"><div class="sh-sec-title">Blood Sorcery</div><div class="disc-list">';rit.forEach(([d,r])=>{h+=renderDiscRow(d,r,'color:rgba(220,160,120,.9)');});h+='</div></div>';}
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
  const cruacDots=(c.disciplines||{}).Cruac||0, thebanDots=(c.disciplines||{}).Theban||0;
  const hasSorcery=cruacDots>0||thebanDots>0;
  if(editMode?hasSorcery:ritP.length){
    const cruacPool=cruacDots*2, thebanPool=thebanDots*2;
    const cruacFreeUsed=ritP.filter(p=>p.tradition==='Cruac'&&p.free).length;
    const thebanFreeUsed=ritP.filter(p=>p.tradition==='Theban'&&p.free).length;
    const _riteOver=cruacFreeUsed>cruacPool||thebanFreeUsed>thebanPool;
    const _riteBadge=editMode?_alertBadge(_riteOver?'red':cruacFreeUsed<cruacPool||thebanFreeUsed<thebanPool?'yellow':null):'';
    h+='<div class="sh-sec"><div class="sh-sec-title">Rites'+_riteBadge+'</div>';
    if(editMode){
      h+='<div class="grant-pools">';
      if(cruacDots>0){const cls=cruacFreeUsed>cruacPool?' sc-over':cruacFreeUsed===cruacPool?' sc-full':' sc-val';h+='<div class="grant-pool-row"><span style="color:rgba(220,160,120,.9)">Cruac</span> free rites <span class="'+cls+'">'+cruacFreeUsed+'/'+cruacPool+'</span><span style="font-size:9px;color:var(--txt3);margin-left:6px">rank \u2264 '+cruacDots+'</span></div>';}
      if(thebanDots>0){const cls=thebanFreeUsed>thebanPool?' sc-over':thebanFreeUsed===thebanPool?' sc-full':' sc-val';h+='<div class="grant-pool-row"><span style="color:rgba(220,160,120,.9)">Theban</span> free rites <span class="'+cls+'">'+thebanFreeUsed+'/'+thebanPool+'</span><span style="font-size:9px;color:var(--txt3);margin-left:6px">rank \u2264 '+thebanDots+'</span></div>';}
      h+='</div>';
    }
    h+='<div class="disc-list">';
    const allPw=c.powers||[];
    ritP.forEach(p=>{
      const pi=allPw.indexOf(p);
      const gid='rite'+c.name.replace(/[^a-z]/gi,'')+pi;
      const xpCost=p.free?0:(p.level>=4?2:1);
      if(editMode){
        const discDots=p.tradition==='Cruac'?cruacDots:thebanDots;
        const usedFree=p.tradition==='Cruac'?cruacFreeUsed:thebanFreeUsed;
        const freePool=p.tradition==='Cruac'?cruacPool:thebanPool;
        const canFree=!p.free&&p.level<=discDots&&usedFree<freePool;
        const freeLbl=p.free?'Free':(xpCost+' XP');
        const freeCls=p.free?'rite-free-badge':'rite-xp-badge';
        h+='<div class="disc-tap-row disc-edit" id="disc-row-'+gid+'" onclick="toggleDisc(\''+gid+'\')"><div class="disc-tap-left"><span class="disc-tap-name" style="color:rgba(220,160,120,.9)">'+esc(p.name)+'</span><span class="disc-tap-dots" style="margin-left:6px;color:rgba(220,160,120,.75)">'+shDots(p.level)+'</span><span style="font-family:var(--fh);font-size:10px;color:var(--txt3);margin-left:6px">'+esc(p.tradition)+'</span></div><div style="display:flex;align-items:center;gap:4px"><button class="'+freeCls+'" onclick="event.stopPropagation();shToggleRiteFree('+pi+')"'+(p.free||canFree?'':' disabled title="rank exceeds '+p.tradition+' dots or pool full"')+'>'+freeLbl+'</button><span class="disc-tap-arr">\u203A</span><button class="dev-rm-btn" onclick="event.stopPropagation();shRemoveRite('+pi+')" title="Remove">&times;</button></div></div><div class="disc-drawer" id="disc-drawer-'+gid+'"><div class="disc-power">'+(p.stats?'<div class="disc-power-stats">'+esc(p.stats)+'</div>':'')+'<div class="disc-power-effect">'+esc(p.effect||'')+'</div></div></div>';
      } else {
        h+='<div class="disc-tap-row" id="disc-row-'+gid+'" onclick="toggleDisc(\''+gid+'\')"><div class="disc-tap-left"><span class="disc-tap-name" style="color:rgba(220,160,120,.9)">'+esc(p.name)+'</span><span class="disc-tap-dots" style="margin-left:6px;color:rgba(220,160,120,.75)">'+shDots(p.level)+'</span><span style="font-family:var(--fh);font-size:10px;color:var(--txt3);margin-left:6px">'+esc(p.tradition)+'</span>'+(p.free===false?'<span style="font-size:9px;color:var(--txt3);margin-left:6px">'+xpCost+' XP</span>':'')+'</div><span class="disc-tap-arr">\u203A</span></div><div class="disc-drawer" id="disc-drawer-'+gid+'"><div class="disc-power">'+(p.stats?'<div class="disc-power-stats">'+esc(p.stats)+'</div>':'')+'<div class="disc-power-effect">'+esc(p.effect||'')+'</div></div></div>';
      }
    });
    if(editMode){
      const trads=[];
      if(cruacDots>0)trads.push('Cruac');
      if(thebanDots>0)trads.push('Theban');
      if(trads.length){
        const tradSel=trads.length>1?'<select id="rite-add-trad" class="gen-qual-input" style="width:90px">'+trads.map(t=>'<option>'+t+'</option>').join('')+'</select>':'<span style="font-size:11px;color:rgba(220,160,120,.9);padding:0 4px">'+trads[0]+'</span><input type="hidden" id="rite-add-trad" value="'+trads[0]+'">';
        h+='<div class="dev-add-row" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><input type="text" id="rite-add-name" class="gen-qual-input" placeholder="Rite name\u2026" style="flex:1;min-width:120px"><select id="rite-add-level" class="gen-qual-input" style="width:80px">'+[1,2,3,4,5].map(r=>'<option value="'+r+'">\u25CF'.repeat(r)+'</option>').join('')+'</select>'+tradSel+'<button class="dev-add-btn" onclick="shAddRite(document.getElementById(\'rite-add-trad\').value,document.getElementById(\'rite-add-name\').value,+document.getElementById(\'rite-add-level\').value)">+ Add</button></div>';
      }
    }
    h+='</div></div>';
  }
  // Pacts
  const pctP=(c.powers||[]).filter(p=>p.category==='pact');
  if(pctP.length||editMode){
    const _oathDB=Object.fromEntries(Object.entries(MERITS_DB||{}).filter(([,v])=>v.type==='Invictus Oath'));
    const _toTitle=s=>s.replace(/\b\w/g,ch=>ch.toUpperCase());
    const _allSkillOpts=ALL_SKILLS.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
    const _charNames=(state.chars||[]).filter(ch=>ch.name&&ch.name!==c.name).map(ch=>'<option value="'+esc(ch.name)+'">'+esc(ch.name)+'</option>').join('');
    h+='<div class="sh-sec"><div class="sh-sec-title">Pacts</div><div class="disc-list">';
    pctP.forEach((p,i)=>{
      const realPi=(c.powers||[]).indexOf(p);
      const gid='pact'+c.name.replace(/[^a-z]/gi,'')+i;
      const isOHM=(p.name||'').toLowerCase()==='oath of the hard motherfucker';
      const isSW=(p.name||'').toLowerCase()==='oath of the safe word';
      const dbEntry=_oathDB[(p.name||'').toLowerCase()];
      const effect=p.effect||(dbEntry&&dbEntry.desc)||'';
      const reqDots=dbEntry&&dbEntry.rating?parseInt(dbEntry.rating)||0:0;
      if(editMode){
        const pcp=p.cp||0,pxp=p.xp||0,ptotal=pcp+pxp;
        const ptColor=ptotal>=reqDots&&(reqDots===0||ptotal===reqDots)?'var(--gold2)':ptotal>0?'var(--err)':'var(--txt3)';
        h+='<div class="pact-edit-block">'
          +'<div class="pact-edit-hdr">'
          +'<span class="disc-tap-name" style="font-size:12px;color:var(--txt2)">'+esc(_toTitle(p.name))+'</span>'
          +(reqDots?'<span class="pact-req-dots">\u25CF'.repeat(reqDots)+' required</span>':'')
          +'<div class="pact-cp-xp">'
          +'<span class="bd-lbl">CP</span><input class="merit-bd-input" type="number" min="0" value="'+pcp+'" onchange="shEditPact('+realPi+',\'cp\',+this.value)" style="width:36px">'
          +'<span class="bd-lbl">XP</span><input class="merit-bd-input" type="number" min="0" value="'+pxp+'" onchange="shEditPact('+realPi+',\'xp\',+this.value)" style="width:36px">'
          +'<span style="font-size:11px;color:'+ptColor+'">= '+ptotal+' dot'+(ptotal===1?'':'s')+'</span>'
          +'</div>'
          +'<button class="dev-rm-btn" onclick="shRemovePact('+realPi+')" title="Remove oath">&times;</button>'
          +'</div>';
        // OHM-specific controls
        if(isOHM){
          const sk0=(p.ohm_skills&&p.ohm_skills[0])||'';
          const sk1=(p.ohm_skills&&p.ohm_skills[1])||'';
          const ohmSphere=p.ohm_allies_sphere||'';
          const _alliesMerits=(c.merits||[]).filter(m=>m.category==='influence'&&m.name==='Allies'&&m.area);
          const _alliesOpts=_alliesMerits.map(m=>'<option value="'+esc(m.area)+'"'+((m.area||'').toLowerCase()===ohmSphere.toLowerCase()?' selected':'')+'>'+esc(m.area)+'</option>').join('');
          h+='<div class="pact-controls">'
            +'<div class="pact-ctrl-row"><span class="pact-ctrl-lbl">Auto grants:</span><span style="color:var(--gold2)">+1 Contacts, +1 Resources</span></div>'
            +'<div class="pact-ctrl-row"><span class="pact-ctrl-lbl">+1 Allies:</span>'
            +(_alliesMerits.length
              ? '<select class="gen-qual-input" style="width:180px" onchange="shEditPact('+realPi+',\'ohm_allies_sphere\',this.value)"><option value="">-- pick Allies merit --</option>'+_alliesOpts+'</select>'
              : '<span style="font-size:10px;color:var(--txt3);font-style:italic">Add an Allies merit first</span>')
            +'</div>'
            +'<div class="pact-ctrl-row"><span class="pact-ctrl-lbl">9-Again skills:</span>'
            +'<select class="gen-qual-input" style="width:120px" onchange="shEditPact('+realPi+',\'ohm_skill_0\',this.value)"><option value="">-- skill 1 --</option>'+_allSkillOpts.replace('value="'+esc(sk0)+'"','value="'+esc(sk0)+'" selected')+'</select>'
            +'<select class="gen-qual-input" style="width:120px" onchange="shEditPact('+realPi+',\'ohm_skill_1\',this.value)"><option value="">-- skill 2 --</option>'+_allSkillOpts.replace('value="'+esc(sk1)+'"','value="'+esc(sk1)+'" selected')+'</select>'
            +'</div>'
            +'</div>';
        }
        // Safe Word-specific controls
        if(isSW){
          const partner=p.partner||'';
          const sharedMerit=p.shared_merit||'';
          const partnerChar=partner?(state.chars||[]).find(ch=>ch.name===partner):null;
          const partnerHasSW=partnerChar&&(partnerChar.powers||[]).some(pp=>pp.category==='pact'&&(pp.name||'').toLowerCase()==='oath of the safe word'&&pp.partner===c.name);
          h+='<div class="pact-controls">'
            +'<div class="pact-ctrl-row"><span class="pact-ctrl-lbl">Partner:</span>'
            +'<select class="gen-qual-input" style="width:160px" onchange="shEditPact('+realPi+',\'partner\',this.value)"><option value="">-- select character --</option>'+_charNames.replace('value="'+esc(partner)+'"','value="'+esc(partner)+'" selected')+'</select>'
            +(partner&&!partnerHasSW?'<span style="font-size:10px;color:var(--txt3);font-style:italic;margin-left:4px">partner must also take this oath</span>':'')
            +(partnerHasSW?'<span style="font-size:10px;color:var(--gold2);margin-left:4px">\u2713 mutually linked</span>':'')
            +'</div>'
            +'<div class="pact-ctrl-row"><span class="pact-ctrl-lbl">Shared Social Merit:</span>'
            +'<input class="gen-qual-input" style="width:180px" type="text" value="'+esc(sharedMerit)+'" placeholder="e.g. Striking Looks\u2026" onchange="shEditPact('+realPi+',\'shared_merit\',this.value)">'
            +'</div>'
            +'</div>';
        }
        h+='</div>';
      } else {
        h+='<div class="disc-tap-row" id="disc-row-'+gid+'" onclick="toggleDisc(\''+gid+'\')">'
          +'<div class="disc-tap-left"><span class="disc-tap-name" style="color:var(--txt2)">'+esc(_toTitle(p.name))+'</span>'
          +(isOHM&&p.ohm_allies_sphere?'<span style="font-size:11px;color:var(--txt3);margin-left:8px">Allies: '+esc(p.ohm_allies_sphere)+'</span>':'')
          +(isOHM&&p.ohm_skills&&p.ohm_skills.filter(Boolean).length?'<span style="font-size:11px;color:var(--txt3);margin-left:8px">9-again: '+p.ohm_skills.filter(Boolean).map(esc).join(', ')+'</span>':'')
          +(isSW&&p.partner?'<span style="font-size:11px;color:var(--txt3);margin-left:8px">w/ '+esc(p.partner)+(p.shared_merit?' | '+esc(p.shared_merit):'')+'</span>':'')
          +'</div><span class="disc-tap-arr">\u203A</span></div>'
          +'<div class="disc-drawer" id="disc-drawer-'+gid+'"><div class="disc-power">'
          +(p.stats?'<div class="disc-power-stats">'+esc(p.stats)+'</div>':'')
          +'<div class="disc-power-effect">'+esc(effect)+'</div>'
          +'</div></div>';
      }
    });
    if(editMode){
      const _takenOaths=new Set(pctP.map(p=>(p.name||'').toLowerCase()));
      const _addableOaths=Object.keys(_oathDB).filter(k=>!_takenOaths.has(k));
      h+='<div class="dev-add-row" style="display:flex;gap:6px;align-items:center">'
        +'<select id="pact-add-sel" class="gen-qual-input" style="flex:1;min-width:200px">'
        +'<option value="">-- select oath to add --</option>'
        +_addableOaths.map(k=>{const db=_oathDB[k];const dots=db&&db.rating?parseInt(db.rating)||0:0;return'<option value="'+esc(k)+'">'+esc(_toTitle(k))+(dots?' (\u25CF'.repeat(dots)+')':'')+'</option>';}).join('')
        +'</select>'
        +'<button class="dev-add-btn" onclick="shAddPact(document.getElementById(\'pact-add-sel\').value)">+ Add Oath</button>'
        +'</div>';
    }
    h+='</div></div>';
  }
  return h;
}

export function shRenderInfluenceMerits(c,editMode) {
  const inflM=(c.merits||[]).filter(m=>m.category==='influence');
  if(!editMode&&!inflM.length) return '';
  const totalInfl=calcTotalInfluence(c);
  const _inflVmPools=(c._grant_pools||[]).filter(p=>p.category==='vm');
  const _inflOhmPools=(c._grant_pools||[]).filter(p=>p.category==='ohm');
  const _inflInvPools=(c._grant_pools||[]).filter(p=>p.category==='inv');
  let _inflAlert=null;
  _inflVmPools.forEach(p=>{const u=vmAlliesUsed(c);if(u>p.amount)_inflAlert='red';else if(u<p.amount&&_inflAlert!=='red')_inflAlert='yellow';});
  _inflOhmPools.forEach(p=>{const u=ohmUsed(c);if(u>p.amount)_inflAlert='red';else if(u<p.amount&&_inflAlert!=='red')_inflAlert='yellow';});
  _inflInvPools.forEach(p=>{const u=investedUsed(c);if(u>p.amount)_inflAlert='red';else if(u<p.amount&&_inflAlert!=='red')_inflAlert='yellow';});
  const _inflBadge=editMode?_alertBadge(_inflAlert):'';
  let h='<div class="sh-sec"><div class="sh-sec-subtitle">Influence Merits'+_inflBadge+'</div><div class="merit-list">';
  if(editMode){
    // All non-Contacts influence merits
    const _inflMciPool=(c.merits||[]).filter(m=>m.name==='Mystery Cult Initiation'&&m.active!==false).reduce((s,m)=>s+mciPoolTotal(m),0);
    const _inflHasVM=hasViralMythology(c);
    const _inflHasLK=hasLorekeeper(c);
    const _inflHasINV=hasInvested(c);
    const _invMerits=new Set(['Herd','Mentor','Resources','Retainer']);
    const nonContacts=inflM.filter(m=>m.name!=='Contacts');
    nonContacts.forEach(m=>{const idx=inflM.indexOf(m),inf=calcMeritInfluence(m),tOpts=INFLUENCE_MERIT_TYPES.map(t=>'<option'+(m.name===t?' selected':'')+'>'+t+'</option>').join(''),rIdx=c.merits.indexOf(m),mc=(c.merit_creation&&c.merit_creation[rIdx])||{cp:0,free:0,free_mci:0,free_vm:0,free_lk:0,free_ohm:0,free_inv:0,xp:0},dd=(mc.cp||0)+(mc.free||0)+(mc.free_mci||0)+(mc.free_vm||0)+(mc.free_lk||0)+(mc.free_ohm||0)+(mc.free_inv||0)+(mc.xp||0);
      h+='<div class="infl-edit-row"><select class="infl-type" onchange="shEditInflMerit('+idx+',\'name\',this.value);renderSheet(chars[editIdx])">'+tOpts+'</select>'+_inflArea(m,idx,false)+'<span class="infl-dots-derived">'+shDots(dd)+'</span><span class="infl-inf">'+(inf?'<span class="inf-val">'+inf+'</span> inf':'')+'</span>';
      if(m.granted_by) h+='<span class="gen-granted-tag">'+esc(m.granted_by)+'</span>';
      h+='<button class="dev-rm-btn" onclick="shRemoveInflMerit('+idx+')" title="Remove">&times;</button></div>';
      h+=meritBdRow(rIdx,mc,meritFixedRating(m.name),{showMCI:_inflMciPool>0,showVM:_inflHasVM&&m.name==='Allies',showLK:_inflHasLK&&m.name==='Retainer',showINV:_inflHasINV&&_invMerits.has(m.name)});h+=_prereqWarn(c,m.name);});
    // Contacts: single entry with sphere-per-dot
    const contactsEntry=inflM.find(m=>m.name==='Contacts');
    const cInf=calcContactsInfluence(c);
    if(contactsEntry){
      const cIdx=c.merits.indexOf(contactsEntry),cMc=(c.merit_creation&&c.merit_creation[cIdx])||{cp:0,free:0,free_mci:0,free_vm:0,free_ohm:0,free_pt:0,xp:0},rating=contactsEntry.rating||0,spheres=contactsEntry.spheres||[],frDots=cMc.free||0,baseDots=(cMc.cp||0)+(cMc.xp||0),spOpts=s=>INFLUENCE_SPHERES.map(sp=>'<option'+(s===sp?' selected':'')+'>'+sp+'</option>').join('');
      h+='<div class="contacts-edit-block"><div class="contacts-edit-hdr">Contacts '+shDots(rating)+(cInf?' \u2014 <span class="inf-val">'+cInf+'</span> inf':'')+'</div>';
      h+=meritBdRow(cIdx,cMc,meritFixedRating(contactsEntry.name),{showMCI:_inflMciPool>0});
      if(cMc.free_pt)h+='<div style="font-size:10px;color:var(--gold2);padding:2px 8px">PT Bonus: +'+cMc.free_pt+' dots (auto) \u2014 removed if PT is removed</div>';
      for(let d=0;d<rating;d++){
        const sp=spheres[d]||'';
        let src='';
        if(d<baseDots) src='base';
        else src='granted';
        h+='<div class="contacts-dot-row"><span class="contacts-dot-num">\u25CF '+(d+1)+'</span><select class="contacts-sphere-sel" onchange="shEditContactSphere('+cIdx+','+d+',this.value)"><option value="">\u2014 sphere \u2014</option>'+spOpts(sp)+'</select>'+(src!=='base'?'<span class="contacts-dot-src">'+src+'</span>':'')+'</div>';
      }
      h+='</div>';
    }
    h+='<div class="dev-add-row"><button class="dev-add-btn" onclick="shAddInflMerit(\'Allies\')">+ Add Allies / Other</button></div>';
    h+='<div class="infl-total">Total Influence: <span class="inf-n">'+totalInfl+'</span></div>';
  } else {
    inflM.filter(m=>m.name!=='Contacts').forEach((m,idx)=>{const area=(m.area||'').trim()||null,gt=m.name==='Retainer'&&m.ghoul?' (ghoul)':'',tags=m._grant_sources||[],gb=tags.length?(' <span class="gen-granted-tag-view">'+tags.join(', ')+'</span>'):'';
      const iRIdx=c.merits.indexOf(m),iMc=(c.merit_creation&&c.merit_creation[iRIdx])||{};
      const iPurch=(iMc.cp||0)+(iMc.xp||0),iBon=(iMc.free||0)+(iMc.free_mci||0)+(iMc.free_vm||0);
      h+=shRenderMeritRow((area?m.name+' ('+area+gt+')':m.name+gt)+(m.rating?' '+shDots(m.rating):'')+gb,'infl',idx,shDotsMixed(iPurch,iBon));});
    const ce=inflM.filter(m=>m.name==='Contacts');
    if(ce.length){const td=Math.min(5,ce.reduce((s,m)=>s+(m.rating||0),0));const allSp=[];ce.forEach(m=>{if(m.spheres&&m.spheres.length)allSp.push(...m.spheres);else if(m.area)allSp.push(m.area.trim());else if(m.qualifier)allSp.push(...m.qualifier.split(/,\s*/).filter(Boolean));});const sp=[...new Set(allSp)].join(', ');h+=shRenderMeritRow('Contacts'+(sp?' ('+sp+')':'')+(td?' '+shDots(td):''),'infl','contacts');}
    h+='<div class="infl-total">Total Influence: <span class="inf-n">'+totalInfl+'</span></div>';
  }
  h+='</div></div>';return h;
}
function _inflArea(m,idx,isC) {
  const spOpts=s=>INFLUENCE_SPHERES.map(sp=>'<option'+(s===sp?' selected':'')+'>'+sp+'</option>').join('');
  if(m.name==='Allies') return '<select class="infl-area" onchange="shEditInflMerit('+idx+',\'area\',this.value)"><option value="">\u2014 sphere \u2014</option>'+spOpts(m.area)+'</select>';
  if(isC) return '<span class="infl-area-fixed">'+esc(m.area||'\u2014')+'</span>';
  if(m.name==='Resources') return '<span class="infl-area-none"></span>';
  if(m.name==='Mentor') return '<input type="text" class="infl-area" value="'+esc(m.area||'')+'" placeholder="Mentor name" onchange="shEditInflMerit('+idx+',\'area\',this.value)">';
  if(m.name==='Retainer') return '<input type="text" class="infl-area" value="'+esc(m.area||'')+'" placeholder="Description" onchange="shEditInflMerit('+idx+',\'area\',this.value)"><label class="infl-ghoul-lbl"><input type="checkbox"'+(m.ghoul?' checked':'')+' onchange="shEditInflMerit('+idx+',\'ghoul\',this.checked)"> Ghoul</label>';
  if(m.name==='Staff') return '<input type="text" class="infl-area" value="'+esc(m.area||'')+'" placeholder="Area of expertise" onchange="shEditInflMerit('+idx+',\'area\',this.value)">';
  if(m.name==='Status'){const isNarrow=m.narrow||(m.area&&!INFLUENCE_SPHERES.includes(m.area));return '<button class="infl-mode-btn" onclick="shEditStatusMode('+idx+')" title="'+(isNarrow?'Switch to sphere':'Switch to narrow')+'">'+(isNarrow?'Sphere \u2195':'Narrow \u2195')+'</button>'+(isNarrow?'<input type="text" class="infl-area infl-area-narrow" value="'+esc(m.area||'')+'" placeholder="Narrow status" onchange="shEditInflMerit('+idx+',\'area\',this.value)">':'<select class="infl-area" onchange="shEditInflMerit('+idx+',\'area\',this.value)"><option value="">\u2014 sphere \u2014</option>'+spOpts(m.area)+'</select>');}
  return '<input type="text" class="infl-area" value="'+esc(m.area||'')+'" placeholder="Sphere / scope" onchange="shEditInflMerit('+idx+',\'area\',this.value)">';
}

export function shRenderDomainMerits(c,editMode) {
  const chars=state.chars,domM=(c.merits||[]).filter(m=>m.category==='domain');
  if(!editMode&&!domM.length) return '';
  const _domLkPools=(c._grant_pools||[]).filter(p=>p.category==='lk');
  const _domInvPools=(c._grant_pools||[]).filter(p=>p.category==='inv');
  let _domAlert=null;
  _domLkPools.forEach(p=>{const u=lorekeeperUsed(c);if(u>p.amount)_domAlert='red';else if(u<p.amount&&_domAlert!=='red')_domAlert='yellow';});
  _domInvPools.forEach(p=>{const u=investedUsed(c);if(u>p.amount)_domAlert='red';else if(u<p.amount&&_domAlert!=='red')_domAlert='yellow';});
  const _domBadge=editMode?_alertBadge(_domAlert):'';
  let h='<div class="sh-sec"><div class="sh-sec-subtitle">Domain Merits'+_domBadge+'</div><div class="merit-list">';
  if(editMode){
    const _domMciPool=(c.merits||[]).filter(m=>m.name==='Mystery Cult Initiation'&&m.active!==false).reduce((s,m)=>s+mciPoolTotal(m),0);
    const _hasLK=hasLorekeeper(c);const _hasINV=hasInvested(c);
    domM.forEach((m,di)=>{const hTk=domM.some((dm,dj)=>dm.name==='Herd'&&dj!==di),tOpts=DOMAIN_MERIT_TYPES.filter(t=>t!=='Herd'||!hTk||m.name==='Herd').map(t=>'<option'+(m.name===t?' selected':'')+'>'+esc(t)+'</option>').join(''),rIdx=c.merits.indexOf(m),mc=(c.merit_creation&&c.merit_creation[rIdx])||{cp:0,free:0,free_mci:0,free_vm:0,free_lk:0,free_inv:0,xp:0},dd=(mc.cp||0)+(mc.free||0)+(mc.free_mci||0)+(mc.free_vm||0)+(mc.free_lk||0)+(mc.free_inv||0)+(mc.xp||0),parts=m.shared_with||[],eT=domMeritTotal(c,m.name),avP=chars.filter(ch=>ch.name!==c.name&&!parts.includes(ch.name));
      h+='<div class="dom-edit-block"><div class="infl-edit-row"><select class="infl-type" onchange="shEditDomMerit('+di+',\'name\',this.value)">'+tOpts+'</select><span class="dom-contrib-lbl">My dots: '+shDots(dd)+'</span><span class="dom-total-lbl" title="Total across all contributors">Total: '+shDots(eT)+'</span><button class="dev-rm-btn" onclick="shRemoveDomMerit('+di+')" title="Remove">&times;</button></div>';
      const _isLKMerit=m.name==='Herd'||m.name==='Retainer';const _isINVMerit=m.name==='Herd';
      h+=meritBdRow(rIdx,mc,meritFixedRating(m.name),{showMCI:_domMciPool>0,showLK:_hasLK&&_isLKMerit,showINV:_hasINV&&_isINVMerit});h+=_prereqWarn(c,m.name);
      if(m.name==='Herd'&&hasViralMythology(c)){const vmB=vmHerdPool(c);if(vmB)h+='<div style="font-size:10px;color:var(--gold2);padding:2px 8px">VM Bonus: +'+vmB+' dots ('+shDots(vmB)+') \u2014 lost if VM removed</div>';}
      if(m.name==='Herd'){const ssjB=ssjHerdBonus(c);if(ssjB)h+='<div style="font-size:10px;color:var(--gdim);padding:2px 8px">SSJ Bonus: +'+ssjB+' dots ('+shDots(ssjB)+') \u2014 equals MCI dots</div>';}
      if(m.name==='Herd'){const flockB=flockHerdBonus(c);if(flockB)h+='<div style="font-size:10px;color:var(--gdim);padding:2px 8px">Flock Bonus: +'+flockB+' dots ('+shDots(flockB)+') \u2014 equals Flock rating, can exceed 5</div>';}
      if(m.name!=='Herd'&&parts.length){h+='<div class="dom-partners-row">';parts.forEach(pN=>{const p=chars.find(ch=>ch.name===pN),pD=p?domMeritShareable(p,m.name):0;h+='<span class="dom-partner-tag">'+esc(pN)+(pD?' '+shDots(pD):' \u25CB')+'<button class="dom-partner-rm" onclick="shRemoveDomainPartner('+di+',\''+pN.replace(/'/g,"\\'")+'\')">\u00D7</button></span>';});h+='</div>';}
      if(m.name!=='Herd'&&avP.length) h+='<div class="dom-add-partner-row"><select class="dom-partner-sel" onchange="if(this.value){shAddDomainPartner('+di+',this.value);this.value=\'\';}"><option value="">+ Add shared partner\u2026</option>'+avP.map(p=>'<option value="'+esc(p.name)+'">'+esc(p.name)+'</option>').join('')+'</select></div>';
      h+='</div>';});
    h+='<div class="dev-add-row"><button class="dev-add-btn" onclick="shAddDomMerit()">+ Add Domain Merit</button></div>';
  } else {
    domM.forEach(m=>{const dp=m.shared_with&&m.shared_with.length?m.shared_with:null,de=domMeritTotal(c,m.name),dO=domMeritContrib(c,m.name),dRIdx=c.merits.indexOf(m),dMc=(c.merit_creation&&c.merit_creation[dRIdx])||{},dPurch=Math.min(5,(dMc.cp||0)+(dMc.free||0)+(dMc.free_mci||0)+(dMc.free_vm||0)+(dMc.free_lk||0)+(dMc.free_inv||0)+(dMc.xp||0)),ssjB=!dp&&m.name==='Herd'?ssjHerdBonus(c):0,flockB=!dp&&m.name==='Herd'?flockHerdBonus(c):0;
      const dotHtml=(ssjB>0||flockB>0)?shDotsMixed(dPurch,Math.max(0,de-dPurch)):'<span class="merit-dots-sh">'+shDots(de)+'</span>';
      h+='<div class="merit-plain"><div style="flex:1"><div class="merit-name-sh">'+esc(m.name)+'</div>'+(dp?'<div class="merit-sub-sh dom-shared-lbl">Shared \u00B7 '+dp.map(n=>{const p=chars.find(ch=>ch.name===n),pd=p?domMeritShareable(p,m.name):0;return esc(n)+(pd?' '+shDots(pd):'');}).join(', ')+'</div>':'')+'</div><div style="text-align:right">'+(dp?'<div class="dom-total-view">'+shDots(de)+'</div><div class="dom-own-view">mine: '+shDots(dO)+'</div>':dotHtml)+'</div></div>';});
  }
  h+='</div></div>';return h;
}

export function shRenderStandingMerits(c,editMode) {
  const standM=(c.merits||[]).filter(m=>m.category==='standing');
  if(!editMode&&!standM.length) return '';
  let h='<div class="sh-sec"><div class="sh-sec-subtitle">Standing Merits</div><div class="merit-list">';
  const _standMciPool=(c.merits||[]).filter(m=>m.name==='Mystery Cult Initiation'&&m.active!==false).reduce((s,m)=>s+mciPoolTotal(m),0);
  standM.forEach((m,si)=>{const rIdx=c.merits.indexOf(m),mc=(c.merit_creation&&c.merit_creation[rIdx])||{cp:0,free:0,free_mci:0,free_vm:0,xp:0},dd=(mc.cp||0)+(mc.free||0)+(mc.free_mci||0)+(mc.free_vm||0)+(mc.xp||0);
    if(m.name==='Mystery Cult Initiation') h+=_renderMCI(c,m,si,rIdx,mc,dd,editMode);
    else if(m.name==='Professional Training') h+=_renderPT(c,m,si,rIdx,mc,dd,editMode,_standMciPool);
    else if(editMode){h+='<div class="infl-edit-row"><input type="text" class="gen-name-input" value="'+esc(m.name)+'" placeholder="Merit name" onchange="shEditStandMerit('+si+',\'name\',this.value)"><span class="infl-dots-derived">'+shDots(dd)+'</span></div>';h+=meritBdRow(rIdx,mc,meritFixedRating(m.name),{showMCI:_standMciPool>0});h+=_prereqWarn(c,m.name);}
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
function _renderMCI(c,m,si,rIdx,mc,dd,editMode) {
  const inactive=m.active===false,eDots=editMode?dd:m.rating;
  const dots=['\u25CF','\u25CF\u25CF','\u25CF\u25CF\u25CF','\u25CF\u25CF\u25CF\u25CF','\u25CF\u25CF\u25CF\u25CF\u25CF'];
  let h='<div class="mci-block'+(inactive?' mci-inactive':'')+'"><div class="mci-header"><div class="mci-title"><span class="merit-name-sh">'+esc(m.name)+'</span>';
  if(editMode) h+='<input type="text" class="stand-name-input" value="'+esc(m.cult_name||'')+'" placeholder="Cult name" onchange="shEditStandMerit('+si+',\'cult_name\',this.value)">';
  else if(m.cult_name) h+='<span class="merit-sub-sh mci-cult-name">'+esc(m.cult_name)+'</span>';
  h+='</div><div class="mci-header-right">';
  if(editMode){h+='<button class="mci-toggle-btn" onclick="shToggleMCI('+si+')" title="'+(inactive?'Activate cult':'Suspend cult')+'">'+(inactive?'Suspended':'Active')+'</button>';h+='<button class="dev-rm-btn" onclick="shRemoveStandMerit('+si+')" title="Remove MCI">\u00D7</button>';}
  else if(inactive) h+='<span class="mci-toggle-btn" style="opacity:0.5">Suspended</span>';
  h+='<span class="merit-dots-sh">'+shDots(eDots)+'</span></div></div>';
  if(editMode){
    h+=meritBdRow(rIdx,mc,meritFixedRating(m.name));h+=_prereqWarn(c,m.name);
    const d1c=m.dot1_choice||'merits',d3c=m.dot3_choice||'merits',d5c=m.dot5_choice||'merits';
    for(let d=0;d<5&&d<eDots;d++){
      h+='<div class="mci-benefit-row"><span class="mci-dot-lbl">'+dots[d]+'</span><div class="mci-dot-content">';
      if(d===0){
        h+='<button class="mci-choice-btn'+(d1c==='speciality'?' mci-choice-active':'')+'" onclick="shEditMCIDot('+si+',\'dot1_choice\',\'speciality\')">Speciality</button>';
        h+='<button class="mci-choice-btn'+(d1c==='merits'?' mci-choice-active':'')+'" onclick="shEditMCIDot('+si+',\'dot1_choice\',\'merits\')">1 Merit</button>';
        if(d1c==='speciality') h+='<input type="text" class="stand-name-input" value="'+esc(m.dot1_spec||'')+'" placeholder="Speciality" onchange="shEditMCIDot('+si+',\'dot1_spec\',this.value)">';
      } else if(d===1){
        h+='<span class="mci-benefit-text">1 merit dot</span>';
      } else if(d===2){
        h+='<button class="mci-choice-btn'+(d3c==='skill'?' mci-choice-active':'')+'" onclick="shEditMCIDot('+si+',\'dot3_choice\',\'skill\')">Skill Dot</button>';
        h+='<button class="mci-choice-btn'+(d3c==='merits'?' mci-choice-active':'')+'" onclick="shEditMCIDot('+si+',\'dot3_choice\',\'merits\')">2 Merits</button>';
        if(d3c==='skill') h+='<select class="pt-skill-sel" onchange="shEditMCIDot('+si+',\'dot3_skill\',this.value)"><option value="">'+(m.dot3_skill||'\u2014 skill \u2014')+'</option>'+ALL_SKILLS.map(sk=>'<option'+(m.dot3_skill===sk?' selected':'')+'>'+esc(sk)+'</option>').join('')+'</select>';
      } else if(d===3){
        h+='<span class="mci-benefit-text">3 merit dots</span>';
      } else if(d===4){
        h+='<button class="mci-choice-btn'+(d5c==='advantage'?' mci-choice-active':'')+'" onclick="shEditMCIDot('+si+',\'dot5_choice\',\'advantage\')">Advantage</button>';
        h+='<button class="mci-choice-btn'+(d5c==='merits'?' mci-choice-active':'')+'" onclick="shEditMCIDot('+si+',\'dot5_choice\',\'merits\')">3 Merits</button>';
        if(d5c==='advantage') h+='<input type="text" class="stand-name-input" value="'+esc(m.dot5_text||'')+'" placeholder="Advantage description" onchange="shEditMCIDot('+si+',\'dot5_text\',this.value)">';
      }
      h+='</div></div>';
    }
    const pool=mciPoolTotal(m);
    if(pool>0) h+='<div class="mci-pool-row"><span class="mci-pool-lbl">Merit Pool</span><span class="mci-pool-val">'+pool+' dot'+(pool===1?'':'s')+'</span><span class="mci-pool-hint">allocate via Fr in any merit or manoeuvre</span></div>';
  } else if(!inactive){
    const d1c=m.dot1_choice||'merits',d3c=m.dot3_choice||'merits',d5c=m.dot5_choice||'merits';
    for(let d=0;d<5&&d<m.rating;d++){
      let txt;
      if(d===0) txt=d1c==='speciality'?'Speciality'+(m.dot1_spec?' ('+m.dot1_spec+')':''):'1 merit dot';
      else if(d===1) txt='1 merit dot';
      else if(d===2) txt=d3c==='skill'?'Skill Dot'+(m.dot3_skill?' ('+m.dot3_skill+')':''):'2 merit dots';
      else if(d===3) txt='3 merit dots';
      else if(d===4) txt=d5c==='advantage'?'Advantage'+(m.dot5_text?' \u2014 '+m.dot5_text:''):'3 merit dots';
      h+='<div class="mci-benefit-row"><span class="mci-dot-lbl">'+dots[d]+'</span><span class="mci-benefit-text">'+esc(txt||'')+'</span></div>';
    }
  }
  h+='</div>';return h;
}
function _renderPT(c,m,si,rIdx,mc,dd,editMode,mciPool=0) {
  const as=m.asset_skills||[],eDots=editMode?dd:m.rating;
  const dots=['\u25CF','\u25CF\u25CF','\u25CF\u25CF\u25CF','\u25CF\u25CF\u25CF\u25CF','\u25CF\u25CF\u25CF\u25CF\u25CF'];
  const _skSel=(slotIdx,label)=>{const cur=as[slotIdx]||'';return'<select class="pt-skill-sel" onchange="shEditStandAssetSkill('+si+','+slotIdx+',this.value)"><option value="">'+(cur||label)+'</option>'+ALL_SKILLS.map(sk=>'<option'+(cur===sk?' selected':'')+'>'+esc(sk)+'</option>').join('')+'</select>';};
  let h='<div class="pt-block"><div class="pt-header"><span class="merit-name-sh">'+esc(m.name)+'</span>';
  if(editMode) h+='<input type="text" class="stand-name-input" value="'+esc(m.role||'')+'" placeholder="Role" onchange="shEditStandMerit('+si+',\'role\',this.value)">';
  else if(m.role) h+='<span class="merit-sub-sh">'+esc(m.role)+'</span>';
  h+='<span class="merit-dots-sh">'+shDots(eDots)+'</span></div>';
  if(editMode){
    h+=meritBdRow(rIdx,mc,meritFixedRating(m.name),{showMCI:mciPool>0});
    h+=_prereqWarn(c,m.name);
    h+='<div class="pt-skills-edit">';
    if(eDots>=1) h+='<div class="mci-benefit-row"><span class="mci-dot-lbl">\u25CF</span><span class="mci-benefit-text">Networking: 2 free Contacts'+(m.role?' ('+esc(m.role)+')':'')+'</span></div>';
    if(eDots>=2){
      h+='<div class="mci-benefit-row"><span class="mci-dot-lbl">\u25CF\u25CF</span><div><span class="mci-benefit-text">Continuing Education: 9-Again on Asset Skills</span><div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">'+_skSel(0,'\u2014 skill 1 \u2014')+_skSel(1,'\u2014 skill 2 \u2014')+'</div></div></div>';
    }
    if(eDots>=3){
      const ptAssetSet3=new Set(as.filter(Boolean));
      const _assetSp3=Object.entries(c.skills||{}).filter(([sk])=>ptAssetSet3.has(sk)).reduce((s,[,sk])=>s+(sk.specs?sk.specs.length:0),0);
      const ptFreeCov3=Math.min(2,_assetSp3);
      h+='<div class="mci-benefit-row"><span class="mci-dot-lbl">\u25CF\u25CF\u25CF</span><div><span class="mci-benefit-text">Breadth of Knowledge: 3rd Asset Skill + 2 PT Specialisations (Asset Skills only)</span><div style="display:flex;gap:6px;margin-top:4px;align-items:center">'+_skSel(2,'\u2014 3rd skill \u2014')+'<span style="font-size:10px;color:var(--gold2)">PT specs: '+ptFreeCov3+' / 2 used</span></div></div></div>';
    }
    if(eDots>=4){
      const dot4=m.dot4_skill||'',validAs=as.filter(Boolean);
      h+='<div class="mci-benefit-row"><span class="mci-dot-lbl">\u25CF\u25CF\u25CF\u25CF</span><div><span class="mci-benefit-text">On the Job Training: +1 dot in an Asset Skill</span><div style="display:flex;gap:4px;margin-top:4px"><select class="pt-skill-sel" onchange="shEditStandMerit('+si+',\'dot4_skill\',this.value)"><option value="">'+(dot4||'\u2014 choose \u2014')+'</option>'+validAs.map(sk=>'<option'+(dot4===sk?' selected':'')+'>'+esc(sk)+'</option>').join('')+'</select></div></div></div>';
    }
    if(eDots>=5) h+='<div class="mci-benefit-row"><span class="mci-dot-lbl">\u25CF\u25CF\u25CF\u25CF\u25CF</span><span class="mci-benefit-text">The Routine: spend 1 WP for Rote quality on any Asset Skill action</span></div>';
    h+='</div>';
  } else {
    if(as.filter(Boolean).length) h+='<div class="pt-assets">'+as.filter(Boolean).map(s=>'<span class="pt-skill-tag">'+esc(s)+'</span>').join('')+'</div>';
    const PT_BENEFITS=[
      'Networking: 2 dots Contacts ('+(m.role||'field')+')',
      'Continuing Education: 9-Again on Asset Skills ('+as.slice(0,2).filter(Boolean).join(', ')+')',
      'Breadth of Knowledge: 3rd Asset Skill + 2 PT Specialisations (Asset Skills only)',
      'On the Job Training: +1 dot in '+(m.dot4_skill?esc(m.dot4_skill):'an Asset Skill'),
      'The Routine: spend 1 WP for Rote quality on any Asset Skill action'
    ];
    for(let d=0;d<eDots&&d<5;d++) h+='<div class="mci-benefit-row"><span class="mci-dot-lbl">'+dots[d]+'</span><span class="mci-benefit-text">'+PT_BENEFITS[d]+'</span></div>';
  }
  h+='</div>';return h;
}

export function shRenderGeneralMerits(c,editMode) {
  const oM=(c.merits||[]).filter(m=>m.category==='general');
  if(!editMode&&!oM.length) return '';
  const bpCP=(c.bp_creation&&c.bp_creation.cp)||0;
  const meritCPUsed=(c.merit_creation||[]).reduce((s,mc)=>s+(mc?mc.cp||0:0),0)+(c.fighting_styles||[]).reduce((s,fs)=>s+(fs.cp||0),0)+(c.powers||[]).filter(p=>p.category==='pact').reduce((s,p)=>s+(p.cp||0),0)+bpCP;
  const meritCPRem=10-meritCPUsed;
  const meritCPCls=meritCPRem<0?' over':meritCPRem===0?' full':'';
  let _meritAlert=meritCPRem<0?'red':null;
  for(const _p of (c._grant_pools||[]).filter(_p2=>_p2.category==='any')){const _u=getMCIPoolUsed(c);if(_u>_p.amount){_meritAlert='red';break;}else if(_u<_p.amount&&_meritAlert!=='red')_meritAlert='yellow';}
  const _meritBadge=editMode?_alertBadge(_meritAlert):'';
  let h='<div class="sh-sec"><div class="sh-sec-title">Merits'+_meritBadge+'</div><div class="merit-list">';
  if(editMode){
    h+='<div class="sh-merit-cp-row"><span class="sh-cp-remaining'+meritCPCls+'">'+meritCPUsed+' / 10 CP</span><span class="sh-merit-cp-lbl"> creation points used</span><span class="sh-bp-cp-row">BP: <input class="attr-bd-input sh-bp-cp-input" type="number" min="0" value="'+bpCP+'" onchange="shEditBPCreation(+this.value)"> CP</span></div>';
    h+=_renderPoolCounters(c,'general')+_renderPoolCounters(c,'influence')+_renderPoolCounters(c,'domain');
    const _genMciPool=(c.merits||[]).filter(m=>m.name==='Mystery Cult Initiation'&&m.active!==false).reduce((s,m)=>s+mciPoolTotal(m),0);
    const _KERBEROS_ASPECTS=['Monstrous','Competitive','Seductive'];
    oM.forEach((m,gi)=>{const rIdx=c.merits.indexOf(m),mc=(c.merit_creation&&c.merit_creation[rIdx])||{cp:0,free:0,free_mci:0,free_vm:0,xp:0},dd=(mc.cp||0)+(mc.free||0)+(mc.free_mci||0)+(mc.free_vm||0)+(mc.xp||0),isAoE=m.name==='Area of Expertise',isIS=m.name==='Interdisciplinary Specialty',isFT=m.name==='Fucking Thief',isKerberos=m.name==='Three Heads of Kerberos',nSp=isAoE||isIS,cSp=Object.values(c.skills||{}).flatMap(sk=>sk.specs||[]);
      if(m.granted_by){h+='<div class="gen-edit-row gen-granted-row"><span class="gen-granted-name">'+esc(m.name)+(m.qualifier?' ('+esc(m.qualifier)+')':'')+'</span><span class="infl-dots-derived">'+shDots(dd)+'</span><span class="gen-granted-tag" title="Granted by '+esc(m.granted_by)+'">'+esc(m.granted_by)+'</span></div>';h+=meritBdRow(rIdx,mc,meritFixedRating(m.name),{showMCI:_genMciPool>0});h+=_prereqWarn(c,m.name);}
      else{h+='<div class="gen-edit-row"><select class="gen-name-select" onchange="shEditGenMerit('+gi+',\'name\',this.value)">'+buildMeritOptions(c,m.name||'')+'</select>';
        if(isFT) h+='<select class="gen-qual-input" onchange="shEditGenMerit('+gi+',\'qualifier\',this.value)">'+buildFThiefOptions(m.qualifier||'')+'</select>';
        else if(isKerberos) h+='<select class="gen-qual-input" onchange="shEditGenMerit('+gi+',\'qualifier\',this.value)"><option value="">'+(m.qualifier||'\u2014 Aspect \u2014')+'</option>'+_KERBEROS_ASPECTS.map(a=>'<option'+(m.qualifier===a?' selected':'')+'>'+a+'</option>').join('')+'</select>';
        else if(nSp&&cSp.length) h+='<select class="gen-qual-input" onchange="shEditGenMerit('+gi+',\'qualifier\',this.value)"><option value="">'+(m.qualifier||'\u2014 spec \u2014')+'</option>'+cSp.map(sp=>'<option'+(m.qualifier===sp?' selected':'')+'>'+esc(sp)+'</option>').join('')+'</select>';
        else h+='<input type="text" class="gen-qual-input" value="'+esc(m.qualifier||'')+'" placeholder="Qualifier" onchange="shEditGenMerit('+gi+',\'qualifier\',this.value)">';
        h+='<span class="infl-dots-derived">'+shDots(dd)+'</span><button class="dev-rm-btn" onclick="shRemoveGenMerit('+gi+')" title="Remove">&times;</button></div>';h+=meritBdRow(rIdx,mc,meritFixedRating(m.name),{showMCI:_genMciPool>0});h+=_prereqWarn(c,m.name);}});
    h+='<div class="dev-add-row"><button class="dev-add-btn" onclick="shAddGenMerit()">+ Add Merit</button></div>';
  } else {
    oM.forEach((m,i)=>{const qual=m.qualifier?' ('+m.qualifier+')':'';
      const pw=_prereqWarn(c,m.name);
      const rIdx=c.merits.indexOf(m),mc2=(c.merit_creation&&c.merit_creation[rIdx])||{};
      const purch=(mc2.cp||0)+(mc2.xp||0),bon=(mc2.free||0)+(mc2.free_mci||0)+(mc2.free_vm||0);
      const dotH=shDotsMixed(purch,bon);
      if(m.granted_by){const gb=m.granted_by==='Mystery Cult Initiation'?'MCI':m.granted_by==='Professional Training'?'PT':m.granted_by;h+='<div class="merit-plain'+(pw?' merit-prereq-fail':'')+'"><div style="flex:1"><div class="merit-name-sh">'+esc(m.name)+esc(qual)+'</div></div><span class="gen-granted-tag-view" title="Granted by '+esc(m.granted_by)+'">'+esc(gb)+'</span>'+dotH+'</div>'+pw;}
      else{h+=shRenderMeritRow(m.name+qual+(m.rating?' '+shDots(m.rating):''),'merit',i,dotH);if(pw)h+=pw;}});
  }
  h+='</div></div>';return h;
}

/** Compute tag counts from all fighting styles (includes free_mci dots). */
function _tagCounts(c) {
  const counts = {};
  (c.fighting_styles || []).forEach(fs => {
    const dots = (fs.cp || 0) + (fs.free || 0) + (fs.free_mci || 0) + (fs.xp || 0);
    const tags = STYLE_TAGS[fs.name] || [];
    tags.forEach(t => { counts[t] = (counts[t] || 0) + dots; });
  });
  return counts;
}

/** Non-combat style names — live in general merits, not fighting_styles. */
const NON_COMBAT_STYLES = new Set(['Fast-Talking', 'Cacophony Savvy', 'Etiquette', 'Three Heads of Kerberos']);

/** Max accessible rank for a style = max(own dots, highest relevant tag count). */
function _maxRank(c, styleName, dots) {
  const tags = STYLE_TAGS[styleName] || [];
  const tc = _tagCounts(c);
  let maxTag = 0;
  tags.forEach(t => { if ((tc[t] || 0) > maxTag) maxTag = tc[t]; });
  return Math.max(dots, maxTag);
}

// ── Prereq checking ───────────────────────────────────────────────────────────

const _ATTR_MAP = {
  'Dex': 'Dexterity', 'Dexterity': 'Dexterity',
  'Str': 'Strength',  'Strength': 'Strength',
  'Sta': 'Stamina',   'Stamina': 'Stamina',
  'Wits': 'Wits', 'Composure': 'Composure', 'Resolve': 'Resolve',
  'Manipulation': 'Manipulation', 'Intelligence': 'Intelligence', 'Presence': 'Presence'
};

const _SKILL_SET = new Set([
  'Athletics','Brawl','Drive','Firearms','Larceny','Stealth','Survival','Weaponry',
  'Animal Ken','Empathy','Expression','Intimidation','Persuasion','Socialise','Streetwise','Subterfuge',
  'Academics','Computer','Crafts','Investigation','Medicine','Occult','Politics','Science'
]);

const _COV_STATUS_MAP = {
  'crone': 'Circle of the Crone', 'invictus': 'Invictus',
  'sanctum': 'Ordo Dracul', 'carthian': 'Carthian Movement',
  'lancea': 'Lancea et Sanctum'
};

function _attrDots(c, fullName) {
  const obj = (c.attributes || {})[fullName];
  return obj ? (obj.dots || 0) + (obj.bonus || 0) : 0;
}

function _skillDots(c, name) {
  const obj = (c.skills || {})[name];
  return obj ? (obj.dots || 0) + (obj.bonus || 0) : 0;
}

function _checkSingleTerm(c, term) {
  term = term.trim();
  if (!term) return true;

  // Term with a trailing number: "Name N" (greedy name, last word is digit)
  const numM = term.match(/^(.+?)\s+(\d+)$/);
  if (numM) {
    const name = numM[1].trim();
    const req  = parseInt(numM[2]);

    if (_ATTR_MAP[name])     return _attrDots(c, _ATTR_MAP[name]) >= req;
    if (_SKILL_SET.has(name)) return _skillDots(c, name) >= req;

    if (name.endsWith(' Status')) {
      const type = name.slice(0, -7).trim().toLowerCase();
      if (type === 'city')    return ((c.status || {}).city    || 0) >= req;
      if (type === 'clan')    return ((c.status || {}).clan    || 0) >= req;
      if (type === 'covenant')return ((c.status || {}).covenant|| 0) >= req;
      const cov = _COV_STATUS_MAP[type];
      return cov ? ((c.covenant_standings || {})[cov] || 0) >= req : true;
    }

    if (name === 'Willpower')
      return (_attrDots(c, 'Resolve') + _attrDots(c, 'Composure')) >= req;

    // Fighting style by name
    if ((c.fighting_styles || []).some(fs => fs.name === name)) {
      return (c.fighting_styles || [])
        .filter(fs => fs.name === name)
        .reduce((s, fs) => s + (fs.cp||0) + (fs.free||0) + (fs.free_mci||0) + (fs.xp||0), 0) >= req;
    }

    // Discipline
    if ((c.disciplines || {})[name] !== undefined) return (c.disciplines[name] || 0) >= req;

    // Merit with rating
    return (c.merits || []).some(m => m.name === name && (m.rating || 0) >= req);
  }

  // Term with qualifier: "Name (Qualifier)"
  const qualM = term.match(/^(.+?)\s*\((.+)\)$/);
  if (qualM) {
    const name = qualM[1].trim(), qual = qualM[2].trim();
    return (c.merits || []).some(m =>
      m.name === name && (m.qualifier || '').toLowerCase() === qual.toLowerCase()
    );
  }

  // Bare term
  if (term === 'Kerberos Bloodline') return (c.bloodline || '').toLowerCase().includes('kerberos');
  if (term === 'Bonded Condition')   return true; // game-world condition — optimistic
  return (c.merits || []).some(m => m.name === term) || true; // optimistic for unknowns
}

/**
 * Returns true if all prereqs in the prereqStr are met.
 * Format: "Term, Term, ...; ManoeuvrePrereq"
 * Terms may contain 'or': "Wits 3 or Fighting Finesse"
 */
function _prereqsMet(c, prereqStr) {
  if (!prereqStr) return true;
  const [statPart, manPart] = prereqStr.split(';').map(s => s.trim());

  if (manPart) {
    const picked = new Set((c.fighting_picks || []).map(pk =>
      (typeof pk === 'string' ? pk : pk.manoeuvre).toLowerCase()
    ));
    if (!picked.has(manPart.toLowerCase())) return false;
  }

  for (const term of statPart.split(',').map(t => t.trim()).filter(Boolean)) {
    const ok = term.includes(' or ')
      ? term.split(' or ').some(t => _checkSingleTerm(c, t.trim()))
      : _checkSingleTerm(c, term);
    if (!ok) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Get all MAN_DB manoeuvres for a style, sorted by rank. */
function _styleManoeuvres(styleName) {
  const results = [];
  for (const [key, entry] of Object.entries(MAN_DB)) {
    if (entry.style === styleName) results.push({ key, ...entry });
  }
  results.sort((a, b) => parseInt(a.rank) - parseInt(b.rank));
  return results;
}

/**
 * Returns true if the character qualifies for a manoeuvre (orthodox or unorthodox).
 * Pass pre-computed tc = _tagCounts(c) for efficiency when calling in a loop.
 * Orthodox: has a type:'style' entry for man.style with dots >= man.rank.
 * Unorthodox: any shared tag total >= man.rank.
 */
function _qualifiesForManoeuvre(c, man, tc) {
  const rank = parseInt(man.rank) || 1;
  const styleDots = (c.fighting_styles || [])
    .filter(fs => fs.type !== 'merit' && fs.name === man.style)
    .reduce((s, fs) => s + (fs.cp||0) + (fs.free||0) + (fs.free_mci||0) + (fs.xp||0), 0);
  if (styleDots >= rank) return true;
  const manTags = STYLE_TAGS[man.style] || [];
  return manTags.some(t => (tc[t] || 0) >= rank);
}

/**
 * Returns all MAN_DB manoeuvres the character qualifies for but hasn't yet picked,
 * excluding non-combat styles. Sorted by rank then name.
 */
function _availablePicks(c) {
  const picked = new Set((c.fighting_picks || []).map(pk =>
    (typeof pk === 'string' ? pk : pk.manoeuvre).toLowerCase()
  ));
  const tc = _tagCounts(c);
  const results = [];
  for (const [key, man] of Object.entries(MAN_DB)) {
    if (NON_COMBAT_STYLES.has(man.style)) continue;
    if (picked.has(key)) continue;
    if (!_qualifiesForManoeuvre(c, man, tc)) continue;
    if (!_prereqsMet(c, man.prereq)) continue;
    results.push({ key, ...man });
  }
  results.sort((a, b) => (parseInt(a.rank) - parseInt(b.rank)) || a.name.localeCompare(b.name));
  return results;
}

/** Get all unique style names from MAN_DB. */
function _allStyles() {
  const s = new Set();
  for (const entry of Object.values(MAN_DB)) s.add(entry.style);
  return [...s].sort();
}

export function shRenderManoeuvres(c, editMode) {
  const styles = c.fighting_styles || [];
  const allPicks = c.fighting_picks || [];
  if (!editMode && !styles.length && !allPicks.length) return '';

  const mciPool = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation' && m.active !== false)
    .reduce((s, m) => s + mciPoolTotal(m), 0);

  let h = '<div class="sh-sec"><div class="sh-sec-title">Manoeuvres</div>';

  if (editMode) {
    const tc = _tagCounts(c);
    const fStyles = styles.filter(fs => fs.type !== 'merit');
    const fMerits = styles.filter(fs => fs.type === 'merit');
    const totalDots = styles.reduce((s, fs) => s + (fs.cp || 0) + (fs.free || 0) + (fs.free_mci || 0) + (fs.xp || 0), 0);
    const totalPicks = allPicks.length;

    h += '<div class="sh-merit-cp-row" style="margin-bottom:6px"><span style="color:var(--txt2)">' + totalDots + ' dot' + (totalDots === 1 ? '' : 's') + ', ' + totalPicks + ' pick' + (totalPicks === 1 ? '' : 's') + '</span></div>';

    // Style Points — tag totals for unorthodox access
    const tagEntries = Object.entries(tc).filter(([, v]) => v > 0);
    if (tagEntries.length) {
      h += '<div class="grant-pools">';
      h += '<div style="font-size:9px;letter-spacing:.07em;color:var(--txt3);margin-bottom:3px">STYLE POINTS (unorthodox access)</div>';
      tagEntries.sort((a, b) => a[0].localeCompare(b[0])).forEach(([tag, count]) => {
        h += '<div class="grant-pool-row"><span style="color:var(--gold2)">' + esc(tag) + '</span>'
          + '<span style="margin-left:6px">' + shDots(Math.min(count, 5)) + '</span>'
          + '<span style="font-size:10px;color:var(--txt3);margin-left:6px">rank 1\u2013' + count + '</span></div>';
      });
      h += '</div>';
    }

    // ── Fighting Styles ──────────────────────────────────────
    h += '<div class="sh-sub-title" style="color:var(--gold2);font-size:11px;letter-spacing:.05em;margin:6px 0 2px">Fighting Styles</div>';
    h += '<div class="man-list">';
    fStyles.forEach(fs => {
      const si = styles.indexOf(fs);
      const dots = (fs.cp || 0) + (fs.free || 0) + (fs.free_mci || 0) + (fs.xp || 0);
      const tags = STYLE_TAGS[fs.name] || [];
      const fsUp = fs.up || 0;

      h += '<div class="mci-block"><div class="mci-header"><div class="mci-title"><span class="merit-name-sh">' + esc(fs.name) + '</span>';
      if (tags.length) h += '<span style="font-size:9px;color:var(--txt3);margin-left:6px">' + tags.map(t => esc(t)).join(', ') + '</span>';
      h += '</div><span class="merit-dots-sh">' + shDots(dots) + '</span></div>';

      h += '<div class="merit-bd-row">'
        + '<div class="bd-grp"><span class="bd-lbl">CP</span><input class="merit-bd-input" type="number" min="0" value="' + (fs.cp || 0) + '" onchange="shEditStyle(' + si + ',\'cp\',+this.value)"></div>'
        + '<div class="bd-grp"><span class="bd-lbl">XP</span><input class="merit-bd-input" type="number" min="0" value="' + (fs.xp || 0) + '" onchange="shEditStyle(' + si + ',\'xp\',+this.value)"></div>'
        + '<div class="bd-grp"><span class="bd-lbl" style="color:var(--gold2)">Fr</span><input class="merit-bd-input" style="color:var(--gold2)" type="number" min="0" value="' + (fs.free || 0) + '" onchange="shEditStyle(' + si + ',\'free\',+this.value)"></div>'
        + (mciPool > 0 ? '<div class="bd-grp"><span class="bd-lbl" style="color:var(--crim)">MCI</span><input class="merit-bd-input" style="color:var(--crim)" type="number" min="0" value="' + (fs.free_mci || 0) + '" onchange="shEditStyle(' + si + ',\'free_mci\',+this.value)"></div>' : '')
        + '<div class="bd-eq"><span class="bd-val">' + dots + ' dot' + (dots === 1 ? '' : 's') + '</span>'
        + (dots > 0 ? '<span style="font-size:9px;color:var(--txt3);margin-left:4px">orthodox rank 1\u2013' + dots + '</span>' : '')
        + (fsUp ? '<span class="bd-up-warn">+' + fsUp + ' unaccounted</span>' : '') + '</div></div>';

      h += '<button class="sk-spec-rm" style="float:right;margin:4px" onclick="shRemoveStyle(' + si + ')" title="Remove">&times; Remove</button>';
      h += '<div style="clear:both"></div></div>';
    });

    const existingNames = new Set(styles.map(s => s.name));
    h += '<div class="dev-add-row"><select class="dev-add-btn" style="font-size:11px" onchange="if(this.value){shAddStyle(this.value,\'style\');this.value=\'\'}">';
    h += '<option value="">+ Add Fighting Style\u2026</option>';
    _allStyles().filter(s => !existingNames.has(s) && !NON_COMBAT_STYLES.has(s)).forEach(s => {
      h += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
    });
    h += '</select></div></div>';

    // ── Fighting Merits ──────────────────────────────────────
    h += '<div class="sh-sub-title" style="color:var(--gold2);font-size:11px;letter-spacing:.05em;margin:10px 0 2px">Fighting Merits</div>';
    h += '<div class="man-list">';
    fMerits.forEach(fs => {
      const si = styles.indexOf(fs);
      const dots = (fs.cp || 0) + (fs.free || 0) + (fs.free_mci || 0) + (fs.xp || 0);
      const tags = STYLE_TAGS[fs.name] || [];
      const fsUp = fs.up || 0;

      h += '<div class="mci-block"><div class="mci-header"><div class="mci-title"><span class="merit-name-sh">' + esc(fs.name) + '</span>';
      if (tags.length) h += '<span style="font-size:9px;color:var(--txt3);margin-left:6px">' + tags.map(t => esc(t)).join(', ') + '</span>';
      h += '</div><span class="merit-dots-sh">' + shDots(dots) + '</span></div>';

      h += '<div class="merit-bd-row">'
        + '<div class="bd-grp"><span class="bd-lbl">CP</span><input class="merit-bd-input" type="number" min="0" value="' + (fs.cp || 0) + '" onchange="shEditStyle(' + si + ',\'cp\',+this.value)"></div>'
        + '<div class="bd-grp"><span class="bd-lbl">XP</span><input class="merit-bd-input" type="number" min="0" value="' + (fs.xp || 0) + '" onchange="shEditStyle(' + si + ',\'xp\',+this.value)"></div>'
        + '<div class="bd-grp"><span class="bd-lbl" style="color:var(--gold2)">Fr</span><input class="merit-bd-input" style="color:var(--gold2)" type="number" min="0" value="' + (fs.free || 0) + '" onchange="shEditStyle(' + si + ',\'free\',+this.value)"></div>'
        + (mciPool > 0 ? '<div class="bd-grp"><span class="bd-lbl" style="color:var(--crim)">MCI</span><input class="merit-bd-input" style="color:var(--crim)" type="number" min="0" value="' + (fs.free_mci || 0) + '" onchange="shEditStyle(' + si + ',\'free_mci\',+this.value)"></div>' : '')
        + '<div class="bd-eq"><span class="bd-val">' + dots + ' dot' + (dots === 1 ? '' : 's') + '</span>'
        + (dots > 0 ? '<span style="font-size:9px;color:var(--txt3);margin-left:4px">unorthodox via tags</span>' : '')
        + (fsUp ? '<span class="bd-up-warn">+' + fsUp + ' unaccounted</span>' : '') + '</div></div>';

      h += '<button class="sk-spec-rm" style="float:right;margin:4px" onclick="shRemoveStyle(' + si + ')" title="Remove">&times; Remove</button>';
      h += '<div style="clear:both"></div></div>';
    });

    h += '<div class="dev-add-row"><select class="dev-add-btn" style="font-size:11px" onchange="if(this.value){shAddStyle(this.value,\'merit\');this.value=\'\'}">';
    h += '<option value="">+ Add Fighting Merit\u2026</option>';
    _allStyles().filter(s => !existingNames.has(s) && !NON_COMBAT_STYLES.has(s)).forEach(s => {
      h += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
    });
    h += '</select></div></div>';

    // ── Picks editor ─────────────────────────────────────────
    const remaining = totalDots - totalPicks;
    h += '<div class="sh-sub-title" style="color:var(--gold2);font-size:11px;letter-spacing:.05em;margin:10px 0 2px">Manoeuvres Picked'
      + '<span style="font-weight:normal;color:var(--txt2);margin-left:8px">' + totalPicks + ' / ' + totalDots + '</span></div>';
    h += '<div class="man-list">';

    allPicks.forEach((pk, pi) => {
      const manName = typeof pk === 'string' ? pk : pk.manoeuvre;
      const db = MAN_DB[manName.toLowerCase()];
      const prereqOk = !db || _prereqsMet(c, db.prereq);
      h += '<div class="mci-benefit-row">'
        + '<span class="mci-dot-lbl">' + (db ? '\u25CF'.repeat(parseInt(db.rank) || 1) : '\u25CF') + '</span>'
        + '<span style="flex:1;font-size:11px' + (prereqOk ? '' : ';color:var(--crim)') + '">' + esc(manName) + '</span>'
        + (db ? '<span style="font-size:9px;color:var(--txt3);margin-right:6px">' + esc(db.style) + '</span>' : '')
        + (!prereqOk ? '<span style="font-size:9px;color:var(--crim);margin-right:4px" title="' + esc(db.prereq) + '">prereq</span>' : '')
        + '<button class="sk-spec-rm" onclick="shRemovePick(' + pi + ')" title="Remove">&times;</button></div>';
    });

    if (remaining > 0) {
      const available = _availablePicks(c);
      if (available.length) {
        h += '<div style="padding:2px 0"><select class="gen-name-select" style="font-size:10px" onchange="if(this.value){shAddPick(this.value);this.value=\'\'}">';
        h += '<option value="">+ Add manoeuvre (' + remaining + ' remaining)\u2026</option>';
        available.forEach(m => {
          h += '<option value="' + esc(m.name) + '">' + esc(m.name) + ' (' + esc(m.style) + ', rank ' + m.rank + ')</option>';
        });
        h += '</select></div>';
      } else {
        h += '<div style="font-size:10px;color:var(--txt3);padding:4px 0">' + remaining + ' slot' + (remaining === 1 ? '' : 's') + ' available \u2014 no qualifying manoeuvres yet</div>';
      }
    }

    h += '</div>'; // closes man-list (picks)

  } else {
    // ── View mode ────────────────────────────────────────────
    const fStyles = styles.filter(fs => fs.type !== 'merit');
    const fMerits = styles.filter(fs => fs.type === 'merit');

    // Style Points summary
    const tc = _tagCounts(c);
    const tagEntries = Object.entries(tc).filter(([, v]) => v > 0);
    if (tagEntries.length) {
      h += '<div class="grant-pools">';
      h += '<div style="font-size:9px;letter-spacing:.07em;color:var(--txt3);margin-bottom:3px">STYLE POINTS</div>';
      tagEntries.sort((a, b) => a[0].localeCompare(b[0])).forEach(([tag, count]) => {
        h += '<div class="grant-pool-row"><span style="color:var(--gold2)">' + esc(tag) + '</span>'
          + '<span style="margin-left:6px">' + shDots(Math.min(count, 5)) + '</span>'
          + '<span style="font-size:10px;color:var(--txt3);margin-left:6px">rank 1\u2013' + count + '</span></div>';
      });
      h += '</div>';
    }

    if (fStyles.length) {
      h += '<div class="sh-sub-title" style="color:var(--txt3);font-size:10px;letter-spacing:.08em;margin:2px 0 2px">FIGHTING STYLES</div>';
      h += '<div class="man-list">';
      fStyles.forEach(fs => {
        const dots = (fs.cp || 0) + (fs.free || 0) + (fs.free_mci || 0) + (fs.xp || 0);
        const tags = STYLE_TAGS[fs.name] || [];
        h += '<div class="merit-plain"><div style="flex:1;min-width:0"><div class="merit-name-sh">' + esc(fs.name) + '</div>'
          + (tags.length ? '<div class="merit-sub-sh">' + tags.map(t => esc(t)).join(', ') + '</div>' : '') + '</div>'
          + '<span class="merit-dots-sh">' + shDots(dots) + '</span></div>';
      });
      h += '</div>';
    }

    if (fMerits.length) {
      h += '<div class="sh-sub-title" style="color:var(--txt3);font-size:10px;letter-spacing:.08em;margin:6px 0 2px">FIGHTING MERITS</div>';
      h += '<div class="man-list">';
      fMerits.forEach(fs => {
        const dots = (fs.cp || 0) + (fs.free || 0) + (fs.free_mci || 0) + (fs.xp || 0);
        const tags = STYLE_TAGS[fs.name] || [];
        h += '<div class="merit-plain"><div style="flex:1;min-width:0"><div class="merit-name-sh">' + esc(fs.name) + '</div>'
          + (tags.length ? '<div class="merit-sub-sh">' + tags.map(t => esc(t)).join(', ') + '</div>' : '') + '</div>'
          + '<span class="merit-dots-sh">' + shDots(dots) + '</span></div>';
      });
      h += '</div>';
    }

    if (allPicks.length) {
      h += '<div class="sh-sub-title" style="color:var(--txt3);font-size:10px;letter-spacing:.08em;margin:6px 0 2px">MANOEUVRES</div>';
      h += '<div class="man-list">';
      allPicks.forEach((pk, pi) => {
        const manName = typeof pk === 'string' ? pk : pk.manoeuvre;
        const db = MAN_DB[manName.toLowerCase()];
        const prereqOk = !db || _prereqsMet(c, db.prereq);
        const id2 = 'man' + pi;
        const body = db
          ? '<div class="man-exp-body"><div class="man-style">' + esc(db.style) + ' \u2014 Rank ' + esc(db.rank) + '</div><div>' + esc(db.effect || '') + '</div>' + (db.prereq ? '<div class="man-prereq">Prerequisite: ' + esc(db.prereq) + '</div>' : '') + '</div>'
          : '<div>' + esc(manName) + '</div>';
        h += '<div class="exp-row' + (prereqOk ? '' : ' merit-prereq-fail') + '" id="exp-row-' + id2 + '" onclick="toggleExp(\'' + id2 + '\')"><div style="flex:1;min-width:0"><div class="merit-name-sh">' + esc(manName) + '</div>'
          + (db ? '<div class="merit-sub-sh">' + esc(db.style) + ' \u2014 Rank ' + db.rank + (prereqOk ? '' : ' \u2014 prereq not met') + '</div>' : '') + '</div>'
          + '<span class="exp-arr">\u203A</span></div><div class="exp-body" id="exp-body-' + id2 + '">' + body + '</div>';
      });
      h += '</div>';
    }
  }

  h += '</div>';
  return h;
}

export function shRenderMeritRow(m,idPrefix,i,dotHtml) {
  const b2=meritBase(m),dc=meritDotCount(m),ds=dc?shDots(dc):'',pm=b2.match(/^([^(]+?)\s*\((.+)\)$/),mn=pm?pm[1].trim():b2,sn=pm?pm[2].trim():null;
  const nh=sn?'<div class="merit-name-sh">'+esc(mn)+'</div><div class="merit-sub-sh">'+esc(sn)+'</div>':'<div class="merit-name-sh">'+esc(mn)+'</div>';
  const db=meritLookup(m),dt=dotHtml!==undefined?dotHtml:(ds?'<span class="merit-dots-sh">'+ds+'</span>':'');
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
  h+='<div class="sh-player-row"><span class="sh-char-player">'+(editMode?'<input class="sh-edit-input" value="'+esc(c.player||'')+'" onchange="shEdit(\'player\',this.value)" placeholder="Player">':esc(c.player||''))+'</span><span class="sh-xp-badge'+(xpLeft(c)<0?' xp-over':'')+'">XP '+xpLeft(c)+'/'+xpEarned(c)+'</span></div></div>';
  if(editMode){const eT=xpEarned(c),sT=xpSpent(c);
    h+='<div class="sh-xp-breakdown"><table><tr><th colspan="2">XP Earned</th><th colspan="2">XP Spent</th></tr><tr><td>Starting</td><td>'+xpStarting()+'</td><td>Attributes</td><td>'+xpSpentAttrs(c)+'</td></tr><tr><td>Humanity Drop</td><td>'+xpHumanityDrop(c)+'</td><td>Skills + Specs</td><td>'+xpSpentSkills(c)+'</td></tr><tr><td>Ordeals</td><td>'+xpOrdeals(c)+'</td><td>Merits</td><td>'+xpSpentMerits(c)+'</td></tr><tr><td>Game</td><td>'+xpGame(c)+'</td><td>Powers</td><td>'+xpSpentPowers(c)+'</td></tr><tr><td></td><td></td><td>Special</td><td>'+xpSpentSpecial(c)+'</td></tr><tr class="xp-total-row"><td>Total Earned</td><td>'+eT+'</td><td>Total Spent</td><td>'+sT+'</td></tr><tr class="xp-total-row"><td colspan="3" style="text-align:right;padding-right:8px">Available</td><td>'+(eT-sT)+'</td></tr></table></div>';
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
    h+='<div class="sh-dcol sh-dcol-mid"><div class="sh-body">'+shRenderGeneralMerits(c,editMode)+shRenderInfluenceMerits(c,editMode)+shRenderDomainMerits(c,editMode)+shRenderStandingMerits(c,editMode)+shRenderManoeuvres(c,editMode)+'</div></div>';
    h+='<div class="sh-dcol sh-dcol-right"><div class="sh-body">'+shRenderDisciplines(c,editMode)+'</div></div>';
    h+='</div>'; // end sh-desktop
  } else {
    h+='<div class="sh-body">'+shRenderAttributes(c,editMode)+shRenderSkills(c,editMode)+shRenderDisciplines(c,editMode)+shRenderGeneralMerits(c,editMode)+shRenderInfluenceMerits(c,editMode)+shRenderDomainMerits(c,editMode)+shRenderStandingMerits(c,editMode)+shRenderManoeuvres(c,editMode)+'</div>';
  }
  const _scrollEl=el.closest('.sh-wrap')||el.parentElement||document.documentElement,_scrollTop=_scrollEl.scrollTop;
  el.innerHTML=h;_scrollEl.scrollTop=_scrollTop;
}
