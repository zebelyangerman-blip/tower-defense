/* R85 combat VFX layer. Presentation only: no gameplay writes, timers, or RAF. */
'use strict';
const R85VFX = (() => {
  const TWO_PI=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const cells={impact:0,ember:1,frost:2,lightning:3,poison:4,rune:5,shield:6,healing:7,void:8};
  const shot={BASIC:'impact',SNIPER:'impact',CANNON:'ember',FROST:'frost',LASER:'rune',TESLA:'lightning',ALCH:'poison',BALLISTA:'impact',STANDARD:'shield',WARDEN:'void'};
  const spells={1:'ember',2:'frost',3:'healing',4:'lightning',5:'void',6:'lightning',7:'shield',8:'rune',9:'void'};
  const palettes={13:'#76d5d5',14:'#efc77b',15:'#b1e76c',16:'#ffa45e',17:'#7ddfff',18:'#ddabff'};
  const state={fx:[],attached:false,events:{},rendered:0,dropped:0,drawErrors:0,peak:0,telegraphs:0,atlasLoaded:false,hasState:false};
  let game=null,lastTime=0,lastEffectAt=-100;
  const atlas=new Image();atlas.onload=()=>{state.atlasLoaded=true;};atlas.onerror=()=>{state.atlasLoaded=false;};
  atlas.src='images/fx-r85/r85_vfx_atlas.webp';
  const now=()=>Reforged.time;
  const reduced=()=>Reforged.settings.motion==='reduced'||(Reforged.settings.motion==='system'&&window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  function quality(){return Reforged.effectiveQuality||Reforged.settings.quality||'medium';}
  function limit(){return quality()==='low'?12:quality()==='high'?70:36;}
  function reset(){state.fx.length=0;lastEffectAt=-100;lastTime=now();}
  function add(kind,x,y,scale=1,life=.38,priority=1){
    if(!cells.hasOwnProperty(kind)||!Number.isFinite(x+y)||x< -90||x>1090||y< -90||y>690)return false;
    const t=now(),tier=quality();
    if(t<lastTime-.1)reset();lastTime=t;
    if(t-lastEffectAt<(tier==='low'?.037:.013)&&priority<3){state.dropped++;return false;}
    if(state.fx.length>=limit()){const idx=state.fx.findIndex(a=>a.priority<priority);if(idx>=0)state.fx.splice(idx,1);else{state.dropped++;return false;}}
    state.fx.push({kind,x,y,scale:clamp(scale,.2,3),start:t,life:Math.max(.07,life),priority});
    state.peak=Math.max(state.peak,state.fx.length);lastEffectAt=t;return true;
  }
  function attach(getState){
    game=getState;state.hasState=typeof getState==='function';
    if(state.attached)return;state.attached=true;
    const on=(event,fn)=>Reforged.on(event,p=>{state.events[event]=(state.events[event]||0)+1;try{fn(p);}catch(e){state.drawErrors++;}});
    on('projectile:impact',p=>{
      const kind=shot[p.sourceTower?.type?.id]||'impact';add(kind,p.x,p.y,kind==='ember'?1.05:.65,.28,2);
    });
    on('enemy:shield-break',e=>add('shield',e.x,e.y,1.05,.42,3));
    on('enemy:status',e=>{
      const f=e.effects||{};
      add(f.freeze>0||f.slow>0?'frost':f.poison>0?'poison':'rune',e.x,e.y,.46,.30,1);
    });
    on('enemy:ability',e=>add(e.isHealer?'healing':e.disableTower?'rune':e.type===24?'shield':'impact',e.x,e.y,.75,.34,2));
    on('boss:phase',e=>add(e.bossProfile?.worldId===18?'void':'rune',e.x,e.y,1.7,.70,3));
    on('boss:ability',e=>add(e.bossProfile?.worldId===17?'lightning':e.bossProfile?.worldId===16?'ember':e.bossProfile?.worldId===15?'poison':'rune',e.x,e.y,1.25,.38,3));
    on('spell:cast',id=>{
      // R91.4 semantic renderer uses the resolved event and exact affected targets.
      if(window.R91SpellFX)return;
      const s=game?.();const list=s?.enemies?.filter(e=>e.hp>0)||[];
      const kind=spells[id]||'rune';
      if(list.length){const stride=Math.max(1,Math.ceil(list.length/(quality()==='low'?2:5)));
        for(let i=0;i<list.length;i+=stride)add(kind,list[i].x,list[i].y,.7,.38,2);
      }else if(s?.towers?.length){const t=s.towers[0];add(kind,t.x,t.y,.85,.4,2);}
    });
  }
  function draw(ctx){
    const t=now();if(t<lastTime-.1)reset();lastTime=t;
    const low=quality()==='low',still=reduced();
    let j=0;
    ctx.save();
    for(let i=0;i<state.fx.length;i++){
      const p=state.fx[i],age=t-p.start;if(age>=p.life)continue;
      state.fx[j++]=p;
      let k=clamp(age/p.life,0,1),fade=(1-k)*(still?.38:1),size=64*p.scale*(still?.7:1);
      if(low){ctx.globalAlpha=fade*.38;ctx.strokeStyle=({frost:'#a6edff',ember:'#ffbd70',lightning:'#b2e8ff',poison:'#b6ec86',healing:'#a6efbf',void:'#d2b6fc'}[p.kind]||'#f4deb3');ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,size*.29*(.65+k*.3),0,TWO_PI);ctx.stroke();}
      else if(state.atlasLoaded){
        let idx=cells[p.kind];ctx.globalAlpha=fade*(quality()==='high'?.82:.62);
        let growth=still?1:(.72+k*.58),r=size*growth;
        ctx.drawImage(atlas,(idx%3)*192,Math.floor(idx/3)*192,192,192,p.x-r/2,p.y-r/2,r,r);
      }else{ctx.globalAlpha=fade*.6;ctx.fillStyle='#d1ebed';ctx.beginPath();ctx.arc(p.x,p.y,3*p.scale,0,TWO_PI);ctx.fill();}
      state.rendered++;
    }
    ctx.restore();state.fx.length=j;
  }
  function drawTelegraph(ctx,e){
    if(!e?.bossPendingAbility)return false;
    const progress=clamp(1-e.bossTelegraphTimer/Math.max(1,e.bossTelegraphMax),0,1);
    const world=Number(e.bossProfile?.worldId)||1;
    const color=palettes[world]||'#ffce8d',r=e.drawSize*(.43+(e.bossPhase||0)*.025)+16;
    const still=reduced()||quality()==='low',phase=still?0:now()*1.8;
    const segments=world===16?8:world===17?6:world===18?10:6;
    ctx.save();ctx.lineCap='round';ctx.strokeStyle=color;ctx.fillStyle=color;
    // Unconditional critical warning: quality/reduced-motion never removes it.
    ctx.globalAlpha=.93;ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(e.x,e.y,r,-Math.PI/2,-Math.PI/2+TWO_PI*progress);ctx.stroke();
    ctx.lineWidth=1.4;ctx.globalAlpha=.68;
    for(let i=0;i<segments;i++){
      const a=-Math.PI/2+i*TWO_PI/segments+phase*.07;
      let x=e.x+Math.cos(a)*r,y=e.y+Math.sin(a)*r;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*7,y+Math.sin(a)*7);ctx.stroke();
    }
    for(const target of e.bossTelegraphTargets||[]){
      if(!Number.isFinite(target.x+target.y))continue;
      const x=target.x,y=target.y;
      ctx.lineWidth=2.2;ctx.globalAlpha=.86;
      ctx.beginPath();ctx.arc(x,y,39,0,TWO_PI);ctx.stroke();
      ctx.lineWidth=3.4;ctx.beginPath();ctx.arc(x,y,44,-Math.PI/2,-Math.PI/2+TWO_PI*progress);ctx.stroke();
      // Cross / circuit nodes do not obscure the target tower.
      ctx.lineWidth=1.2;ctx.globalAlpha=.68;
      for(let j=0;j<4;j++){const a=j*Math.PI/2;
        ctx.beginPath();ctx.moveTo(x+Math.cos(a)*48,y+Math.sin(a)*48);ctx.lineTo(x+Math.cos(a)*56,y+Math.sin(a)*56);ctx.stroke();}
      ctx.setLineDash([3,7]);ctx.globalAlpha=.24;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(x,y);ctx.stroke();ctx.setLineDash([]);
      // World-specific micro-details are always outside the 39px true target zone.
      ctx.globalAlpha=.73;ctx.lineWidth=1.7;
      if(world===16){
        for(let n=0;n<4;n++){const a=n*Math.PI/2+.38;
          ctx.beginPath();ctx.moveTo(x+Math.cos(a)*48,y+Math.sin(a)*48);
          ctx.lineTo(x+Math.cos(a+.16)*57,y+Math.sin(a+.16)*57);
          ctx.lineTo(x+Math.cos(a-.08)*62,y+Math.sin(a-.08)*62);ctx.stroke();}
      }else if(world===17){
        for(let n=0;n<3;n++){const a=n*TWO_PI/3;
          ctx.beginPath();ctx.moveTo(x+Math.cos(a)*49,y+Math.sin(a)*49);
          ctx.lineTo(x+Math.cos(a+.11)*59,y+Math.sin(a+.11)*59);
          ctx.lineTo(x+Math.cos(a-.09)*54,y+Math.sin(a-.09)*54);
          ctx.lineTo(x+Math.cos(a+.05)*65,y+Math.sin(a+.05)*65);ctx.stroke();}
      }else if(world===18){
        for(let n=0;n<6;n++){const a=n*TWO_PI/6;
          ctx.beginPath();ctx.moveTo(x+Math.cos(a)*51,y+Math.sin(a)*51);
          ctx.lineTo(x+Math.cos(a+.14)*57,y+Math.sin(a+.14)*57);
          ctx.lineTo(x+Math.cos(a-.14)*57,y+Math.sin(a-.14)*57);ctx.closePath();ctx.stroke();}
      }
    }
    ctx.restore();state.telegraphs++;return true;
  }
  function drawStance(ctx,e){
    if(e.hp<=0)return;
    const m=e.r69Mechanic;
    const boss=e.isBoss&&e.r69BossStanceTimer>0;
    if(!(m?.stanceCycleFrames>0||boss))return;
    const phys=boss?e.r69BossStance==='physical':m.stance===0;
    const c=phys?'#f5b56f':'#84dcff',r=Math.min(60,e.drawSize*.36),y=e.y-e.drawSize*.52-14,x=e.x+(e.isBoss?61:43);
    ctx.save();ctx.fillStyle='#101d27';ctx.strokeStyle=c;ctx.lineWidth=1.6;ctx.globalAlpha=.92;
    ctx.beginPath();ctx.moveTo(x-10,y-9);ctx.lineTo(x+10,y-9);ctx.lineTo(x+8,y+8);ctx.lineTo(x,y+12);ctx.lineTo(x-8,y+8);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.beginPath();if(phys){ctx.moveTo(x-6,y+3);ctx.lineTo(x-6,y-3);ctx.lineTo(x+6,y-3);ctx.lineTo(x+6,y+3);}
    else{ctx.moveTo(x+2,y-7);ctx.lineTo(x-5,y+1);ctx.lineTo(x+1,y+1);ctx.lineTo(x-2,y+8);ctx.lineTo(x+6,y-2);ctx.lineTo(x+1,y-2);}
    ctx.stroke();ctx.restore();
  }
  return Object.freeze({attach,reset,draw,drawTelegraph,drawStance,diagnostics:()=>({atlasLoaded:state.atlasLoaded,active:state.fx.length,peak:state.peak,dropped:state.dropped,rendered:state.rendered,telegraphs:state.telegraphs,drawErrors:state.drawErrors,events:{...state.events},hasState:state.hasState,quality:quality(),reduced:reduced()})});
})();
window.R85VFX=R85VFX;
