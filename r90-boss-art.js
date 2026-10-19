/* R90 boss rigs - ART ONLY.
 * Six distinct bosses of worlds XIII-XVIII; 3 phase rows of 6 states x 4 frames.
 * Driven EXCLUSIVELY by existing boss state/timers; no combat mutation, RAF or save writes.
 */
'use strict';
const R90BOSS=(()=>{
  const FIRST=13,LAST=18,CELL=128,STATES=['idle','move','attack','hit','transition','death'];
  const NAMES=Object.freeze({13:'admiral',14:'chronos',15:'thornmother',16:'obsidian',17:'regent',18:'origin'});
  const counts={draw:0,fallback:0,death:0,echo:0,byBoss:{},byState:{},invalid:0};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const id=(e)=>NAMES[Number(e?.bossProfile?.worldId)]||'';
  const assetKey=(worldId)=>NAMES[Number(worldId)]?'boss_'+NAMES[Number(worldId)]+'_anim_r90':null;
  function supports(e){return !!e?.isBoss&&!!id(e)&&!!e.bossProfile&&e.hp>0;}
  function source(e,assets){return assets?.[assetKey(e?.bossProfile?.worldId)];}
  function ready(a){return !!a?.ready&&a.naturalWidth===CELL*4&&a.naturalHeight===CELL*18;}
  function pose(e,m){
    const phase=clamp(Math.floor(Number(e.bossPhase)||0),0,2);
    const time=Number(e.bossTime)||0;
    let state=0,frame=0;
    if(e.hp<=0){
      state=5;frame=3;
    }else if(e.bossSpawnTimer>0){
      state=4;frame=clamp(Math.floor((1-e.bossSpawnTimer/Math.max(1,e.bossSpawnMax||80))*4),0,3);
    }else if(e.bossPhaseFlash>0){
      state=4;frame=clamp(Math.floor((1-e.bossPhaseFlash/90)*4),0,3);
    }else if(e.bossPendingAbility&&e.bossTelegraphTimer>0){
      state=2;frame=clamp(Math.floor((1-e.bossTelegraphTimer/Math.max(1,e.bossTelegraphMax))*4),0,3);
    }else if(e.hitFlash>0){
      state=3;frame=clamp(Math.floor((1-e.hitFlash/7)*4),0,3);
    }else if(m&&m.speedRatio>.08){
      state=1;frame=((Math.floor((m.walk||0)*4/(Math.PI*2))%4)+4)%4;
    }else{
      state=0;frame=Math.floor(time/15)%4;
    }
    return {phase,state,frame,row:phase*STATES.length+state};
  }
  // Purely visual phase identification: atlas, hit box and actual boss phases remain authoritative.
  function phaseSigil(c,world,phase,size){
    if(phase<1)return;
    const tint=({13:'#80e4f9',14:'#d4c2ff',15:'#fa83b8',16:'#ffbd70',17:'#9de8ff',18:'#dfbcff'})[world]||'#c8e7eb';
    const r=size*(phase===1?.44:.51),yr=size*.31;
    c.save();c.strokeStyle=tint;c.globalAlpha=phase===1?.76:.92;
    c.lineWidth=Math.max(1.8,size*.018);
    c.beginPath();c.ellipse(0,yr,r,r*.29,0,0,Math.PI*2);c.stroke();
    if(phase===2){
      // A second distinct segmented ring and six stable rune ticks. Never mask the boss sprite.
      c.lineWidth=Math.max(1.8,size*.015);c.setLineDash([Math.max(3,size*.07),Math.max(2,size*.04)]);
      c.beginPath();c.ellipse(0,yr,r+size*.065,(r+size*.065)*.33,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
      for(let i=0;i<6;i++){
       const angle=i*Math.PI/3,xx=Math.cos(angle)*(r+size*.035),yy=yr+Math.sin(angle)*r*.31;
       c.beginPath();c.moveTo(xx,yy-size*.04);c.lineTo(xx+Math.cos(angle)*size*.033,yy-size*.07);c.stroke();
      }
    }
    c.restore();
  }
  function draw(c,e,m,size,assets){
    if(!supports(e))return false;
    const a=source(e,assets);if(!ready(a)){counts.fallback++;return false;}
    const p=pose(e,m);
    if(p.phase>0)phaseSigil(c,Number(e.bossProfile.worldId)||0,p.phase,size);
    c.drawImage(a,p.frame*CELL,p.row*CELL,CELL,CELL,-size/2,-size/2,size,size);
    counts.draw++;counts.byBoss[id(e)]=(counts.byBoss[id(e)]||0)+1;
    counts.byState[STATES[p.state]]=(counts.byState[STATES[p.state]]||0)+1;
    return true;
  }
  // Freeze the exact live pose for a trail, never borrow a legacy boss or a death row.
  function decorateEcho(g,assets,e,m){
    if(!e?.isBoss||!id(e))return false;
    const image=source(e,assets);if(!ready(image))return false;
    g.r90Boss=id(e);g.r90Echo=true;g.r90Phase=clamp(Math.floor(e.bossPhase||0),0,2);
    g.r90Pose=pose(e,m);g.image=image;g.bossAtlas=false;g.cell=CELL;return true;
  }
  function drawEcho(c,g,size){
    if(!g?.r90Echo||!g.r90Pose||!ready(g.image))return false;
    const frame=clamp(g.r90Pose.frame|0,0,3),row=clamp(g.r90Pose.row|0,0,17);
    c.drawImage(g.image,frame*CELL,row*CELL,CELL,CELL,-size/2,-size/2,size,size);counts.echo++;return true;
  }
  function decorateDeath(g,assets,e){
    // Death event happens AFTER hp is set to zero. Do not use supports(), which requires hp>0.
    if(!e?.isBoss||!id(e))return false;
    const a=source(e,assets);if(!ready(a))return false;
    g.r90Echo=false;g.r90Pose=null;g.r90Boss=id(e);g.r90Phase=clamp(Math.floor(e.bossPhase||0),0,2);
    g.image=a;g.bossAtlas=false;g.cell=CELL;
    return true;
  }
  function drawDeath(c,g,size,t){
    if(!g?.r90Boss||g.r90Echo||!ready(g.image))return false;
    const phase=clamp(Math.floor(g.r90Phase||0),0,2);
    const frame=clamp(Math.floor(t*4),0,3);
    c.drawImage(g.image,frame*CELL,(phase*6+5)*CELL,CELL,CELL,-size/2,-size/2,size,size);
    counts.death++;return true;
  }
  function diagnostics(){return {draw:counts.draw,fallback:counts.fallback,death:counts.death,echo:counts.echo,invalid:counts.invalid,byBoss:{...counts.byBoss},byState:{...counts.byState}};}
  return Object.freeze({assetKey,supports,pose,draw,decorateEcho,drawEcho,decorateDeath,drawDeath,diagnostics,cell:CELL,states:STATES.slice()});
})();
window.R90BOSS=R90BOSS;
