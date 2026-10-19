/* R81 display-only decoration: never writes economy, stars or save state. */
(function(){'use strict';
 const map={hp:['fortress','ach_architect.svg','ОБОРОНА'],towerCap:['fortress','castle_tab.svg','ГАРНИЗОН'],skill1:['magic',1,'БОЕВАЯ МАГИЯ'],skill2:['magic',2,'БОЕВАЯ МАГИЯ'],skill3:['economy',3,'ЭКОНОМИКА'],unlock4:['magic',4,'АРКАНА'],unlock5:['magic',5,'АРКАНА']};
 const available=['ach_architect.svg','castle_tab.svg','resource_gold.svg'];
 let current='all';
 function iconFile(name){return typeof name==='number'?window.R78Icons.spellAsset(name):'images/ui-r78/icons/'+(name||'castle_tab.svg');}
 function decorate(stars,levels,upgrades,points,rank){
  const status=document.getElementById('r81-command-status');
  if(status){const affordable=Object.keys(upgrades).filter(k=>Number(levels[k])<upgrades[k].max && stars>=upgrades[k].cost[Number(levels[k])]);const first=affordable[0];const extra=first?'Следующий приказ: '+upgrades[first].title+' · '+upgrades[first].cost[Number(levels[first])]+' зв.':'Накопите звёзды для следующего улучшения';status.innerHTML='<span class="r81-command-kicker">ШТАБ · '+points+'/19 УКРЕПЛЕНИЙ</span><strong>Развитие цитадели</strong><span>'+rank+' · '+stars+' доступных звёзд · '+extra+'</span>';}
  document.querySelectorAll('#castle-ui .r65-upgrade').forEach(card=>{
    const key=card.dataset.r65Upgrade;const item=map[key]||['fortress','castle_tab.svg','КРЕПОСТЬ'];card.dataset.r81Category=item[0];
    const ico=card.querySelector('.r65-upgrade-icon');if(ico){const img=document.createElement('img');img.src=iconFile(item[1]);img.alt='';img.setAttribute('aria-hidden','true');if(typeof item[1]==='number'){img.className='r93-canonical-spell-icon';img.dataset.r93Spell=String(item[1]);ico.dataset.r93Spell=String(item[1]);}img.addEventListener('error',()=>{img.src=iconFile('castle_tab.svg')},{once:true});ico.replaceChildren(img);}
    const title=card.querySelector('.r65-upgrade-title small');if(title)title.textContent=item[2];
    card.classList.toggle('r81-hidden',current!=='all'&&current!==item[0]);
  });
 }
 function init(){const filters=document.getElementById('r81-groups');if(!filters||filters.dataset.r81Bound)return;filters.dataset.r81Bound='1';filters.addEventListener('click',ev=>{const btn=ev.target.closest('button[data-r81-filter]');if(!btn)return;current=btn.dataset.r81Filter;filters.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-pressed',String(b===btn))});document.querySelectorAll('#castle-ui .r65-upgrade').forEach(card=>card.classList.toggle('r81-hidden',current!=='all'&&current!==card.dataset.r81Category));});}
 window.R81HQ={decorate};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
