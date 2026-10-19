/* R81 display-only decoration: never writes economy, stars or save state. */
(function(){'use strict';
 const map={hp:['fortress','ach_architect.svg','ОБОРОНА'],towerCap:['fortress','castle_tab.svg','ГАРНИЗОН'],skill1:['magic','spell_meteor.svg','БОЕВАЯ МАГИЯ'],skill2:['magic','spell_time.svg','БОЕВАЯ МАГИЯ'],skill3:['economy','resource_gold.svg','ЭКОНОМИКА'],unlock4:['magic','spell_lightning.svg','АРКАНА'],unlock5:['magic','spell_blackhole.svg','АРКАНА']};
 const available=['ach_architect.svg','castle_tab.svg','resource_gold.svg'];
 let current='all';
 function iconFile(name){return 'images/ui-r78/icons/'+(name||'castle_tab.svg');}
 function decorate(stars,levels,upgrades,points,rank){
  const status=document.getElementById('r81-command-status');
  if(status){const affordable=Object.keys(upgrades).filter(k=>Number(levels[k])<upgrades[k].max && stars>=upgrades[k].cost[Number(levels[k])]);const first=affordable[0];const extra=first?'Следующий приказ: '+upgrades[first].title+' · '+upgrades[first].cost[Number(levels[first])]+' зв.':'Накопите звёзды для следующего улучшения';status.innerHTML='<span class="r81-command-kicker">ШТАБ · '+points+'/19 УКРЕПЛЕНИЙ</span><strong>Развитие цитадели</strong><span>'+rank+' · '+stars+' доступных звёзд · '+extra+'</span>';}
  document.querySelectorAll('#castle-ui .r65-upgrade').forEach(card=>{
    const key=card.dataset.r65Upgrade;const item=map[key]||['fortress','castle_tab.svg','КРЕПОСТЬ'];card.dataset.r81Category=item[0];
    const ico=card.querySelector('.r65-upgrade-icon');if(ico){const img=document.createElement('img');img.src=iconFile(item[1]);img.alt='';img.setAttribute('aria-hidden','true');img.addEventListener('error',()=>{img.src=iconFile('castle_tab.svg')},{once:true});ico.replaceChildren(img);}
    const title=card.querySelector('.r65-upgrade-title small');if(title)title.textContent=item[2];
    card.classList.toggle('r81-hidden',current!=='all'&&current!==item[0]);
  });
 }
 function init(){const filters=document.getElementById('r81-groups');if(!filters||filters.dataset.r81Bound)return;filters.dataset.r81Bound='1';filters.addEventListener('click',ev=>{const btn=ev.target.closest('button[data-r81-filter]');if(!btn)return;current=btn.dataset.r81Filter;filters.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-pressed',String(b===btn))});document.querySelectorAll('#castle-ui .r65-upgrade').forEach(card=>card.classList.toggle('r81-hidden',current!=='all'&&current!==card.dataset.r81Category));});}
 window.R81HQ={decorate};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
