/* R49 - fixed mobile presentation, explicit navigation, no new game loop. */
(function(global){
'use strict';
const query=matchMedia('(max-width:1023px), (max-height:600px)');
const $=id=>document.getElementById(id);
let infoFocus=null,toastTimer=null,selectedWorld=null;
function isMobile(){return query.matches;}
function closeInfo(){const el=$('r49-info');if(!el)return;el.classList.remove('open');if(infoFocus?.isConnected)infoFocus.focus({preventScroll:true});}
function info(title,paragraphs){
 infoFocus=document.activeElement;
 $('r49-info-title').textContent=title;
 const box=$('r49-info-body');box.replaceChildren();
 paragraphs.filter(Boolean).forEach(text=>{const p=document.createElement('p');p.textContent=text;box.appendChild(p);});
 $('r49-info').classList.add('open');box.scrollTop=0;$('r49-info-close').focus({preventScroll:true});
}
function waveDetails(){info('\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0430 \u043a \u0432\u043e\u043b\u043d\u0435', ['wave-prep-title','wave-prep-text','wave-prep-roster','wave-prep-objective','wave-prep-note'].map(id=>$(id)?.textContent));}
function rewardToast(amount){const el=$('r49-reward-toast');if(!el)return;clearTimeout(toastTimer);el.textContent=`+${amount} \u0437\u043e\u043b\u043e\u0442\u0430 \u00b7 \u0440\u0430\u043d\u043d\u044f\u044f \u0432\u043e\u043b\u043d\u0430`;el.classList.add('show');toastTimer=setTimeout(()=>el.classList.remove('show'),1900);}
function group(value){
 const val=value==='magic'?'magic':'towers';$('bottom-panel').dataset.r49Group=val;
 document.querySelectorAll('[data-r49-tab]').forEach(btn=>btn.setAttribute('aria-selected',String(btn.dataset.r49Tab===val)));
 // A spell tab cannot keep an invisible tower-placement tool armed.
 if(val==='magic'&&typeof clearTowerSelection==='function')clearTowerSelection();
}
function updateCampaign(){
 if(typeof state==='undefined')return;
 const current=TD_DATA.getLevel(state.level).worldId;
 if(selectedWorld===null)selectedWorld=current;
 const select=$('r49-world-select');
 if(!select.options.length){for(let n=1;n<=12;n++){const w=TD_DATA.getWorld(n),opt=document.createElement('option');opt.value=String(n);opt.textContent=`${n}. ${w.name}`;select.appendChild(opt);}}
 select.value=String(selectedWorld);
 document.querySelectorAll('#level-selector .world-card').forEach(card=>card.classList.toggle('r49-world-hidden',Number(card.dataset.worldId)!==selectedWorld));
 $('r49-campaign-play').textContent=`\u0418\u0433\u0440\u0430\u0442\u044c: \u0443\u0440. ${state.level}`;
}
function openCampaign(){
 selectedWorld=TD_DATA.getLevel(state.level).worldId;
 document.body.dataset.r49Menu='campaign';
 if(typeof setCampaignPage==='function')setCampaignPage(campaignPageForWorld(selectedWorld));
 updateCampaign();$('r49-world-select').focus({preventScroll:true});
}
function metaLabels(){
 const names={castle:'Замок',arsenal:'Арсенал',magic:'Магия',chronicles:'Хроники',achievements:'Награды',bestiary:'Бестиарий',profile:'Профиль',plan:'План'};
 document.querySelectorAll('.meta-tab').forEach(button=>{if(!button.dataset.r49Original){button.dataset.r49Original=button.textContent;button.setAttribute('aria-label',button.textContent);}button.textContent=isMobile()?names[button.dataset.metaTab]:button.dataset.r49Original;});
}
function mount(){
 const overlay=document.createElement('div');overlay.id='r49-info';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','r49-info-title');
 overlay.innerHTML='<section class="r49-info-card"><header class="r49-info-head"><h2 id="r49-info-title"></h2><button id="r49-info-close" type="button" aria-label="\u0417\u0430\u043a\u0440\u044b\u0442\u044c">\u00d7</button></header><div id="r49-info-body" tabindex="0"></div></section>';
 document.body.appendChild(overlay);$('r49-info-close').addEventListener('click',closeInfo);
 overlay.addEventListener('click',e=>{if(e.target===overlay)closeInfo();});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeInfo();}if(e.key==='Tab'){const focus=document.activeElement;if(e.shiftKey&&focus===$('r49-info-close')){e.preventDefault();$('r49-info-body').focus();}else if(!e.shiftKey&&focus===$('r49-info-body')){e.preventDefault();$('r49-info-close').focus();}}});
 const toast=document.createElement('div');toast.id='r49-reward-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.appendChild(toast);
 $('r49-dock-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-r49-tab]');if(b)group(b.dataset.r49Tab);});
 $('r49-dock-tabs').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const next=$('bottom-panel').dataset.r49Group==='towers'?'magic':'towers';group(next);document.querySelector(`[data-r49-tab="${next}"]`).focus();}});
 $('r49-upgrade-info').addEventListener('click',()=>info($('upg-title').textContent,['upg-role','path-1-name','path-1-desc','path-2-name','path-2-desc'].map(id=>$(id).textContent)));
 $('r49-result-details').addEventListener('click',()=>info('\u0418\u0442\u043e\u0433\u0438 \u0431\u043e\u044f',[$('result-desc').textContent,...Array.from(document.querySelectorAll('.result-stat')).map(el=>el.innerText),$('result-progression').textContent]));
 $('r49-open-campaign').addEventListener('click',openCampaign);
 $('r49-campaign-back').addEventListener('click',()=>{document.body.dataset.r49Menu='home';$('r49-open-campaign').focus({preventScroll:true});});
 $('r49-campaign-play').addEventListener('click',()=>startGame());
 $('r49-world-select').addEventListener('change',e=>{selectedWorld=Number(e.target.value);setCampaignPage(campaignPageForWorld(selectedWorld));updateCampaign();});
 new MutationObserver(updateCampaign).observe($('level-selector'),{childList:true});
 // Only observe screen visibility, never the whole animated canvas/DOM subtree.
 const observer=new MutationObserver(()=>{if(typeof state==='undefined')return;if(state.screen!=='play'){closeInfo();if(state.screen==='menu')group('towers');}if(state.screen==='play'&&state.wave===0)group('towers');updateCampaign();});
 document.querySelectorAll('.screen').forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['class']}));
 updateCampaign();metaLabels();query.addEventListener?.('change',()=>{closeInfo();updateCampaign();metaLabels();Reforged.scene();});
}
global.R49UI=Object.freeze({isMobile,waveDetails,rewardToast,info,closeInfo,group});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(window);
