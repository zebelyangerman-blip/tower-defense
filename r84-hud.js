/* R84: UI instrumentation only. No gameplay clocks, resource modifications or saves. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 function snapshot(){
  const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
  const canvas=$('gameCanvas');const image=rect(canvas);const shell=rect($('canvas-shell'));const towers=rect($('r54-tower-rail'));
  const reserve=rect($('r84-inspect-reserve'));const skills=rect($('skills-panel'));const legacy=rect($('rf-inspect-dock'));
  const compact=!!document.documentElement?.classList?.contains('device-touch')&&window.innerWidth>window.innerHeight&&window.innerHeight<=600&&window.innerWidth<=1100;
  const upgrade=$('upgrade-ui');
  const visible=el=>!!el&&getComputedStyle(el).display!=='none';
  const intersects=(a,b)=>!!(a&&b&&Math.max(a.x,b.x)<Math.min(a.x+a.w,b.x+b.w)-.5&&Math.max(a.y,b.y)<Math.min(a.y+a.h,b.y+b.h)-.5);
  return Object.freeze({scene:document.body.dataset.scene||'unknown',compact,viewport:[window.innerWidth,window.innerHeight],logical:[canvas?.width,canvas?.height],canvas:image,shell,towerRail:towers,inspector:reserve,skills,legacyInspector:legacy,legacyInspectorVisible:visible($('rf-inspect-dock')),reservedInspectorVisible:visible($('r84-inspect-reserve')),upgradeHost:upgrade?.parentElement?.id||null,upgradeActive:!!upgrade?.classList?.contains('show'),towerCount:$('tower-buttons')?.querySelectorAll('button[data-tower-id]').length||0,spellCount:$('skills-panel')?.querySelectorAll('button[data-skill-id]').length||0,canvasRailOverlap:visible($('r54-tower-rail'))&&intersects(image,towers),cssRatio:image&&image.h?+(image.w/image.h).toFixed(4):null,inspectorOverlapsCanvas:visible($('r84-inspect-reserve'))&&intersects(image,reserve),legacyObscuresSkills:compact&&visible($('rf-inspect-dock'))&&intersects(legacy,skills)});
 }
 function audit(){
  const state=snapshot();const problems=[];
  if(state.scene!=='play')return Object.freeze({ok:null,status:'NOT IN BATTLE',problems,state});
  const bad=(id,condition)=>{if(condition)problems.push(id);};
  bad('LOGICAL_CANVAS',state.logical[0]!==1000||state.logical[1]!==600);
  bad('CANVAS_HIDDEN',!state.canvas||state.canvas.w<=1||state.canvas.h<=1);
  bad('CANVAS_RATIO',!!state.cssRatio&&Math.abs(state.cssRatio-5/3)>.025);
  bad('TOWER_SLOTS',state.towerCount!==7);
  bad('SPELL_SLOTS',state.spellCount!==5);
  bad('TOWER_RAIL_OVERLAP',state.canvasRailOverlap);
  bad('INSPECTOR_OVERLAP',state.inspectorOverlapsCanvas);
  bad('MOBILE_DUPLICATE_INSPECTOR',state.compact&&state.legacyInspectorVisible);
  bad('MOBILE_INSPECTOR_MISSING',state.compact&&!state.reservedInspectorVisible);
  bad('MOBILE_SKILLS_COVERED',state.legacyObscuresSkills);
  const uiBridge=window.TD_R91_BATTLE_UI?.snapshot?.();
  bad('HIDDEN_ARMED_TOWER',!!uiBridge?.armedTower&&$('bottom-panel')?.dataset.r49Group==='magic'&&!document.documentElement.classList.contains('device-touch'));
  bad('MOBILE_UPGRADE_WRONG_HOST',state.compact&&state.upgradeActive&&state.upgradeHost!=='r84-inspect-reserve');
  return Object.freeze({ok:problems.length===0,status:problems.length?'FAIL':'PASS',problems:Object.freeze(problems),state});
 }
 function compareLayout(before,after){
  if(!before?.canvas||!after?.canvas)return Object.freeze({status:'BLOCKED',ok:null,reason:'NO_CANVAS'});
  const keys=['x','y','w','h'];const delta=Object.fromEntries(keys.map(k=>[k,+(after.canvas[k]-before.canvas[k]).toFixed(2)]));
  const ok=keys.every(k=>Math.abs(delta[k])<=1);
  return Object.freeze({status:ok?'PASS':'FAIL',ok,delta,reason:ok?'STABLE_MAP':'CANVAS_MOVED_ON_INSPECTION'});
 }
  // Explicit diagnostic invoked from the console; never changes battle state.
  // elementFromPoint tests whether a higher layer intercepts the intended tap.
  function probeControls(){
   const scene=document.body.dataset.scene||'unknown';
   if(scene!=='play')return Object.freeze({status:'NOT IN BATTLE',ok:null,controls:[]});
   const get=(selector)=>Array.from(document.querySelectorAll(selector));
   const candidates=[...get('#r54-tower-rail button[data-tower-id]'),...get('#skills-panel button[data-skill-id]'),...get('#battle-speed'),...get('#pause-btn')];
   if($('wave-prep')?.classList?.contains('show'))candidates.push(...get('#wave-prep .wave-prep-btn'));
   const upgrade=$('upgrade-ui');
   if(upgrade?.classList?.contains('show')){
    if(!upgrade.classList.contains('r58-details'))candidates.push(...get('#upgrade-ui .btn-close,#upgrade-ui .btn-upgrade,#upgrade-ui .btn-sell,#r58-details-toggle'));
    else candidates.push(...get('#r58-details-close'));
   }
   const results=[];
   for(const el of candidates){
    const r=el.getBoundingClientRect();const style=getComputedStyle(el);
    if(style.display==='none'||style.visibility==='hidden'||r.width<=0||r.height<=0)continue;
    const x=r.left+r.width/2,y=r.top+r.height/2;
    const inViewport=x>=0&&y>=0&&x<window.innerWidth&&y<window.innerHeight;
    const hit=inViewport&&typeof document.elementFromPoint==='function'?document.elementFromPoint(x,y):null;
    const notOccluded=!hit||el===hit||el.contains(hit);
    results.push(Object.freeze({id:el.id||el.dataset.towerId||el.dataset.skillId||el.className,
      visible:inViewport,hitTest:hit?notOccluded:null,disabled:!!el.disabled,
      size:[Math.round(r.width),Math.round(r.height)]}));
   }
   const blocked=results.filter(r=>!r.visible||r.hitTest===false);
   return Object.freeze({status:blocked.length?'FAIL':'PASS',ok:blocked.length===0,
    blocked:Object.freeze(blocked.map(r=>r.id)),controls:Object.freeze(results)});
  }
  // R91.7.4: inspect the actual DOM after any user-visible transition.
  // This is not an automated browser PASS: call it from an open game client.
  function auditNavigation(){
   const visible=Array.from(document.querySelectorAll('.screen')).filter(el=>!el.classList.contains('hidden')).map(el=>el.id);
   const current=document.body.dataset.scene||'unknown';
   const expected={boot:'screen-boot',menu:'screen-menu',rules:'screen-rules',tutorial:'screen-tutorial',
    meta:'screen-meta',settings:'screen-settings',pause:'screen-pause',result:'screen-result'};
   const wanted=expected[current];const failures=[];
   if(wanted && (visible.length!==1 || visible[0]!==wanted))failures.push('SCREEN_VISIBILITY');
   if((current==='play'||current==='system-pause') && visible.length)failures.push('BATTLE_SCREEN_OBSCURED');
   const atlas=$('r80-atlas-panel'),confirm=$('r79-exit-confirm');
   if(atlas&&!atlas.hidden && current!=='menu')failures.push('ATLAS_OUTSIDE_MENU');
   if(confirm&&!confirm.classList.contains('hidden')&&current!=='pause')failures.push('PAUSE_CONFIRM_LEAK');
   const focus=document.activeElement;
   if(focus && focus!==document.body && focus.closest?.('.screen.hidden'))failures.push('FOCUS_IN_HIDDEN_SCREEN');
   return Object.freeze({status:failures.length?'FAIL':'PASS',ok:!failures.length,scene:current,
    visibleScreens:Object.freeze(visible),focusId:focus?.id||null,
    problems:Object.freeze(failures)});
  }
  // R91.7.5: occupancy diagnostics. Letterboxing required by the 5:3 aspect
  // ratio is NOT wasted space. Compare the rendered canvas with the largest
  // 5:3 rectangle inside the reserved shell, not the whole viewport.
  function auditUtilization(){
   const metrics=snapshot();
   if(metrics.scene!=='play')return Object.freeze({status:'NOT IN BATTLE',ok:null,problems:[],metrics});
   const shell=metrics.shell,canvas=metrics.canvas,skills=$('skills-panel');
   if(!shell||!canvas||shell.w<=0||shell.h<=0||canvas.w<=1||canvas.h<=1)
    return Object.freeze({status:'BLOCKED',ok:null,problems:['NO_MEASURABLE_LAYOUT'],metrics});
   const expectedWidth=Math.min(shell.w,shell.h*5/3);
   const expectedHeight=expectedWidth*3/5;
   const actualArea=canvas.w*canvas.h;
   const optimalArea=expectedWidth*expectedHeight;
   const mapFit=optimalArea>0?Math.min(1,actualArea/optimalArea):0;
   const visible=el=>el&&getComputedStyle(el).display!=='none';
   let spellFill=null,spellButtons=0;
   if(visible(skills)){
    const bounds=skills.getBoundingClientRect();
    const buttons=Array.from(skills.querySelectorAll('button[data-skill-id]'))
     .filter(btn=>visible(btn)).map(btn=>btn.getBoundingClientRect());
    spellButtons=buttons.length;
    // Only real occupied vertical span matters; a two-column 2x3 grid
    // artificially ends well before the bottom of a tall desktop dock.
    if(bounds.height>0&&buttons.length){
     const occupiedBottom=Math.max(...buttons.map(b=>b.bottom));
     spellFill=Math.min(1,Math.max(0,(occupiedBottom-bounds.top)/bounds.height));
    }
   }
   const desktop=window.innerWidth>=900&&window.innerHeight>=601;
   const compact=metrics.compact;
   const dock=$('bottom-panel'),reserve=$('r84-inspect-reserve'),boss=$('boss-hud');
   let mobileDockGap=null;
   if(compact&&visible(dock)&&visible(reserve)&&!visible(boss)){
    const dockBounds=dock.getBoundingClientRect(),reserveBounds=reserve.getBoundingClientRect();
    mobileDockGap=Math.max(0,dockBounds.bottom-reserveBounds.bottom);
   }
   const problems=[];
   if(mapFit<.94)problems.push('MAP_NOT_MAXIMIZED_5_3');
   if(desktop&&spellButtons===5&&spellFill!==null&&spellFill<.83)problems.push('UNUSED_SPELL_DOCK_SPACE');
   if(compact&&mobileDockGap!==null&&mobileDockGap>20)problems.push('UNUSED_MOBILE_INSPECTOR_SPACE');
   return Object.freeze({status:problems.length?'FAIL':'PASS',ok:!problems.length,
    problems:Object.freeze(problems),
    measurements:Object.freeze({mapFit:+mapFit.toFixed(3),spellFill:spellFill===null?null:+spellFill.toFixed(3),
     spellButtons,desktop,compact,mobileDockGap:mobileDockGap===null?null:+mobileDockGap.toFixed(1),
     canvasBounds:metrics.canvas,shellBounds:metrics.shell})});
  }
  window.R84_HUD_DIAGNOSTICS=Object.freeze({snapshot,audit,compareLayout,probeControls,auditNavigation,auditUtilization});
 function mount(){
  // R93.5: both upgrade paths are permanently visible; do not set legacy branch switch state.
  const inspector=$('r84-inspect-reserve');if(inspector)inspector.removeAttribute('data-r54-branch');
  const last=$('r84-spell-heading');if(last)last.title='Перезарядка заклинаний берётся из боевого движка';
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

/* R91.7.6: read-only responsive briefing in otherwise unused map sideband.
   The actual game canvas stays at its native 1000x600 coordinates / 5:3 ratio. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 let scheduled=false;
 const clean=v=>String(v||'').replace(/\s+/g,' ').replace(/^[^\p{L}\p{N}]+/u,'').trim();
 function update(){
  const panel=$('r9176-field-report'),shell=$('canvas-shell'),canvas=$('gameCanvas');
  if(!panel||!shell||!canvas)return;
  const sr=shell.getBoundingClientRect(),cr=canvas.getBoundingClientRect();
  const gap=sr.right-cr.right;
  const isPlay=document.body.dataset.scene==='play';
  const activeMobile=isPlay && document.documentElement.classList.contains('device-touch') &&
   window.innerWidth>window.innerHeight && window.innerHeight<=600 && window.innerWidth<=1100;
  // Only on ultra-wide desktop: use genuine free sideband, never overlap the 5:3 canvas.
  const activeWide=isPlay && !document.documentElement.classList.contains('device-touch') &&
   window.innerWidth>=3000 && window.innerHeight>=1000;
  if((!activeMobile&&!activeWide)||gap<(activeWide?210:118)||sr.height<220){panel.hidden=true;return;}
  panel.dataset.mode=activeWide?'wide':'compact';
  const width=Math.floor(gap-10);
  panel.style.left=Math.round(cr.right-sr.left+5)+'px';
  panel.style.top='4px';
  panel.style.width=width+'px';
  panel.style.height=Math.floor(sr.height-8)+'px';
  panel.hidden=false;
  const roster=clean($('wave-prep-roster')?.textContent);
  const threat=clean($('wave-prep-note')?.textContent);
  const intro=clean($('wave-prep-objective')?.textContent);
  const preparing=!!$('wave-prep')?.classList.contains('show');
  const r=$('r9176-field-roster'),t=$('r9176-field-threat');
  const wave=clean($('ui-wave')?.textContent);
  const towers=clean($('ui-tower-count')?.textContent);
  const lives=clean($('ui-lives')?.textContent);
  if(r)r.textContent=preparing?(roster||'Готовится следующий натиск'):(wave?'Волна '+wave:'Волна в движении');
  if(t)t.textContent=preparing?(threat||intro||'Следите за дорогами'):(towers&&lives?'Башни: '+towers+' · Прочность замка: '+lives:'Защищайте выход к замку');
 }
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;update()});}
 function init(){
  const shell=$('canvas-shell');if(!shell)return;
  window.addEventListener('resize',schedule,{passive:true});
  if(typeof ResizeObserver==='function'){
   const ro=new ResizeObserver(schedule);ro.observe(shell);
   if($('gameCanvas'))ro.observe($('gameCanvas'));
  }
  const mo=new MutationObserver(schedule);
  mo.observe(document.body,{attributes:true,attributeFilter:['data-scene']});
  mo.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  const prep=$('wave-prep');
  if(prep)mo.observe(prep,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
  for(const id of ['ui-wave','ui-tower-count','ui-lives']){const e=$(id);if(e)mo.observe(e,{subtree:true,childList:true,characterData:true});}
  schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
