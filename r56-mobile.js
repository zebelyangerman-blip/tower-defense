/* R56 / 1.4.5: phone-landscape-only inspector placement and skill rows.
   No changes to the tower logic, money, timers, or canvas coordinate mapping. */
(function () {
  'use strict';
  const QUERY = '(orientation:landscape) and (max-height:600px) and (max-width:1100px)';
  const $ = (id) => document.getElementById(id);
  const MOBILE_SKILL_LABELS = Object.freeze({1:'Метеор',2:'Стоп',3:'Резерв',4:'Молния',5:'Бездна',6:'Знамя',7:'Бастион',8:'Барьер',9:'Раскол'});
  const MOBILE_TOWER_LABELS = Object.freeze({BASIC:'Стрелок',SNIPER:'Снайпер',CANNON:'Пушка',FROST:'Крио',LASER:'Лазер',TESLA:'Тесла',ALCH:'Алхим',BALLISTA:'Баллиста',STANDARD:'Знамя',WARDEN:'Печать'});
  let lastActive = false;
  let lastBranchTower = null;

  function active() {
    return document.documentElement.classList.contains('device-touch') && matchMedia(QUERY).matches;
  }
  function syncDock() {
    const enabled = active();
    const ui = $('upgrade-ui');
    if (!enabled) {
      const activeUpgrade=$('upgrade-ui');
      if(activeUpgrade?.classList.contains('r58-details')){
        activeUpgrade.classList.remove('r58-details');
        activeUpgrade.querySelector('#r58-details-panel')?.setAttribute('aria-hidden','true');
        const toggle=activeUpgrade.querySelector('#r58-details-toggle');
        if(toggle){toggle.textContent='Описание улучшения';toggle.setAttribute('aria-expanded','false');}
      }
      const skills = $('skills-panel');
      const towers = $('tower-buttons');
      if (lastActive && towers) {
        for (const name of towers.querySelectorAll('.tower-name[data-r58-original]')) {
          name.textContent=name.dataset.r58Original; delete name.dataset.r58Original;
        }
      }
      if (lastActive && skills) {
        for (const name of skills.querySelectorAll('.skill-name[data-r56-original]')) {
          name.textContent = name.dataset.r56Original;
          delete name.dataset.r56Original;
        }
      }
      if (lastActive && ui) {
        for (const key of ['left', 'right', 'top', 'bottom']) ui.style.removeProperty(key);
        ui.removeAttribute('data-r56-placement');
      }
      lastActive = false;
      return;
    }
    lastActive = true;
    const skills = $('skills-panel');
    const dock = $('bottom-panel');
    if (skills && dock) {
      const buttons = skills.querySelectorAll('button[data-skill-id]');
      dock.style.setProperty('--r56-skill-rows', String(Math.max(1, Math.ceil(buttons.length / 3))));
      for (const button of buttons) {
        const short = MOBILE_SKILL_LABELS[Number(button.dataset.skillId)];
        const label = button.querySelector('.skill-name');
        if (short && label && label.textContent !== short) {
          if (!label.dataset.r56Original) label.dataset.r56Original = label.textContent;
          label.textContent = short;
        }
      }
    }
    const towers = $('tower-buttons');
    if (towers) for (const button of towers.querySelectorAll('button[data-tower-id]')) {
      const name=button.querySelector('.tower-name');
      const short=MOBILE_TOWER_LABELS[button.dataset.towerId];
      if (name && short && name.textContent!==short) {
        if (!name.dataset.r58Original) name.dataset.r58Original=name.textContent;
        name.textContent=short;
      }
    }
    const popup = $('r56-mobile-upgrade-layer');
    const inspector = $('rf-inspect-dock');
    if (popup && inspector && !popup.dataset.r54Branch) popup.dataset.r54Branch = inspector.dataset.r54Branch || '1';
  }

  function activateBranch(branch) {
    const ui = $('upgrade-ui');
    if (!ui) return;
    const target = ui.querySelectorAll('.r54-branch-tabs button')[branch - 1];
    if (target && target.getAttribute('aria-selected') !== 'true') target.click();
  }

  // Ultra-short devices offer full upgrade descriptions in a compact,
  // scrollable *in-card* layer. Revealing descriptions must never push the
  // upgrade's purchase/close controls beyond the screen edge.
  function ensureDetailsToggle(ui) {
    if (!active() || !ui || ui.querySelector('#r58-details-toggle')) return;
    const host=ui.querySelector('.upg-paths');
    if (!host) return;
    const button=document.createElement('button');
    button.id='r58-details-toggle'; button.type='button';
    button.textContent='Описание улучшения';
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls','r58-details-panel');
    host.insertAdjacentElement('afterend',button);
    const panel=document.createElement('section');
    panel.id='r58-details-panel';
    panel.setAttribute('role','region');
    panel.setAttribute('aria-label','Описание выбранной ветки улучшения');
    panel.setAttribute('aria-hidden','true');
    const heading=document.createElement('strong');
    heading.id='r58-details-heading';
    const text=document.createElement('div');
    text.id='r58-details-copy';
    const close=document.createElement('button');
    close.type='button'; close.textContent='Вернуться к покупке';
    close.id='r58-details-close';
    close.setAttribute('aria-label','Закрыть описание и вернуться к покупке');
    panel.append(heading,text,close);
    ui.appendChild(panel);
    function closeDetails(){
      const hadFocus=panel.contains(document.activeElement);
      ui.classList.remove('r58-details');
      panel.setAttribute('aria-hidden','true');
      button.textContent='Описание улучшения';
      button.setAttribute('aria-expanded','false');
      if(hadFocus && active() && ui.classList.contains('show'))button.focus({preventScroll:true});
    }
    function showDetails(){
      const branch=($('r84-inspect-reserve')?.contains(ui)?$('r84-inspect-reserve')?.dataset.r54Branch:$('r56-mobile-upgrade-layer')?.dataset.r54Branch)==='2'?2:1;
      const path=$(`path-${branch}-container`);
      heading.textContent=$(`path-${branch}-name`)?.textContent || `Ветка ${branch}`;
      const fragments=Array.from(path?.querySelector('.upg-desc')?.children || [])
        .map(node=>node.textContent?.trim()).filter(Boolean);
      text.replaceChildren();
      if (!fragments.length) {
        const copy=path?.querySelector('.upg-desc')?.textContent?.trim();
        text.textContent=copy||'Описание недоступно';
      }
      else for(const [index,fragment] of fragments.entries()){
        const line=document.createElement('div');
        line.textContent=fragment;
        if(index===1)line.style.fontWeight='800';
        line.style.marginBottom='4px';
        text.appendChild(line);
      }
      ui.classList.add('r58-details');
      panel.setAttribute('aria-hidden','false');
      button.textContent='Скрыть описание';
      button.setAttribute('aria-expanded','true');
      close.focus({preventScroll:true});
    }
    button.addEventListener('click',()=>{ui.classList.contains('r58-details')?closeDetails():showDetails()});
    close.addEventListener('click',closeDetails);
    panel.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeDetails();}
    });
  }

  function positionPopup(tower) {
    // R84 inspector is embedded in the reserved right dock instead of a floating overlay.
    if ($('upgrade-ui')?.parentElement?.id === 'r84-inspect-reserve') return;
    if (!active() || !tower) return;
    const ui = $('upgrade-ui'), popup = $('r56-mobile-upgrade-layer'), canvas = $('gameCanvas');
    const title = $('upg-title');
    if (title && title.title && title.textContent !== title.title) title.textContent = title.title;
    if (!ui || !popup || !canvas || !ui.classList.contains('show')) return;
    if (lastBranchTower !== tower) {
      ui.classList.remove('r58-details');
      const detail=ui.querySelector('#r58-details-toggle'); if(detail){detail.textContent='Описание улучшения';detail.setAttribute('aria-expanded','false');}
      lastBranchTower = tower;
      activateBranch(tower.path === 2 ? 2 : 1);
    }
    const canvasRect = canvas.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height) return;
    ensureDetailsToggle(ui);
    const rect = ui.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (w < 20 || h < 20) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const safe = 5, gap = 15;
    const headerBottom = document.querySelector('#game-wrapper .battle-header')?.getBoundingClientRect().bottom || 38;
    const safeTop = Math.max(safe, Math.ceil(headerBottom + 3));
    const tx = canvasRect.left + (tower.x / canvas.width) * canvasRect.width;
    const ty = canvasRect.top + (tower.y / canvas.height) * canvasRect.height;
    const playLeft = Math.max(0, canvasRect.left);
    const playRight = Math.min(vw, $('bottom-panel')?.getBoundingClientRect().left || canvasRect.right);
    const minX = Math.max(safe, playLeft + safe);
    const maxX = Math.max(minX, playRight - w - safe);
    const limitY = Math.max(safeTop, vh - h - safe);
    let x = Math.max(minX, Math.min(maxX, tx - w * .5));
    let y, placement;
    if (ty - gap - h >= safeTop) {
      placement = 'above';
      y = ty - gap - h;
    } else if (ty + gap + h <= vh - safe) {
      placement = 'below';
      y = ty + gap;
    } else {
      // Near a viewport edge: favor a lateral card over covering its tower.
      placement = 'side';
      const rightX = tx + gap, leftX = tx - w - gap;
      if (rightX + w < playRight - safe) x = rightX;
      else if (leftX > minX) x = leftX;
      y = ty - h * .5;
    }
    y = Math.max(safeTop, Math.min(limitY, y));
    // Constrain the popup to the battlefield; never let its right edge sit
    // over the always-visible tower/spell rail. The two-row compact layout
    // can still inspect towers at either edge of the map.
    x = Math.max(minX, Math.min(maxX, x));
    ui.style.setProperty('left', `${Math.round(x)}px`, 'important');
    ui.style.setProperty('top', `${Math.round(y)}px`, 'important');
    ui.style.setProperty('right', 'auto', 'important');
    ui.style.setProperty('bottom', 'auto', 'important');
    ui.dataset.r56Placement = placement;
  }

  function onScene(s) {
    syncDock();
    if (!active()) { lastBranchTower = null; return; }
    const ui=$('upgrade-ui');
    if (!s || s.screen !== 'play' || !s.activeTowerUI) {
      if (ui?.classList.contains('r58-details')) ui.querySelector('#r58-details-toggle')?.click();
      lastBranchTower = null;
      return;
    }
    if (ui?.parentElement?.id === 'r84-inspect-reserve') {
      // The R84 reserved inspector hides descriptions to preserve purchase controls.
      // Provide a readable on-demand layer without covering the game canvas.
      ensureDetailsToggle(ui);
      if (lastBranchTower !== s.activeTowerUI) {
        if (ui.classList.contains('r58-details')) ui.querySelector('#r58-details-toggle')?.click();
        lastBranchTower = s.activeTowerUI;
      }
      return;
    }
    positionPopup(s.activeTowerUI);
  }
  function afterBranchChange() {
    if (!active()) return;
    const ui=$('upgrade-ui');
    if (ui?.classList.contains('r58-details')) ui.querySelector('#r58-details-toggle')?.click();
    // Switching branches changes card height. Reposition after layout without
    // changing selection or tower state.
    requestAnimationFrame(() => {
      if (typeof state !== 'undefined' && state.activeTowerUI) positionPopup(state.activeTowerUI);
    });
  }
  window.R56Mobile = Object.freeze({active, syncDock, onScene, positionPopup, afterBranchChange});
  function observeCatalogs(){
    if (typeof MutationObserver !== 'function') return;
    for (const id of ['skills-panel','tower-buttons']) {
      const panel=$(id); if (!panel) continue;
      const observer=new MutationObserver(()=>{if(active()) syncDock();});
      observer.observe(panel,{childList:true});
    }
    if(active()) syncDock();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',observeCatalogs,{once:true});
  else observeCatalogs();
  window.addEventListener('resize', () => {
    if (!active()) { lastBranchTower = null; syncDock(); }
    else requestAnimationFrame(() => {
      syncDock();
      if (typeof state !== 'undefined' && state.activeTowerUI) positionPopup(state.activeTowerUI);
    });
  }, {passive:true});
})();
