/* R91.4 | Semantic spell feedback. Real targets arrive in spell:resolved.
 * Rendering only: no gameplay writes, Math.random, new timers or RAF loop.
 * The simulation keeps existing instantaneous damage and game-time durations. */
'use strict';
const R91SpellFX=(()=>{
 const TAU=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const names={1:'meteor',2:'time-stop',3:'gold-reserve',4:'lightning',5:'void',6:'war-banner',7:'bastion',8:'rune-barrier',9:'armor-shred'};
 const colors={1:'#ffa85b',2:'#b3f0ed',3:'#f1cb70',4:'#b3efff',5:'#c09cee',6:'#edcb84',7:'#99dbb9',8:'#a7dfff',9:'#daa8f3'};
 let read=null,attached=false,records=[],last=null,eventCount=0,errors=0,draws=0;
 const time=()=>Reforged.time;
 function reduced(){const s=Reforged.settings;return s.motion==='reduced'||s.motion==='system'&&!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}
 function reset(){records=[];last=null;}
 function attach(fn){read=fn;if(attached)return;attached=true;
  Reforged.on('spell:resolved',p=>{try{
   if(!p || !names[p.id])return;
   const targets=(p.targets||[]).filter(t=>Number.isFinite(t.x+t.y)).map(t=>({x:t.x,y:t.y}));
   last={id:p.id,semantic:names[p.id],targets:targets.slice(),gold:p.gold||0,heal:p.heal||0};eventCount++;
   // Cap is cosmetic only. Actual spell targets have already been handled in game.js.
   if(records.length>=12)records.shift();
   records.push({...last,born:time(),life:p.id===1?.66:p.id===2?.95:.85});
  }catch(e){errors++;}});
 }
 function poly(c,p,fill,stroke,width=2){c.beginPath();p.forEach((v,i)=>i?c.lineTo(v[0],v[1]):c.moveTo(v[0],v[1]));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
 function ellipse(c,x,y,rx,ry,stroke,width=2,fill=null){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
 function shield(c,x,y,sz,color,cracked=false){
  const shape=[[x,y-sz],[x+sz*.76,y-sz*.58],[x+sz*.64,y+sz*.28],[x,y+sz],[x-sz*.64,y+sz*.28],[x-sz*.76,y-sz*.58]];
  poly(c,shape,'#182d3b',color,2.5);
  if(cracked){c.strokeStyle='#ffefcd';c.lineWidth=3;c.beginPath();c.moveTo(x+5,y-sz);c.lineTo(x-6,y-3);c.lineTo(x+6,y+3);c.lineTo(x-5,y+sz);c.stroke();
   for(const dir of [-1,1]){c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.moveTo(x+dir*sz*.9,y);c.lineTo(x+dir*sz*1.3,y-4);c.stroke();}
  }else{c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.moveTo(x,y-sz*.48);c.lineTo(x,y+sz*.58);c.moveTo(x-sz*.42,y-sz*.23);c.lineTo(x+sz*.42,y-sz*.23);c.stroke();}
 }
 function clock(c,x,y,r,p,color){
  ellipse(c,x,y,r,r,color,2.6,'#0f263045');
  for(let i=0;i<12;i++){const a=i*TAU/12;c.strokeStyle=color;c.lineWidth=1.6;c.beginPath();c.moveTo(x+Math.cos(a)*r*.82,y+Math.sin(a)*r*.82);c.lineTo(x+Math.cos(a)*r*.94,y+Math.sin(a)*r*.94);c.stroke();}
  c.strokeStyle='#e6ffec';c.lineWidth=3.2;c.lineCap='round';c.beginPath();c.moveTo(x-r*.24,y-r*.17);c.lineTo(x,y);c.lineTo(x,y-r*.60);c.stroke();
 }
 function meteor(c,x,y,p,still,color){
  // Arrival trail exists on the SAME frame as the instantaneous legacy hit.
  // No extra delayed damage, phantom target or new hitbox is introduced.
  const r=still?12:17*(1-p*.40),offset=still?0:p*7;
  if(!still){poly(c,[[x-83,y-134],[x+11,y-10],[x+6,y+8],[x-20,y-7]],'#ef6c2940',null);
   poly(c,[[x-51,y-103],[x+6,y-6],[x-8,y+4]],'#ffd47799',null);
   c.strokeStyle='#fff0b1';c.lineWidth=3;c.beginPath();c.moveTo(x-44,y-88);c.lineTo(x-5,y-15);c.stroke();}
  ellipse(c,x,y+8,15+p*39,5+p*14,color,2);
  poly(c,[[x-r,y-r*.6+offset],[x+r*.1,y-r+offset],[x+r,y-r*.05+offset],[x+r*.45,y+r*.8+offset],[x-r*.6,y+r*.7+offset]],'#614033',color,2.5);
  poly(c,[[x-r*.5,y-r*.3+offset],[x+r*.1,y-r*.7+offset],[x+r*.55,y+offset],[x-r*.2,y+r*.35+offset]],'#af7744','#ffe8ab',1);
 }
 // R91.7.7: semantic spell art only. Deterministic geometry; no spell damage/timing changes.
 function bolt(c,x0,y0,x1,y1,color,seed,low){
  const steps=low?5:8,dx=x1-x0,dy=y1-y0,ox=-dy/Math.max(1,Math.hypot(dx,dy)),oy=dx/Math.max(1,Math.hypot(dx,dy));
  const points=[];
  for(let j=0;j<=steps;j++){
   const t=j/steps,offset=(j===0||j===steps)?0:Math.sin(j*3.71+seed*5.39)*Math.min(20,Math.hypot(dx,dy)*.08);
   points.push([x0+dx*t+ox*offset,y0+dy*t+oy*offset]);
  }
  c.save();c.lineCap='round';c.lineJoin='round';
  const trace=(width,stroke,shadow)=>{
   c.strokeStyle=stroke;c.lineWidth=width;c.shadowBlur=shadow;c.shadowColor=color;
   c.beginPath();points.forEach((q,k)=>k?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]));c.stroke();
  };
  trace(low?4:7,color,low?1:9);trace(low?1.3:2.1,'#f2fcff',low?0:3);
  if(!low){
   const p=points[Math.floor(steps*.55)];c.shadowBlur=0;c.strokeStyle=color;c.lineWidth=1.6;
   c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(p[0]+(seed%2?29:-26),p[1]+26);c.stroke();
  }
  c.restore();
 }
 function flag(c,x,y,p,color){
  const top=y-47; c.strokeStyle='#d8b57a';c.lineWidth=3;c.beginPath();c.moveTo(x-12,y+3);c.lineTo(x-12,top);c.stroke();
  const sway=reduced()?0:Math.sin(p*5)*2;
  poly(c,[[x-11,top+2],[x+15,top+6+sway],[x+20,top+21],[x+3,top+16],[x-11,top+20]],'#9c6435',color,2);
  poly(c,[[x-2,top+7],[x+6,top+12],[x+1,top+17],[x-6,top+12]],color,null);
  ellipse(c,x,y,24,9,color,1.5);
 }
 function render(c,r){
  const age=time()-r.born,p=clamp(age/r.life,0,1),still=reduced(),low=(Reforged.effectiveQuality||Reforged.settings.quality)==='low';
  const a=(1-p)*(still?.62:.91),color=colors[r.id];c.save();c.globalAlpha=a;c.lineCap='round';
  const count=low?2:(Reforged.effectiveQuality||Reforged.settings.quality)==='high'?6:4;
  if(r.id===1){const pts=r.targets.length?r.targets:[{x:500,y:300}];for(const t of pts.slice(0,count))meteor(c,t.x,t.y,p,still,color);}
  else if(r.id===2){c.globalAlpha=a*.72;clock(c,500,300,still?44:44+p*22,p,color);if(!still){c.globalAlpha=a*.30;ellipse(c,500,300,82+p*210,48+p*120,color,2);}}
  else if(r.id===3){const x=125,y=80-(still?0:p*28);for(let i=0;i<3;i++){ellipse(c,x+i*16,y+10-i*9,13,5,'#fff2b7',2,'#ad783e');c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.moveTo(x+i*16-13,y+10-i*9);c.lineTo(x+i*16-13,y+16-i*9);c.moveTo(x+i*16+13,y+10-i*9);c.lineTo(x+i*16+13,y+16-i*9);c.stroke();} }
  else if(r.id===4){
   for(const [i,t] of r.targets.slice(0,count).entries()){
    // The arc itself must be readable, not only the target ring.
    const origin=i?r.targets[i-1]:{x:t.x-52,y:t.y-124};
    bolt(c,origin.x,origin.y,t.x,t.y,color,i,low);
    ellipse(c,t.x,t.y,15+p*19,7+p*8,color,2);
   }
  }
  else if(r.id===5){
   const s=read?.(),z=s?.hazards.find(h=>h.type==='blackhole'&&h.life>0);
   if(z){
    const radius=Math.min(160,Math.max(30,Number(z.aoe)||92));
    c.globalAlpha=a*.55;ellipse(c,z.x,z.y,radius,radius*.66,color,2);
    c.globalAlpha=a*.80;
    c.fillStyle='#111329';c.beginPath();c.ellipse(z.x,z.y,radius*.19,radius*.12,0,0,TAU);c.fill();
    for(let n=0;n<(low?2:4);n++){
     const phase=n*TAU/(low?2:4)+(still?0:p*.7);
     c.strokeStyle=n%2?'#d9b8ff':color;c.lineWidth=low?1.7:2.6;
     c.beginPath();c.ellipse(z.x,z.y,radius*(.42+n*.11),radius*(.26+n*.075),0,phase,phase+Math.PI*.72);c.stroke();
    }
   }
  }
  else if(r.id===6){for(const t of r.targets.slice(0,count))flag(c,t.x,t.y,p,color);}
  else if(r.id===7){const x=915,y=104;poly(c,[[x-23,y+12],[x-23,y-22],[x-17,y-22],[x-17,y-29],[x-10,y-29],[x-10,y-22],[x-3,y-22],[x-3,y+12]],'#2c4548',color,2);shield(c,x+10,y,22,color);if(r.heal>0){c.strokeStyle='#defbe0';c.lineWidth=3;c.beginPath();c.moveTo(x-15,y-9);c.lineTo(x-15,y+5);c.moveTo(x-22,y-2);c.lineTo(x-8,y-2);c.stroke();}}
  else if(r.id===8){const x=923,y=100;shield(c,x,y,27,color);ellipse(c,x,y,37,37,color,1.6);for(let j=0;j<6;j++){const a=j*TAU/6;poly(c,[[x+Math.cos(a)*43,y+Math.sin(a)*43],[x+Math.cos(a+.12)*38,y+Math.sin(a+.12)*38],[x+Math.cos(a-.12)*38,y+Math.sin(a-.12)*38]],color,null);}}
  else if(r.id===9){for(const t of r.targets.slice(0,count))shield(c,t.x+24,t.y-28,15,color,true);}
  c.restore();draws++;
 }
 function draw(c){try{const now=time();records=records.filter(r=>now>=r.born&&now-r.born<r.life);for(const r of records)render(c,r);}catch(e){errors++;}}
 return Object.freeze({attach,reset,draw,diagnostics:()=>({active:records.length,events:eventCount,draws,errors,last:last?{...last,targets:last.targets.map(t=>({...t}))}:null,quality:(Reforged.effectiveQuality||Reforged.settings.quality),reduced:reduced(),clock:time(),capacity:12})});
})();
window.R91SpellFX=R91SpellFX;
