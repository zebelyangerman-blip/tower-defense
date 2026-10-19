/* Royal Bastion Renaissance R82: presentation filter only; no save, unlock or combat changes. */
(function(){'use strict';
 const mode={tower:'all',magic:'all'};
 function refresh(kind){
  const root=document.querySelector(kind==='tower'?'#meta-panel-arsenal':'#meta-panel-magic');if(!root)return;
  const filter=mode[kind], attr=kind==='tower'?'data-r82-kind':'data-r82-magic';
  const cards=root.querySelectorAll(kind==='tower'?'.r82-tower-card':'.r82-spell-card');
  cards.forEach(el=>{el.hidden=filter!=='all'&&el.getAttribute(attr)!==filter;});
  root.querySelectorAll('[data-r82-filter]').forEach(b=>{
    const active=b.dataset.r82Filter===filter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
  });
  const counter=root.querySelector('[data-r82-visible-count]');
  if(counter)counter.textContent=`Показано ${Array.from(cards).filter(el=>!el.hidden).length} из ${cards.length}`;
 }
 document.addEventListener('click',ev=>{
    const btn=ev.target.closest('[data-r82-filter]');if(!btn)return;
    const kind=btn.closest('#meta-panel-arsenal')?'tower':btn.closest('#meta-panel-magic')?'magic':null;
    if(!kind)return;mode[kind]=btn.dataset.r82Filter;refresh(kind);
 });
 window.R82Gallery=Object.freeze({refresh,filters:()=>Object.assign({},mode)});
})();
