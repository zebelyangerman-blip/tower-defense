/* REFORGED presentation. No game rules, random gameplay, save schema, or extra RAF here. */
'use strict';
const Reforged = (() => {
    const TAU = Math.PI * 2;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const mix = (a, b, t) => a + (b - a) * t;
    const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
    const QUALITY = Object.freeze({
        low:    { particles: 76, ambience: 8,  trail: 3, smoke: 0.35, lights: false },
        medium: { particles: 220, ambience: 26, trail: 6, smoke: 0.65, lights: true },
        high:   { particles: 420, ambience: 48, trail: 8, smoke: 1, lights: true }
    });
    const PROFILES = Object.freeze({
        BASIC:  { color:'#9dc8ee', hot:'#fce5a9', kick:4,  kind:'spark', sound:'shot-basic', life:.18 },
        SNIPER: { color:'#9deac4', hot:'#eafff1', kick:6,  kind:'spark', sound:'shot-sniper', life:.24 },
        CANNON: { color:'#ed9f68', hot:'#fff2b3', kick:9,  kind:'ember', sound:'shot-cannon', life:.36 },
        FROST:  { color:'#88dfec', hot:'#e4ffff', kick:2,  kind:'shard', sound:'shot-frost', life:.26 },
        LASER:  { color:'#c2a1fa', hot:'#fbeaff', kick:1,  kind:'spark', sound:'shot-laser', life:.12 },
        TESLA:  { color:'#7de5ea', hot:'#f0ffff', kick:3,  kind:'spark', sound:'shot-tesla', life:.19 },
        ALCH:   { color:'#b3d563', hot:'#f1ffc2', kick:4,  kind:'mist',  sound:'shot-alch', life:.30 }
    });
    const WORLDS = Object.freeze([
        null,
        {name:'green_marches', color:'#ccde9c', sky:'#223d33', kind:'leaf',   wind:16, fog:.025, glow:'#c2eba0'},
        {name:'frost_pass', color:'#d9f6ff', sky:'#30445c', kind:'snow',      wind:32, fog:.07, glow:'#92d9ec'},
        {name:'ashen_frontier', color:'#efb285', sky:'#423229', kind:'ash',  wind:13, fog:.045, glow:'#ff9351'},
        {name:'haunted_marsh', color:'#96baba', sky:'#253c3b', kind:'wisp',  wind:7, fog:.10, glow:'#9bdac3'},
        {name:'dragon_highlands', color:'#deb58b', sky:'#3b343e', kind:'dust', wind:27, fog:.035, glow:'#efb46a'},
        {name:'shadow_citadel', color:'#b6a3df', sky:'#252038', kind:'rune', wind:9, fog:.065, glow:'#bca0f7'},
        {name:'shard_frontier', color:'#accde8', sky:'#2c304b', kind:'shard', wind:19, fog:.04, glow:'#a9c3fa'},
        {name:'mirror_glaciers', color:'#d8edfa', sky:'#263e4e', kind:'mirror', wind:22, fog:.055, glow:'#bbefff'},
        {name:'void_forges', color:'#edb383', sky:'#452b35', kind:'ember', wind:10, fog:.035, glow:'#f49852'},
        {name:'nameless_city', color:'#cfc0a8', sky:'#343744', kind:'paper', wind:15, fog:.075, glow:'#c6b994'},
        {name:'shattered_sky', color:'#badbef', sky:'#273a4f', kind:'sky', wind:43, fog:.055, glow:'#a2e2f6'},
        {name:'heart_of_verge', color:'#c6aaf6', sky:'#332443', kind:'void', wind:-12, fog:.05, glow:'#d4a0ff'}
    ]);
    const errors = [], events = Object.create(null), listeners = new Map();
    let time = 0, worldId = 1, assets = {}, game = null, soundHook = null, stateReader = null;
    let seed = 0x638bc137, ambience = [], towerMotion = new WeakMap(), enemyMotion = new WeakMap();
    let finishRemaining = 0, lastAmbientCue = 0, canvasScale = 1, crowded = false;
    const particleBudget = () => crowded ? Math.min(quality.particles, 120) : quality.particles;
    const textDraw = [];
    const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    const diagnostics = {frames:0, frameTotal:0, framePeak:0, downgraded:0, dropped:0, particlePeak:0, ghostPeak:0, textPeak:0};
    let config = {version:1, quality:'medium', auto:true, motion:'system', shake:true, text:true};
    try {
        const saved = JSON.parse(localStorage.getItem('td_reforged_visual_v1') || 'null');
        if (saved && saved.version === 1) {
            if (QUALITY[saved.quality]) config.quality = saved.quality;
            for (const key of ['auto','shake','text']) if (typeof saved[key] === 'boolean') config[key] = saved[key];
            if (['system','reduced','full'].includes(saved.motion)) config.motion = saved.motion;
        }
    } catch (_) { /* Storage refusal must never prevent gameplay. */ }
    let quality = QUALITY[config.quality], overloaded = 0, warmup = 4;
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduced = () => config.motion === 'reduced' || (config.motion === 'system' && reducedQuery.matches);
    function warn(error) { if (errors.length < 12) errors.push(String(error && error.message || error)); }
    function persist() { try { localStorage.setItem('td_reforged_visual_v1', JSON.stringify(config)); } catch (_) {} }
    function sound(name) { if (soundHook) { try { soundHook(name); } catch (error) { warn(error); } } }

    // Stable storage: each pool is allocated once and reused. Priority 0 is decoration,
    // 2 is combat, 3 is a major action. Critical telegraphs are drawn directly from simulation.
    class Pool {
        constructor(size) { this.items = Array.from({length:size}, () => ({active:false, age:0, life:0, priority:0})); this.count=0; this.cursor=0; }
        take(priority, limit=this.items.length) {
            let slot = null;
            if (this.count < Math.min(limit, this.items.length)) {
                for (let n=0; n<this.items.length; n++) {
                    const index = (this.cursor + n) % this.items.length;
                    if (!this.items[index].active) { slot=this.items[index]; this.cursor=(index+1)%this.items.length; this.count++; break; }
                }
            }
            if (!slot) {
                let score = Infinity;
                for (const candidate of this.items) {
                    if (candidate.active && candidate.priority < priority) {
                        const value = candidate.priority * 10 - candidate.age / candidate.life;
                        if (value < score) { slot=candidate; score=value; }
                    }
                }
            }
            if (!slot) { diagnostics.dropped++; return null; }
            slot.active=true; slot.age=0; slot.priority=priority;
            return slot;
        }
        release(item) { if (item.active) { item.active=false; this.count--; } }
        clear() { for (const item of this.items) { item.active=false; item.image=null; item.animation=null; } this.count=0; }
    }
    const particles = new Pool(448), rings = new Pool(80), ghosts = new Pool(72), texts = new Pool(72), decals = new Pool(32);
    const stamps = new Map();
    function stamp(color, soft=false) {
        const key=color+(soft?'s':'l'); if (stamps.has(key)) return stamps.get(key);
        const c=document.createElement('canvas'); c.width=c.height=64;
        const x=c.getContext('2d'); const g=x.createRadialGradient(32,32,0,32,32,32);
        g.addColorStop(0,color); g.addColorStop(soft?.3:.12,color); g.addColorStop(1,'rgba(0,0,0,0)');
        x.fillStyle=g; x.fillRect(0,0,64,64); stamps.set(key,c); return c;
    }
    const shadowStamp = (() => {
        const c=document.createElement('canvas'); c.width=96;c.height=48;
        const x=c.getContext('2d'); x.scale(1,.5);const g=x.createRadialGradient(48,48,4,48,48,46);g.addColorStop(0,'rgba(0,0,0,.55)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,96,96);return c;
    })();
    function ring(x,y,color,radius,life=.4,priority=2,kind='ring') {
        const p=rings.take(priority); if(!p)return;
        Object.assign(p,{x,y,color,radius,life,kind,angle:random()*TAU});
    }
    function burst(x,y,color,count,kind='spark',power=1,priority=2,angle=null) {
        const mult=priority>=2?(config.quality==='low'?.5:config.quality==='high'?1:.75):quality.smoke;
        const total=Math.max(priority>=2?1:0,Math.round(Math.min(70,count)*mult));
        for(let i=0;i<total;i++) {
            const p=particles.take(priority,particleBudget()); if(!p)break;
            const a=angle===null?random()*TAU:angle+(random()-.5)*1.2;
            const speed=(20+random()*105)*power;
            const smoke=kind==='smoke'||kind==='mist';
            Object.assign(p,{x,y,prevX:x,prevY:y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
                color,kind,life:smoke?.48+random()*.42:.16+random()*.35,
                size:(smoke?9+random()*12:kind==='shard'?3+random()*4:1.4+random()*2.2)*Math.sqrt(power),
                angle:a,spin:(random()-.5)*8,drag:smoke?3:4,gravity:kind==='debris'?90:kind==='ember'?-22:smoke?-14:18});
        }
    }
    function legacyParticles(x,y,color,count,sizeMult=1,smoke=false,line=false) {
        if(!Number.isFinite(x+y))return;
        burst(x,y,color,Math.min(8,count),smoke?'smoke':line?'spark':'dot',Math.min(1.4,Math.sqrt(sizeMult)),smoke?0:1);
    }
    function legacyExplosion(x,y,color,count,smoke=false) {
        if(!Number.isFinite(x+y))return;
        burst(x,y,color,Math.min(20,count),smoke?'smoke':'spark',1.15,1);
    }
    function floatText(x,y,text,color,size=18) {
        if(!Number.isFinite(x+y))return;
        const value=String(text), numeric=/^[+\-\u2212]?\d+(?:[.,]\d+)?$/.test(value);
        if(numeric&&!config.text)return;
        // Continuous beams aggregate their damage numbers instead of allocating 60 labels/s.
        if(numeric) {
            for(const t of texts.items) if(t.active&&t.numeric&&t.color===color&&t.age<.20&&Math.abs(t.x-x)<30&&Math.abs(t.y-y)<35) {
                t.value += Number(value.replace(',','.')); t.text=String(Math.round(t.value*10)/10); return;
            }
        } else {
            for(const t of texts.items) if(t.active&&t.text===value&&t.age<.35&&Math.hypot(t.x-x,t.y-y)<70)return;
        }
        const t=texts.take(numeric?1:3,numeric?40:72);if(!t)return;
        Object.assign(t,{x:x+(random()-.5)*8,y,text:value,value:Number(value),numeric,color,size:clamp(size,16,23),life:numeric?.72:1.0});
    }
    // Distance-driven actor motion. These records never write gameplay coordinates or timers.
    const GAITS=RF_MOTION.gaits, BOSS_SIGNATURES=RF_MOTION.bosses;
    let actorSequence=0, replaySeed=null, sceneSeed=0x638bc137, contactFxBudget=0, lastFootCue=-10;
    let scenery=[], scenePaths=[], sceneSlots=[];
    const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
    function gaitFor(e) {return e.isBoss?BOSS_SIGNATURES[clamp((e.bossProfile?.worldId||worldId)-1,0,11)]:(GAITS[e.type]||GAITS[0]);}
    function phaseHash(n) {n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;}
    function setReplaySeed(value) { replaySeed=Number.isFinite(value)?value>>>0:null; }
    function advanceEnemy(e,dtFrames,moving) {
        const m=motion(enemyMotion,e),p=m.gait||(m.gait=gaitFor(e));
        const dt=clamp(Number(dtFrames)||0,0,6)/60;
        let dx=e.x-m.lastX,dy=e.y-m.lastY,distance=Math.hypot(dx,dy);
        m.lastX=e.x;m.lastY=e.y;
        // Blink handlers reset the origin. This second bound also protects callers restoring a scene.
        if(distance>Math.max(32,(e.speed||e.baseSpeed||1)*Math.max(1,dtFrames)*2.5))distance=0;
        m.distance=distance;
        if(e.effects.freeze>0||e.effects.stun>0)return m;
        m.clock+=dt;
        const oldContact=Math.floor(m.walk/Math.PI);
        m.walk+=distance/Math.max(24,p.stride)*TAU;
        if(m.walk>TAU*100000)m.walk%=TAU;
        if(distance>.001&&dt>0){
            let target=Math.atan2(dy,dx);
            const path=e.path,next=path?.[e.pathIndex],after=path?.[e.pathIndex+1];
            if(next&&after){const left=Math.hypot(next.x-e.x,next.y-e.y),anticipation=clamp(1-left/Math.max(24,e.drawSize*.32),0,1)*.35;
                target+=angleDelta(Math.atan2(after.y-next.y,after.x-next.x),target)*anticipation;}
            const delta=angleDelta(target,m.heading);
            m.heading+=delta*(1-Math.exp(-dt*p.turn));
            m.bank=mix(m.bank,clamp(delta,-.8,.8),1-Math.exp(-dt*8));
            const face=Math.cos(m.heading);if(Math.abs(face)>.22)m.faceTarget=face<0?-1:1;
            m.facing=mix(m.facing,m.faceTarget,1-Math.exp(-dt*(p.turn+7)));
            m.speedRatio=mix(m.speedRatio,clamp(distance/Math.max(.001,dt*60*(e.baseSpeed||1)),0,2.5),1-Math.exp(-dt*12));
        }else{m.speedRatio=mix(m.speedRatio,0,1-Math.exp(-dt*10));m.bank*=Math.exp(-dt*9);}
        if(moving&&distance>.001&&Math.floor(m.walk/Math.PI)!==oldContact&&p.hover<.6){
            m.contact=m.clock;m.footSide=Math.floor(m.walk/Math.PI)%2?1:-1;
            if(contactFxBudget>0&&p.weight>.55&&!reduced()){
                contactFxBudget--;burst(e.x+m.footSide*e.drawSize*.10,e.y+e.drawSize*(p.ground||.34),p.foot==='ice'?'#b0e5ec':p.foot==='forge'?'#eab780':'#b3a58c',p.weight>.8?3:1,p.foot==='ice'?'shard':'smoke',.28,0);
            }
            if(e.x>20&&e.x<980&&e.y>15&&e.y<585&&time-lastFootCue>(e.isBoss?.16:.22)&&(e.isBoss||p.weight>.65||(!crowded&&m.serial%7===0))){
                lastFootCue=time;sound('step-'+(e.isBoss?'boss':p.foot));
            }
        }
        // A real aura pulse is observed, not a new simulation ability.
        if(e.hasteAura&&e.hasteAuraTimer<m.auraTimer)emit('enemy:ability',e);
        m.auraTimer=e.hasteAuraTimer||0;
        if(contactFxBudget>0&&!reduced()&&config.quality!=='low'&&distance>.001&&m.clock-m.detailAt>.22&&(!crowded||m.serial%4===0)){
            m.detailAt=m.clock;
            const spectral=p.hover>.6||p.family==='erase',fast=(p.family==='run'||p.family==='rage')&&m.speedRatio>.9&&distance/Math.max(dt,.001)>150;
            if(spectral||fast){contactFxBudget--;actorEcho(e,m,fast?.11:.17);}
            else if(p.fx==='electric'||p.fx==='ember'||p.fx==='ice'||p.fx==='rune'){
                contactFxBudget--;burst(e.x,e.y+e.drawSize*.22,e.color,1,p.fx==='ice'?'shard':p.fx==='ember'?'ember':'spark',.28,0);
            }
        }
        return m;
    }
    function actorEcho(e,m,opacity) {
        if(config.quality==='low'||reduced())return;
        const g=ghosts.take(0,46);if(!g)return;
        const boss=e.isBoss?gaitFor(e):null;
        Object.assign(g,{echo:true,x:e.x,y:e.y,size:e.drawSize,flip:m.facing<0,angle:0,kind:'echo',life:.22,color:e.color,
            opacity,image:boss?assets[boss.atlasKey]||assets[e.imgKey]:assets[e.animation?.assetKey]||assets[e.imgKey],
            animation:e.animation,frame:e.animFrame||0,row:e.animState==='hit'?2:e.animState==='walk'?1:0,bossAtlas:!!boss&&!!assets[boss.atlasKey]?.ready,
            cell:boss?.cell||e.animation?.frameWidth||128,isBoss:false,signature:0});
    }
    function abilityWarmth(e,m) {
        if(e.isBoss)return e.bossPendingAbility?clamp(1-e.bossTelegraphTimer/Math.max(1,e.bossTelegraphMax),0,1):0;
        if(e.blink&&e.blinkCooldown<20)return 1-e.blinkCooldown/20;
        if(e.disableTower&&e.disableCooldown<24)return 1-e.disableCooldown/24;
        if(e.isHealer)return clamp((e.healCooldown-e.healCooldownFrames+22)/22,0,1);
        if(e.hasteAura)return clamp((e.hasteAuraTimer-e.hastePulseFrames+10)/10,0,1)*.35;
        return 0;
    }
    // Cache exact atlas tiles rather than repeatedly transforming a large atlas.
    // Two bounded LRU pools: 16 MiB for 128px tiles, 6 MiB for 256px boss tiles.
    // Pixel content and animation timing are unchanged; misses use the original atlas.
    const frameSources=new WeakMap();
    const framePools=[{size:128,limit:256,slots:[]},{size:256,limit:24,slots:[]}];
    const frameCacheStats={hits:0,misses:0,bytes:0};
    let frameUse=0;
    function drawFrame(c,image,sx,sy,sw,sh,dx,dy,dw,dh) {
        const pool=sw===sh?(sw===128?framePools[0]:sw===256?framePools[1]:null):null;
        if(!pool){c.drawImage(image,sx,sy,sw,sh,dx,dy,dw,dh);return;}
        let source=frameSources.get(image);
        if(!source){const columns=Math.max(1,Math.floor((image.naturalWidth||image.width)/sw));source={columns,frames:[]};frameSources.set(image,source);}
        const index=Math.floor(sy/sh)*source.columns+Math.floor(sx/sw);
        let tile=source.frames[index];
        if(tile){frameCacheStats.hits++;tile.used=++frameUse;}
        else {
            frameCacheStats.misses++;
            if(pool.slots.length<pool.limit){
                const surface=document.createElement('canvas');surface.width=sw;surface.height=sh;
                const context=surface.getContext('2d');
                if(!context){c.drawImage(image,sx,sy,sw,sh,dx,dy,dw,dh);return;}
                tile={surface,context,owner:null,index:0,used:0};pool.slots.push(tile);frameCacheStats.bytes+=sw*sh*4;
            }else{
                tile=pool.slots[0];for(let i=1;i<pool.slots.length;i++)if(pool.slots[i].used<tile.used)tile=pool.slots[i];
                if(tile.owner)tile.owner.frames[tile.index]=null;
            }
            const x=tile.context;x.clearRect(0,0,sw,sh);x.imageSmoothingEnabled=false;
            x.drawImage(image,sx,sy,sw,sh,0,0,sw,sh);
            tile.owner=source;tile.index=index;tile.used=++frameUse;source.frames[index]=tile;
        }
        c.drawImage(tile.surface,dx,dy,dw,dh);
    }

    function enemyBody(c,e,m,size) {
        if(e.isBoss){
            const p=gaitFor(e),atlas=assets[p.atlasKey];
            if(atlas?.ready){
                const floating=p.hover>.6||p.family==='wing';
                const phase=floating?m.clock*(.48+e.bossPhase*.075)+m.phase/TAU:m.walk/TAU;
                const frame=((Math.floor(phase*p.frames)%p.frames)+p.frames)%p.frames;
                drawFrame(c,atlas,frame*p.cell,0,p.cell,p.cell,-size/2,-size/2,size,size);return;
            }
        }else if(e.drawAnimationFrame(size,c))return;
        if(assets[e.imgKey]?.ready)c.drawImage(assets[e.imgKey],-size/2,-size/2,size,size);
    }
    function locomotionTransform(e,m) {
        const p=m.gait||gaitFor(e),amp=reduced()?.28:1,phase=m.walk,step=Math.sin(phase),double=Math.cos(phase*2);
        let bob=0,sway=0,compress=0;
        if(p.family==='float'||p.family==='mirror'){
            bob=Math.sin(m.clock*1.65+m.phase)*p.bob;sway=Math.sin(m.clock*.91+m.phase)*p.sway;
        }else if(p.family==='heavy'||p.family==='guard'){
            bob=-p.bob*(1-double)*.5;compress=Math.max(0,double)*.013*p.weight;sway=step*p.sway;
        }else if(p.family==='odd'){
            bob=-Math.abs(step)*p.bob;sway=(step+Math.sin(phase*2+.8)*.28)*p.sway;
        }else if(p.family==='robe'){
            bob=-Math.abs(step)*p.bob;sway=Math.sin(phase-.7)*p.sway;
        }else if(p.family==='wing'){
            bob=Math.sin(m.clock*2.5+m.phase)*p.bob;sway=Math.sin(m.clock*1.8+m.phase)*p.sway;
        }else{
            bob=-Math.abs(step)*p.bob;sway=step*p.sway*(p.family==='skulk'?.45:.75);
        }
        const rage=e.rageTriggered?1.3:1;
        m.bob=bob*amp*rage;m.sway=sway*amp;
        m.squash=compress*amp;
        m.lean=clamp((Math.cos(m.heading)*p.lean*m.speedRatio*rage+m.bank*.065+step*p.cloth*.009)*amp,-.14,.14);
    }
    function actorAccent(c,e,m,after=false) {
        const p=m.gait||gaitFor(e),s=e.drawSize,phase=m.clock,rich=config.quality!=='low'&&!crowded;
        if(e.isBoss){bossMotif(c,gaitFor(e),s,m.clock,e.bossPhase,after);return;}
        const warm=abilityWarmth(e,m),cast=Math.max(0,1-(time-m.ability)/.58),effect=Math.max(warm,cast);
        c.save();c.strokeStyle=e.color;c.fillStyle=e.color;c.lineWidth=1.2;c.globalAlpha=after?.60:.35;
        if(p.family==='guard'&&after){
            const recoil=Math.max(0,1-(time-m.shieldHit)/.18),x=s*.24-recoil*3,y=2+Math.sin(m.walk-.6)*1.3;
            c.strokeStyle='#9ee6ef';c.lineWidth=1.5;c.beginPath();c.moveTo(x-9,y-12);c.lineTo(x+8,y-9);c.lineTo(x+7,y+9);c.lineTo(x,y+16);c.lineTo(x-8,y+7);c.closePath();
            if(e.shieldHp>0){c.stroke();if(recoil>0){c.globalAlpha=recoil*.45;c.fill();}}
        }else if(p.family==='robe'&&after){
            if(effect>0){c.globalAlpha=.3+effect*.45;c.translate(s*.22,-s*.18-effect*5);polygon(c,0,0,5+effect*4,4,phase*.5);c.stroke();glow(c,0,0,16,e.color,effect*.35);}
            if(rich&&!reduced()){c.globalAlpha=.25;c.beginPath();c.moveTo(-s*.23,s*.14);c.quadraticCurveTo(Math.sin(phase*1.4+m.phase)*6,s*.32,s*.21,s*.28);c.stroke();}
        }else if((p.family==='float'||p.family==='erase')&&!after&&rich){
            c.globalAlpha=.20;for(let i=0;i<2;i++){const y=s*.12+i*7;c.beginPath();c.moveTo(-s*.3,y);c.quadraticCurveTo(Math.sin(phase*1.7+i)*s*.22,y+12,s*.3,y+3);c.stroke();}
        }else if(p.family==='mirror'&&after){
            c.globalAlpha=.35;c.beginPath();c.moveTo(-s*.22,-s*.16);c.lineTo(s*.16,s*.22);c.stroke();
        }else if((p.fx==='electric'||p.family==='shard')&&after&&(rich||p.fx==='electric')){
            const v=Math.sin(phase*4+m.phase);c.globalAlpha=.25+Math.abs(v)*.2;c.beginPath();c.moveTo(-s*.24,-s*.14);c.lineTo(-s*.15,-s*.21-v*2);c.lineTo(-s*.18,-s*.05);c.stroke();
        }else if(p.fx==='ember'&&after){
            const heat=.25+(1-clamp(e.hp/e.maxHp,0,1))*.35;c.globalAlpha=heat;c.fillStyle='#ffc786';circle(c,-s*.20,s*.02,2);c.fill();circle(c,s*.21,s*.08,2);c.fill();
        }
        c.restore();
    }

    function crystal(c,x,y,w,h,color,tilt=0) {
        c.save();c.translate(x,y);c.rotate(tilt);c.fillStyle=color;c.strokeStyle='#dfedf0';c.lineWidth=.8;
        c.beginPath();c.moveTo(0,-h);c.lineTo(w,0);c.lineTo(0,h*.65);c.lineTo(-w,0);c.closePath();c.fill();c.stroke();
        c.globalAlpha*=.4;c.fillStyle='#071824';c.beginPath();c.moveTo(0,-h);c.lineTo(w,0);c.lineTo(0,h*.65);c.closePath();c.fill();c.restore();
    }
    function bossMotif(c,p,size,clock,phase,after=false) {
        const r=size*.40,t=reduced()?0:clock*(1+phase*.16),rich=config.quality!=='low'&&!crowded;
        const color=WORLDS[p.world].glow;
        c.save();c.strokeStyle=color;c.fillStyle=color;c.lineWidth=1.6;c.globalAlpha=after?.48:.31;
        if(after){
            // Small body accents have a different topology from the ground signature.
            if(p.motif==='anvil'||p.motif==='plates'){
                c.globalAlpha=.28+phase*.12;for(let i=-1;i<=1;i+=2){c.beginPath();c.moveTo(i*r*.42,r*.22);c.lineTo(i*r*.58,r*.12);c.lineTo(i*r*.70,r*.35);c.stroke();}
            }else if(p.motif==='wings'||p.motif==='stormwings'){
                c.globalAlpha=.35;c.beginPath();c.moveTo(-r*.65,-r*.22);c.quadraticCurveTo(-r*.25,-r*.12,r*.15,-r*.25);c.stroke();
            }else if(p.motif==='singularity'){
                c.globalAlpha=.12+phase*.05;glow(c,0,-r*.05,r*.32,color,.7);
            }else if(p.motif==='souls'||p.motif==='pages'){
                c.globalAlpha=.40;circle(c,r*.26,-r*.16,3+phase);c.stroke();
            }else{
                c.globalAlpha=.32+phase*.08;c.beginPath();c.moveTo(-r*.16,-r*.48);c.lineTo(0,-r*.55);c.lineTo(r*.16,-r*.48);c.stroke();
            }
            c.restore();return;
        }
        switch(p.motif){
            case 'fang':
                for(let i=-1;i<=1;i+=2){c.fillStyle='#97765b';c.beginPath();c.moveTo(i*r*.67,r*.42);c.lineTo(i*r*.92,-r*.20);c.lineTo(i*r*.74,-r*.04);c.lineTo(i*r*.51,r*.35);c.closePath();c.fill();c.stroke();
                    if(phase){c.fillStyle='#bc7065';c.beginPath();c.moveTo(i*r*.76,-r*.19);c.lineTo(i*r*.92,-r*.08+Math.sin(t*2)*3);c.lineTo(i*r*.78,r*.22);c.closePath();c.fill();}}
                break;
            case 'crown':
                for(let i=0;i<5+phase;i++){const a=-Math.PI+(i/(4+phase))*Math.PI;crystal(c,Math.cos(a)*r*.72,Math.sin(a)*r*.65-r*.15,4+i%2,11+phase*3,color,a+Math.PI/2);}
                c.beginPath();c.ellipse(0,r*.45,r*.88,r*.22,0,0,TAU);c.stroke();break;
            case 'souls':
                for(let i=0;i<3+phase;i++){const a=t*.7+i*TAU/(3+phase),x=Math.cos(a)*r*.77,y=Math.sin(a)*r*.45;c.globalAlpha=.22+.22*(1+Math.sin(a))*.5;circle(c,x,y,4);c.fill();c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+Math.sin(a)*18,y+20,x-8,y+34);c.stroke();}
                break;
            case 'plates':
                for(let i=0;i<4+phase;i++){const a=i*TAU/(4+phase),x=Math.cos(a)*r*.75,y=r*.51+Math.sin(a)*r*.22;c.fillStyle='#74796d';polygon(c,x,y,7+phase*2,5,a);c.fill();c.stroke();}
                c.beginPath();c.moveTo(-r*.85,r*.66);c.lineTo(-r*.4,r*.71);c.lineTo(-r*.23,r*.60);c.lineTo(r*.20,r*.77);c.lineTo(r*.84,r*.67);c.stroke();break;
            case 'wings':
                c.globalAlpha=.2+phase*.07;c.strokeStyle='#e9a07b';
                for(let side=-1;side<=1;side+=2){c.beginPath();c.moveTo(side*r*.32,r*.23);c.quadraticCurveTo(side*r*.76,-r*.5-Math.sin(t*2)*3,side*r*1.10,-r*.22);c.lineTo(side*r*.83,r*.24);c.stroke();}
                if(rich)glow(c,r*.2,r*.26,r*.42,'#e28f63',.17+phase*.07);break;
            case 'crownblade':
                for(let i=-1;i<=1;i++){c.save();c.translate(i*r*.52,-r*.27+Math.sin(t*.8+i)*2);c.rotate(i*.26);c.beginPath();c.moveTo(0,-r*.65);c.lineTo(5,-r*.24);c.lineTo(0,r*.12);c.lineTo(-5,-r*.24);c.closePath();c.fill();c.stroke();c.restore();}
                break;
            case 'riftblade':
                c.lineWidth=2;c.beginPath();c.moveTo(-r*.85,r*.43);c.lineTo(r*.68,-r*.68);c.moveTo(-r*.77,r*.60);c.lineTo(r*.84,-r*.5);c.stroke();
                for(let i=0;i<2+phase;i++){const a=t*.35+i*TAU/(2+phase);crystal(c,Math.cos(a)*r*.8,Math.sin(a)*r*.65,4,13,color,a);}
                break;
            case 'mirrors':
                for(let i=0;i<3+phase;i++){const a=-Math.PI/2+i*TAU/(3+phase),x=Math.cos(a)*r*.83,y=Math.sin(a)*r*.65;c.save();c.translate(x,y);c.rotate(Math.sin(t*.7+i)*.14);c.strokeRect(-7,-16,14,32);c.beginPath();c.moveTo(-5,12);c.lineTo(5,-11);c.stroke();c.restore();}
                break;
            case 'anvil':
                c.fillStyle='#967960';for(let side=-1;side<=1;side+=2){c.save();c.translate(side*r*.72,r*.2);c.rotate(side*.12);c.fillRect(-8,-12,16,25);c.strokeRect(-8,-12,16,25);c.fillStyle='#f5b676';for(let i=0;i<2+phase;i++)c.fillRect(-6,-8+i*6,12,2);c.restore();}
                break;
            case 'pages':
                for(let i=0;i<4+phase;i++){const a=t*.27+i*TAU/(4+phase),x=Math.cos(a)*r*.84,y=Math.sin(a)*r*.66;
                    c.save();c.translate(x,y);c.rotate(Math.sin(t*1.2+i)*.3);c.fillStyle='#dccca1';c.fillRect(-5,-8,10,16);c.strokeStyle='#34393d';c.beginPath();c.moveTo(-3,-3);c.lineTo(3,-3);c.moveTo(-3,1);c.lineTo(2,1);c.stroke();c.restore();}break;
            case 'stormwings':
                for(let i=0;i<2+phase;i++){c.beginPath();c.ellipse(0,r*.15,r*(.72+i*.09),r*(.24+i*.02),-.18+t*.04,i*.7,Math.PI+i*.7);c.stroke();}
                c.beginPath();c.moveTo(-r*.82,-r*.28);c.lineTo(-r*.54,-r*.46);c.lineTo(-r*.62,-r*.17);c.lineTo(-r*.39,-r*.27);c.stroke();break;
            case 'singularity':
                c.globalAlpha=.23;c.fillStyle='#100e22';circle(c,0,0,r*.58);c.fill();
                for(let i=0;i<6+phase*2;i++){const a=t*.32+i*TAU/(6+phase*2);crystal(c,Math.cos(a)*r*.9,Math.sin(a)*r*.57,3,7+phase*2,color,a);}
                c.strokeStyle=color;for(let i=0;i<phase+1;i++){c.beginPath();c.ellipse(0,0,r*.96,r*.62,-.24,t*.2+i*2,t*.2+i*2+1.6);c.stroke();}break;
        }
        c.restore();
    }
    function bossBurst(e,kind) {
        const p=gaitFor(e),color=e.bossProfile?.phaseColor||e.color;
        const fx=rings.take(3);if(fx)Object.assign(fx,{x:e.x,y:e.y,color,radius:e.drawSize*.52,life:kind==='death'?1.2:.65,kind:'signature',signature:p.world,phase:e.bossPhase||0,angle:0});
        burst(e.x,e.y,color,kind==='death'?28:kind==='phase'?22:12,p.particle,kind==='death'?1.3:1.0,3);
        sound('boss-'+kind+'-'+p.world);
    }

    function metal(c,x,y,w,h,accent) {
        c.fillStyle='#273a43';c.strokeStyle='#adc0c2';c.lineWidth=1;c.fillRect(x,y,w,h);c.strokeRect(x,y,w,h);
        c.fillStyle=accent;c.fillRect(x+1,y+1,Math.max(1,w-2),Math.min(2,h-2));
    }
    function vial(c,x,y,color,wide=7) {
        c.fillStyle='#213a3d';c.strokeStyle='#b8d5cc';c.lineWidth=1;c.fillRect(x-wide/2,y-9,wide,18);c.strokeRect(x-wide/2,y-9,wide,18);
        c.fillStyle=color;c.globalAlpha*=.8;c.fillRect(x-wide/2+1,y-1,wide-2,9);c.globalAlpha/= .8;
        c.fillStyle='#a0b2b3';c.fillRect(x-wide/2-1,y-11,wide+2,3);
        if(!reduced()){c.fillStyle='#edf6d0';circle(c,x,y+5-((time*5+x)%8+8)%8,1);c.fill();}
    }
    function towerHardware(c,t,f,up) {
        if(!t.tier)return;
        const branch=t.path,accent=branch===1?'#d5b080':'#a5cdd6';
        for(let level=1;level<=t.tier;level++){
            const progress=level===t.tier?easeOut(clamp(up*1.3-.06,0,1)):1;
            c.save();c.globalAlpha*=.25+.75*progress;c.translate(-(1-progress)*9,(level%2?1:-1)*(1-progress)*6);
            switch(t.type.id){
                case 'BASIC':
                    if(branch===1){
                        if(level===1)metal(c,-18,-15,12,7,accent);
                        else if(level===2){metal(c,10,-10,28,6,accent);metal(c,10,4,28,6,accent);}
                        else{c.fillStyle='#30434a';circle(c,-12,0,14);c.fill();c.strokeStyle=accent;c.stroke();for(let i=0;i<5;i++){const a=i*TAU/5+(reduced()?0:time*.6);metal(c,-12+Math.cos(a)*8-2,Math.sin(a)*8-2,4,4,f.color);}}
                    }else{
                        if(level===1)metal(c,16,-6,27,12,accent);
                        else if(level===2){metal(c,-7,-17,19,5,accent);c.fillStyle=f.color;circle(c,11,-15,3);c.fill();}
                        else{metal(c,-22,-10,14,20,accent);c.strokeStyle='#e6aa81';c.beginPath();c.moveTo(29,-8);c.lineTo(36,-8);c.moveTo(29,8);c.lineTo(36,8);c.stroke();}
                    }break;
                case 'SNIPER':
                    if(branch===1){
                        if(level===1)metal(c,15,-3,35,6,accent);
                        else if(level===2){c.strokeStyle=accent;c.lineWidth=3;c.beginPath();c.moveTo(9,-5);c.lineTo(1,-21);c.moveTo(9,5);c.lineTo(1,21);c.stroke();}
                        else{metal(c,39,-6,9,12,accent);metal(c,-4,-15,16,5,accent);c.fillStyle=f.color;circle(c,12,-12,3);c.fill();}
                    }else{
                        if(level===1)vial(c,-15,-14,'#a4d579',7);
                        else if(level===2){metal(c,1,-16,25,6,accent);c.fillStyle='#b9e8df';circle(c,27,-13,4);c.fill();}
                        else{metal(c,9,11,20,8,accent);c.fillStyle='#a9d789';circle(c,28,15,3);c.fill();}
                    }break;
                case 'CANNON':
                    if(branch===1){
                        if(level===1)metal(c,15,-8,27,16,accent);
                        else if(level===2){metal(c,0,-17,17,34,accent);metal(c,29,-11,10,22,accent);}
                        else{vial(c,-16,0,'#eeb06a',13);for(let i=0;i<3;i++){metal(c,18+i*6,-12,3,4,'#f2b577');metal(c,18+i*6,8,3,4,'#f2b577');}}
                    }else{
                        if(level===1){metal(c,-22,-11,13,22,accent);}
                        else if(level===2){metal(c,0,-23,12,7,f.color);metal(c,0,16,12,7,f.color);}
                        else for(let i=-1;i<=1;i++){metal(c,15,i*10-3,23,6,accent);c.fillStyle='#142029';c.fillRect(33,i*10-2,4,4);}
                    }break;
                case 'FROST':
                    if(branch===1){
                        if(level===1)crystal(c,11,0,7,15,f.color,Math.PI/2);
                        else if(level===2){crystal(c,-5,-16,5,10,f.color,-.3);crystal(c,-5,16,5,10,f.color,.3);}
                        else{crystal(c,21,0,10,18,f.hot,Math.PI/2);c.strokeStyle=f.color;c.beginPath();c.ellipse(9,0,8,23,0,0,TAU);c.stroke();}
                    }else{
                        if(level===1){crystal(c,8,-13,4,9,f.color,.3);crystal(c,8,13,4,9,f.color,-.3);}
                        else if(level===2){c.strokeStyle=f.color;c.lineWidth=2;circle(c,0,0,24);c.stroke();}
                        else{for(let i=0;i<3;i++){const a=i*TAU/3;crystal(c,Math.cos(a)*22,Math.sin(a)*22,4,9,f.color,a);}}
                    }break;
                case 'TESLA':
                    if(branch===1){
                        const x=-12+level*12;c.strokeStyle='#c7b29a';c.lineWidth=2;c.beginPath();c.moveTo(x,-13);c.lineTo(x,13);c.stroke();
                        for(let i=-1;i<=1;i++){c.beginPath();c.ellipse(x,i*6,7,3,0,0,TAU);c.stroke();}
                        c.fillStyle=f.color;circle(c,x,-15,3+level*.4);c.fill();
                    }else{
                        if(level===1){vial(c,-14,-12,f.color,8);vial(c,-14,12,f.color,8);}
                        else if(level===2){c.strokeStyle=accent;c.lineWidth=2;c.beginPath();c.moveTo(4,-23);c.lineTo(4,23);c.stroke();for(let side=-1;side<=1;side+=2){c.fillStyle=f.hot;circle(c,4,side*23,4);c.fill();}}
                        else{c.strokeStyle=f.color;c.lineWidth=1;for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(-8,-18+i*4);c.lineTo(24,9+i*4);c.stroke();}metal(c,20,-8,8,16,accent);}
                    }break;
                case 'LASER':
                    if(branch===1){
                        if(level===1){metal(c,11,-7,19,14,accent);crystal(c,26,0,4,8,f.color,Math.PI/2);}
                        else if(level===2)for(let i=0;i<4;i++)metal(c,-21+i*6,-15,3,30,accent);
                        else{c.strokeStyle=f.color;c.lineWidth=2;for(let i=0;i<2;i++){c.beginPath();c.ellipse(24+i*8,0,4,13-i*2,0,0,TAU);c.stroke();}}
                    }else{
                        if(level===1){c.strokeStyle=accent;c.lineWidth=2;circle(c,21,0,10);c.stroke();}
                        else{const side=level===2?-1:1;metal(c,5,side*17-4,17,8,accent);crystal(c,24,side*17,5,9,f.color,Math.PI/2);}
                    }break;
                case 'ALCH':
                    if(branch===1){
                        if(level===1)vial(c,-11,-14,'#c8e777',10);
                        else if(level===2){metal(c,-21,0,12,14,accent);c.strokeStyle='#a7be86';c.lineWidth=3;c.beginPath();c.moveTo(-11,-9);c.lineTo(-18,6);c.lineTo(12,6);c.stroke();}
                        else{vial(c,1,14,'#e4d889',8);metal(c,15,-6,21,12,accent);}
                    }else{
                        if(level===1){c.fillStyle='#647b71';c.beginPath();c.moveTo(14,-5);c.lineTo(33,-12);c.lineTo(33,12);c.lineTo(14,5);c.closePath();c.fill();c.strokeStyle=accent;c.stroke();}
                        else if(level===2){vial(c,-11,-15,'#98d0a0',9);vial(c,-11,15,'#b6a9e2',9);}
                        else{c.strokeStyle=f.color;c.lineWidth=2;c.beginPath();c.ellipse(27,0,6,18,0,0,TAU);c.stroke();crystal(c,3,0,5,9,'#bea8e8',Math.PI/2);}
                    }break;
            }
            c.restore();
        }
    }

    function distanceSegment(x,y,a,b) {const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?clamp(((x-a.x)*dx+(y-a.y)*dy)/l,0,1):0;return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);}
    function setupScenery(layout) {
        scenePaths=layout?.paths||[];sceneSlots=layout?.slots||[];scenery=[];
        for(let i=0;i<36;i++){
            const edge=i%4,k=Math.floor(i/4),x=edge===0?28:edge===1?972:70+k*107,y=edge===2?20:edge===3?580:50+k*61;
            if(x<0||x>1000||y<0||y>600)continue;
            let safe=true;
            for(const path of scenePaths){for(let j=1;j<path.length;j++)if(distanceSegment(x,y,path[j-1],path[j])<64){safe=false;break;}if(!safe)break;}
            if(safe)for(const s of sceneSlots)if(Math.hypot(x-s.x,y-s.y)<58){safe=false;break;}
            if(safe)scenery.push({x,y,edge,phase:phaseHash(i*8137+sceneSeed)*TAU,size:11+phaseHash(i*743+sceneSeed)*10});
        }
    }
    function environmentUnder(c) {
        if(config.quality==='low')return;
        const kind=RF_MOTION.environments[worldId-1],clock=reduced()?0:time;
        c.save();
        if(kind==='grove'||kind==='peaks'||kind==='sky'){
            // Low-contrast, broad cloud shadows are below the road actors, not post-processing them.
            for(let i=0;i<2;i++){const x=((i*600+clock*(worldId===11?9:3))%1450)-170,y=90+i*290;c.globalAlpha=.04;c.drawImage(stamp('#142332',true),x-210+camera.x*.12,y-80,420,160);}
        }
        const limit=Math.min(scenery.length,config.quality==='high'?14:9);
        for(let i=0;i<limit;i++){
            const a=scenery[i],v=Math.sin(clock*(kind==='forge'?.7:1.1)+a.phase),s=a.size;
            c.save();c.translate(a.x,a.y);if(a.edge===2)c.rotate(Math.PI);c.globalAlpha=.42;c.strokeStyle=WORLDS[worldId].glow;c.fillStyle=WORLDS[worldId].glow;c.lineWidth=1.2;
            if(kind==='grove'||kind==='marsh'||kind==='peaks'){
                c.strokeStyle=kind==='marsh'?'#77978a':'#7c9c6b';
                for(let j=-1;j<=1;j++){c.beginPath();c.moveTo(j*4,4);c.quadraticCurveTo(j*4+v*2,-s*.5,j*7+v*3,-s);c.stroke();}
                if(kind==='marsh'){c.globalAlpha=.18;c.beginPath();c.ellipse(0,5,s*.8,3+(clock*.6+a.phase)%3,0,0,TAU);c.stroke();circle(c,v*4,-s*.4,1.5);c.fill();}
                else if(kind==='grove'&&i%2===0){c.fillStyle='#d7dda3';c.globalAlpha=.25+.15*Math.sin(clock*1.7+a.phase);circle(c,v*8,-s-4,1.4);c.fill();}
            }else if(kind==='ice'||kind==='shards'||kind==='mirrors'){
                crystal(c,-3,1,4,s*.68,WORLDS[worldId].glow,-.25);crystal(c,5,3,3,s*.48,WORLDS[worldId].glow,.4);
                if((clock*.7+a.phase)%6<.35){c.globalAlpha=.55;c.beginPath();c.moveTo(-6,-s*.4);c.lineTo(6,-s*.4);c.moveTo(0,-s*.4-5);c.lineTo(0,-s*.4+5);c.stroke();}
            }else if(kind==='cinders'||kind==='forge'){
                c.globalAlpha=.16+(v+1)*.05;glow(c,0,3,s*1.2,'#f2a16d',.8);c.globalAlpha=.4;c.strokeStyle='#b59a82';
                if(kind==='forge'){c.save();c.rotate(clock*.12+a.phase);polygon(c,0,0,s*.6,8);c.stroke();for(let j=0;j<6;j++){const a=j*TAU/6;c.beginPath();c.moveTo(Math.cos(a)*s*.42,Math.sin(a)*s*.42);c.lineTo(Math.cos(a)*s*.8,Math.sin(a)*s*.8);c.stroke();}c.restore();}
                else{c.beginPath();c.moveTo(-s*.7,4);c.lineTo(-3,v*2);c.lineTo(2,5);c.lineTo(s*.7,0);c.stroke();}
                c.fillStyle='#f4c18b';for(let j=0;j<2;j++){const f=((clock*.4+a.phase+j*.5)%1+1)%1;c.globalAlpha=(1-f)*.35;circle(c,Math.sin(f*4+a.phase)*5,-f*s,1);c.fill();}
            }else if(kind==='citadel'){
                c.translate(v*1.2,0);for(let j=0;j<4;j++){c.beginPath();c.ellipse(0,-j*5,2,3,0,0,TAU);c.stroke();}crystal(c,0,-20,3,6,'#bdaacb',0);
            }else if(kind==='archive'){
                c.rotate(v*.1);c.fillStyle='#c3b38e';c.fillRect(-5,-11,10,14);c.fillStyle='#5a6364';c.fillRect(-3,-7,5,1);c.fillRect(-3,-3,6,1);
            }else if(kind==='sky'){
                c.globalAlpha=.12;c.drawImage(stamp('#d5e1de',true),-s*1.6+v*3,-s*.5,s*3.2,s);c.globalAlpha=.35;polygon(c,2,-s*.3+v*2,3,5,a.phase);c.stroke();
            }else if(kind==='void'){
                c.translate(0,v*2);c.rotate(clock*.08+a.phase);polygon(c,0,-2,s*.35,3);c.stroke();c.globalAlpha=.16;c.beginPath();c.ellipse(0,2,s*.7,s*.3,0,0,Math.PI*1.5);c.stroke();
            }
            c.restore();
        }
        c.restore();
    }
    function environmentOver(c) {
        if(config.quality!=='high'||reduced()||crowded)return;
        const w=WORLDS[worldId],kind=RF_MOTION.environments[worldId-1];
        c.save();c.beginPath();c.rect(0,0,1000,21);c.rect(0,579,1000,21);c.rect(0,21,20,558);c.rect(980,21,20,558);c.clip();
        c.translate(-camera.x*.20,-camera.y*.12);
        c.fillStyle=w.glow;c.strokeStyle=w.glow;c.lineWidth=1;c.globalAlpha=.19;
        for(let i=0;i<7;i++){
            const a=ambience[i],x=((a.x+time*w.wind*.31+Math.sin(time*.18+a.p)*13+1200)%1200)-100,y=((a.y+time*8+700)%700)-50;
            if(kind==='grove'||kind==='archive'){c.save();c.translate(x,y);c.rotate(time*.4+a.p);c.fillRect(-4,-1,8,2);c.restore();}
            else if(kind==='ice'||kind==='mirrors'){c.beginPath();c.moveTo(x-3,y);c.lineTo(x+3,y);c.moveTo(x,y-3);c.lineTo(x,y+3);c.stroke();}
            else{circle(c,x,y,2.5);c.fill();}
        }c.restore();
    }

    function motion(map,entity) {
        let m=map.get(entity);
        if(!m){
            const serial=++actorSequence,phase=phaseHash(serial^sceneSeed)*TAU;
            const path=entity.path,heading=path&&path.length>1?Math.atan2(path[1].y-path[0].y,path[1].x-path[0].x):0,face=Math.cos(heading)<0?-1:1;
            m={spawn:time,fire:-100,upgrade:-100,hit:-100,power:0,phase,serial,lastX:entity.x,lastY:entity.y,
                clock:0,walk:phase,distance:0,heading,bank:0,faceTarget:face,facing:face,speedRatio:0,
                contact:-10,footSide:1,detailAt:-1,auraTimer:0,ability:-100,shieldHit:-100,
                hitKind:'DOT',hitX:0,hitY:0,critical:false,bob:0,sway:0,squash:0,lean:0,gait:null};
            map.set(entity,m);
        }return m;
    }
    const camera={power:0, x:0,y:0,phase:0, zoom:0,priority:0,
        impulse(magnitude,priority=1,angle=0) {
            if(reduced()||!config.shake)return;
            const m=clamp(magnitude*.28,0,5);
            if(priority>=this.priority||m>this.power){this.priority=priority;this.phase=angle;}
            this.power=Math.min(5,Math.max(this.power,m));this.zoom=Math.max(this.zoom,priority>=3?.003:0);
        },
        update(dt){this.power*=Math.exp(-dt*10);this.zoom*=Math.exp(-dt*9);this.x=Math.sin(time*83+this.phase)*this.power;this.y=Math.cos(time*101)*this.power*.6;if(this.power<.03){this.power=this.x=this.y=0;this.priority=0;}},
        apply(c){if(this.power>0){c.translate(500,300);c.scale(1+this.zoom,1+this.zoom);c.translate(-500+this.x,-300+this.y);}},
        reset(){this.power=this.x=this.y=this.zoom=this.priority=0;}
    };
    function death(e) {
        const m=motion(enemyMotion,e),p=m.gait||gaitFor(e),g=ghosts.take(e.isBoss?3:2);if(!g)return;
        const id=m.hitKind;
        let kind=id==='FROST'||e.effects.freeze>0?'frost':id==='CANNON'?'fire':id==='TESLA'||id==='LASER'?'electric':id==='ALCH'||e.effects.poison>0?'poison':p.death;
        if(kind==='fall')kind='normal';if(kind==='ice')kind='frost';if(kind==='ember')kind='fire';
        const boss=e.isBoss?gaitFor(e):null;
        Object.assign(g,{echo:false,x:e.x+m.sway,y:e.y+m.bob,size:e.drawSize,flip:m.facing<0,angle:m.lean||0,
            image:boss?assets[boss.atlasKey]||assets[e.imgKey]:assets[e.animation?.assetKey]||assets[e.imgKey],animation:e.animation,isBoss:e.isBoss,
            bossAtlas:!!boss&&!!assets[boss.atlasKey]?.ready,cell:boss?.cell||128,frame:boss?Math.floor(m.walk/TAU*boss.frames)%boss.frames:0,
            signature:boss?.world||0,phase:e.bossPhase||0,critical:!!m.critical,
            kind,life:e.isBoss?1.12+(boss.world%3)*.12:kind==='soul'?.85:kind==='armor'?.78:.68,
            color:e.isBoss?(e.bossProfile?.phaseColor||'#d8a968'):PROFILES[id]?.color||e.color});
        if(e.isBoss){bossBurst(e,'death');camera.impulse(16,3);}
        else{
            const particle=kind==='frost'||kind==='mirror'?'shard':kind==='fire'?'ember':kind==='smoke'||kind==='soul'||kind==='poison'?'mist':kind==='normal'||kind==='armor'?'debris':'spark';
            burst(e.x,e.y,g.color,(m.critical?14:9),particle,.72,2);
            if(kind==='soul')ring(e.x,e.y,g.color,e.drawSize*.4,.55,2,'rune');
            if(kind==='void')ring(e.x,e.y,g.color,e.drawSize*.42,.48,2,'implode');
            if(m.critical)ring(e.x,e.y,'#fce7a8',23,.22,2,'cross');
        }
        if(kind==='normal'||kind==='fire'||kind==='armor'){
            const d=decals.take(0);if(d)Object.assign(d,{x:e.x,y:e.y+e.drawSize*.3,life:1.6,size:e.drawSize*.28,kind,color:'#382e27'});
        }
    }
    function impact(p) {
        const id=p.sourceTower?.type?.id||'BASIC', f=PROFILES[id]||PROFILES.BASIC;
        if(id==='CANNON') {
            ring(p.x,p.y,'#efc497',Math.min(94,p.stats.aoe||58),.42,2);
            ring(p.x,p.y,'#ffe9bb',30,.20,2,'flash');
            burst(p.x,p.y,f.color,18,'ember',1.4);burst(p.x,p.y,'#6e6460',9,'smoke',1,0);burst(p.x,p.y,'#b6a18a',7,'debris',1.5);
            camera.impulse(5,1);sound('impact-heavy');
        } else if(id==='FROST') {
            burst(p.x,p.y,f.color,14,'shard',1);ring(p.x,p.y,f.color,28,.36,2,'snow');sound('impact-ice');
        } else if(id==='ALCH') {
            burst(p.x,p.y,f.color,9,'mist',1);ring(p.x,p.y,f.color,clamp(p.stats.statusRadius||28,28,65),.48,2,'splash');sound('impact-poison');
        } else {
            burst(p.x,p.y,f.hot,id==='SNIPER'?12:5,'spark',id==='SNIPER'?1.4:.65,2,Math.atan2(p.vy,p.vx));
            ring(p.x,p.y,f.color,id==='SNIPER'?22:13,.17,2,id==='SNIPER'?'cross':'flash');sound(id==='SNIPER'?'impact-sniper':'impact-light');
        }
        if(p.isCrit) {ring(p.x,p.y,'#ffe6a1',29,.24,3,'cross');camera.impulse(3,1);}
    }
    const handlers={
        'tower:placed':t=>{motion(towerMotion,t).spawn=time;ring(t.x,t.y,'#e5c28c',40,.55,3,'rune');burst(t.x,t.y,'#bfaa85',16,'debris',1,2);},
        'tower:fired':t=>{
            const m=motion(towerMotion,t);m.fire=time;
            const f=PROFILES[t.type.id]||PROFILES.BASIC;
            const x=t.x+Math.cos(t.angle)*26,y=t.y+Math.sin(t.angle)*26;
            if(t.type.id==='CANNON'){burst(x,y,'#d4c0a5',6,'smoke',1,0,t.angle);burst(x,y,f.hot,8,'ember',1.3,2,t.angle);}
            else if(t.type.id!=='LASER')burst(x,y,f.hot,t.type.id==='TESLA'?6:3,f.kind==='mist'?'dot':f.kind,.6,2,t.angle);
            sound(f.sound);
        },
        'tower:upgraded':t=>{motion(towerMotion,t).upgrade=time;ring(t.x,t.y,'#f6ce88',44,.85,3,'rune');burst(t.x,t.y,'#d9b77f',20,'spark',1,3);},
        'tower:sold':t=>{ring(t.x,t.y,'#c3b59a',32,.42,3,'implode');burst(t.x,t.y,'#b7ada0',12,'debris',1,2);},
        'projectile:spawn':p=>{p.fxSample=0;p.fxCount=0;},
        'projectile:impact':impact,
        'enemy:spawn':e=>{const m=motion(enemyMotion,e);m.spawn=time;m.gait=gaitFor(e);if(e.isBoss)handlers['boss:spawn'](e);else if(m.gait.spawn!=='dust'){const kind=m.gait.spawn==='ice'?'snow':m.gait.spawn==='void'?'implode':m.gait.spawn==='rune'?'rune':'flash';ring(e.x,e.y,e.color,e.drawSize*.32,.3,1,kind);}},
        'enemy:hit':(e,source,damage,critical)=>{const m=motion(enemyMotion,e);m.hit=time;m.power=clamp((damage||0)/Math.max(45,e.maxHp*.16),.08,1);m.hitKind=source?.type?.id||'DOT';m.critical=!!critical;const dx=source?e.x-source.x:0,dy=source?e.y-source.y:0,d=Math.hypot(dx,dy)||1;m.hitX=dx/d;m.hitY=dy/d;},
        'enemy:shield-hit':e=>{motion(enemyMotion,e).shieldHit=time;sound('shield-hit');ring(e.x,e.y,'#a6e7ff',e.drawSize*.48,.16,2,'hex');},
        'enemy:shield-break':e=>{const m=motion(enemyMotion,e);m.shieldHit=time;m.hit=time;m.power=.7;ring(e.x,e.y,'#b5f1ff',e.drawSize*.58,.34,3,'hex');burst(e.x,e.y,'#a3dfed',13,'shard',1,2);sound('shield-break');},
        'enemy:status':e=>{const f=e.effects;ring(e.x,e.y,f.freeze>0||f.slow>0?'#a4e4ef':f.poison>0?'#bfdc75':'#e5b780',e.drawSize*.40,.3,2);},
        'enemy:ability':e=>{const m=motion(enemyMotion,e);m.ability=time;ring(e.x,e.y,e.color,e.drawSize*.44,.42,2,e.rageTriggered?'cross':e.disableTower?'hex':'rune');burst(e.x,e.y,e.color,6,e.rageTriggered?'ember':'spark',.6,2);sound(e.rageTriggered?'rage':e.disableTower?'sabotage':'arcane-cast');},
        'enemy:blink-out':e=>{const m=motion(enemyMotion,e);m.warpX=e.x;m.warpY=e.y;actorEcho(e,m,.25);ring(e.x,e.y,e.color,34,.35,2,'implode');burst(e.x,e.y,e.color,7,'spark',.7,2);sound('teleport');},
        'enemy:blink-in':e=>{const m=motion(enemyMotion,e);m.lastX=e.x;m.lastY=e.y;m.ability=time;const r=rings.take(2);if(r)Object.assign(r,{x:m.warpX??e.x,y:m.warpY??e.y,x2:e.x,y2:e.y,color:e.color,kind:'rift',life:reduced()?.15:.38,radius:1,angle:0});ring(e.x,e.y,e.color,42,.4,2,'implode');},
        'enemy:death':death,
        'boss:spawn':e=>{bossBurst(e,'entrance');camera.impulse(10,3);},
        'boss:telegraph':e=>{sound('boss-charge-'+gaitFor(e).world);},
        'boss:ability':e=>{motion(enemyMotion,e).ability=time;bossBurst(e,'cast');},
        'boss:phase':e=>{bossBurst(e,'phase');camera.impulse(10,3);},
        'spell:cast':id=>{
            const colors=['','#ecab73','#a6ebf5','#f2ce81','#a9e8f1','#c4a2f1','#e9c47e','#a6cef2'];
            if(game) for(const t of game.towers) ring(t.x,t.y,colors[id]||'#ddd',id===6?42:34,.55,3,id===7?'hex':'rune');
            if(id===1||id===4||id===5)camera.impulse(id===1?13:7,2);
            sound('spell-'+id);
        },
        'wave:start':()=>{sound('wave');},
        'wave:complete':()=>{sound('reward');},
        'battle:victory':()=>{finishRemaining=ghosts.items.some(g=>g.active&&g.isBoss)?1.45:.55;sound('victory');},
        'battle:defeat':()=>{finishRemaining=.55;sound('defeat');}
    };
    function emit(name,data,source=null,value=0,flag=false) {
        events[name]=(events[name]||0)+1;
        try {if(handlers[name])handlers[name](data,source,value,flag);}catch(error){warn(error);}
        const list=listeners.get(name);if(list)for(const listener of list){try{listener(data);}catch(error){warn(error);}}
    }
    function observe(rawMs) {
        if(!Number.isFinite(rawMs)||rawMs<=0||rawMs>250)return;
        diagnostics.frames++;diagnostics.frameTotal+=rawMs;diagnostics.framePeak=Math.max(diagnostics.framePeak,rawMs);
        if(!config.auto)return;
        const dt=rawMs/1000; if(warmup>0){warmup-=dt;return;}
        overloaded=rawMs>35?overloaded+dt:Math.max(0,overloaded-dt*.6);
        if(overloaded>4&&config.quality!=='low') {
            config.quality=config.quality==='high'?'medium':'low';quality=QUALITY[config.quality];overloaded=0;warmup=8;diagnostics.downgraded++;persist();syncSettings();
        }
    }
    function reset(world,A,s,layout) {
        worldId=clamp(Number(world?.id)||1,1,12);assets=A||assets;game=s||game;time=0;sceneSeed=(replaySeed??(0x638bc137 ^ (worldId*39851)))>>>0;seed=sceneSeed;actorSequence=0;lastFootCue=-10;
        for(const pool of [particles,rings,ghosts,texts,decals])pool.clear();
        towerMotion=new WeakMap();enemyMotion=new WeakMap();camera.reset();finishRemaining=0;warmup=4;overloaded=0;lastAmbientCue=0;
        ambience=Array.from({length:48},()=>({x:random()*1100-50,y:random()*650-25,r:1+random()*2.5,p:random()*TAU,z:.35+random()*.65}));
        setupScenery(layout);document.body.style.setProperty('--world-accent',WORLDS[worldId].glow);
    }
    function step(dtFrames) {
        crowded=(game?.enemies.length||0)>120;contactFxBudget=config.quality==='low'?0:config.quality==='high'?7:3;
        const dt=clamp(Number(dtFrames)||0,0,6)/60;time+=dt;camera.update(dt);if(finishRemaining>0)finishRemaining=Math.max(0,finishRemaining-dt);
        for(const p of particles.items)if(p.active){
            p.age+=dt;if(p.age>=p.life){particles.release(p);continue;}
            p.prevX=p.x;p.prevY=p.y;const decay=Math.exp(-p.drag*dt);const travel=(1-decay)/p.drag;
            p.x+=p.vx*travel;p.y+=p.vy*travel;p.vx*=decay;p.vy=p.vy*decay+p.gravity*dt;p.angle+=p.spin*dt;
        }
        for(const pool of [rings,ghosts,texts,decals])for(const p of pool.items)if(p.active){p.age+=dt;if(p.age>=p.life){pool.release(p);p.image=null;p.animation=null;}}
        diagnostics.particlePeak=Math.max(diagnostics.particlePeak,particles.count);diagnostics.ghostPeak=Math.max(diagnostics.ghostPeak,ghosts.count);diagnostics.textPeak=Math.max(diagnostics.textPeak,texts.count);
        if(game?.screen==='play'&&!reduced()&&time-lastAmbientCue>18){lastAmbientCue=time;sound('ambience-'+worldId);}
    }
    function polygon(c,x,y,r,n,angle=0) {
        c.beginPath();for(let i=0;i<n;i++){const a=angle+i*TAU/n;if(i===0)c.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);else c.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}c.closePath();
    }
    function circle(c,x,y,r) {c.beginPath();c.arc(x,y,Math.max(0,r),0,TAU);}
    function glow(c,x,y,r,color,alpha=.4) {if(!quality.lights)return;c.save();c.globalAlpha*=alpha;c.drawImage(stamp(color),x-r,y-r,r*2,r*2);c.restore();}
    function worldUnder(c) {
        environmentUnder(c);
        const w=WORLDS[worldId];c.save();
        // Border lighting and cloud/fog are low-frequency, low-opacity layers, below all units.
        if(config.quality!=='low'){
            c.globalAlpha=w.fog;
            for(let i=0;i<3;i++){
                const drift=reduced()?0:Math.sin(time*.08+i)*85;
                c.drawImage(stamp(w.sky,true),-130+i*430+drift,-190+i%2*520,600,360);
            }
            c.globalAlpha=.10;
            const sites=worldId===9?[[35,530],[970,80]]:worldId===12?[[945,535],[50,55]]:worldId===2||worldId===8?[[48,50],[960,550]]:[[30,565],[960,25]];
            for(const [x,y]of sites){const pulse=reduced()?1:1+Math.sin(time*1.2+x)*.12;c.drawImage(stamp(w.glow),x-90*pulse,y-65*pulse,180*pulse,130*pulse);}
        }
        for(const d of decals.items)if(d.active){c.globalAlpha=.17*(1-d.age/d.life);c.drawImage(shadowStamp,d.x-d.size,d.y-d.size*.45,d.size*2,d.size*.9);}
        c.restore();
    }
    function worldOver(c) {
        environmentOver(c);
        if(reduced())return;
        const w=WORLDS[worldId];c.save();c.strokeStyle=w.color;c.fillStyle=w.color;c.lineWidth=1;
        for(let i=0;i<(crowded?Math.min(quality.ambience,8):quality.ambience);i++){
            const a=ambience[i];const x=((a.x+time*w.wind*a.z)%1100+1100)%1100-50;
            const rise=['ash','ember','void','wisp','rune'].includes(w.kind)?-8:10;
            const y=((a.y+time*rise*a.z)%680+680)%680-40;
            const phase=a.p+time*(w.kind==='snow'?.8:1.2);
            c.globalAlpha=(.10+.18*a.z)*(w.kind==='wisp'?.7:1);
            if(w.kind==='leaf'){c.save();c.translate(x+Math.sin(phase)*12,y);c.rotate(phase);c.beginPath();c.ellipse(0,0,a.r*2,a.r*.65,0,0,TAU);c.fill();c.restore();}
            else if(w.kind==='shard'||w.kind==='mirror'){polygon(c,x,y,a.r*1.8,4,phase);c.stroke();if(w.kind==='mirror'&&i%5===0){c.globalAlpha*=.5;c.fillRect(x-12,y,24,1);}}
            else if(w.kind==='rune'||w.kind==='void'){polygon(c,x+Math.sin(phase)*7,y,a.r*2,worldId===12?6:4,phase*.25);c.stroke();}
            else if(w.kind==='paper'){c.save();c.translate(x,y);c.rotate(phase);c.scale(Math.cos(phase),1);c.fillRect(-3,-2,6,4);c.restore();}
            else if(w.kind==='wisp'){c.drawImage(stamp(w.glow),x-12,y-12,24,24);}
            else if(w.kind==='sky'){c.beginPath();c.moveTo(x,y);c.lineTo(x-13*a.z,y+3);c.stroke();}
            else {circle(c,x+Math.sin(phase)*9,y,a.r*(w.kind==='dust'?.65:1));c.fill();}
        }
        if(worldId===11&&config.quality==='high'){
            const cycle=time%17;if(cycle>16.88){c.globalAlpha=(17-cycle)*.5;c.strokeStyle='#c9edff';c.beginPath();c.moveTo(960,0);c.lineTo(941,26);c.lineTo(953,30);c.lineTo(938,53);c.stroke();}
        }
        c.restore();
    }
    function tower(c,t) {
        const f=PROFILES[t.type.id]||PROFILES.BASIC,m=motion(towerMotion,t),age=time-m.fire;
        const enter=reduced()?1:easeOut((time-m.spawn)/.35),building=1-enter;
        const up=clamp((time-m.upgrade)/.85,0,1),upgradePulse=up<1?Math.sin(up*Math.PI):0;
        const power=reduced()?0:f.kick*Math.exp(-age/Math.max(.08,f.life*.48));
        const recoil=age<1?-power*Math.cos(age*17):0;
        c.save();c.drawImage(shadowStamp,t.x-38,t.y+10,76,38);
        c.translate(t.x,t.y);c.scale(1-building*.15,1-building*.25);c.translate(0,-building*12);
        if(assets.tower_base?.ready)c.drawImage(assets.tower_base,-28,-28,56,56);
        const selected=game?.activeTowerUI===t;
        c.lineWidth=selected?2.3:1.2;c.strokeStyle=selected?'#f1d69b':t.path===1?'#d7b081':t.path===2?'#9cbbd5':'#82796c';c.globalAlpha=selected?.95:.55;
        c.beginPath();c.ellipse(0,10,30+t.tier*2,17+t.tier,0,0,TAU);c.stroke();c.globalAlpha=1;
        // Forged supports, branch geometry and emitter growth are real tier silhouettes.
        for(let i=0;i<t.tier+1;i++){
            const a=-Math.PI/2+i*TAU/(t.tier+1)+Math.PI/4;c.save();c.translate(Math.cos(a)*25,Math.sin(a)*18+5);c.rotate(a);
            c.fillStyle=t.path===1?'#625244':'#46535e';c.strokeStyle=t.path===1?'#c9a87a':'#a9bfce';c.lineWidth=1;
            c.fillRect(-5,-3,10+t.tier*2,6);c.strokeRect(-5,-3,10+t.tier*2,6);c.restore();
        }
        if(t.tier>=2){c.strokeStyle=f.color;c.globalAlpha=.55;polygon(c,0,2,31,6,(t.path===1?0:Math.PI/6));c.stroke();c.globalAlpha=1;}
        if(upgradePulse>0)glow(c,0,0,54,'#efd2a0',upgradePulse*.65);
        if(game?.warBannerTimer>0){c.strokeStyle='#eac88d';c.lineWidth=2;c.beginPath();c.arc(0,3,35,-Math.PI*.8,Math.PI*.2);c.stroke();}
        c.save();c.rotate(t.angle);c.translate(recoil,0);
        const key=t.stats.assetKey||t.type.assetKey;
        if(assets[key]?.ready)c.drawImage(assets[key],-28,-28,56,56);
        towerHardware(c,t,f,up);
        const charge=t.target&&t.disabledTimer<=0?1-clamp(t.fireTimer/Math.max(10,t.stats.fireRate*.24),0,1):0;
        const pulse=reduced()?0:Math.sin(time*3+m.phase)*.15;
        if(['FROST','LASER','TESLA','ALCH'].includes(t.type.id)) {
            const r=3+t.tier*.75+charge*.7;
            glow(c,8,0,11+charge*9,f.color,.28+charge*.3);
            c.fillStyle=f.color;polygon(c,8,0,r,t.type.id==='FROST'?4:t.type.id==='TESLA'?6:5,time*.2);c.fill();
            if(t.type.id==='ALCH'){for(let i=0;i<3;i++){circle(c,-6+i*6,-2-Math.sin(time*2.5+i)*3,1.4);c.fill();}}
            if(t.type.id==='TESLA'&&!reduced()){c.strokeStyle=f.color;c.lineWidth=1;c.globalAlpha=.4+pulse;c.beginPath();c.moveTo(-9,-10);c.lineTo(-4,-15-pulse*9);c.lineTo(2,-8);c.stroke();c.globalAlpha=1;}
        }
        if(t.type.id==='SNIPER'&&charge>0){c.strokeStyle=f.color;c.lineWidth=1;c.globalAlpha=charge*.65;c.strokeRect(20,-3,7,6);c.beginPath();c.moveTo(30,0);c.lineTo(49,0);c.stroke();c.globalAlpha=1;}
        if(age<f.life&&age>=0&&!t.stats.isLaser){const flash=(1-age/f.life);c.fillStyle=f.hot;c.globalAlpha=flash;
            polygon(c,29,0,(t.type.id==='CANNON'?12:6)*flash,4,0);c.fill();glow(c,29,0,25,f.color,flash*.55);c.globalAlpha=1;
        }
        c.restore();
        if(t.tier){c.fillStyle='#071016';c.fillRect(-17,30,34,9);for(let i=0;i<3;i++){c.fillStyle=i<t.tier?(t.path===1?'#e9ba82':'#b3ddec'):'#43535d';polygon(c,-10+i*10,34,3,4,0);c.fill();}}
        if(t.disabledTimer>0){c.strokeStyle='#f2bb75';c.lineWidth=2;polygon(c,0,0,35,6,0);c.stroke();c.beginPath();c.moveTo(-16,-16);c.lineTo(16,16);c.moveTo(16,-16);c.lineTo(-16,16);c.stroke();}
        c.restore();
        if(t.stats.isLaser&&t.disabledTimer<=0&&t.targets){
            const x=t.x+Math.cos(t.angle)*26,y=t.y+Math.sin(t.angle)*26;
            for(const e of t.targets)if(e.hp>0){
                c.save();c.lineCap='round';c.strokeStyle=f.color;c.globalAlpha=.22;c.lineWidth=9+Math.min(3,t.heatMult)*2+t.tier;
                c.beginPath();c.moveTo(x,y);c.lineTo(e.x,e.y);c.stroke();c.globalAlpha=.8;c.lineWidth=3+t.tier*.35;c.stroke();c.strokeStyle=f.hot;c.lineWidth=1.4;c.stroke();
                glow(c,e.x,e.y,13+t.tier*3,f.color,.65);c.fillStyle='#fff2ff';circle(c,e.x,e.y,2.5);c.fill();c.restore();
            }
        }
    }
    function projectileStep(p,dtFrames) {
        p.fxSample+=Math.max(0,dtFrames);
        if(p.fxSample<1.2)return;p.fxSample%=1.2;
        const max=8;
        for(let i=max-1;i>0;i--){p.fxX[i]=p.fxX[i-1];p.fxY[i]=p.fxY[i-1];}
        p.fxX[0]=p.x;p.fxY[0]=p.y;p.fxCount=Math.min(max,p.fxCount+1);
    }
    function projectile(c,p) {
        const id=p.sourceTower?.type.id||'BASIC',f=PROFILES[id]||PROFILES.BASIC;
        const startDistance=Math.max(1,p.fxDistance||1),distance=Math.hypot(p.targetX-p.x,p.targetY-p.y);
        const progress=clamp(1-distance/startDistance,0,1),arc=(id==='CANNON'?32:id==='ALCH'?20:0)*Math.sin(progress*Math.PI);
        const x=p.x,y=p.y-arc,angle=Math.atan2(p.vy,p.vx);
        c.save();c.lineCap='round';c.strokeStyle=f.color;
        if(arc>0){c.globalAlpha=.25;c.drawImage(shadowStamp,p.x-9,p.y-2,18,9);c.globalAlpha=1;}
        const count=Math.min(p.fxCount,quality.trail);
        for(let i=count-1;i>0;i--){c.globalAlpha=(1-i/count)*.5;c.lineWidth=(id==='SNIPER'?2:id==='FROST'?3:2)*(1-i/(count+1));
            c.beginPath();c.moveTo(p.fxX[i],p.fxY[i]-arc*.9);c.lineTo(p.fxX[i-1],p.fxY[i-1]-arc);c.stroke();}
        c.globalAlpha=1;c.translate(x,y);c.rotate(angle);c.fillStyle=f.color;
        if(id==='CANNON'){
            c.fillStyle='#392f2a';c.fillRect(-9,-4,17,8);c.fillStyle='#d9ae7f';polygon(c,7,0,5,3,0);c.fill();c.fillStyle='#fff0b0';polygon(c,-10,0,4,3,Math.PI);c.fill();
        }else if(id==='FROST'){
            c.fillStyle=f.hot;polygon(c,0,0,7,4,0);c.fill();c.strokeStyle=f.color;c.lineWidth=2;c.stroke();
        }else if(id==='ALCH'){
            c.rotate(time*4);c.fillStyle='#365032';circle(c,0,0,6);c.fill();c.fillStyle=f.color;c.beginPath();c.arc(0,0,4,0,Math.PI);c.fill();c.strokeStyle='#dbe5bd';c.lineWidth=1;c.strokeRect(-2,-8,4,4);
        }else if(id==='SNIPER'||p.isTracer){
            c.strokeStyle=f.hot;c.lineWidth=p.isCrit?3:2;c.beginPath();c.moveTo(-22,0);c.lineTo(7,0);c.stroke();
        }else{c.fillStyle=f.hot;c.beginPath();c.ellipse(0,0,6,2,0,0,TAU);c.fill();}
        c.restore();
    }
    function enemy(c,e) {
        if(e.hp<=0)return;
        const m=motion(enemyMotion,e),p=m.gait||gaitFor(e);locomotionTransform(e,m);
        const phase=e.isBoss?e.bossPhase:0,color=e.bossProfile?.phaseColor||e.color;
        const spawned=e.isBoss&&e.bossSpawnMax>0?1-e.bossSpawnTimer/e.bossSpawnMax:clamp((time-m.spawn)/.27,0,1);
        const enter=easeOut(spawned),hitAge=time-m.hit,hitLife=m.hitKind==='FROST'?.26:m.hitKind==='TESLA'?.11:.18;
        const hit=Math.max(0,1-hitAge/hitLife)*m.power*(reduced()?.25:1)*(e.isBoss?.42:1);
        const phaseScale=e.isBoss?e.bossPhaseValue(e.bossProfile.phaseScaleByPhase,1):1;
        const floating=p.hover>.6,bob=m.bob,ground=e.y+e.drawSize*(p.ground||.34)*phaseScale,height=Math.max(0,-bob+p.hover*5);
        const breathe=e.isBoss&&e.effects.freeze<=0&&e.effects.stun<=0&&!reduced()?Math.sin(e.bossTime*.045)*.009:0;
        c.save();c.globalAlpha=(floating?.32:.58)*(1-height*.013);
        const shadowW=e.drawSize*(floating?.58:.74)*(1-height*.007),shadowH=e.drawSize*(floating?.17:.23);
        if(crowded||config.quality==='low'){c.fillStyle='#091218';c.beginPath();c.ellipse(e.x,ground,shadowW*.45,shadowH*.32,0,0,TAU);c.fill();}
        else c.drawImage(shadowStamp,e.x-shadowW/2,ground-shadowH*.42,shadowW,shadowH);c.globalAlpha=1;
        // Actual ability targets and their actual countdown are never subject to VFX budgets.
        if(e.isBoss){
            const r=e.drawSize*(.43+phase*.025);
            if(e.bossPhaseGuard>0){c.save();c.globalAlpha=.65;c.strokeStyle=color;c.lineWidth=2;polygon(c,e.x,e.y,r+9,6,time*.15);c.stroke();c.restore();}
            if(e.bossPendingAbility){
                const progress=clamp(1-e.bossTelegraphTimer/Math.max(1,e.bossTelegraphMax),0,1);
                c.save();c.strokeStyle='#ffd698';c.lineWidth=3;c.globalAlpha=.95;
                c.beginPath();c.arc(e.x,e.y,r+15,-Math.PI/2,-Math.PI/2+TAU*progress);c.stroke();
                for(const t of e.bossTelegraphTargets||[]){
                    c.strokeStyle='#ffc174';c.lineWidth=2;circle(c,t.x,t.y,34);c.stroke();
                    c.lineWidth=3;c.beginPath();c.arc(t.x,t.y,39,-Math.PI/2,-Math.PI/2+TAU*progress);c.stroke();
                    c.globalAlpha=.28;c.setLineDash([4,7]);c.beginPath();c.moveTo(e.x,e.y);c.lineTo(t.x,t.y);c.stroke();c.setLineDash([]);c.globalAlpha=.95;
                    c.fillStyle='#ffe5b3';polygon(c,t.x,t.y-42,5,3,-Math.PI/2);c.fill();
                }c.restore();
            }
        }
        const warm=abilityWarmth(e,m),physical=m.hitKind==='CANNON'?4:m.hitKind==='SNIPER'?2.8:m.hitKind==='BASIC'?1.7:0;
        const arrival=clamp(1-(time-m.ability)/.24,0,1);
        c.translate(e.x+m.sway+hit*m.hitX*physical,e.y+bob+hit*m.hitY*physical-(1-enter)*6);
        c.globalAlpha=.4+enter*.6;
        const grow=e.isBoss?.72+.28*enter:.92+.08*enter;
        const face=m.facing<0?-1:1,turnWidth=.87+.13*Math.abs(m.facing);
        const contraction=m.hitKind==='TESLA'?hit*.065:m.hitKind==='DOT'?0:hit*.025;
        const warp=e.blink&&!reduced()?warm*.14-arrival*.04:0;
        c.scale(face*turnWidth*grow*phaseScale*(1+breathe-contraction-warp),grow*phaseScale*(1-breathe+contraction-m.squash));
        c.rotate(m.lean);actorAccent(c,e,m,false);
        enemyBody(c,e,m,e.drawSize);actorAccent(c,e,m,true);
        if(e.hitFlash>0&&m.hitKind!=='DOT'){
            c.strokeStyle=m.hitKind==='FROST'?'#ccf7ff':m.hitKind==='TESLA'?'#b2f3fc':m.hitKind==='LASER'?'#f0d6ff':'#ffefc9';
            c.globalAlpha=Math.min(.85,e.hitFlash/7);c.lineWidth=m.critical?2.5:1.5;
            if(m.hitKind==='LASER'){circle(c,0,0,e.drawSize*.055);c.stroke();}
            else{c.beginPath();c.moveTo(-e.drawSize*.13,-e.drawSize*.17);c.lineTo(e.drawSize*.13,e.drawSize*.11);c.stroke();}
        }
        c.restore();
        const r=e.drawSize*.4,ef=e.effects;
        c.save();c.strokeStyle='#a8e9f4';c.lineWidth=1.6;
        if(e.shieldHp>0){c.globalAlpha=.5+.3*clamp(e.shieldHp/Math.max(1,e.shieldMax),0,1);polygon(c,e.x,e.y,r+7,6,Math.PI/6);c.stroke();c.globalAlpha=1;}
        if(ef.freeze>0||e.brittleTimer>0){polygon(c,e.x,e.y,r+2,6,Math.PI/6);c.stroke();for(let i=0;i<4;i++){const a=i*TAU/4;c.beginPath();c.moveTo(e.x+Math.cos(a)*r,e.y+Math.sin(a)*r);c.lineTo(e.x+Math.cos(a)*(r-9),e.y+Math.sin(a)*(r-9));c.stroke();}}
        else if(ef.slow>0){c.beginPath();c.ellipse(e.x,e.y+e.drawSize*.25,r*.85,r*.3,0,0,TAU);c.stroke();}
        if(ef.stun>0){c.fillStyle='#f5d486';for(let i=0;i<3;i++){const a=i*TAU/3+(reduced()?0:time*3);polygon(c,e.x+Math.cos(a)*r*.6,e.y-r+Math.sin(a)*3,3,4,0);c.fill();}}
        if(ef.poison>0){c.fillStyle='#c5df78';for(let i=0;i<3;i++){const phase=reduced()?i/3:(time*.65+i/3)%1;circle(c,e.x+(i-1)*r*.4,e.y+r*.5-phase*r,1.8+phase);c.globalAlpha=1-phase*.6;c.fill();}c.globalAlpha=1;}
        if(ef.bleed>0){c.strokeStyle='#ed997f';c.lineWidth=2;c.beginPath();c.moveTo(e.x-r*.2,e.y-r*.1);c.lineTo(e.x+r*.1,e.y+r*.2);c.stroke();}
        if(e.rageTriggered||ef.haste>0){c.strokeStyle=e.rageTriggered?'#f29c78':'#e5ca84';for(let i=0;i<2;i++){const x=e.x-r+8+i*9;c.beginPath();c.moveTo(x,e.y+r*.2);c.lineTo(x+5,e.y+r*.4);c.lineTo(x,e.y+r*.6);c.stroke();}}
        if(e.isHealer||e.hasteAura){c.strokeStyle=e.isHealer?'#b7e5a4':'#e7bc80';c.globalAlpha=.5;c.beginPath();c.ellipse(e.x,e.y+r*.6,r,r*.3,0,0,TAU);c.stroke();c.globalAlpha=1;}
        if(e.disableTower||e.energyResist>.1){c.strokeStyle='#bfa7e3';c.lineWidth=1.5;c.beginPath();c.arc(e.x,e.y,r+5,-.5,.7);c.stroke();}
        if(e.armorShredTimer>0){c.strokeStyle='#eabe85';c.beginPath();c.moveTo(e.x-r,e.y-9);c.lineTo(e.x-r+5,e.y-3);c.lineTo(e.x-r+1,e.y+2);c.stroke();}
        // Health and mechanics remain visible on every quality tier.
        const barW=e.isBoss?84:48,barY=e.y-e.drawSize*.52-8,hp=clamp(e.hp/e.maxHp,0,1);
        c.fillStyle='#071015';c.fillRect(e.x-barW/2-1,barY-1,barW+2,7);c.fillStyle=hp>.5?'#96d2ad':hp>.2?'#e7c081':'#ee967e';c.fillRect(e.x-barW/2,barY,barW*hp,5);
        if(e.shieldHp>0){c.fillStyle='#acd8ed';c.fillRect(e.x-barW/2,barY-4,barW*clamp(e.shieldHp/e.shieldMax,0,1),2);}
        if(e.badge&&!e.isBoss){c.fillStyle='#13202a';circle(c,e.x+barW*.5+5,barY,8);c.fill();c.strokeStyle=e.color;c.lineWidth=1; c.stroke();c.fillStyle='#fff3d9';c.font='bold 12px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(e.badge,e.x+barW*.5+5,barY+.5);}
        c.restore();
    }
    function hazard(c,h) {
        const black=h.type==='blackhole',color=black?'#ba97ed':'#d79264';
        c.save();c.globalAlpha=.16;c.fillStyle=black?'#272135':'#c5804e';circle(c,h.x,h.y,h.aoe);c.fill();
        c.globalAlpha=.6;c.strokeStyle=color;c.lineWidth=1.7;
        if(black){for(let n=0;n<3;n++){c.beginPath();c.ellipse(h.x,h.y,h.aoe*(.25+n*.21),h.aoe*(.17+n*.12),(reduced()?0:time*.7)+n*.6,0,TAU);c.stroke();}}
        else {c.setLineDash([6,7]);circle(c,h.x,h.y,h.aoe);c.stroke();c.setLineDash([]);for(let i=0;i<7;i++){const a=i*TAU/7;const rr=h.aoe*.63;circle(c,h.x+Math.cos(a)*rr,h.y+Math.sin(a)*rr,3+Math.sin(time*3+i));c.fill();}}
        c.restore();
    }
    function ghostImage(c,g,size,p) {
        if(!g.image?.ready)return;
        if(g.bossAtlas){const count=Math.max(1,Math.floor(g.image.naturalWidth/g.cell));drawFrame(c,g.image,clamp(g.frame|0,0,count-1)*g.cell,0,g.cell,g.cell,-size/2,-size/2,size,size);}
        else if(g.animation){const fw=g.animation.frameWidth||128,fh=g.animation.frameHeight||128,count=Math.max(1,Math.floor(g.image.naturalWidth/fw));
            const frame=g.echo?clamp(g.frame|0,0,count-1):Math.min(count-1,Math.floor(p*count));
            drawFrame(c,g.image,frame*fw,(g.echo?g.row:3)*fh,fw,fh,-size/2,-size/2,size,size);
        }else c.drawImage(g.image,-size/2,-size/2,size,size);
    }
    function drawGhosts(c) {
        c.save();
        for(const g of ghosts.items)if(g.active){
            const p=clamp(g.age/g.life,0,1),fall=easeOut(p),size=g.size;
            c.save();c.translate(g.x,g.y);
            if(g.echo){c.globalAlpha=g.opacity*(1-p);if(g.flip)c.scale(-1,1);ghostImage(c,g,size,p);c.restore();continue;}
            c.globalAlpha=Math.min(1,(1-p)*1.8);
            if(!reduced()){
                if(g.kind==='soul'){c.translate(Math.sin(p*4)*3,-p*24);c.scale(1+p*.08,1+p*.12);}
                else if(g.kind==='void'||g.signature===12){c.scale(Math.max(.03,1-fall),1+Math.sin(p*Math.PI)*.08);}
                else if(g.kind==='frost'||g.kind==='mirror'){c.translate(0,Math.max(0,p-.32)*12);c.scale(1,1-Math.max(0,p-.4)*.22);}
                else if(g.kind==='electric'){const k=1-Math.sin(Math.min(1,p*4)*Math.PI)*.04;c.scale(k,2-k);}
                else if(g.kind==='smoke'||g.kind==='poison'){c.translate(0,-p*10);c.scale(1+p*.16,1+p*.06);}
                else {c.translate(0,fall*(g.isBoss?10:7));c.rotate((g.flip?-1:1)*fall*(g.kind==='armor'?.20:.38));c.scale(1,1-fall*.16);}
            }
            if(g.isBoss)bossMotif(c,BOSS_SIGNATURES[g.signature-1],size,g.age*2,g.phase,false);
            c.save();if(g.flip)c.scale(-1,1);ghostImage(c,g,size,p);c.restore();
            if(g.kind==='frost'||g.kind==='mirror'){
                c.strokeStyle=g.kind==='mirror'?'#e7f3fa':'#b5eaf2';c.lineWidth=1.5;c.globalAlpha=(1-p)*.8;
                c.beginPath();c.moveTo(-size*.24,-size*.2);c.lineTo(size*.06,-size*.05);c.lineTo(-size*.04,size*.13);c.lineTo(size*.21,size*.28);c.stroke();
            }
            if(g.isBoss){c.globalAlpha=(1-p)*.65;c.strokeStyle=g.color;c.lineWidth=1.6;const spokes=g.signature===8?4:g.signature===4?5:g.signature===12?9:3+(g.signature%4);
                for(let i=0;i<spokes;i++){const a=i*TAU/spokes+g.signature*.2;c.beginPath();c.moveTo(Math.cos(a)*size*.2,Math.sin(a)*size*.2);c.lineTo(Math.cos(a)*size*(.28+fall*.38),Math.sin(a)*size*(.28+fall*.38));c.stroke();}}
            c.restore();
        }c.restore();
    }
    function drawEffects(c) {
        c.save();
        for(const p of particles.items)if(p.active){
            const t=p.age/p.life;c.globalAlpha=(1-t)*(p.kind==='smoke'||p.kind==='mist'?.22:.88);
            c.fillStyle=p.color;c.strokeStyle=p.color;
            if(p.kind==='smoke'||p.kind==='mist'){const size=p.size*(1+t*1.7);c.drawImage(stamp(p.color,true),p.x-size,p.y-size,size*2,size*2);}
            else if(p.kind==='shard'||p.kind==='debris'){polygon(c,p.x,p.y,p.size*(1-t*.5),p.kind==='shard'?3:4,p.angle);c.fill();}
            else if(p.kind==='paper'||p.kind==='rune'){c.save();c.translate(p.x,p.y);c.rotate(p.angle);c.fillRect(-p.size,-p.size*.7,p.size*2,p.size*1.4);if(p.kind==='rune'){c.strokeStyle='#21303a';c.lineWidth=.7;c.strokeRect(-p.size*.5,-p.size*.3,p.size,p.size*.6);}c.restore();}
            else if(p.kind==='spark'){c.lineWidth=Math.max(.6,p.size*.65*(1-t));c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*.055,p.y-p.vy*.055);c.stroke();}
            else{circle(c,p.x,p.y,Math.max(.1,p.size*(1-t*.5)));c.fill();}
        }
        for(const r of rings.items)if(r.active){
            const p=r.age/r.life,eo=easeOut(p),size=r.kind==='implode'?r.radius*(1-eo):r.radius*(.18+.82*eo);
            c.globalAlpha=(1-p)*.75;c.strokeStyle=r.color;c.fillStyle=r.color;c.lineWidth=2*(1-p)+.5;
            if(r.kind==='signature'){c.save();c.translate(r.x,r.y);c.scale(1+p*.35,1+p*.35);bossMotif(c,BOSS_SIGNATURES[r.signature-1],r.radius*2,r.age*2,r.phase||0,false);c.restore();}
            else if(r.kind==='rift'){c.strokeStyle=r.color;c.lineWidth=2;c.beginPath();for(let i=0;i<=6;i++){const k=i/6,x=mix(r.x,r.x2,k),y=mix(r.y,r.y2,k)+Math.sin(i*2.7)*5*(1-p);if(!i)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();}
            else if(r.kind==='flash'){c.globalAlpha*=(1-p);glow(c,r.x,r.y,size,r.color,.8);circle(c,r.x,r.y,size*.28);c.fill();}
            else if(r.kind==='hex'){polygon(c,r.x,r.y,size,6,r.angle);c.stroke();}
            else if(r.kind==='cross'){c.beginPath();c.moveTo(r.x-size,r.y);c.lineTo(r.x+size,r.y);c.moveTo(r.x,r.y-size);c.lineTo(r.x,r.y+size);c.stroke();}
            else if(r.kind==='snow'){for(let i=0;i<6;i++){const a=i*TAU/6;c.beginPath();c.moveTo(r.x+Math.cos(a)*size*.3,r.y+Math.sin(a)*size*.3);c.lineTo(r.x+Math.cos(a)*size,r.y+Math.sin(a)*size);c.stroke();}}
            else if(r.kind==='rune'){c.beginPath();c.ellipse(r.x,r.y,size,size*.55,0,0,TAU);c.stroke();polygon(c,r.x,r.y,size*.7,6,r.angle+p*.2);c.stroke();}
            else if(r.kind==='splash'){c.setLineDash([3,5]);circle(c,r.x,r.y,size);c.stroke();c.setLineDash([]);}
            else{c.beginPath();c.ellipse(r.x,r.y,size,size*.72,0,0,TAU);c.stroke();}
        }
        c.restore();
    }
    function drawTexts(c) {
        const screenScale=Math.max(.08,canvasScale),compact=screenScale<.60;
        textDraw.length=0;
        for(const t of texts.items)if(t.active)textDraw.push(t);
        textDraw.sort((a,b)=>a.age-b.age);
        let numbers=0,labels=0;
        c.save();c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
        for(const t of textDraw){
            if(t.numeric ? ++numbers>(compact?7:26) : ++labels>(compact?3:16))continue;
            const fontSize=Math.max(t.size,12/screenScale);
            c.font=`700 ${fontSize}px system-ui, sans-serif`;
            if(t._raw!==t.text||t._font!==fontSize){
                t._raw=t.text;t._font=fontSize;let text=t.text;
                while(text.length>2&&c.measureText(text).width>790)text=text.slice(0,-2)+'\u2026';
                t._display=text;t._width=c.measureText(text).width;
            }
            const p=t.age/t.life;c.globalAlpha=Math.min(1,(1-p)*3);c.fillStyle=t.color;c.strokeStyle='rgba(4,10,14,.94)';c.lineWidth=2.1/screenScale;
            const margin=Math.min(410,t._width/2+8),x=clamp(t.x,margin,1000-margin),y=clamp(t.y-p*32,fontSize/2+6,594-fontSize/2);
            c.strokeText(t._display,x,y);c.fillText(t._display,x,y);
        }
        c.restore();
    }

    // One bounded mix bus per WebAudio context. Voice objects disconnect on completion.
    const audioStates=new WeakMap();
    function audio(kind,ac,volume) {
        if(!ac||ac.state!=='running'||volume<=0||kind==='step-none')return;
        let a=audioStates.get(ac);
        if(!a){
            const buffer=ac.createBuffer(1,Math.ceil(ac.sampleRate*.7),ac.sampleRate),data=buffer.getChannelData(0);
            let n=7919;for(let i=0;i<data.length;i++){n=(n*16807)%2147483647;data[i]=(n/2147483647*2-1)*.55;}
            const bus=ac.createDynamicsCompressor();bus.threshold.value=-17;bus.knee.value=16;bus.ratio.value=7;bus.attack.value=.003;bus.release.value=.12;bus.connect(ac.destination);
            a={voices:0,footVoices:0,lastStep:-10,last:new Map(),noise:buffer,bus};audioStates.set(ac,a);
        }
        const now=ac.currentTime,foot=kind.startsWith('step-'),important=/^(boss|victory|defeat|upgrade|shield|spell)/.test(kind);
        const minGap=foot?.16:/^(shot|impact)/.test(kind)?.065:.065;
        if(a.voices>(important?32:20)||now-(a.last.get(kind)??-99)<minGap)return;
        if(foot&&(a.footVoices>=4||now-a.lastStep<.115))return;
        if(foot)a.lastStep=now;a.last.set(kind,now);
        const started=()=>{a.voices++;if(foot)a.footVoices++;diagnostics.audioVoicePeak=Math.max(diagnostics.audioVoicePeak||0,a.voices);};
        const ended=()=>{a.voices--;if(foot)a.footVoices--;};
        const tone=(freq,end,duration,type,gain,delay=0)=>{
            if(a.voices>=36)return;
            started();const osc=ac.createOscillator(),g=ac.createGain(),t=now+delay;
            osc.type=type;osc.frequency.setValueAtTime(clamp(freq,25,15000),t);osc.frequency.exponentialRampToValueAtTime(clamp(end,25,15000),t+duration);
            g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(volume*gain,t+Math.min(.007,duration*.16));g.gain.exponentialRampToValueAtTime(.0001,t+duration);
            osc.connect(g);g.connect(a.bus);osc.start(t);osc.stop(t+duration+.025);osc.onended=()=>{osc.disconnect();g.disconnect();ended();};
        };
        const noise=(duration,gain,freq,filter='lowpass',delay=0)=>{
            if(a.voices>=36)return;
            started();const src=ac.createBufferSource(),g=ac.createGain(),f=ac.createBiquadFilter(),t=now+delay;
            src.buffer=a.noise;f.type=filter;f.frequency.setValueAtTime(clamp(freq,60,14000),t);f.Q.value=.7;
            g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(volume*gain,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
            src.connect(f);f.connect(g);g.connect(a.bus);src.start(t);src.stop(t+duration+.025);src.onended=()=>{src.disconnect();f.disconnect();g.disconnect();ended();};
        };
        if(foot){
            if(kind==='step-heavy'||kind==='step-boss'||kind==='step-forge'){
                const boss=kind==='step-boss';tone(boss?63:91,boss?30:43,boss?.16:.12,'sine',boss?.062:.04);noise(.075,.024,kind==='step-forge'?1050:380);
            }else if(kind==='step-metal'){tone(245,148,.055,'triangle',.024);noise(.05,.018,1800);}
            else if(kind==='step-ice'||kind==='step-glass'){tone(1500,1150,.07,'sine',.012);noise(.04,.014,3600,'highpass');}
            else noise(.045,.014,1200);
        }
        else if(kind==='shot-basic'){tone(340,160,.075,'triangle',.055);noise(.023,.04,2500);tone(640,400,.024,'sine',.012,.043);}
        else if(kind==='shot-sniper'){noise(.027,.09,5600,'highpass');tone(940,116,.12,'triangle',.065);tone(175,86,.16,'sine',.042,.016);noise(.025,.019,1850,'bandpass',.09);}
        else if(kind==='shot-cannon'){tone(118,35,.29,'sine',.145);noise(.18,.10,850);tone(265,135,.08,'triangle',.034,.05);noise(.055,.025,2200,'bandpass',.11);}
        else if(kind==='impact-heavy'){tone(83,29,.31,'sine',.14);noise(.27,.085,550);noise(.08,.03,1800,'bandpass',.045);}
        else if(kind==='shot-frost'||kind==='impact-ice'){tone(1047,800,.15,'sine',.036);tone(1660,1330,.105,'sine',.025,.027);noise(.06,.022,4200,'highpass');}
        else if(kind==='shot-tesla'){tone(180,790,.085,'sawtooth',.019);noise(.07,.035,3400,'bandpass');tone(970,470,.055,'square',.008,.018);}
        else if(kind==='shot-laser'){tone(435,510,.145,'sine',.024);tone(870,960,.10,'sine',.009,.012);}
        else if(kind==='shot-alch'||kind==='impact-poison'){tone(310,590,.055,'sine',.036);tone(195,93,.14,'sine',.044,.035);noise(.10,.029,850,'bandpass',.02);tone(470,310,.055,'sine',.015,.09);}
        else if(kind==='impact-light'||kind==='impact-sniper'){noise(.035,.035,2400);tone(510,350,.026,'triangle',.012);}
        else if(kind.startsWith('boss-')){
            const id=clamp(Number(kind.split('-').pop())||1,1,12),p=BOSS_SIGNATURES[id-1],root=p.root;
            const gain=p.wave==='sawtooth'?.042:.075;
            if(kind.includes('charge')){
                tone(root*p.chord[0]*1.5,root*p.chord[0]*3.8,.38,p.wave,gain*.7);
                tone(root*p.chord[1]*2,root*p.chord[1]*2.6,.32,'sine',.021,p.beat*.5);
                noise(.25,.022,p.noise,id===2||id===8?'highpass':'bandpass');
            }else if(kind.includes('death')){
                tone(root*2.2,Math.max(28,root*.48),.65,p.wave,gain);
                noise(.42,.062,p.noise*.7,id===2||id===8?'highpass':'lowpass');
                tone(root*p.chord[2],root*p.chord[1],.48,'sine',.035,p.beat*1.6);
            }else if(kind.includes('phase')){
                for(let i=0;i<3;i++)tone(root*p.chord[i],root*p.chord[i]*1.12,.29,p.wave,gain*.72,i*p.beat);
                noise(.19,.045,p.noise,'bandpass');
            }else{
                tone(root,root*.77,.33,p.wave,gain);tone(root*p.chord[1],root*p.chord[2],.24,'sine',.037,p.beat);
                noise(.16,.045,p.noise,id===11?'highpass':'lowpass');
            }
        }
        else if(kind==='shield-hit'){tone(720,310,.08,'triangle',.036);noise(.028,.021,2200,'bandpass');}
        else if(kind==='shield-break'){noise(.17,.075,3100);tone(970,285,.21,'sine',.055);}
        else if(kind==='rage'){tone(98,61,.26,'sawtooth',.024);noise(.22,.045,620);}
        else if(kind==='teleport'){tone(205,760,.12,'sine',.048);tone(950,160,.18,'triangle',.034,.055);noise(.14,.02,1800,'bandpass');}
        else if(kind==='arcane-cast'){tone(325,620,.17,'sine',.03);tone(490,780,.12,'sine',.016,.034);}
        else if(kind==='sabotage'){tone(160,72,.11,'triangle',.037);noise(.065,.022,2400,'bandpass');}
        else if(kind==='victory'||kind==='upgrade'||kind==='reward'){const f=kind==='reward'?520:kind==='upgrade'?440:330;for(let i=0;i<3;i++)tone(f*(1+i*.25),f*(1+i*.25)*1.005,.26,'sine',.065,i*.065);}
        else if(kind==='defeat'){tone(220,92,.5,'triangle',.10);tone(165,82,.5,'sine',.06,.06);}
        else if(kind==='build'){tone(180,95,.12,'triangle',.095);noise(.07,.045,1300);tone(540,680,.16,'sine',.04,.055);}
        else if(kind==='sell'){tone(420,225,.15,'triangle',.055);tone(660,360,.13,'sine',.035,.035);}
        else if(kind.startsWith('spell-')){const id=Number(kind.slice(6))||1;tone(150+id*35,470+id*65,.3,'triangle',.06);tone(310+id*65,650+id*80,.32,'sine',.04,.04);if(id===1||id===4)noise(.2,.07,1800);}
        else if(kind.startsWith('ambience-')){const id=Number(kind.slice(9));tone(90+id*17,92+id*17,.5,'sine',.006);}
        else if(kind==='wave'){tone(260,310,.16,'triangle',.065);tone(390,430,.2,'sine',.045,.08);}
        else if(kind==='error'){tone(125,80,.12,'triangle',.06);}
        else if(kind==='boss'||kind==='skill'){/* Dedicated commit-point events own these cues. */}
        else tone(470,565,.065,'sine',.045);
    }
    function syncSettings() {
        document.body.classList.toggle('rf-reduced',reduced());document.body.dataset.fullMotion=String(config.motion==='full');document.body.dataset.quality=config.quality;
        const q=document.getElementById('rf-quality'),auto=document.getElementById('rf-auto'),motion=document.getElementById('rf-motion'),shake=document.getElementById('rf-shake'),txt=document.getElementById('rf-text');
        if(q)q.value=config.quality;if(auto)auto.checked=config.auto;if(motion)motion.value=config.motion;if(shake)shake.checked=config.shake;if(txt)txt.checked=config.text;
        if(reduced()||!config.shake)camera.reset();
    }
    function configure(changes) {
        if(QUALITY[changes.quality]){config.quality=changes.quality;quality=QUALITY[config.quality];overloaded=0;warmup=5;}
        for(const key of ['auto','shake','text'])if(typeof changes[key]==='boolean')config[key]=changes[key];
        if(['system','reduced','full'].includes(changes.motion))config.motion=changes.motion;
        persist();syncSettings();
    }
    function scene() {
        if(!stateReader)return;
        const s=stateReader();document.body.dataset.scene=s.screen;document.body.classList.toggle('rf-upgrade',!!s.activeTowerUI);layoutDock();
        if(s.screen!=='play'&&s.screen!=='result'){for(const pool of [particles,rings,texts])if(s.screen==='menu')pool.clear();}
        fitCanvas();
    }
    function layoutDock() {
        const ui=document.getElementById('upgrade-ui');if(!ui)return;
        const wide=innerWidth>=1024&&innerHeight>600;
        const short=innerWidth>innerHeight&&innerHeight<=600;
        const parent=document.getElementById(wide?'rf-inspect-dock':'game-wrapper');
        if(parent&&ui.parentElement!==parent){const focus=document.activeElement;parent.appendChild(ui);if(focus&&ui.contains(focus))focus.focus({preventScroll:true});}
    }
    function fitCanvas() {
        const shell=document.getElementById('canvas-shell'),canvas=document.getElementById('gameCanvas');if(!shell||!canvas)return;
        const w=shell.clientWidth,h=shell.clientHeight;
        const width=Math.max(1,Math.min(w,h*5/3));
        canvasScale=width/1000;canvas.style.width=width+'px';canvas.style.height=width*.6+'px';
    }
    function initUI(getState,sfx) {
        stateReader=getState;soundHook=sfx;
        const box=document.getElementById('screen-settings')?.querySelector('.settings-card');
        if(box&&!document.getElementById('rf-graphics')){
            const field=document.createElement('fieldset');field.id='rf-graphics';
            field.innerHTML='<legend>\u0413\u0440\u0430\u0444\u0438\u043a\u0430 \u0438 \u0434\u0432\u0438\u0436\u0435\u043d\u0438\u0435</legend><label>\u041a\u0430\u0447\u0435\u0441\u0442\u0432\u043e<select id="rf-quality"><option value="low">LOW \u00b7 \u041b\u0451\u0433\u043a\u043e\u0435</option><option value="medium">MEDIUM \u00b7 \u0421\u0431\u0430\u043b\u0430\u043d\u0441\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u043e\u0435</option><option value="high">HIGH \u00b7 \u041f\u043e\u043b\u043d\u043e\u0435</option></select></label><label class="rf-check"><input id="rf-auto" type="checkbox">\u0421\u043d\u0438\u0436\u0430\u0442\u044c \u044d\u0444\u0444\u0435\u043a\u0442\u044b \u043f\u0440\u0438 \u0434\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0439 \u043f\u0435\u0440\u0435\u0433\u0440\u0443\u0437\u043a\u0435</label><label>\u0410\u043d\u0438\u043c\u0430\u0446\u0438\u0438<select id="rf-motion"><option value="system">\u041a\u0430\u043a \u0432 \u0441\u0438\u0441\u0442\u0435\u043c\u0435</option><option value="reduced">\u041c\u0438\u043d\u0438\u043c\u0443\u043c \u0434\u0432\u0438\u0436\u0435\u043d\u0438\u044f</option><option value="full">\u041f\u043e\u043b\u043d\u044b\u0435</option></select></label><label class="rf-check"><input id="rf-shake" type="checkbox">\u0418\u043c\u043f\u0443\u043b\u044c\u0441\u044b \u043a\u0430\u043c\u0435\u0440\u044b</label><label class="rf-check"><input id="rf-text" type="checkbox">\u0427\u0438\u0441\u043b\u0430 \u0443\u0440\u043e\u043d\u0430</label><p>\u0423\u0440\u043e\u043d, \u0441\u043a\u043e\u0440\u043e\u0441\u0442\u044c \u0432\u0440\u0430\u0433\u043e\u0432 \u0438 \u043d\u0430\u0433\u0440\u0430\u0434\u044b \u043d\u0435 \u0437\u0430\u0432\u0438\u0441\u044f\u0442 \u043e\u0442 \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0430. \u041f\u0440\u0435\u0434\u0443\u043f\u0440\u0435\u0436\u0434\u0435\u043d\u0438\u044f \u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u0438 \u043e\u0441\u0442\u0430\u044e\u0442\u0441\u044f \u0432\u0438\u0434\u0438\u043c\u044b\u043c\u0438.</p>';
            const actions=box.querySelector('.screen-actions');box.insertBefore(field,actions||null);
            field.addEventListener('change',e=>{const target=e.target;if(target.id==='rf-quality')configure({quality:target.value,auto:false});else if(target.id==='rf-motion')configure({motion:target.value});else if(target.id==='rf-auto')configure({auto:target.checked});else if(target.id==='rf-shake')configure({shake:target.checked});else if(target.id==='rf-text')configure({text:target.checked});});
        }
        const prep=document.getElementById('wave-prep');
        if(prep&&!document.getElementById('rf-prep-details')){
            const details=document.createElement('button');details.id='rf-prep-details';details.type='button';
            details.textContent='i';details.setAttribute('aria-label','\u041f\u043e\u0434\u0440\u043e\u0431\u043d\u043e\u0441\u0442\u0438 \u0432\u043e\u043b\u043d\u044b');details.setAttribute('aria-expanded','false');details.setAttribute('aria-controls','wave-prep-objective');
            details.addEventListener('click',()=>{if(window.R49UI && R49UI.isMobile()){R49UI.waveDetails();return;}const open=prep.classList.toggle('rf-prep-expanded');details.setAttribute('aria-expanded',String(open));fitCanvas();});prep.appendChild(details);
        }
        // A layout observer responds only to size/visibility changes, not every game tick.
        if(window.ResizeObserver){const ro=new ResizeObserver(fitCanvas);ro.observe(document.getElementById('canvas-shell'));}
        window.addEventListener('resize',()=>{layoutDock();fitCanvas();},{passive:true});
        const observer=new MutationObserver(scene);
        document.querySelectorAll('.screen').forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['class']}));
        reducedQuery.addEventListener?.('change',syncSettings);
        document.addEventListener('visibilitychange',()=>{if(document.hidden)camera.reset();});
        syncSettings();scene();
    }
    return Object.freeze({
        emit,on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return()=>listeners.get(name)?.delete(fn);},
        reset,step,advanceEnemy,drawFrame,setReplaySeed,observe,worldUnder,worldOver,tower,enemy,projectile,projectileStep,hazard,drawGhosts,drawEffects,drawTexts,random,
        legacyParticles,legacyExplosion,floatText,camera,audio,initUI,fitCanvas,scene,configure,
        get finishRemaining(){return finishRemaining;},
        get settings(){return {...config};},
        get time(){return time;},
        get quality(){return quality;},
        diagnostics(){return {version:'R48',frameCache:{...frameCacheStats,tiles:framePools[0].slots.length+framePools[1].slots.length},motionProfiles:GAITS.length,bossSignatures:BOSS_SIGNATURES.length,scenery:scenery.length,...diagnostics,frameMean:diagnostics.frames?diagnostics.frameTotal/diagnostics.frames:0,active:{particles:particles.count,rings:rings.count,ghosts:ghosts.count,texts:texts.count,decals:decals.count},settings:{...config},events:{...events},errors:errors.slice(),worldId,time};}
    });
})();
window.TD_REFORGED=Object.freeze({get:()=>Reforged.diagnostics(),settings:()=>Reforged.settings,configure:changes=>Reforged.configure(changes),setReplaySeed:value=>Reforged.setReplaySeed(value)});
