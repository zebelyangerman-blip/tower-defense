(function(global){
  'use strict';
  /* R78 | purely visual iconography. No campaign data, saves or SDK hooks. */
  const VALID={"close_button":true,"volume":true,"ach_stars":true,"world-11":true,"arsenal_tab":true,"world-02":true,"resource_gold":true,"axe-crest":true,"world_thorn":true,"status_check":true,"arcane-spark":true,"menu_headquarters":true,"crown-rank":true,"spell_time":true,"tower_alchemist":true,"banner-crest":true,"defeat":true,"pause_button":true,"ach_killer":true,"tower_sniper":true,"bestiary_tab":true,"menu_settings":true,"resource_towers":true,"world_frost":true,"tower_cryogenic":true,"button_reward":true,"battle_speed":true,"profile-chart":true,"world-10":true,"music-lyre":true,"spell_lightning":true,"world-12":true,"world-17":true,"world-18":true,"key-crest":true,"world-06":true,"tower_laser":true,"obsidian-crest":true,"mute-horn":true,"tower_arrow":true,"lightbulb-scroll":true,"world-14":true,"achievement_tab":true,"wave_warning":true,"world_lava":true,"ach_1000":true,"spell_gold":true,"world-15":true,"clock-crest":true,"tide-crest":true,"castle_tab":true,"status_lock":true,"magic_tab":true,"sealed-document":true,"tower-siege":true,"world-13":true,"sand-crest":true,"victory":true,"world_storm":true,"world-09":true,"ach_first_100":true,"upgrading-anvil":true,"world-05":true,"runic-crest":true,"mirror-crest":true,"ach_engineer":true,"boss_alert":true,"save-cloud":true,"ach_architect":true,"triple-stars":true,"menu_start":true,"spell_meteor":true,"quest-target":true,"shadow-crest":true,"world-16":true,"ach_alchemist":true,"spell_blackhole":true,"spell_armor_break":true,"group-heralds":true,"world-01":true,"dragon-crest":true,"shield-crest":true,"tower_tesla":true,"world_forest":true,"resource_stars":true,"resource_lives":true,"menu_rules":true,"menu_story":true,"world-04":true,"world-08":true,"boss-skull":true,"world-03":true,"chronicles_tab":true,"world-07":true,"profile_tab":true,"tower_cannon":true,"poison-crest":true,"world_origin":true,"plan_tab":true};
  const GLYPHS={"⚔️":"menu_start","⚔":"menu_start","🏰":"menu_headquarters","📖":"menu_rules","📚":"chronicles_tab","📜":"chronicles_tab","⚙️":"menu_settings","⚙":"menu_settings","🛠️":"upgrading-anvil","🏗️":"ach_architect","🏗":"ach_architect","⭐":"resource_stars","🌟":"resource_stars","🌠":"resource_stars","❤️":"resource_lives","❤":"resource_lives","🛡️":"resource_lives","🛡":"resource_lives","💀":"bestiary_tab","☠️":"bestiary_tab","☠":"bestiary_tab","👑":"boss_alert","🏆":"victory","🏅":"achievement_tab","🎖️":"achievement_tab","👹":"ach_killer","🗺️":"plan_tab","🗺":"plan_tab","🌲":"world_forest","🌳":"world_forest","❄️":"world_frost","❄":"world_frost","🔥":"world_lava","🌿":"world_thorn","🌌":"world_origin","⛈️":"world_storm","⛈":"world_storm","🌩️":"world_storm","🌊":"tide-crest","⌛":"clock-crest","⏳":"clock-crest","⚒️":"obsidian-crest","⚒":"obsidian-crest","🕯️":"poison-crest","🐉":"dragon-crest","💠":"runic-crest","🔷":"runic-crest","🪞":"mirror-crest","🏛️":"castle_tab","💰":"spell_gold","🪙":"resource_gold","💾":"save-cloud","☁":"save-cloud","☁️":"save-cloud","🎬":"button_reward","🎥":"button_reward","🔒":"status_lock","🔐":"status_lock","✓":"status_check","✔️":"status_check","⚠️":"wave_warning","⚠":"wave_warning","⏸":"pause_button","⏸️":"pause_button","✨":"arcane-spark","✦":"arcane-spark","✧":"arcane-spark","🔮":"magic_tab","☄️":"spell_meteor","☄":"spell_meteor","⚡":"spell_lightning","♒":"tide-crest","🚩":"banner-crest","♣":"world_thorn","⬛":"obsidian-crest","🎯":"plan_tab","⬆️":"upgrading-anvil","⬆":"upgrading-anvil","🔊":"volume","🔇":"mute-horn","🎵":"music-lyre","👤":"profile_tab","👥":"group-heralds","📄":"sealed-document","📊":"profile-chart","💡":"lightbulb-scroll","🏹":"tower_arrow","🪓":"axe-crest","🗝️":"key-crest","🗿":"runic-crest","🎭":"mirror-crest","🌑":"shadow-crest","⚓":"tide-crest"};
  const ACH={"first_hundred":"ach_first_100","thousand_fallen":"ach_1000","architect":"ach_architect","engineer":"ach_engineer","arcanist":"arcane-spark","boss_hunter":"ach_killer","perfect_guard":"resource_lives","star_keeper":"ach_stars","star_master":"triple-stars","conqueror":"plan_tab","bestiary_master":"chronicles_tab","dark_king":"boss_alert"};
  const SKILLS={"1":"spell_meteor","2":"spell_time","3":"spell_gold","4":"spell_lightning","5":"spell_blackhole","6":"banner-crest","7":"resource_lives","8":"shield-crest","9":"spell_armor_break"};
  const ROOT='images/ui-r78/icons/';
  const escaped=Object.keys(GLYPHS).sort((a,b)=>b.length-a.length).map(s=>s.replace(/[\^$.*+?()[\]{}|]/g,'\\$&'));
  const token=new RegExp('(?:'+escaped.join('|')+')','gu');
  const quick=/[\u2600-\u27bf\u2300-\u23ff\u2b00-\u2bff\u{1f000}-\u{1ffff}]/u;
  const forbidden='SCRIPT STYLE NOSCRIPT TEXTAREA OPTION CODE PRE SVG CANVAS INPUT'.split(' ');
  const visited=new WeakSet();
  let suppress=0;
  function path(id){return ROOT+(VALID[id]?id:'menu_start')+'.svg';}
  function create(id,cls){
    if(!VALID[id])id='menu_start';
    const img=document.createElement('img');img.className='r78-icon'+(cls?' '+cls:'');
    img.src=path(id);img.width=32;img.height=32;img.alt='';
    img.setAttribute('aria-hidden','true');img.decoding='async';img.draggable=false;
    img.dataset.r78Icon=id;return img;
  }
  function html(id,cls){
    if(!VALID[id])id='menu_start';
    return '<img aria-hidden="true" alt="" draggable="false" class="r78-icon'+(cls?' '+cls.replace(/[^\w-]/g,''):'')+'" data-r78-icon="'+id+'" src="'+path(id)+'" />';
  }
  function world(id){let n=Math.min(18,Math.max(1,Number(id)||1));return 'world-'+String(n).padStart(2,'0');}
  function roleFromContext(parent,glyph){
    if(!parent || !parent.closest)return GLYPHS[glyph];
    const combatSkill=parent.closest('[data-skill-id], [data-r78-skill]');
    if(combatSkill && glyph==='⚔️' && Number(combatSkill.dataset.skillId || combatSkill.dataset.r78Skill)===9) return 'spell_armor_break';
    const achievement=parent.closest('[data-r78-achievement]');
    if(achievement && ACH[achievement.dataset.r78Achievement])return ACH[achievement.dataset.r78Achievement];
    const worldRow=parent.closest('[data-r78-world]');
    if(worldRow)return world(worldRow.dataset.r78World);
    if(parent.closest('.achievement-icon') && glyph==='🏗️')return 'ach_architect';
    return GLYPHS[glyph];
  }
  function paintText(node){
    if(!node || node.nodeType!==3 || !quick.test(node.data))return 0;
    const parent=node.parentElement;
    if(!parent || forbidden.includes(parent.tagName)||parent.closest('.r78-icon,[data-r78-skip]'))return 0;
    const raw=node.data;
    token.lastIndex=0;let match;let last=0;let count=0;
    const frag=document.createDocumentFragment();
    while((match=token.exec(raw))!==null){
      if(match.index>last)frag.appendChild(document.createTextNode(raw.slice(last,match.index)));
      frag.appendChild(create(roleFromContext(parent,match[0])));
      last=match.index+match[0].length;count++;
    }
    if(!count)return 0;
    if(last<raw.length)frag.appendChild(document.createTextNode(raw.slice(last)));
    suppress++;
    node.replaceWith(frag);
    suppress--;
    return count;
  }
  function paint(root){
    if(!root)return 0;
    if(root.nodeType===3)return paintText(root);
    if(root.nodeType!==1 && root.nodeType!==9 && root.nodeType!==11)return 0;
    if(root.nodeType===1 && (forbidden.includes(root.tagName)||root.classList.contains('r78-icon')||root.hasAttribute('data-r78-skip')))return 0;
    let count=0;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){
      if(!quick.test(n.data))return NodeFilter.FILTER_REJECT;
      const p=n.parentElement;
      if(!p || forbidden.includes(p.tagName)||p.closest('.r78-icon,[data-r78-skip]'))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const n of nodes)count+=paintText(n);
    return count;
  }
  let scheduled=false;const pending=new Set();
  function flush(){scheduled=false;const nodes=Array.from(pending);pending.clear();for(const n of nodes){if(n.isConnected)paint(n);}}
  const watcher=new MutationObserver(records=>{
    if(suppress)return;
    for(const rec of records){
      if(rec.type==='characterData'){if(quick.test(rec.target.data))pending.add(rec.target);continue;}
      for(const node of rec.addedNodes){
        if(node.nodeType===3){if(quick.test(node.data))pending.add(node);}
        else if(node.nodeType===1 && !node.classList.contains('r78-icon') && !forbidden.includes(node.tagName))pending.add(node);
      }
    }
    if(pending.size&&!scheduled){scheduled=true;queueMicrotask(flush);}
  });
  function init(){
    paint(document.body);
    watcher.observe(document.body,{childList:true,characterData:true,subtree:true});
    document.documentElement.dataset.r78Icons='ready';
  }
  global.R78Icons=Object.freeze({path,create,html,paint,world,
    achievement:id=>ACH[id]||'achievement_tab',skill:id=>SKILLS[id]||'magic_tab',
    getCount:()=>document.querySelectorAll('img.r78-icon').length});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})(window);
