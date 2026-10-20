/* R79: purely presentational menu/pause binder. Never modifies simulation or saves. */
(function(){'use strict';
 const $=id=>document.getElementById(id);
 function visible(el){return !!el && !el.classList.contains('hidden');}
 function renderPause(){
  if(!visible($('screen-pause')))return;
  // Freeze the already drawn REAL battlefield as a background without touching game state.
  const c=$('gameCanvas'),overlay=$('screen-pause');
  try{if(c && c.width && c.height){const uri=c.toDataURL('image/webp',.57);
    if(uri && uri.startsWith('data:image/'))overlay.style.setProperty('--r79-live-map','url("'+uri+'")');}}
  catch(e){/* On tainted canvases use the bundled backplate; pause behavior never depends on capture. */}
  const world=$('ui-world-name')?.textContent?.trim() || 'Королевская кампания';
  const level=$('ui-level')?.textContent?.trim() || '1';
  const wave=$('ui-wave')?.textContent?.trim() || '0/0';
  const lives=$('ui-lives')?.textContent?.trim() || '';
  const gold=$('ui-gold')?.textContent?.trim() || '';
  if($('r79-pause-world'))$('r79-pause-world').textContent='Уровень '+level+' · '+world;
  if($('r79-pause-wave'))$('r79-pause-wave').textContent='Волна '+wave+(lives?'   •   Замок '+lives:'')+(gold?'   •   Золото '+gold:'');
 }
 function requestExit(){
  if(!visible($('screen-pause')))return;
  $('r79-exit-confirm')?.classList.remove('hidden');
  $('screen-pause')?.classList.add('r79-confirm-exit');
  $('r79-cancel-exit')?.focus();
 }
 function dismissExit(){
  $('r79-exit-confirm')?.classList.add('hidden');
  $('screen-pause')?.classList.remove('r79-confirm-exit');
 }
 function cancelExit(){dismissExit();$('r79-request-exit')?.focus();}
 function confirmExit(){dismissExit();if(typeof window.returnToMenu==='function')window.returnToMenu();}
 function init(){
  const pause=$('screen-pause');
  if(pause){const observer=new MutationObserver(()=>renderPause());observer.observe(pause,{attributes:true,attributeFilter:['class']});}
  document.querySelectorAll('#screen-menu .menu-main-actions button,#screen-pause .screen-actions button').forEach(button=>{
   // Preserve existing inline click handlers, disabled state and keyboard behavior.
   if(button.type!=='button')button.type='button';
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && visible($('r79-exit-confirm'))){event.preventDefault();event.stopImmediatePropagation();cancelExit();}},true);
  window.R79UI=Object.freeze({renderPause,requestExit,cancelExit,confirmExit,dismissExit,version:'1.6.21.7.4'});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
