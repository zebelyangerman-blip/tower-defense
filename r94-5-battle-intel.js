/* R94.5 — read-only tactical status. Shows actual level/wave composition
   from TD_DATA and existing wave preparation metadata; never modifies game
   state, enemy spawning, ads, maps, viewport sizes or input handling. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
  let queued = false;
  let currentLevel = -1;
  let currentWave = -1;
  let waveIsActive = false;
  let cachedSignature = '';
  let preparedLevel = -1;
  let preparedWave = -1;

  const write = (id, text) => {
    const node = $(id);
    if (node && node.textContent !== text) node.textContent = text;
  };
  // Touch tablets already letterbox the 5:3 game canvas vertically. Position
  // the status in that genuine free band between canvas and tower controls;
  // do not move or resize either of them, and keep wave-prep buttons visible.
  function syncTabletPosition() {
    const tallTouch = document.documentElement.classList.contains('device-touch') &&
      window.innerWidth > window.innerHeight && window.innerHeight > 600;
    if (!tallTouch) return;
    const status = $('r49-wave-state'), canvas = $('gameCanvas'), rail = $('r54-tower-rail');
    if (!status || !canvas || !rail) return;
    const cr = canvas.getBoundingClientRect(), rr = rail.getBoundingClientRect();
    const freeGap = rr.top - cr.bottom;
    const height = Math.max(29, Math.min(47, Math.floor(freeGap - 8)));
    const top = Math.round(rr.top - 4 - height);
    const values = {
      '--r945-tablet-left':`${Math.round(cr.left)}px`,
      '--r945-tablet-top':`${top}px`,
      '--r945-tablet-width':`${Math.round(cr.width)}px`,
      '--r945-tablet-height':`${height}px`
    };
    for (const [name,value] of Object.entries(values)) {
      if (status.style.getPropertyValue(name) !== value) status.style.setProperty(name,value);
    }
  }
  function render() {
    queued = false;
    const panel = $('r94-5-battle-intel');
    if (!panel) return;
    const scene = document.body.dataset.scene;
    if (scene !== 'play' && scene !== 'pause') return;
    syncTabletPosition();

    const match = clean($('ui-wave')?.textContent).match(/(\d+)\s*\/\s*(\d+)/);
    const completed = match ? Number(match[1]) : 0;
    const total = match ? Number(match[2]) : 0;
    const levelId = Number(clean($('ui-level')?.textContent));
    const prepVisible = !!$('wave-prep')?.classList.contains('show');
    if (levelId !== currentLevel || completed === 0 || completed < currentWave) {
      currentLevel = levelId; currentWave = completed; waveIsActive = false;
    } else currentWave = completed;

    // Wave event is authoritative for whether this wave is still fighting.
    // Preparation DOM is authoritative for the next-wave preview.
    const nextIndex = prepVisible ? completed + 1 : waveIsActive ? completed : Math.min(completed + 1, total);
    const waveIndex = Math.max(1, Math.min(nextIndex, total || 1));
    const stage = scene === 'pause' ? 'ПАУЗА' : prepVisible ? 'ПОДГОТОВКА' : waveIsActive ? 'В БОЮ' : 'ОЖИДАНИЕ';
    const isNext = prepVisible || (!waveIsActive && completed < total);
    const data = window.TD_DATA;
    const level = data?.getLevelStrict?.(levelId);
    const wave = level?.waves?.[waveIndex - 1];
    const preview = wave && data?.getWavePreview?.(wave);
    const enemies = preview?.boss ? [{name:clean(preview.boss.name),count:1,boss:true}] :
      (Array.isArray(preview?.enemies) ? preview.enemies.map(e => ({name:clean(e.name),count:Number(e.count)||0,boss:false})) : []);
    const lineup = enemies.length ? enemies.map(e => `${e.name} ×${e.count}`).join(' · ') :
      (level ? 'Ожидание противников' : 'Разведка готовится');
    // Reuse the authored briefing of this *same* upcoming wave, where present.
    // Otherwise use the preview's own note or level's authored threat.
    let threat = clean(preview?.note || level?.threat);
    const prepNote = clean($('wave-prep-note')?.textContent).replace(/^⚠\s*/, '');
    if (prepVisible && preparedLevel === levelId && preparedWave === waveIndex && prepNote) threat = prepNote;
    if (!threat) threat = level ? 'Защищайте замок' : 'Информация уточняется';
    const routeWeights = Array.isArray(level?.routeWeights) ? level.routeWeights : [];
    const routes = routeWeights.filter(x => Number(x) > 0).length;
    if (routes > 1 && !(prepVisible && preparedLevel === levelId && preparedWave === waveIndex)) {
      threat = `${routes} направления · ${threat}`;
    }

    const signature = JSON.stringify([stage,waveIndex,total,levelId,lineup,threat,isNext]);
    if (signature === cachedSignature) return;
    cachedSignature = signature;
    write('r945-stage', stage);
    const shortStage = stage === 'ПОДГОТОВКА' ? 'ПОДГОТ.' : stage === 'ОЖИДАНИЕ' ? 'ОЖИД.' : stage;
    const stageEl = $('r945-stage');if (stageEl) stageEl.dataset.short = shortStage;
    write('r945-wave', `${waveIndex}/${total || '?'}`);
    write('r945-roster-caption', isNext ? 'НА ПОДХОДЕ' : 'СОСТАВ ВОЛНЫ');
    write('r945-threat-text', threat);
    panel.dataset.phase = stage === 'В БОЮ' ? 'combat' : stage === 'ПОДГОТОВКА' ? 'prep' : 'hold';
    panel.dataset.wave = String(waveIndex);
    panel.setAttribute('aria-label', `${stage}, волна ${waveIndex} из ${total}. ${isNext?'На подходе':'Состав волны'}: ${lineup}. Угроза: ${threat}`);
    const t = $('r945-threat-text'); if (t) t.title = threat;
    const roster = $('r945-enemies');
    if (roster) {
      roster.title = lineup;
      roster.setAttribute('aria-label', lineup);
      const frag = document.createDocumentFragment();
      if (!enemies.length) {
        const placeholder = document.createElement('span');placeholder.className='r945-placeholder';placeholder.textContent=lineup;frag.append(placeholder);
      } else {
        for (const enemy of enemies) {
          const chip = document.createElement('span'); chip.className='r945-enemy' + (enemy.boss?' r945-boss':'');
          const name = document.createElement('span');name.className='r945-enemy-name';name.textContent=enemy.name;
          const count = document.createElement('b');count.className='r945-enemy-count';count.textContent='×'+enemy.count;
          chip.append(name,count);chip.title=`${enemy.name} ×${enemy.count}`;frag.append(chip);
        }
      }
      roster.replaceChildren(frag);
    }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(render);
  }
  function init() {
    if (!$('r94-5-battle-intel')) return;
    const mo = new MutationObserver(schedule);
    const prep = $('wave-prep');
    if (prep) mo.observe(prep,{attributes:true,attributeFilter:['class'],subtree:true,childList:true,characterData:true});
    for (const id of ['ui-wave','ui-level']) {
      const n = $(id); if (n) mo.observe(n,{subtree:true,childList:true,characterData:true});
    }
    mo.observe(document.body,{attributes:true,attributeFilter:['data-scene']});
    // State transitions are emitted by the existing simulation, not inferred
    // from animation frames or by attaching handlers to gameplay buttons.
    const bus = typeof Reforged !== 'undefined' ? Reforged : window.Reforged;
    bus?.on?.('wave:start', game => {
      currentLevel = Number(clean($('ui-level')?.textContent));
      currentWave = Number(game?.wave) || currentWave;
      waveIsActive = true; schedule();
    });
    bus?.on?.('wave:complete', () => { waveIsActive = false; schedule(); });
    bus?.on?.('battle:victory', () => { waveIsActive = false; schedule(); });
    bus?.on?.('battle:defeat', () => { waveIsActive = false; schedule(); });
    // Snapshot of the real preview's wave identity, refreshed only when
    // preparation begins. The note text is not used for a different wave.
    const prepObserver = new MutationObserver(() => {
      if (!prep?.classList.contains('show')) return;
      const match = clean($('ui-wave')?.textContent).match(/(\d+)\s*\//);
      preparedLevel = Number(clean($('ui-level')?.textContent));
      preparedWave = match ? Number(match[1])+1 : -1;
      schedule();
    });
    if (prep) prepObserver.observe(prep,{attributes:true,attributeFilter:['class']});
    window.addEventListener('pageshow',schedule,{passive:true});
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('orientationchange',schedule,{passive:true});
    window.visualViewport?.addEventListener?.('resize',schedule,{passive:true});
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(schedule);
      for (const id of ['gameCanvas','r54-tower-rail']) {const e=$(id);if(e)ro.observe(e);}
    }
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
  window.R94BattleIntel=Object.freeze({refresh:schedule});
})();
