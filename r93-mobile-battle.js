/* R93.4 — touch-landscape layout / read-only compact wave briefing.
   No gameplay timers, coordinates, spells, upgrades, or money are changed. */
(() => {
  'use strict';
  const media = matchMedia('(orientation:landscape) and (max-height:600px) and (max-width:1100px)');
  const $ = id => document.getElementById(id);
  let queued = false;
  let lastActive = false;
  const visible = () => media.matches && document.documentElement.classList.contains('device-touch') &&
    (document.body.dataset.scene === 'play' || document.body.dataset.scene === 'pause');
  const normalize = s => String(s || '').replace(/\s+/g, ' ').trim();
  function ensureBriefing() {
    let panel = $('r93-mobile-recon');
    if (!panel) {
      panel = document.createElement('aside');
      panel.id = 'r93-mobile-recon';
      panel.hidden = true;
      panel.setAttribute('role', 'status');
      panel.setAttribute('aria-live', 'polite');
      panel.setAttribute('aria-label', 'Разведка следующей волны');
      const heading = document.createElement('strong');
      heading.className = 'r93-recon-label';
      heading.textContent = 'НА ПОДХОДЕ';
      const text = document.createElement('span');
      text.className = 'r93-recon-text';
      panel.append(heading, text);
      document.body.appendChild(panel);
    }
    return panel;
  }
  function sync() {
    queued = false;
    const panel = ensureBriefing();
    const active = visible();
    if (!active) {
      if (lastActive) document.body.style.removeProperty('--r56-right');
      document.body.classList.remove('r93-narrow-spells', 'r95-map-priority');
      lastActive = false;
      panel.hidden = true;
      return;
    }
    lastActive = true;
    const ww = window.innerWidth;
    const hh = window.innerHeight;
    // R95.2: on wide, short landscape phones prefer a larger *complete* 5:3
    // battlefield.  A compact (but still usable) HUD and tower rail give the
    // map more height; their widths and the inspector are reserved in advance.
    // Do not derive this from tower selection, magic, pause, or wave status.
    const mapPriority = ww >= 740 && ww <= 1100 && hh >= 350 && hh <= 480 && ww / hh >= 1.9;
    document.body.classList.toggle('r95-map-priority', mapPriority);
    const header = mapPriority ? 28 : ((hh <= 345 && ww <= 700) ? 33 : 35);
    const towerRail = mapPriority ? 44 : ((hh <= 345 && ww <= 700) ? 51 : 57);
    // Reserve exactly the width required for the largest full 5:3 canvas.
    // The remainder becomes useful spell and tower-inspection space.
    const mapHeight = Math.max(1, hh - header - towerRail - 7);
    const fieldWidth = Math.max(1, mapHeight * 5 / 3);
    const right = Math.max(172, Math.min(ww - 210, Math.round(ww - fieldWidth)));
    const current = document.body.style.getPropertyValue('--r56-right');
    const target = `${right}px`;
    document.body.classList.toggle('r93-narrow-spells', right < 230);
    if (current !== target) {
      document.body.style.setProperty('--r56-right', target, 'important');
      if (window.Reforged?.fitCanvas) requestAnimationFrame(() => window.Reforged?.fitCanvas?.());
    }
    const prep = $('wave-prep');
    const preparing = document.body.dataset.scene === 'play' && !!prep?.classList.contains('show');
    panel.hidden = !preparing;
    if (!preparing) return;
    const wave = normalize($('ui-wave')?.textContent);
    const roster = normalize($('wave-prep-roster')?.textContent);
    const threat = normalize($('wave-prep-note')?.textContent);
    const message = [wave ? `Волна ${wave}` : '', roster, threat].filter(Boolean).join(' · ') || 'Подготовка к следующей волне';
    const text = panel.querySelector('.r93-recon-text');
    if (text && text.textContent !== message) { text.textContent = message; text.title = message; }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  }
  function init() {
    ensureBriefing();
    const resize = () => schedule();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('orientationchange', resize, { passive: true });
    window.visualViewport?.addEventListener('resize', resize, { passive: true });
    media.addEventListener?.('change', resize);
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-scene'] });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    for (const id of ['wave-prep', 'ui-wave']) {
      const node = $(id);
      if (node) mo.observe(node, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    }
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  window.R93MobileBattle = Object.freeze({ active: visible, refresh: schedule, ensureLayout: sync });
})();
