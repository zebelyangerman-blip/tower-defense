/* R83 | Royal archive interface: display-only categories. No saves, economy or combat writes. */
(function(global){
'use strict';
const active={achievements:'all',bestiary:'all',chronicles:'all'};
const groups={achievements:'r83-achievements-filters',bestiary:'r83-bestiary-filters',chronicles:'r83-chronicles-filters'};
function buttons(group){return document.querySelectorAll('#'+groups[group]+' [data-r83-filter]');}
function setPressed(group){for(const btn of buttons(group)){const on=btn.dataset.r83Filter===active[group];btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));}}
function totalAndShow(list,match){let count=0;for(const card of list){const ok=match(card);card.hidden=!ok;if(ok)count++;}return count;}
function refresh(group){
 if(group==='achievements'){
  const cards=Array.from(document.querySelectorAll('#achievements-ui .r83-achievement-card'));
  const earned=cards.filter(x=>x.dataset.r83Status==='earned').length;
  const progress=cards.filter(x=>x.dataset.r83Status==='progress').length;
  const waiting=cards.length-earned-progress;
  const visible=totalAndShow(cards,x=>active.achievements==='all'||x.dataset.r83Status===active.achievements);
  const counter=document.getElementById('r83-ach-counter');if(counter)counter.textContent=`Показано ${visible} / ${cards.length}`;
  const summary=document.getElementById('r83-ach-summary');if(summary)summary.textContent=`Получено ${earned} · В процессе ${progress} · Не начато ${waiting}`;
  setPressed(group);
 }
 if(group==='bestiary'){
  const cards=Array.from(document.querySelectorAll('#bestiary-ui .r83-bestiary-card'));
  const known=cards.filter(x=>x.dataset.r83Known==='yes').length;
  const visible=totalAndShow(cards,x=>active.bestiary==='all'||(active.bestiary==='known'&&x.dataset.r83Known==='yes')||(active.bestiary==='locked'&&x.dataset.r83Known==='no')||x.dataset.r83Kind===active.bestiary);
  const counter=document.getElementById('r83-best-counter');if(counter)counter.textContent=`Показано ${visible} / ${cards.length} · открыто ${known}`;
  setPressed(group);
 }
 if(group==='chronicles'){
  const cards=Array.from(document.querySelectorAll('#chronicles-ui .r83-chapter'));
  const visible=totalAndShow(cards,x=>active.chronicles==='all'||!x.classList.contains('locked'));
  const counter=document.getElementById('r83-chron-counter');if(counter)counter.textContent=cards.length?`Главы ${visible} / ${cards.length}`:'Переключитесь на обзор глав';
  const root=document.getElementById('r83-chronicles-filters');if(root)root.hidden=!cards.length;
  setPressed(group);
 }
 if(group==='profile'){
  const rank=document.getElementById('meta-rank-name')?.textContent||'Страж рубежа';
  const stars=document.getElementById('meta-stars-total')?.textContent||'0';
  const achievements=document.getElementById('meta-achievements-total')?.textContent||'0';
  const rankBox=document.getElementById('r83-profile-rank');if(rankBox)rankBox.textContent=rank;
  const summary=document.getElementById('r83-profile-summary');if(summary)summary.textContent=`Звёзды кампании: ${stars} · достижения: ${achievements}`;
 }
}
function init(){
 document.addEventListener('click',ev=>{
  const btn=ev.target.closest('[data-r83-filter]');if(!btn)return;
  const root=btn.closest('[id^="r83-"]');if(!root)return;
  const group=Object.keys(groups).find(x=>groups[x]===root.id);if(!group)return;
  if(!Array.from(buttons(group)).includes(btn))return;
  active[group]=btn.dataset.r83Filter;refresh(group);
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
global.R83Archive=Object.freeze({refresh,active:()=>Object.assign({},active)});
})(window);
