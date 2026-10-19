
    // Tower Defense: Reforged. Original campaign rules and platform/save adapters retained.
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('selectstart', e => e.preventDefault());
    document.addEventListener('dragstart', e => e.preventDefault());

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');


    // Release diagnostics stay in memory only; they never block play or expose stack traces in the UI.
    const releaseDiagnostics = { errors: [], rejections: [], startedAt: Date.now() };
    function pushReleaseDiagnostic(bucket, value) {
        const list = releaseDiagnostics[bucket]; if (!list || list.length >= 12) return;
        list.push({ at:Date.now(), message:String(value && (value.message || value.reason) || value || 'Unknown error').slice(0,240) });
    }
    window.addEventListener('error', function (event) { pushReleaseDiagnostic('errors', event && (event.error || event.message)); });
    window.addEventListener('unhandledrejection', function (event) { pushReleaseDiagnostic('rejections', event && event.reason); });
    window.TD_RELEASE_HEALTH = Object.freeze({
        get: function () { return { errors:releaseDiagnostics.errors.slice(), rejections:releaseDiagnostics.rejections.slice(), uptimeMs:Date.now()-releaseDiagnostics.startedAt, assets:window.GameAssets&&GameAssets.status?GameAssets.status():null, device:window.TD_DEVICE_HEALTH?TD_DEVICE_HEALTH.get():null }; }
    });

    if (ctx) {
        try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } catch (_) {}
    }

    // R9.11 Device Viewport Runtime: stable visual viewport for VK WebView / m.vk / iOS / Android.
    let viewportSyncFrame = 0;
    let lastViewportWidth = 0;
    let lastViewportHeight = 0;
    let lastViewportSource = 'initial';
    let viewportTransitionTimer = null;
    const viewportStabilizeTimers = new Set();

    function classifyDeviceShell() {
        const root = document.documentElement;
        const ua = String(navigator.userAgent || '');
        const platform = String(navigator.platform || '');
        const touchMac = platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1;
        const ios = /iPad|iPhone|iPod/i.test(ua) || touchMac;
        const android = /Android/i.test(ua);
        root.classList.toggle('device-ios', ios);
        root.classList.toggle('device-android', android);
        root.classList.toggle('device-touch', Number(navigator.maxTouchPoints || 0) > 0 || matchMedia('(pointer:coarse)').matches);
        root.classList.toggle('device-vk', /\bVK\b|VKApp|VKMobile/i.test(ua));
        root.dataset.deviceOs = ios ? 'ios' : android ? 'android' : 'desktop';
    }

    function readStableViewportMetrics() {
        const root = document.documentElement;
        const vv = window.visualViewport;
        const innerW = Number(window.innerWidth) || 0;
        const innerH = Number(window.innerHeight) || 0;
        const clientW = Number(root.clientWidth) || 0;
        const clientH = Number(root.clientHeight) || 0;
        const scale = vv && Number.isFinite(vv.scale) ? vv.scale : 1;
        const vvW = vv && Number.isFinite(vv.width) ? vv.width : 0;
        const vvH = vv && Number.isFinite(vv.height) ? vv.height : 0;

        // Some Android/iOS WebViews update innerWidth/innerHeight before visualViewport
        // during rotation/resume. A still-plausible visualViewport can therefore belong
        // to the previous orientation for a few frames. Trust it only when its width is
        // already synchronized with the layout viewport and its orientation agrees.
        const layoutW = innerW >= 240 ? innerW : (clientW >= 240 ? clientW : 0);
        const layoutH = innerH >= 160 ? innerH : (clientH >= 160 ? clientH : 0);
        const authoritativeW = innerW >= 240 ? innerW : clientW;
        const vvWidthFresh = vvW > 0 && authoritativeW > 0 && Math.abs(vvW - authoritativeW) <= 2;
        const vvOrientationMatches = layoutW > 0 && layoutH > 0
            ? ((vvW >= vvH) === (layoutW >= layoutH))
            : true;
        // Height may legitimately differ because browser chrome/keyboard changes the
        // visual viewport, so freshness is intentionally decided by width + orientation.
        const vvPlausible = vvW >= 240 && vvH >= 160 && scale >= 0.96 && scale <= 1.04
            && vvWidthFresh && vvOrientationMatches;

        let w = vvPlausible ? vvW : (layoutW || lastViewportWidth || 320);
        let h = vvPlausible ? vvH : (layoutH || lastViewportHeight || 480);
        if (w < 240 && lastViewportWidth >= 240) w = lastViewportWidth;
        if (h < 160 && lastViewportHeight >= 160) h = lastViewportHeight;
        w = Math.max(1, Math.round(w));
        h = Math.max(1, Math.round(h));
        return { w, h, source: vvPlausible ? 'visualViewport' : 'layoutViewport', scale };
    }

    function applyViewportMetrics() {
        viewportSyncFrame = 0;
        const next = readStableViewportMetrics();
        const w = next.w, h = next.h;
        const root = document.documentElement;
        const changed = w !== lastViewportWidth || h !== lastViewportHeight || next.source !== lastViewportSource;
        lastViewportWidth = w; lastViewportHeight = h; lastViewportSource = next.source;
        root.style.setProperty('--app-height', h + 'px');
        root.style.setProperty('--app-width', w + 'px');
        root.style.setProperty('--viewport-scale', String(next.scale || 1));
        root.dataset.viewportOrientation = w >= h ? 'landscape' : 'portrait';
        root.dataset.viewportSource = next.source;
        root.classList.toggle('viewport-short', h <= 600);
        root.classList.toggle('viewport-ultrashort', h <= 420);
        root.classList.toggle('viewport-narrow', w <= 780);
        if (changed) {
            try { document.dispatchEvent(new CustomEvent('tdviewportchange', { detail:{ width:w, height:h, source:next.source } })); } catch (_) {}
        }
    }

    function syncViewportMetrics() {
        if (viewportSyncFrame) return;
        // Apply once synchronously so WebView resize/rotation cannot expose an old body
        // size while requestAnimationFrame is delayed (background tab, resume, heavy frame).
        applyViewportMetrics();
        viewportSyncFrame = requestAnimationFrame(applyViewportMetrics);
    }

    function scheduleViewportStabilization(reason) {
        const root = document.documentElement;
        root.classList.add('viewport-transitioning');
        syncViewportMetrics();
        [60, 180, 420, 850].forEach(delay => {
            const id = setTimeout(() => { viewportStabilizeTimers.delete(id); syncViewportMetrics(); }, delay);
            viewportStabilizeTimers.add(id);
        });
        if (viewportTransitionTimer) clearTimeout(viewportTransitionTimer);
        viewportTransitionTimer = setTimeout(() => { root.classList.remove('viewport-transitioning'); syncViewportMetrics(); }, 980);
    }

    classifyDeviceShell();
    applyViewportMetrics();
    window.addEventListener('resize', syncViewportMetrics, { passive:true });
    window.addEventListener('orientationchange', () => scheduleViewportStabilization('orientationchange'), { passive:true });
    window.addEventListener('pageshow', () => scheduleViewportStabilization('pageshow'), { passive:true });
    window.addEventListener('focus', () => scheduleViewportStabilization('focus'), { passive:true });
    if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
        window.screen.orientation.addEventListener('change', () => scheduleViewportStabilization('screen-orientation'), { passive:true });
    }
    try {
        const orientationMedia = matchMedia('(orientation: portrait)');
        const onOrientationMedia = () => scheduleViewportStabilization('media-orientation');
        if (orientationMedia.addEventListener) orientationMedia.addEventListener('change', onOrientationMedia);
        else if (orientationMedia.addListener) orientationMedia.addListener(onOrientationMedia);
    } catch (_) {}
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncViewportMetrics, { passive:true });
        window.visualViewport.addEventListener('scroll', syncViewportMetrics, { passive:true });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => scheduleViewportStabilization('fonts')).catch(() => {});

    window.TD_DEVICE_HEALTH = Object.freeze({
        get: function () {
            const root = document.documentElement;
            const body = document.body;
            return {
                viewport:{ width:lastViewportWidth, height:lastViewportHeight, orientation:root.dataset.viewportOrientation || '', source:lastViewportSource, scale:Number(root.style.getPropertyValue('--viewport-scale') || 1) },
                device:root.dataset.deviceOs || 'desktop',
                touch:root.classList.contains('device-touch'),
                vk:root.classList.contains('device-vk'),
                overflow:body ? { x:Math.max(0, body.scrollWidth-lastViewportWidth), y:Math.max(0, body.scrollHeight-lastViewportHeight), scrollX:window.scrollX||0, scrollY:window.scrollY||0 } : null
            };
        }
    });

    // R9 release manifest helpers: in normal play they resolve to ordinary relative URLs;
    // inside ZIP audit sandboxes the static manifest URLs are rewritten to local data: URLs.
    function releaseImageSrc(name) {
        const key=String(name||''),node=document.getElementById('asset-image-'+key);
        if(node&&(node.currentSrc||node.src))return node.currentSrc||node.src;
        const derivative=RF_MOTION.assets[key];
        const declared=window.TD_DATA?.assets?.imageKeys?.includes(key);
        if(!derivative&&!declared)throw new Error('Unknown image key: '+key);
        const path=derivative||('images/'+key+'.webp');
        return /^(?:data:|blob:)/i.test(path)?path:path+'?v=rf48';
    }
    function releaseAudioSrc(name) {
        const node = document.getElementById('asset-audio-' + String(name || ''));
        return node && node.src ? node.src : ('audio/' + String(name || '') + '.mp3');
    }

    // V3 Audio Manager: independent music/SFX controls + persistent settings.
    const AUDIO_FILES = {
        'menu_theme': 'audio/menu_theme.mp3',
        'Before_the_Gates_Fall': 'audio/Before_the_Gates_Fall.mp3',
        'Banner_Over_The_Ramparts': 'audio/Banner_Over_The_Ramparts.mp3',
        'Ashes_of_the_Gate': 'audio/Ashes_of_the_Gate.mp3'
    };
    const AUDIO_SETTINGS_KEY = 'td_audio_settings_v3';
    const DEFAULT_AUDIO_SETTINGS = { musicEnabled: true, musicVolume: 0.45, sfxEnabled: true, sfxVolume: 0.65, masterMuted: false };
    const audioPlayers = {};
    let currentMusicName = null;
    let audioContext = null;
    let audioSettingsReturnScreen = 'menu';
    let audioSettingsReturnFocus = null; // restore keyboard navigation to originating screen
    let systemPauseActive = false;
    let systemPausePreviousScreen = null;
    let systemPauseReason = '';
    let lifecycleBlurTimer = null;

    function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
    function loadAudioSettings() {
        try {
            const stored = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) || 'null');
            if (!stored || typeof stored !== 'object') return { ...DEFAULT_AUDIO_SETTINGS };
            return {
                musicEnabled: stored.musicEnabled !== false,
                musicVolume: clamp01(stored.musicVolume ?? DEFAULT_AUDIO_SETTINGS.musicVolume),
                sfxEnabled: stored.sfxEnabled !== false,
                sfxVolume: clamp01(stored.sfxVolume ?? DEFAULT_AUDIO_SETTINGS.sfxVolume),
                masterMuted: stored.masterMuted === true
            };
        } catch (e) { return { ...DEFAULT_AUDIO_SETTINGS }; }
    }
    let audioSettings = loadAudioSettings();

    function saveAudioSettings() {
        try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(audioSettings)); } catch (e) {}
        if (window.GameSave && typeof window.GameSave.save === 'function') window.GameSave.save('audio-settings');
    }

    function musicOutputVolume() {
        return (!audioSettings.masterMuted && audioSettings.musicEnabled) ? clamp01(audioSettings.musicVolume) : 0;
    }
    function sfxOutputVolume() {
        return (!audioSettings.masterMuted && audioSettings.sfxEnabled) ? clamp01(audioSettings.sfxVolume) : 0;
    }

    function initAudioSystem() {
        for (const key in AUDIO_FILES) {
            if (audioPlayers[key]) continue;
            const a = new Audio();
            a.src = releaseAudioSrc(key);
            // Avoid downloading every soundtrack during boot; playback fetches tracks on demand.
            a.preload = key === 'menu_theme' ? 'metadata' : 'none';
            a.playsInline = true;
            a.volume = musicOutputVolume();
            a.loop = (key === 'menu_theme' || key === 'Before_the_Gates_Fall');
            audioPlayers[key] = a;
        }
        updateAudioPlayersVolume();
    }

    function updateAudioPlayersVolume() {
        const volume = musicOutputVolume();
        Object.values(audioPlayers).forEach(player => { try { player.volume = volume; } catch (e) {} });
    }

    function audioPlaybackSuspended() {
        if (document.hidden || systemPauseActive) return true;
        if (typeof state !== 'undefined' && state.screen === 'pause') return true;
        if (typeof state !== 'undefined' && state.screen === 'settings' && audioSettingsReturnScreen === 'pause') return true;
        return false;
    }

    function playMusic(trackName) {
        initAudioSystem();
        if (!audioPlayers[trackName]) return;
        if (currentMusicName !== trackName) {
            if (currentMusicName && audioPlayers[currentMusicName]) {
                try { audioPlayers[currentMusicName].pause(); audioPlayers[currentMusicName].currentTime = 0; } catch (e) {}
            }
            currentMusicName = trackName;
            try { audioPlayers[trackName].currentTime = 0; } catch (e) {}
        }
        updateAudioPlayersVolume();
        if (musicOutputVolume() <= 0 || audioPlaybackSuspended()) {
            try { audioPlayers[trackName].pause(); } catch (e) {}
            return;
        }
        audioPlayers[trackName].play().catch(() => {});
    }

    function stopMusic() {
        if (currentMusicName && audioPlayers[currentMusicName]) {
            try { audioPlayers[currentMusicName].pause(); audioPlayers[currentMusicName].currentTime = 0; } catch (e) {}
        }
        currentMusicName = null;
    }

    function pauseMusic() {
        if (currentMusicName && audioPlayers[currentMusicName]) {
            try { audioPlayers[currentMusicName].pause(); } catch (e) {}
        }
    }

    function resumeMusic() {
        updateAudioPlayersVolume();
        if (!currentMusicName || !audioPlayers[currentMusicName]) return;
        if (musicOutputVolume() <= 0 || audioPlaybackSuspended()) return;
        audioPlayers[currentMusicName].play().catch(() => {});
    }

    function suspendSfxContextForSystem() {
        if (audioContext && audioContext.state === 'running' && typeof audioContext.suspend === 'function') audioContext.suspend().catch(() => {});
    }

    function resumeSfxContextFromSystem() {
        if (audioContext && audioContext.state === 'suspended' && typeof audioContext.resume === 'function') audioContext.resume().catch(() => {});
    }

    function ensureAudioContext() {
        if (audioContext) {
            if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
            return audioContext;
        }
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try { audioContext = new Ctx(); } catch (e) { return null; }
        return audioContext;
    }

    function playSfx(kind = 'ui') {
        const volume=sfxOutputVolume();
        if(volume<=0||document.hidden||systemPauseActive||adBusy)return;
        const ac=ensureAudioContext();
        if(ac)Reforged.audio(kind,ac,volume);
    }

    function syncAudioSettingsUI() {
        const music = document.getElementById('music-volume');
        const sfx = document.getElementById('sfx-volume');
        const musicValue = document.getElementById('music-volume-value');
        const sfxValue = document.getElementById('sfx-volume-value');
        const musicToggle = document.getElementById('music-toggle');
        const sfxToggle = document.getElementById('sfx-toggle');
        const master = document.getElementById('master-audio-toggle');
        if (music) music.value = Math.round(audioSettings.musicVolume * 100);
        if (sfx) sfx.value = Math.round(audioSettings.sfxVolume * 100);
        if (musicValue) musicValue.textContent = Math.round(audioSettings.musicVolume * 100) + '%';
        if (sfxValue) sfxValue.textContent = Math.round(audioSettings.sfxVolume * 100) + '%';
        if (musicToggle) { musicToggle.textContent = audioSettings.musicEnabled ? 'ВКЛ' : 'ВЫКЛ'; musicToggle.classList.toggle('off', !audioSettings.musicEnabled); }
        if (sfxToggle) { sfxToggle.textContent = audioSettings.sfxEnabled ? 'ВКЛ' : 'ВЫКЛ'; sfxToggle.classList.toggle('off', !audioSettings.sfxEnabled); }
        if (master) {
            master.textContent = audioSettings.masterMuted ? 'ВКЛЮЧИТЬ ВЕСЬ ЗВУК' : 'ВЫКЛЮЧИТЬ ВЕСЬ ЗВУК';
            master.classList.toggle('muted', audioSettings.masterMuted);
        }
    }

    function applyAudioSettings(previewSfx = false) {
        saveAudioSettings(); updateAudioPlayersVolume(); syncAudioSettingsUI();
        if (musicOutputVolume() <= 0) pauseMusic(); else resumeMusic();
        if (previewSfx) playSfx('ui');
    }
    function setMusicVolume(value) { audioSettings.musicVolume = clamp01(Number(value) / 100); applyAudioSettings(false); }
    function setSfxVolume(value) { audioSettings.sfxVolume = clamp01(Number(value) / 100); applyAudioSettings(true); }
    function toggleMusicEnabled() { audioSettings.musicEnabled = !audioSettings.musicEnabled; applyAudioSettings(false); playSfx('ui'); }
    function toggleSfxEnabled() { audioSettings.sfxEnabled = !audioSettings.sfxEnabled; applyAudioSettings(audioSettings.sfxEnabled); }
    function toggleMasterMute() { audioSettings.masterMuted = !audioSettings.masterMuted; applyAudioSettings(!audioSettings.masterMuted); }

    function openAudioSettings(returnScreen) {
        audioSettingsReturnFocus = document.activeElement;
        audioSettingsReturnScreen = returnScreen || (typeof state !== 'undefined' ? state.screen : 'menu');
        if (typeof state !== 'undefined') state.screen = 'settings';
        setPauseButtonVisible(false);
        document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
        document.getElementById('screen-settings').classList.remove('hidden');
        const settingsCard = document.querySelector('#screen-settings .settings-card'); if (settingsCard) settingsCard.scrollTop = 0;
        document.getElementById('music-volume')?.focus({preventScroll:true});
        syncAudioSettingsUI();
        if (audioSettingsReturnScreen === 'pause') pauseMusic(); else resumeMusic();
        playSfx('ui');
    }

    function closeAudioSettings() {
        document.getElementById('screen-settings').classList.add('hidden');
        if (audioSettingsReturnScreen === 'pause') {
            state.screen = 'pause';
            document.getElementById('screen-pause').classList.remove('hidden');
            setPauseButtonVisible(false); pauseMusic();
        } else {
            state.screen = 'menu';
            document.getElementById('screen-menu').classList.remove('hidden');
            setPauseButtonVisible(false); resumeMusic();
        }
        const previousFocus=audioSettingsReturnFocus;audioSettingsReturnFocus=null;
        if(previousFocus?.isConnected && previousFocus.getClientRects?.().length)previousFocus.focus({preventScroll:true});
        playSfx('ui');
    }

    // Unlock AudioContext and retry music only after a trusted user gesture.
    ['click', 'keydown', 'pointerdown', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, () => {
            initAudioSystem(); ensureAudioContext(); resumeMusic();
        }, { passive: true });
    });

    async function bootGame() {
        const button = document.getElementById('boot-play-btn');
        const loader = document.getElementById('boot-loader');
        const message = document.getElementById('boot-message');
        if (button && button.disabled) return;
        if (button) { button.disabled = true; button.textContent = 'ПРОВЕРКА ГРАФИКИ…'; }
        if (loader) loader.classList.add('active');
        if (message) message.textContent = 'Проверяем обязательные изображения перед запуском.';
        initAudioSystem(); syncAudioSettingsUI();

        let assetReport = null;
        try {
            const results = await Promise.all([
                ensureCoreAssetsReady({ onProgress:updateBootAssetProgress }),
                window.GameSave ? GameSave.ready().catch(() => null) : Promise.resolve(null)
            ]);
            assetReport = results[0];
        } catch (error) {
            assetReport = { ok:false, failed:[{name:'core',reason:String(error && error.message || error || 'error')}] };
        }

        if (!assetReport || !assetReport.ok) {
            const failed = assetReport && Array.isArray(assetReport.failed) ? assetReport.failed.map(x => x.name).filter(Boolean) : [];
            if (message) message.textContent = failed.length
                ? `Не удалось подготовить графику (${failed.length}). Проверьте соединение и повторите.`
                : 'Не удалось подготовить графику. Повторите загрузку.';
            if (button) { button.disabled = false; button.textContent = 'ПОВТОРИТЬ ЗАГРУЗКУ'; }
            if (loader) loader.classList.add('active');
            return;
        }

        if (message) message.textContent = 'Графика проверена. Запускаем меню.';
        document.getElementById('screen-boot').classList.add('hidden');
        document.getElementById('screen-menu').classList.remove('hidden');
        state.screen = 'menu';
        playMusic('menu_theme');
        updateSaveStatusUI();
        setMenuAssetStatus('', '');
        scheduleBackgroundAssetWarmup();
        scheduleR24HudGuard();
        setTimeout(maybeShowUpdateNotice,80);
    }

    // ================= R9.10 Asset Reliability =================
    // Mandatory level art is verified before simulation begins. Failed requests are never cached forever:
    // each foreground gate gets bounded retries, a fresh Image object and decode/dimension verification.
    const ASSETS = {};
    // R90: expansion bosses need their own atlas and portrait registry; the original
    // TD_DATA imageKeys list predates worlds XIII-XVIII. This is loading metadata only.
    const R90_BOSS_ASSET_KEYS = Object.freeze(['admiral','chronos','thornmother','obsidian','regent','origin'].flatMap(name => ['boss_'+name+'_r69','boss_'+name+'_anim_r90']));
    const assetNames = Array.from(new Set((window.TD_DATA && TD_DATA.assets ? TD_DATA.assets.imageKeys : []).concat(Object.keys(RF_MOTION.assets),R90_BOSS_ASSET_KEYS)));
    const assetNameSet = new Set(assetNames);
    const ASSET_TIMEOUT_MS = 8000;
    const ASSET_MAX_ATTEMPTS = 3;
    const ASSET_RETRY_DELAYS = Object.freeze([0, 260, 760]);
    const ASSET_FOREGROUND_CONCURRENCY = 4;
    const RELEASE_COMMON_ASSETS = Object.freeze(Array.from(new Set(
        ['tower_base'].concat(window.TD_DATA && TD_DATA.assets && Array.isArray(TD_DATA.assets.towerKeys) ? TD_DATA.assets.towerKeys : [])
    )));
    const assetRequests = new Map();          // active requests only; failures are deleted and can be retried
    const assetStatus = new Map();            // idle/loading/retrying/loaded/failed
    const assetFailure = new Map();           // last failure reason
    const assetAttempts = new Map();          // lifetime attempt counter per key
    const assetLoadState = { total:assetNames.length, totalAttempts:0, coreTotal:0, coreSettled:0, backgroundComplete:false, backgroundPasses:0 };
    let bootAssetSet = new Set();
    let backgroundWarmPromise = null;
    let assetRecoveryActive = false;
    let assetRecoveryBusy = false;
    let assetRecoveryMissingKey = '';

    function assetIsReady(name) {
        const img = ASSETS[String(name || '')];
        return !!(img && img.ready === true && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
    }

    function currentAssetCounts() {
        let loaded=0, failed=0, loading=0, retrying=0;
        assetNames.forEach(function(name){
            const status=assetStatus.get(name);
            if (assetIsReady(name)) loaded++;
            else if (status==='failed') failed++;
            else if (status==='loading') loading++;
            else if (status==='retrying') retrying++;
        });
        return { loaded, failed, loading, retrying, settled:loaded+failed };
    }

    function enemyAssetKeys(type, keys) {
        const enemy = window.TD_DATA && TD_DATA.getEnemyByType ? TD_DATA.getEnemyByType(type) : null;
        if (!enemy) return;
        // Both atlas and static image are required. Static art is a real-image fallback, never geometry.
        if (enemy.animation && enemy.animation.assetKey) keys.add(enemy.animation.assetKey);
        if (enemy.imgKey) keys.add(enemy.imgKey);
        if (Number.isFinite(Number(enemy.deathSpawnType))) {
            const child = TD_DATA.getEnemyByType(Number(enemy.deathSpawnType));
            if (child) {
                if (child.animation && child.animation.assetKey) keys.add(child.animation.assetKey);
                if (child.imgKey) keys.add(child.imgKey);
            }
        }
    }

    function levelAssetKeys(levelId) {
        const keys = new Set();
        if (!window.TD_DATA) return RELEASE_COMMON_ASSETS.filter(k => assetNameSet.has(k));
        const level = TD_DATA.getLevel(levelId);
        const map = level ? TD_DATA.getMap(level.mapId) : null;
        // Map first, then all tower art, then every enemy/boss that can appear in the level.
        if (map && map.assetKey) keys.add(map.assetKey);
        RELEASE_COMMON_ASSETS.forEach(k => keys.add(k));
        if (level && Array.isArray(level.waves)) {
            level.waves.forEach(function (wave) {
                if (wave && wave.kind === 'normal') {
                    (wave.composition || []).forEach(function (group) { enemyAssetKeys(group.type, keys); });
                    (wave.enemySequence || []).forEach(function (type) { enemyAssetKeys(type, keys); });
                } else if (wave && wave.kind === 'boss') {
                    const boss = TD_DATA.getBoss(wave.bossId);
                    if (boss && boss.imgKey) {
                        keys.add(boss.imgKey);
                        // R90: the correct world XIII-XVIII atlas, never the world XII fallback.
                        const r90Key=window.R90BOSS?.assetKey(boss.worldId);
                        if(r90Key)keys.add(r90Key);
                        else {const motion=RF_MOTION.bosses[boss.worldId-1];if(motion)keys.add(motion.atlasKey);}
                    }
                    if (boss && Array.isArray(boss.summonTypes)) boss.summonTypes.forEach(function (type) { enemyAssetKeys(type, keys); });
                }
            });
        }
        return Array.from(keys).filter(k => assetNameSet.has(k));
    }

    function updateBootAssetProgress(progress) {
        const total = Math.max(1, Number(progress && progress.total) || assetLoadState.coreTotal || bootAssetSet.size || 1);
        let settled = Number(progress && progress.settled);
        if (!Number.isFinite(settled)) {
            settled = 0;
            bootAssetSet.forEach(function (name) { if (assetIsReady(name) || assetStatus.get(name)==='failed') settled++; });
        }
        assetLoadState.coreSettled = Math.max(0, Math.min(total, settled));
        const pct = Math.round((assetLoadState.coreSettled / total) * 100);
        const fill = document.getElementById('boot-progress-fill');
        const text = document.getElementById('boot-progress-text');
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent = `Графика запуска: ${assetLoadState.coreSettled}/${total} · ${pct}%`;
    }

    function setMenuAssetStatus(text, type) {
        const box=document.getElementById('menu-asset-status');
        if (!box) return;
        box.textContent=String(text || '');
        box.className=type ? String(type) : '';
    }

    function sleepAssetRetry(ms) { return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms)||0))); }

    function assetSourceForAttempt(name, attempt) {
        const base = releaseImageSrc(name);
        if (attempt <= 1 || /^(?:data:|blob:)/i.test(base)) return base;
        try {
            const url = new URL(base, document.baseURI);
            if (url.protocol === 'http:' || url.protocol === 'https:') {
                url.searchParams.set('__td_asset_retry', String(attempt));
                return url.href;
            }
        } catch (_) {}
        return base;
    }

    function loadAssetAttempt(name, attempt) {
        return new Promise(function(resolve) {
            const img = new Image();
            img.ready = false;
            try { img.decoding = 'async'; } catch (_) {}
            let settled = false;
            let timer = null;

            function cleanup() {
                if (timer) { clearTimeout(timer); timer=null; }
                img.onload=null; img.onerror=null;
            }
            function finish(ok, reason) {
                if (settled) return;
                settled=true; cleanup();
                if (ok) {
                    img.ready=true;
                    ASSETS[name]=img;
                    assetStatus.set(name,'loaded');
                    assetFailure.delete(name);
                }
                resolve({ name, ok:!!ok, reason:String(reason || ''), attempt, width:img.naturalWidth||0, height:img.naturalHeight||0 });
            }
            async function verifyLoaded() {
                try {
                    if (typeof img.decode === 'function') await img.decode();
                    if (!img.complete || !(img.naturalWidth > 0) || !(img.naturalHeight > 0)) { finish(false,'invalid-dimensions'); return; }
                    finish(true,'');
                } catch (_) { finish(false,'decode'); }
            }

            img.onload=verifyLoaded;
            img.onerror=function(){ finish(false,'error'); };
            timer=setTimeout(function(){ finish(false,'timeout'); },ASSET_TIMEOUT_MS);
            try {
                img.src=assetSourceForAttempt(name,attempt);
                if (img.complete && img.naturalWidth > 0) Promise.resolve().then(verifyLoaded);
            } catch (_) { finish(false,'source'); }
        });
    }

    function loadAsset(name, options) {
        name=String(name || '');
        const opts=options || {};
        if (!assetNameSet.has(name)) return Promise.resolve({name,ok:false,reason:'unknown',attempt:0});
        if (assetIsReady(name)) return Promise.resolve({name,ok:true,reason:'',cached:true,attempt:0,width:ASSETS[name].naturalWidth,height:ASSETS[name].naturalHeight});
        if (assetRequests.has(name)) return assetRequests.get(name);

        const maxAttempts=Math.max(1,Math.min(ASSET_MAX_ATTEMPTS,Number(opts.maxAttempts)||ASSET_MAX_ATTEMPTS));
        const request=(async function(){
            let last={name,ok:false,reason:'not-started',attempt:0};
            try {
                for (let attempt=1; attempt<=maxAttempts; attempt++) {
                    if (attempt>1) {
                        assetStatus.set(name,'retrying');
                        await sleepAssetRetry(ASSET_RETRY_DELAYS[Math.min(attempt-1,ASSET_RETRY_DELAYS.length-1)]);
                    }
                    assetStatus.set(name,'loading');
                    assetAttempts.set(name,(assetAttempts.get(name)||0)+1);
                    assetLoadState.totalAttempts++;
                    last=await loadAssetAttempt(name,attempt);
                    if (last.ok) return last;
                    assetFailure.set(name,last.reason || 'error');
                }
                assetStatus.set(name,'failed');
                return last;
            } finally {
                // Critical R9.10 rule: only active requests live in this map. A failed promise is never permanent.
                assetRequests.delete(name);
            }
        })();
        assetRequests.set(name,request);
        return request;
    }

    async function ensureAssetsReady(names, options) {
        const opts=options || {};
        const unique=Array.from(new Set((names || []).filter(name => assetNameSet.has(name))));
        const total=unique.length;
        const results=new Array(total);
        let cursor=0, settled=0;
        const concurrency=Math.max(1,Math.min(Number(opts.concurrency)||ASSET_FOREGROUND_CONCURRENCY,total||1));
        function emit(current) {
            if (typeof opts.onProgress==='function') {
                try { opts.onProgress({ total, settled, loaded:results.filter(x=>x&&x.ok).length, failed:results.filter(x=>x&&!x.ok).length, current:current||'', percent:total?Math.round(settled/total*100):100 }); } catch (_) {}
            }
        }
        emit('');
        async function worker(){
            while (cursor<total) {
                const index=cursor++;
                const name=unique[index];
                results[index]=await loadAsset(name,opts);
                settled++; emit(name);
            }
        }
        const workers=[]; for(let i=0;i<concurrency;i++) workers.push(worker());
        await Promise.all(workers);
        const failed=results.filter(x=>x&&!x.ok);
        return { ok:failed.length===0, keys:unique, results, failed, loaded:results.filter(x=>x&&x.ok).length, total };
    }

    async function ensureCoreAssetsReady(options) {
        const keys=levelAssetKeys(1);
        bootAssetSet=new Set(keys); assetLoadState.coreTotal=keys.length; assetLoadState.coreSettled=0;
        updateBootAssetProgress({total:keys.length,settled:0});
        return ensureAssetsReady(keys,Object.assign({concurrency:ASSET_FOREGROUND_CONCURRENCY},options||{}));
    }

    async function ensureLevelAssetsReady(levelId, options) {
        return ensureAssetsReady(levelAssetKeys(levelId),Object.assign({concurrency:ASSET_FOREGROUND_CONCURRENCY},options||{}));
    }

    function isLevelReady(levelId) { return levelAssetKeys(levelId).every(assetIsReady); }

    async function warmBackgroundAssets() {
        if (backgroundWarmPromise) return backgroundWarmPromise;
        backgroundWarmPromise=(async function(){
            assetLoadState.backgroundPasses++;
            // Do not decode the whole asset catalog at once on mobile. Warm only the selected and next level at low priority.
            const configuredTotalLevels=Math.max(1,Number(window.TD_DATA&&TD_DATA.meta.totalLevels)||1);
            const current=Math.max(1,Math.min(configuredTotalLevels,Number(typeof state!=='undefined'&&state.level)||1));
            const keys=new Set(levelAssetKeys(current));
            if (current < configuredTotalLevels) levelAssetKeys(current+1).forEach(k=>keys.add(k));
            const report=await ensureAssetsReady(Array.from(keys),{concurrency:1,maxAttempts:1});
            assetLoadState.backgroundComplete=!!report.ok;
            return report;
        })().finally(function(){ backgroundWarmPromise=null; });
        return backgroundWarmPromise;
    }

    function scheduleBackgroundAssetWarmup() {
        const run=function(){ warmBackgroundAssets().catch(function(){}); };
        if ('requestIdleCallback' in window) window.requestIdleCallback(run,{timeout:2500});
        else setTimeout(run,1200);
    }

    function renderAssetRecoveryProgress(progress) {
        const total=Math.max(1,Number(progress&&progress.total)||1);
        const settled=Math.max(0,Math.min(total,Number(progress&&progress.settled)||0));
        const pct=Math.round(settled/total*100);
        const fill=document.getElementById('asset-recovery-fill');
        const text=document.getElementById('asset-recovery-progress-text');
        if (fill) fill.style.width=pct+'%';
        if (text) text.textContent=`Проверено ${settled}/${total} · ${pct}%`;
    }

    function showAssetRecoveryOverlay(text,busy) {
        const overlay=document.getElementById('asset-recovery-overlay');
        const copy=document.getElementById('asset-recovery-text');
        const retry=document.getElementById('asset-recovery-retry');
        const menu=document.getElementById('asset-recovery-menu');
        if (copy) copy.textContent=text || 'Восстанавливаем обязательные изображения уровня.';
        if (retry) retry.style.display=busy?'none':'';
        if (menu) menu.style.display=busy?'none':'';
        if (overlay) overlay.classList.remove('hidden');
    }

    function hideAssetRecoveryOverlay() {
        const overlay=document.getElementById('asset-recovery-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    async function recoverActiveLevelAssets() {
        if (assetRecoveryBusy || typeof state==='undefined' || state.screen!=='play') return;
        assetRecoveryBusy=true; assetRecoveryActive=true;
        setPauseButtonVisible(false); pauseMusic();
        showAssetRecoveryOverlay('Изображение стало недоступно. Игра остановлена до восстановления графики.',true);
        renderAssetRecoveryProgress({total:levelAssetKeys(state.level).length,settled:0});
        const report=await ensureLevelAssetsReady(state.level,{onProgress:renderAssetRecoveryProgress});
        assetRecoveryBusy=false;
        if (report.ok) {
            assetRecoveryActive=false; assetRecoveryMissingKey=''; hideAssetRecoveryOverlay();
            setPauseButtonVisible(true); resetGameClock(); resumeMusic();
        } else {
            const failed=report.failed.map(x=>x.name).join(', ');
            showAssetRecoveryOverlay(`Не удалось загрузить: ${failed || 'обязательная графика'}. Нажмите «Повторить».`,false);
        }
    }

    function requestRuntimeAssetRecovery(name) {
        assetRecoveryMissingKey=String(name || assetRecoveryMissingKey || '');
        if (assetRecoveryActive || assetRecoveryBusy || typeof state==='undefined' || state.screen!=='play') return;
        Promise.resolve().then(recoverActiveLevelAssets);
    }

    function retryRuntimeAssets() { if (!assetRecoveryBusy) recoverActiveLevelAssets(); }
    function cancelRuntimeAssetRecovery() {
        assetRecoveryActive=false; assetRecoveryBusy=false; assetRecoveryMissingKey=''; hideAssetRecoveryOverlay();
        if (typeof returnToMenu==='function') returnToMenu();
    }

    window.GameAssets=Object.freeze({
        version:910,
        ready:ensureCoreAssetsReady, ensure:ensureAssetsReady, ensureLevel:ensureLevelAssetsReady, warm:warmBackgroundAssets,
        levelKeys:levelAssetKeys, isReady:assetIsReady, isLevelReady:isLevelReady, retry:loadAsset,
        status:function(){ const c=currentAssetCounts(); return { total:assetLoadState.total, loaded:c.loaded, failed:c.failed, loading:c.loading, retrying:c.retrying, settled:c.settled, totalAttempts:assetLoadState.totalAttempts, coreTotal:assetLoadState.coreTotal, coreSettled:assetLoadState.coreSettled, backgroundComplete:assetLoadState.backgroundComplete, backgroundPasses:assetLoadState.backgroundPasses, failedKeys:assetNames.filter(n=>assetStatus.get(n)==='failed').map(n=>({name:n,reason:assetFailure.get(n)||''})), attempts:Object.fromEntries(Array.from(assetAttempts.entries())) }; }
    });
    // ================= /R9.10 Asset Reliability =================

    const GAME_DATA = window.TD_DATA;
    const DATA_VALIDATION = GAME_DATA.validate();
    if (!DATA_VALIDATION.ok) throw new Error('Game data validation failed: ' + DATA_VALIDATION.errors.join(', '));
    const GAME_COUNTS = GAME_DATA.counts;
    const TOTAL_LEVELS = GAME_COUNTS.totalLevels;
    const MAX_CAMPAIGN_STARS = GAME_COUNTS.maxCampaignStars;
    const BESTIARY_TOTAL = GAME_COUNTS.bestiaryCount;
    const BOSS_LEVELS = GAME_COUNTS.bossLevels;
    const totalLevelsLabel = document.getElementById('ui-total-levels');
    if (totalLevelsLabel) totalLevelsLabel.textContent = TOTAL_LEVELS;
    function hydrateCampaignChrome() {
        const setText = function (id, value) { const el=document.getElementById(id); if (el) el.textContent=value; };
        setText('menu-campaign-kicker', `КОРОЛЕВСКАЯ КАМПАНИЯ · ${TOTAL_LEVELS} УРОВНЕЙ`);
        setText('menu-badge-arenas', `🗺️ ${DATA_VALIDATION.activeArenas} арен`);
        setText('menu-badge-enemies', `👹 ${GAME_COUNTS.enemyCount} классов`);
        setText('menu-badge-bosses', `👑 ${GAME_COUNTS.bossCount} боссов`);
        setText('campaign-heading-title', `КАМПАНИЯ · ${GAME_COUNTS.worldCount} МИРОВ`);
    }
    hydrateCampaignChrome();

    function createMovementPath(rawPath) {
        // R9: do not mathematically smooth or shortcut corners. The route itself is densely hand-traced
        // through the painted road centerline, so movement follows those exact segments all the way to the castle.
        const source = Array.isArray(rawPath) ? rawPath : [];
        return source.map(p => ({ x:Number(p.x)||0, y:Number(p.y)||0 }));
    }

    function rawMapPaths(mapConfig) {
        const raw = mapConfig && Array.isArray(mapConfig.paths) && mapConfig.paths.length ? mapConfig.paths : [mapConfig.path];
        return raw.filter(Boolean).map(path => path.map(p => ({x:Number(p.x)||0, y:Number(p.y)||0})));
    }

    let activeLevelConfig = GAME_DATA.getLevel(1);
    let activeWorldConfig = GAME_DATA.getWorld(activeLevelConfig.worldId);
    let activeMapConfig = GAME_DATA.getMap(activeLevelConfig.mapId);
    let ROAD_PATHS = rawMapPaths(activeMapConfig);
    let PATHS = ROAD_PATHS.map(createMovementPath);
    let ROAD_PATH = ROAD_PATHS[0];
    let PATH = PATHS[0];
    let ROAD_BUFFER = activeMapConfig.roadBuffer;
    let BUILD_TERRAIN = activeMapConfig.buildTerrain || null; // Kept only for debug/backward diagnostics.
    let BUILD_SLOTS = Array.isArray(activeMapConfig.buildSlots) ? activeMapConfig.buildSlots : [];
    let BUILD_ZONES = BUILD_SLOTS; // Compatibility alias; R9.4 construction snaps only to curated anchors.

    const CASTLE_UPGRADES = GAME_DATA.castleUpgrades;
    const META_PROGRESSION = GAME_DATA.metaProgression;
    const UPGRADES = GAME_DATA.towerUpgrades;
    const TOWER_TYPES = GAME_DATA.towers;
    const ARSENAL = GAME_DATA.arsenal || Object.freeze({});
    const ARCANA = GAME_DATA.arcana || Object.freeze({});
    const TOWER_IDS = Array.isArray(GAME_DATA.towerIds) ? GAME_DATA.towerIds.slice() : Object.keys(TOWER_TYPES);
    const TOWER_SYSTEM = GAME_DATA.towerSystem || Object.freeze({ capacity:TOWER_IDS.length, legacyBaseCount:TOWER_IDS.length });
    const SKILL_SYSTEM = GAME_DATA.skillSystem || Object.freeze({ capacity:Object.keys(GAME_DATA.skills || {}).length, activeSlots:Object.keys(GAME_DATA.skills || {}).length, legacySkillIds:Object.keys(GAME_DATA.skills || {}).map(Number), expansionSkillIds:[] });
    const SKILL_IDS = Array.isArray(GAME_DATA.skillIds) ? GAME_DATA.skillIds.slice() : Object.keys(GAME_DATA.skills || {}).map(Number).sort(function(a,b){ return a-b; });
    const WAR_BANNER_HASTE_MULT = Math.max(1, Number(GAME_DATA.skills && GAME_DATA.skills[6] && GAME_DATA.skills[6].hasteMult) || 1.22);
    const DEFAULT_SKILL_LOADOUT = Object.freeze((Array.isArray(SKILL_SYSTEM.legacySkillIds) ? SKILL_SYSTEM.legacySkillIds : SKILL_IDS).slice(0, Math.max(1, Number(SKILL_SYSTEM.activeSlots) || SKILL_IDS.length)));
    const TOWER_ACTIVE_SLOTS = Math.max(1, Math.min(TOWER_IDS.length, Number(TOWER_SYSTEM.activeSlots) || TOWER_IDS.length));
    const DEFAULT_TOWER_LOADOUT = Object.freeze(TOWER_IDS.slice(0, TOWER_ACTIVE_SLOTS));
    let selectedTowerLoadoutSlot = 0;
    let SKILLS = GAME_DATA.createSkillState();

    function towerUnlockBit(towerId) {
        const tower = TOWER_TYPES[towerId];
        return tower && Number.isInteger(tower.unlockBit) ? tower.unlockBit : TOWER_IDS.indexOf(towerId);
    }
    function isTowerUnlocked(towerId) {
        const bit = towerUnlockBit(towerId);
        if (bit < 0 || bit >= 30) return false;
        return !!(Number(expansionProgress && expansionProgress.towerUnlockMask || 0) & Math.pow(2, bit));
    }

    function expansionSkillUnlockBit(skillId) {
        const def = GAME_DATA.skills && GAME_DATA.skills[skillId];
        if (def && Number.isInteger(def.expansionUnlockBit)) return def.expansionUnlockBit;
        const ids = Array.isArray(SKILL_SYSTEM.expansionSkillIds) ? SKILL_SYSTEM.expansionSkillIds : [];
        return ids.indexOf(Number(skillId));
    }
    function isSkillUnlocked(skillId) {
        const id = Number(skillId), def = GAME_DATA.skills && GAME_DATA.skills[id];
        if (!def) return false;
        if (def.unlockCastleKey) return !!metaStats[def.unlockCastleKey];
        const expansionBit = expansionSkillUnlockBit(id);
        if (expansionBit >= 0) return !!(Number(expansionProgress && expansionProgress.newSpellUnlockMask || 0) & Math.pow(2, expansionBit));
        return true;
    }

    function activateLevelData(levelId) {
        activeLevelConfig = GAME_DATA.getLevel(levelId);
        activeWorldConfig = GAME_DATA.getWorld(activeLevelConfig.worldId);
        activeMapConfig = GAME_DATA.getMap(activeLevelConfig.mapId);
        ROAD_PATHS = rawMapPaths(activeMapConfig);
        PATHS = ROAD_PATHS.map(createMovementPath);
        ROAD_PATH = ROAD_PATHS[0];
        PATH = PATHS[0];
        ROAD_BUFFER = activeMapConfig.roadBuffer;
        BUILD_TERRAIN = activeMapConfig.buildTerrain || null;
        BUILD_SLOTS = Array.isArray(activeMapConfig.buildSlots) ? activeMapConfig.buildSlots : [];
        BUILD_ZONES = BUILD_SLOTS;
        return activeLevelConfig;
    }

    window.TD_RELEASE = Object.freeze({ version: 'REFORGED-R92.0', name: 'Tower Defense: Reforged', saveSchema: 9, packageProfile: 'reforged-canvas-production', releasedAt: '2026-10-18T17:06:04Z' });
    window.TD_RUNTIME_DATA = Object.freeze({
        version: GAME_DATA.meta.dataVersion,
        expansionTargetLevels: GAME_DATA.roadmap.totalLevels,
        expansionTargetWorlds: GAME_DATA.roadmap.worldCount,
        expansionContentReady: true, // all eighteen worlds, levels 1-90, now released; final full-play QA remains pending
        balanceVersion: GAME_DATA.meta.balanceVersion,
        contentVersion: GAME_DATA.meta.contentVersion || 'r21',
        validation: DATA_VALIDATION,
        getActiveLevel: function () { return activeLevelConfig; },
        getActiveWorld: function () { return activeWorldConfig; },
        getActiveMap: function () { return activeMapConfig; }
    });
    // ================= /V15 =================

    // ================= V8 — Game Ad Manager =================
    const ADS_START_GOLD_REWARD = 150;
    const ADS_REVIVE_LIVES = 5;
    const ADS_INTERSTITIAL_EVERY_VICTORIES = 2;
    const ADS_INTERSTITIAL_COOLDOWN_MS = 60000;
    let adBusy = false;
    let adPreviousMusic = null;
    let startGoldAdUsed = false;
    let reviveAdUsed = false;
    let sessionVictories = 0;
    let lastInterstitialAt = 0;
    let adToastTimer = null;

    function showAdStatus(message, type, timeoutMs) {
        const el = document.getElementById('ad-status-toast');
        if (!el) return;
        if (adToastTimer) clearTimeout(adToastTimer);
        el.textContent = String(message || '');
        el.className = 'show' + (type ? ' ' + type : '');
        adToastTimer = setTimeout(() => { el.className = ''; }, timeoutMs || 2800);
    }

    function adsSupportedHere() {
        if (!(window.GamePlatform && GamePlatform.ads)) return false;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
        const transport = GamePlatform.getTransport();
        if (transport === 'local') return false;
        if (transport === 'vk-bridge') return !!(window.vkBridge && typeof window.vkBridge.send === 'function');
        return true;
    }

    function updateRewardAdUI() {
        const startBtn = document.getElementById('reward-start-gold');
        const reviveBtn = document.getElementById('result-revive-btn');
        const supported = adsSupportedHere();
        if (startBtn) {
            const canUse = supported && !startGoldAdUsed && state && state.wave === 0 && state.prepActive;
            startBtn.style.display = (supported && state && state.wave === 0 && state.prepActive) ? '' : 'none';
            startBtn.disabled = adBusy || !canUse;
            startBtn.textContent = startGoldAdUsed ? '✓ БОНУС ПОЛУЧЕН' : '🎬 +150 ЗОЛОТА ЗА РЕКЛАМУ';
        }
        if (reviveBtn) {
            const canRevive = supported && !reviveAdUsed && state && state.screen === 'result' && state.lives <= 0;
            reviveBtn.style.display = canRevive ? '' : 'none';
            reviveBtn.disabled = adBusy || !canRevive;
        }
    }

    async function preloadRewardedForRun() {
        updateRewardAdUI();
        if (!adsSupportedHere()) return false;
        try {
            const info = await GamePlatform.ads.preloadRewarded();
            if (info && info.available) {
                const readyIn = Math.ceil(Math.max(0, Number(info.readyInMs || 0)) / 1000);
                if (readyIn > 0 && GamePlatform.getTransport() === 'ok-fapi') showAdStatus('Видео-бонус готовится · ' + readyIn + 'с', '', 1800);
                return true;
            }
        } catch (error) { console.warn('[Ads] preload failed:', error); }
        return false;
    }

    function enterAdBreak() {
        if (adBusy) return false;
        adBusy = true;
        updateRewardAdUI();
        try { adPreviousMusic = currentMusicName; } catch (_) { adPreviousMusic = null; }
        if (typeof state !== 'undefined' && state.screen === 'play') suspendGameForSystem('advertisement');
        else pauseMusic();
        return true;
    }

    function exitAdBreak() {
        adBusy = false;
        if (typeof state !== 'undefined' && state.screen === 'system-pause' && systemPauseReason === 'advertisement') resumeGameFromSystem('advertisement-complete');
        else if (typeof state !== 'undefined' && state.screen !== 'pause' && state.screen !== 'settings') resumeMusic();
        updateRewardAdUI();
    }

    async function runRewardedAd(reason) {
        if (!adsSupportedHere()) { showAdStatus('Реклама сейчас недоступна.', 'error'); return false; }
        if (!enterAdBreak()) return false;
        showAdStatus('Подготавливаем рекламу…');
        try {
            const result = await GamePlatform.ads.showRewarded();
            if (result && result.completed) return true;
            showAdStatus(result && result.reason === 'skip' ? 'Просмотр пропущен — награда не выдана.' : 'Реклама недоступна. Попробуйте позже.', 'error', 3200);
            return false;
        } catch (error) {
            console.warn('[Ads] Rewarded failed:', reason, error);
            showAdStatus('Не удалось показать рекламу.', 'error');
            return false;
        } finally { exitAdBreak(); }
    }

    async function claimStartGoldAd() {
        if (startGoldAdUsed || state.screen !== 'play' || state.wave !== 0 || !state.prepActive) return;
        const completed = await runRewardedAd('start-gold');
        if (!completed) return;
        startGoldAdUsed = true;
        state.adRewardCount++;
        state.gold += ADS_START_GOLD_REWARD;
        updateHUD();
        addFloatText(500, 120, '+' + ADS_START_GOLD_REWARD + ' золота', '#fbbf24', 24);
        playSfx('upgrade');
        showAdStatus('Награда получена: +' + ADS_START_GOLD_REWARD + ' золота!', 'success');
        updateRewardAdUI();
    }

    async function claimReviveAd() {
        if (reviveAdUsed || state.screen !== 'result' || state.lives > 0) return;
        const completed = await runRewardedAd('revive');
        if (!completed) return;
        reviveAdUsed = true;
        state.adRewardCount++;
        state.lives = ADS_REVIVE_LIVES;
        state.screen = 'play'; resetGameClock(); startGameLoop();
        document.getElementById('screen-result').classList.add('hidden');
        setPauseButtonVisible(true);
        updateHUD();
        playMusic('Before_the_Gates_Fall');
        showAdStatus('Оборона восстановлена: ' + ADS_REVIVE_LIVES + ' ❤️', 'success');
        updateRewardAdUI();
    }

    async function maybeShowInterstitialAfterVictory() {
        sessionVictories++;
        if (!adsSupportedHere()) return false;
        if (sessionVictories % ADS_INTERSTITIAL_EVERY_VICTORIES !== 0) return false;
        if (Date.now() - lastInterstitialAt < ADS_INTERSTITIAL_COOLDOWN_MS) return false;
        if (state.screen !== 'result' || state.lives <= 0 || adBusy) return false;
        if (!enterAdBreak()) return false;
        try {
            const result = await GamePlatform.ads.showInterstitial();
            if (result && result.shown) { lastInterstitialAt = Date.now(); state.adInterstitialCount++; return true; }
            return false;
        } catch (error) {
            console.warn('[Ads] Interstitial failed:', error);
            return false;
        } finally { exitAdBreak(); }
    }

    let state = {
        screen: 'boot', level: 1, maxUnlockedLevel: 1,
        stars: 0,
        gold: 0, lives: 0, wave: 0, maxWaves: 0,
        enemies: [], pendingEnemySpawns: [], towers: [], projectiles: [], hazards: [], lightningArcs: [],
        selectedTowerBtn: null, activeTowerUI: null, frame: 0, timeStop: 0, waveActive: false,
        spawner: { count: 0, timer: 0, interval: 0, type: 0, hp: 0, spawnIndex: 0, isBossWave: false, bossId: null, waveConfig: null }, shake: 0, mouseX: 0, mouseY: 0,
        pointerInside: false, pointerType: 'mouse', pointerDown: false, pointerId: null,
        pointerStartClientX: 0, pointerStartClientY: 0, pointerMoved: false,
        meteorBurnTimer: 0, meteorBurnDmg: 0, meteorBurnTick: 0,
        warBannerTimer: 0, bastionTimer: 0, bastionShield: 0, castleShieldSource: 0,
        bossKilledThisBattle:false, bossEscapedThisBattle:false,
        loopDeltaMs: 0, loopDeltaFrames: 0,
        prepActive: false, prepRemaining: 0,
        lifecyclePauseCount: 0, adRewardCount: 0, adInterstitialCount: 0
    };

    // ================= UPDATE60 R3 — Save Schema V9 + Forward-Compatible Expansion Progress =================
    const SAVE_SCHEMA_VERSION = 9;
    const SAVE_CLOUD_KEY = 'td_save_v9';
    const SAVE_LOCAL_KEY = 'td_save_v9_cache';
    const SAVE_LOCAL_BACKUP_KEY = 'td_save_v9_backup';
    const SAVE_PREVIOUS_CLOUD_KEYS = Object.freeze(['td_save_v8', 'td_save_v7']);
    const SAVE_PREVIOUS_LOCAL_KEYS = Object.freeze(['td_save_v8_cache', 'td_save_v8_backup', 'td_save_v7_cache']);
    const SAVE_MAX_BYTES = 3800;
    const EXPANSION_PROGRESS_VERSION = 6; // R68: existing V9 progress format unchanged
    const LEGACY_BASE_TOWER_COUNT = Math.max(1, Number(TOWER_SYSTEM.legacyBaseCount) || TOWER_IDS.length);
    const LEGACY_BASE_TOWER_UNLOCK_MASK = Math.pow(2, LEGACY_BASE_TOWER_COUNT) - 1;
    const STORY_PROGRESS_MAX_IDS = 160;
    const DEFAULT_CASTLE_STATS = Object.freeze({ hp: 0, skill1: 0, skill2: 0, skill3: 0, unlock4: 0, unlock5: 0, towerCap: 0 });
    const META_STAT_KEYS = Object.freeze(['battlesStarted','victories','defeats','enemiesKilled','bossesKilled','towersBuilt','towerUpgradesBought','towersSold','abilitiesUsed','perfectWins']);
    function bitMaskLimit(bitCount) {
        const count = Math.max(0, Math.min(30, Number(bitCount) || 0));
        return count === 0 ? 0 : (Math.pow(2, count) - 1);
    }
    const ENEMY_MASK_LIMIT = bitMaskLimit(GAME_COUNTS.enemyCount);
    const BOSS_MASK_LIMIT = bitMaskLimit(GAME_COUNTS.bossCount);
    const ACHIEVEMENT_MASK_LIMIT = bitMaskLimit(GAME_COUNTS.achievementCount);
    function createDefaultMetaProgress() {
        return { stats: Object.fromEntries(META_STAT_KEYS.map(k => [k,0])), enemyKills:Array(GAME_COUNTS.enemyCount).fill(0), bossKills:Array(GAME_COUNTS.bossCount).fill(0), enemySeenMask:0, bossSeenMask:0, achievementMask:0 };
    }
    function normalizeProgressIdList(value) {
        if (!Array.isArray(value)) return [];
        const unique = new Set();
        for (const raw of value) {
            const id = Number(raw);
            if (!Number.isInteger(id) || id < 1 || id > 65535) continue;
            unique.add(id);
            if (unique.size >= STORY_PROGRESS_MAX_IDS) break;
        }
        return Array.from(unique).sort(function (a,b) { return a - b; });
    }
    function normalizeSkillLoadout(value) {
        const capacity = Math.max(1, Number(SKILL_SYSTEM.capacity) || 1);
        const slotCount = Math.max(1, Math.min(capacity, Number(SKILL_SYSTEM.activeSlots) || capacity));
        const src = Array.isArray(value) ? value : DEFAULT_SKILL_LOADOUT;
        const result = [];
        src.forEach(function (raw) {
            const id = Number(raw);
            if (!Number.isInteger(id) || id < 1 || id > capacity || !GAME_DATA.skills[id] || result.includes(id) || result.length >= slotCount) return;
            result.push(id);
        });
        DEFAULT_SKILL_LOADOUT.forEach(function (id) {
            if (result.length >= slotCount) return;
            if (Number.isInteger(id) && id >= 1 && id <= capacity && !result.includes(id)) result.push(id);
        });
        for (const id of SKILL_IDS) { if (result.length >= slotCount) break; if (!result.includes(id)) result.push(id); }
        return result.slice(0, slotCount);
    }
    function normalizeTowerLoadout(value) {
        const src = Array.isArray(value) ? value : DEFAULT_TOWER_LOADOUT;
        const result = [];
        for (const raw of src) {
            const id = String(raw);
            if (!TOWER_TYPES[id] || result.includes(id) || result.length >= TOWER_ACTIVE_SLOTS) continue;
            result.push(id);
        }
        for (const id of TOWER_IDS) {
            if (result.length >= TOWER_ACTIVE_SLOTS) break;
            if (!result.includes(id)) result.push(id);
        }
        return result.slice(0, TOWER_ACTIVE_SLOTS);
    }
    function equippedTowerIds() {
        return normalizeTowerLoadout(expansionProgress && expansionProgress.towerLoadout);
    }
    function isTowerEquipped(towerId) {
        return equippedTowerIds().includes(String(towerId));
    }
    function setTowerLoadout(value, reason) {
        if (!Array.isArray(value) || value.length !== TOWER_ACTIVE_SLOTS) return false;
        const ids = value.map(String);
        if (new Set(ids).size !== TOWER_ACTIVE_SLOTS || ids.some(id => !TOWER_TYPES[id])) return false;
        const before = equippedTowerIds();
        // A locked tower may remain in a veteran's historical slot, but a NEW locked one cannot be equipped.
        if (ids.some(id => !isTowerUnlocked(id) && !before.includes(id))) return false;
        if (ids.every((id,index) => id === before[index])) return false;
        expansionProgress.towerLoadout = ids;
        if (state.selectedTowerBtn && !ids.includes(state.selectedTowerBtn)) clearTowerSelection();
        renderTowerButtons(); renderTowerLoadout();
        if (reason && window.GameSave && saveStatus.ready) GameSave.save(reason);
        return true;
    }
    function assignTowerToLoadout(slotIndex, towerId) {
        const slot = Number(slotIndex), id = String(towerId);
        if (!Number.isInteger(slot) || slot < 0 || slot >= TOWER_ACTIVE_SLOTS || !TOWER_TYPES[id]) return false;
        const next = equippedTowerIds();
        const current = next.indexOf(id);
        if (current === slot) return false;
        if (current < 0 && !isTowerUnlocked(id)) return false;
        if (current >= 0) next[current] = next[slot];
        next[slot] = id;
        if (!setTowerLoadout(next, 'tower-loadout')) return false;
        selectedTowerLoadoutSlot = slot;
        renderArsenal();
        return true;
    }
    function createDefaultExpansionProgress() {
        return {
            version: EXPANSION_PROGRESS_VERSION,
            towerUnlockMask: LEGACY_BASE_TOWER_UNLOCK_MASK,
            newSpellUnlockMask: 0,
            skillLoadout: normalizeSkillLoadout(DEFAULT_SKILL_LOADOUT),
            towerLoadout: normalizeTowerLoadout(DEFAULT_TOWER_LOADOUT),
            storyChapter: 0,
            storySeenIds: [],
            storyRecordIds: [],
            contentFlags: 0
        };
    }
    function normalizeExpansionProgress(value) {
        const src = value && typeof value === 'object' ? value : {};
        return {
            version: EXPANSION_PROGRESS_VERSION,
            towerUnlockMask: clampInt(src.towerUnlockMask, LEGACY_BASE_TOWER_UNLOCK_MASK, bitMaskLimit(TOWER_SYSTEM.capacity || TOWER_IDS.length), LEGACY_BASE_TOWER_UNLOCK_MASK),
            newSpellUnlockMask: clampInt(src.newSpellUnlockMask, 0, bitMaskLimit(Math.max(0, Number(SKILL_SYSTEM.capacity || 0) - (SKILL_SYSTEM.legacySkillIds || []).length)), 0),
            skillLoadout: normalizeSkillLoadout(src.skillLoadout),
            towerLoadout: normalizeTowerLoadout(src.towerLoadout),
            storyChapter: clampInt(src.storyChapter, 0, 255, 0),
            storySeenIds: normalizeProgressIdList(src.storySeenIds),
            storyRecordIds: normalizeProgressIdList(src.storyRecordIds),
            contentFlags: clampInt(src.contentFlags, 0, bitMaskLimit(30), 0)
        };
    }
    let metaStats = { ...DEFAULT_CASTLE_STATS };
    let metaProgress = createDefaultMetaProgress();
    let expansionProgress = createDefaultExpansionProgress();
    let levelBestStars = Array(GAME_DATA.meta.totalLevels).fill(0);
    let tutorialCompleted = false;
    let saveInitPromise = null;
    let saveCloudTimer = null;
    let saveCloudDirty = false;
    let saveFlushPromise = null;
    let saveApplying = false;
    let saveSnapshot = null;
    const saveStatus = {
        ready: false, source: 'none', cloud: false, syncing: false,
        lastReason: 'boot', lastSyncAt: 0, lastError: '', migration: false, recoveredFromBackup: false
    };

    function clampInt(value, min, max, fallback) {
        const n = Number.parseInt(value, 10);
        return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    }

    function normalizeCastle(value) {
        const src = value && typeof value === 'object' ? value : {};
        return {
            hp: clampInt(src.hp, 0, 5, 0), skill1: clampInt(src.skill1, 0, 3, 0),
            skill2: clampInt(src.skill2, 0, 3, 0), skill3: clampInt(src.skill3, 0, 3, 0),
            unlock4: clampInt(src.unlock4, 0, 1, 0), unlock5: clampInt(src.unlock5, 0, 1, 0),
            towerCap: clampInt(src.towerCap, 0, 3, 0)
        };
    }

    function normalizeBestStars(value) {
        const src = Array.isArray(value) ? value : [];
        const out = Array(GAME_DATA.meta.totalLevels).fill(0);
        for (let i = 0; i < GAME_DATA.meta.totalLevels; i++) out[i] = clampInt(src[i], 0, 3, 0);
        return out;
    }

    function inferUnlockedFrontierFromBestStars(bestStars) {
        const src = Array.isArray(bestStars) ? bestStars : [];
        let contiguousCompleted = 0;
        while (contiguousCompleted < TOTAL_LEVELS && Number(src[contiguousCompleted] || 0) > 0) contiguousCompleted++;
        return Math.min(TOTAL_LEVELS, Math.max(1, contiguousCompleted + 1));
    }

    function normalizeSavedAudio(value) {
        const src = value && typeof value === 'object' ? value : {};
        return {
            musicVolume: clamp01(Number.isFinite(Number(src.musicVolume)) ? Number(src.musicVolume) : audioSettings.musicVolume),
            sfxVolume: clamp01(Number.isFinite(Number(src.sfxVolume)) ? Number(src.sfxVolume) : audioSettings.sfxVolume),
            musicEnabled: src.musicEnabled !== false,
            sfxEnabled: src.sfxEnabled !== false,
            masterMuted: !!src.masterMuted
        };
    }

    function normalizeMetaProgress(value) {
        const src = value && typeof value === 'object' ? value : {};
        const statsSrc = src.stats && typeof src.stats === 'object' ? src.stats : {};
        const stats = {};
        META_STAT_KEYS.forEach(function (key) { stats[key] = Math.max(0, clampInt(statsSrc[key], 0, 2147483647, 0)); });
        const enemySrc = Array.isArray(src.enemyKills) ? src.enemyKills : [];
        const bossSrc = Array.isArray(src.bossKills) ? src.bossKills : [];
        return {
            stats: stats,
            enemyKills: Array.from({length:GAME_COUNTS.enemyCount}, (_,i) => Math.max(0, clampInt(enemySrc[i],0,2147483647,0))),
            bossKills: Array.from({length:GAME_COUNTS.bossCount}, (_,i) => Math.max(0, clampInt(bossSrc[i],0,2147483647,0))),
            enemySeenMask: clampInt(src.enemySeenMask, 0, ENEMY_MASK_LIMIT, 0),
            bossSeenMask: clampInt(src.bossSeenMask, 0, BOSS_MASK_LIMIT, 0),
            achievementMask: clampInt(src.achievementMask, 0, ACHIEVEMENT_MASK_LIMIT, 0)
        };
    }

    function inferDiscoveryMasks(maxUnlockedLevel, bestStars) {
        let enemyMask = 0, bossMask = 0;
        const highest = Math.max(0, Math.min(GAME_DATA.meta.totalLevels, Number(maxUnlockedLevel || 1)));
        for (let levelId = 1; levelId <= highest; levelId++) {
            const completed = (bestStars[levelId-1] || 0) > 0 || levelId < highest;
            const level = GAME_DATA.getLevel(levelId);
            if (!level) continue;
            (level.waves || []).forEach(function (wave) {
                if (wave.kind === 'normal') (wave.composition || []).forEach(function (group) { enemyMask |= (1 << Number(group.type || 0)); });
                if (completed && wave.kind === 'boss' && wave.bossId) { const bossIndex=GAME_DATA.getBossIndex(wave.bossId); if (bossIndex >= 0) bossMask |= (1 << bossIndex); }
            });
        }
        return { enemyMask: enemyMask & ENEMY_MASK_LIMIT, bossMask: bossMask & BOSS_MASK_LIMIT };
    }

    function normalizeSave(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const incomingSchema = clampInt(raw.schema, 0, SAVE_SCHEMA_VERSION, 0);
        const migrationOrigin = clampInt(raw.migratedFromSchema, 0, SAVE_SCHEMA_VERSION, incomingSchema || SAVE_SCHEMA_VERSION);
        const normalizedBestStars = normalizeBestStars(raw.levelBestStars);
        const savedFrontier = clampInt(raw.maxUnlockedLevel, 1, GAME_DATA.meta.totalLevels, 1);
        // UPDATE60 R4: a veteran who already completed level 30 must enter the expanded campaign at 31,
        // while partial/non-contiguous progress never receives an artificial skip.
        const inferredFrontier = inferUnlockedFrontierFromBestStars(normalizedBestStars);
        return {
            schema: SAVE_SCHEMA_VERSION,
            revision: Math.max(0, clampInt(raw.revision, 0, 2147483647, 0)),
            updatedAt: Math.max(0, Number(raw.updatedAt) || 0),
            maxUnlockedLevel: Math.max(savedFrontier, inferredFrontier, Number(normalizedBestStars[59] || 0) > 0 && GAME_DATA.isLevelReleased(61) ? 61 : 1),
            starsBalance: Math.max(0, clampInt(raw.starsBalance, 0, 999999, 0)),
            levelBestStars: normalizedBestStars,
            castleUpgrades: normalizeCastle(raw.castleUpgrades),
            metaProgress: normalizeMetaProgress(raw.metaProgress),
            expansionProgress: normalizeExpansionProgress(raw.expansionProgress),
            tutorialCompleted: !!raw.tutorialCompleted,
            audio: normalizeSavedAudio(raw.audio),
            migratedFromLegacy: !!raw.migratedFromLegacy,
            migratedFromSchema: migrationOrigin
        };
    }

    function parseSaveText(text) {
        if (!text || typeof text !== 'string') return null;
        try { return normalizeSave(JSON.parse(text)); } catch (error) { return null; }
    }

    function safeLocalGet(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }

    function loadLegacySave() {
        const legacyCastleRaw = safeLocalGet('td_castle_upgrades');
        const legacyAudioRaw = safeLocalGet(AUDIO_SETTINGS_KEY);
        const legacyMaxRaw = safeLocalGet('td_max_level');
        const legacyStarsRaw = safeLocalGet('td_stars');
        const legacyTutorialRaw = safeLocalGet('td_tutorial_done');
        const hasLegacyProgress = [legacyCastleRaw, legacyMaxRaw, legacyStarsRaw, legacyTutorialRaw].some(function (value) { return value !== null; });
        let castle = { ...DEFAULT_CASTLE_STATS };
        let oldAudio = audioSettings;
        try { castle = normalizeCastle(JSON.parse(legacyCastleRaw || 'null')); } catch (_) {}
        try { oldAudio = normalizeSavedAudio(JSON.parse(legacyAudioRaw || 'null')); } catch (_) {}
        const maxUnlockedLevel = clampInt(legacyMaxRaw, 1, GAME_DATA.meta.totalLevels, 1);
        const best = Array(GAME_DATA.meta.totalLevels).fill(0);
        // В старой схеме точные звёзды по уровням не хранились. Для уже открытых уровней
        // фиксируем только гарантированный минимум 1⭐, не выдумывая прошлые 2/3⭐.
        for (let level = 1; level < maxUnlockedLevel; level++) best[level - 1] = 1;
        return normalizeSave({
            revision: 1,
            updatedAt: Date.now(),
            maxUnlockedLevel: maxUnlockedLevel,
            starsBalance: Math.max(0, clampInt(legacyStarsRaw, 0, 999999, 0)),
            levelBestStars: best,
            castleUpgrades: castle,
            metaProgress: createDefaultMetaProgress(),
            expansionProgress: createDefaultExpansionProgress(),
            tutorialCompleted: legacyTutorialRaw === '1',
            audio: oldAudio,
            migratedFromLegacy: hasLegacyProgress,
            migratedFromSchema: hasLegacyProgress ? 0 : SAVE_SCHEMA_VERSION
        });
    }

    function saveProgressRank(snapshot) {
        if (!snapshot) return -1;
        const bestSum = snapshot.levelBestStars.reduce(function (sum, value) { return sum + value; }, 0);
        const castleSum = Object.values(snapshot.castleUpgrades).reduce(function (sum, value) { return sum + Number(value || 0); }, 0);
        const meta = normalizeMetaProgress(snapshot.metaProgress);
        const expansion = normalizeExpansionProgress(snapshot.expansionProgress);
        const achievements = countBits(meta.achievementMask);
        const expansionScore = countBits(expansion.towerUnlockMask) * 30 + countBits(expansion.newSpellUnlockMask) * 20; // R24: story viewing never decides which gameplay save is stronger.
        return snapshot.maxUnlockedLevel * 100000 + bestSum * 1000 + castleSum * 50 + expansionScore + achievements * 3 + (snapshot.tutorialCompleted ? 1 : 0);
    }

    function chooseBestSnapshot(localSave, cloudSave) {
        if (!localSave) return cloudSave;
        if (!cloudSave) return localSave;
        const localRank = saveProgressRank(localSave), cloudRank = saveProgressRank(cloudSave);
        if (localRank !== cloudRank) return localRank > cloudRank ? localSave : cloudSave;
        if (localSave.updatedAt !== cloudSave.updatedAt) return localSave.updatedAt > cloudSave.updatedAt ? localSave : cloudSave;
        return localSave.revision >= cloudSave.revision ? localSave : cloudSave;
    }

    function currentSaveObject(incrementRevision) {
        const previousRevision = saveSnapshot ? saveSnapshot.revision : 0;
        return normalizeSave({
            revision: previousRevision + (incrementRevision ? 1 : 0),
            updatedAt: Date.now(),
            maxUnlockedLevel: state.maxUnlockedLevel,
            starsBalance: state.stars,
            levelBestStars: levelBestStars,
            castleUpgrades: metaStats,
            metaProgress: metaProgress,
            expansionProgress: expansionProgress,
            tutorialCompleted: tutorialCompleted,
            audio: audioSettings,
            migratedFromLegacy: saveSnapshot ? saveSnapshot.migratedFromLegacy : false,
            migratedFromSchema: saveSnapshot ? saveSnapshot.migratedFromSchema : SAVE_SCHEMA_VERSION
        });
    }

    function saveJsonBytes(snapshot) {
        const text = JSON.stringify(snapshot);
        try { return new Blob([text]).size; } catch (_) { return text.length; }
    }

    function updateSaveStatusUI() {
        const el = document.getElementById('save-status');
        if (!el) return;
        el.className = '';
        if (saveStatus.syncing) { el.classList.add('syncing'); el.textContent = '☁ Синхронизация прогресса…'; return; }
        if (saveStatus.recoveredFromBackup) { el.classList.add('local'); el.textContent = '💾 Прогресс восстановлен из резервной копии'; return; }
        if (saveStatus.lastError && !saveStatus.cloud) { el.classList.add('local'); el.textContent = '💾 Локальное сохранение · облако временно недоступно'; return; }
        if (saveStatus.cloud) { el.classList.add('cloud'); el.textContent = '☁ Прогресс синхронизирован'; return; }
        el.classList.add('local'); el.textContent = '💾 Прогресс сохранён на этом устройстве';
    }

    function writeLegacyMirror(snapshot) {
        try {
            localStorage.setItem('td_max_level', String(snapshot.maxUnlockedLevel));
            localStorage.setItem('td_stars', String(snapshot.starsBalance));
            localStorage.setItem('td_castle_upgrades', JSON.stringify(snapshot.castleUpgrades));
            localStorage.setItem('td_tutorial_done', snapshot.tutorialCompleted ? '1' : '0');
            localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(snapshot.audio));
        } catch (_) {}
    }

    function writeLocalSave(snapshot) {
        try {
            const nextText = JSON.stringify(snapshot);
            const previousText = localStorage.getItem(SAVE_LOCAL_KEY) || '';
            // Crash/corruption guard: keep one last known-good local revision before replacing the primary cache.
            if (previousText && parseSaveText(previousText)) localStorage.setItem(SAVE_LOCAL_BACKUP_KEY, previousText);
            else if (!localStorage.getItem(SAVE_LOCAL_BACKUP_KEY)) localStorage.setItem(SAVE_LOCAL_BACKUP_KEY, nextText);
            localStorage.setItem(SAVE_LOCAL_KEY, nextText);
            writeLegacyMirror(snapshot);
            return true;
        } catch (error) {
            saveStatus.lastError = 'local: ' + String(error && error.message || error);
            return false;
        }
    }

    function readLocalSave() {
        try {
            let parsed = parseSaveText(localStorage.getItem(SAVE_LOCAL_KEY) || '');
            if (parsed) return parsed;
            parsed = parseSaveText(localStorage.getItem(SAVE_LOCAL_BACKUP_KEY) || '');
            if (parsed) { saveStatus.recoveredFromBackup = true; return parsed; }
            for (const key of SAVE_PREVIOUS_LOCAL_KEYS) { parsed = parseSaveText(localStorage.getItem(key) || ''); if (parsed) { saveStatus.migration = true; return parsed; } }
            return null;
        } catch (_) { return null; }
    }

    function applySaveToRuntime(snapshot) {
        snapshot = normalizeSave(snapshot);
        if (!snapshot) return;
        saveApplying = true;
        saveSnapshot = snapshot;
        state.maxUnlockedLevel = snapshot.maxUnlockedLevel;
        state.stars = snapshot.starsBalance;
        syncCurrencyDisplays();
        levelBestStars = snapshot.levelBestStars.slice();
        metaStats = { ...snapshot.castleUpgrades };
        metaProgress = normalizeMetaProgress(snapshot.metaProgress);
        expansionProgress = normalizeExpansionProgress(snapshot.expansionProgress);
        const inferredDiscovery = inferDiscoveryMasks(snapshot.maxUnlockedLevel, snapshot.levelBestStars);
        metaProgress.enemySeenMask |= inferredDiscovery.enemyMask;
        metaProgress.bossSeenMask |= inferredDiscovery.bossMask;
        tutorialCompleted = snapshot.tutorialCompleted;
        audioSettings = { ...snapshot.audio };
        try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(audioSettings)); } catch (_) {}
        updateAudioPlayersVolume();
        syncAudioSettingsUI();
        updateLevelSelector();
        renderSkillsUI();
        if (document.getElementById('screen-meta') && !document.getElementById('screen-meta').classList.contains('hidden')) renderMetaHub();
        updateMetaQuickSummary();
        saveApplying = false;
    }

    async function readCloudSave() {
        if (!window.GamePlatform || GamePlatform.getTransport() === 'local') return null;
        await GamePlatform.ready();
        let parsed = parseSaveText(await GamePlatform.storage.get(SAVE_CLOUD_KEY));
        if (parsed) return parsed;
        for (const key of SAVE_PREVIOUS_CLOUD_KEYS) {
            parsed = parseSaveText(await GamePlatform.storage.get(key));
            if (parsed) { saveStatus.migration = true; return parsed; }
        }
        return null;
    }

    async function writeCloudSave(snapshot) {
        if (!window.GamePlatform || GamePlatform.getTransport() === 'local') return false;
        const bytes = saveJsonBytes(snapshot);
        if (bytes > SAVE_MAX_BYTES) throw new Error('Save payload is too large: ' + bytes + ' bytes');
        await GamePlatform.ready();
        await GamePlatform.storage.set(SAVE_CLOUD_KEY, JSON.stringify(snapshot));
        saveStatus.cloud = true;
        saveStatus.lastSyncAt = Date.now();
        saveStatus.lastError = '';
        return true;
    }

    async function flushCloudSave() {
        if (!saveStatus.ready || !saveSnapshot) return false;
        if (!window.GamePlatform || GamePlatform.getTransport() === 'local') { updateSaveStatusUI(); return false; }
        saveCloudDirty = true;
        if (saveFlushPromise) return saveFlushPromise;
        saveFlushPromise = (async function () {
            saveStatus.syncing = true; updateSaveStatusUI();
            let ok = false;
            try {
                do {
                    saveCloudDirty = false;
                    const snapshotToWrite = saveSnapshot;
                    ok = await writeCloudSave(snapshotToWrite);
                } while (ok && saveCloudDirty && saveSnapshot);
                saveStatus.source = ok ? 'cloud' : saveStatus.source;
                return !!ok && !saveCloudDirty;
            } catch (error) {
                // Keep the latest revision dirty. The next save or the online event retries it.
                saveCloudDirty = true;
                saveStatus.cloud = false;
                saveStatus.lastError = 'cloud: ' + String(error && error.message || error);
                console.warn('[GameSave] Cloud save failed, local cache preserved:', error);
                return false;
            } finally {
                saveStatus.syncing = false;
                saveFlushPromise = null;
                updateSaveStatusUI();
            }
        })();
        return saveFlushPromise;
    }

    function scheduleCloudSave(delay) {
        if (saveCloudTimer) clearTimeout(saveCloudTimer);
        saveCloudTimer = setTimeout(function () { saveCloudTimer = null; flushCloudSave(); }, Math.max(50, delay || 450));
    }

    function saveProgress(reason) {
        if (saveApplying) return saveSnapshot;
        const snapshot = currentSaveObject(true);
        saveSnapshot = snapshot;
        saveStatus.lastReason = reason || 'progress';
        writeLocalSave(snapshot);
        saveCloudDirty = true;
        if (saveStatus.ready) scheduleCloudSave(450);
        updateSaveStatusUI();
        return snapshot;
    }

    function getLevelBestStars(level) { return levelBestStars[Math.max(0, Math.min(TOTAL_LEVELS - 1, Number(level || 1) - 1))] || 0; }

    function setLevelBestStars(level, starsEarned) {
        const idx = Math.max(0, Math.min(TOTAL_LEVELS - 1, Number(level || 1) - 1));
        const oldBest = levelBestStars[idx] || 0;
        const nextBest = Math.max(oldBest, clampInt(starsEarned, 0, 3, 0));
        levelBestStars[idx] = nextBest;
        return Math.max(0, nextBest - oldBest);
    }

    // R24 UPDATE60.1: gameplay progress and narrative viewing are intentionally separate.
    // Veteran saves keep levels/stars/upgrades, but completed missions are NOT silently marked as watched.
    // Players can read already recorded scenes in Chronicles or reset only narrative progress to replay the story in context.
    function syncStoryProgressWithCompletedCampaign() {
        return false;
    }

    function initGameSave() {
        if (saveInitPromise) return saveInitPromise;
        saveInitPromise = (async function () {
            saveStatus.syncing = true; updateSaveStatusUI();
            let localSave = readLocalSave();
            if (!localSave) { localSave = loadLegacySave(); saveStatus.migration = true; writeLocalSave(localSave); }
            let cloudSave = null;
            try { cloudSave = await readCloudSave(); }
            catch (error) { saveStatus.lastError = 'cloud-load: ' + String(error && error.message || error); }
            const chosen = chooseBestSnapshot(localSave, cloudSave) || loadLegacySave();
            const reconciled = normalizeSave({ ...chosen, revision: Math.max((localSave && localSave.revision) || 0, (cloudSave && cloudSave.revision) || 0) + 1, updatedAt: Date.now() });
            applySaveToRuntime(reconciled);
            const storyBackfilled = syncStoryProgressWithCompletedCampaign();
            if (storyBackfilled) saveStatus.migration = true;
            // V25 migration: preserve a conservative minimum of historical progression
            // that can be proven from existing best-star records.
            metaProgress.stats.victories = Math.max(metaProgress.stats.victories, completedLevelsTotal());
            metaProgress.stats.perfectWins = Math.max(metaProgress.stats.perfectWins, levelBestStars.filter(v => v === 3).length);
            // R91: a won boss level (1-2 stars) does NOT prove the boss was killed.
            // Since R57, holding the castle while the boss escapes is a valid
            // victory, but the result is capped at 2 stars. Preserve explicit
            // bossKills from V9 saves and infer a legacy kill only from 3 stars.
            // Do not reset historical counters or alter the V9 save schema.
            BOSS_LEVELS.forEach(function (bossLevel, index) {
                if ((levelBestStars[bossLevel - 1] || 0) === 3 && (metaProgress.bossKills[index] || 0) < 1) metaProgress.bossKills[index] = 1;
            });
            metaProgress.stats.bossesKilled = Math.max(metaProgress.stats.bossesKilled, metaProgress.bossKills.reduce((sum,v)=>sum+v,0));
            evaluateAchievements(false);
            const finalized = currentSaveObject(false);
            saveSnapshot = finalized;
            writeLocalSave(finalized);
            saveStatus.ready = true;
            saveStatus.source = cloudSave && chosen === cloudSave ? 'cloud' : (localSave ? 'local' : 'legacy');
            saveStatus.syncing = false;
            if (window.GamePlatform && GamePlatform.getTransport() !== 'local') {
                try { await writeCloudSave(finalized); saveCloudDirty = false; }
                catch (error) { saveCloudDirty = true; saveStatus.cloud = false; saveStatus.lastError = 'cloud-sync: ' + String(error && error.message || error); }
            }
            updateSaveStatusUI();
            updateMetaQuickSummary();
            return finalized;
        })();
        return saveInitPromise;
    }

    window.GameSave = Object.freeze({
        version: SAVE_SCHEMA_VERSION,
        init: initGameSave,
        ready: initGameSave,
        save: saveProgress,
        flush: flushCloudSave,
        getStatus: function () { return { ...saveStatus, pendingSync: saveCloudDirty, payloadBytes: saveSnapshot ? saveJsonBytes(saveSnapshot) : 0 }; },
        getSnapshot: function () { return saveSnapshot ? JSON.parse(JSON.stringify(saveSnapshot)) : null; },
        getLevelBestStars: getLevelBestStars,
        setLevelBestStars: setLevelBestStars,
        getMetaProgress: function () { return JSON.parse(JSON.stringify(metaProgress)); },
        getExpansionProgress: function () {
            return {
                ...expansionProgress,
                skillLoadout: expansionProgress.skillLoadout.slice(),
                towerLoadout: expansionProgress.towerLoadout.slice(),
                storySeenIds: expansionProgress.storySeenIds.slice(),
                storyRecordIds: expansionProgress.storyRecordIds.slice()
            };
        }
    });
    // R67: selection APIs are also useful for future unlocks and automated regression tests.
    window.GameTowers = Object.freeze({
        capacity: Number(TOWER_SYSTEM.capacity),
        activeSlots: TOWER_ACTIVE_SLOTS,
        getCatalogIds: function () { return TOWER_IDS.slice(); },
        getLoadout: function () { return equippedTowerIds().slice(); },
        isUnlocked: function (id) { return isTowerUnlocked(String(id)); },
        isEquipped: function (id) { return isTowerEquipped(String(id)); },
        setLoadout: function (ids) { return setTowerLoadout(ids, 'tower-loadout-api'); },
        assignSlot: function (slot, id) { return assignTowerToLoadout(slot,id); }
    });
    // R11 player-facing spell catalog diagnostics and loadout hooks.
    window.GameSkills = Object.freeze({
        capacity: Number(SKILL_SYSTEM.capacity) || SKILL_IDS.length,
        activeSlots: Number(SKILL_SYSTEM.activeSlots) || SKILL_IDS.length,
        getCatalogIds: function () { return SKILL_IDS.slice(); },
        getLoadout: function () { return normalizeSkillLoadout(expansionProgress.skillLoadout).slice(); },
        isUnlocked: function (id) { return isSkillUnlocked(Number(id)); },
        setLoadout: function (ids) { return setSkillLoadout(ids,'skill-loadout-api'); },
        assignSlot: function (slot,id) { return assignSkillToLoadout(slot,id); }
    });

    // ================= /V25 Save =================

    // ================= UPDATE60 R13 — Story Engine + Chronicles UI runtime =================
    const STORY_DATA = window.TD_STORY || Object.freeze({
        meta:Object.freeze({dataVersion:0}), characters:Object.freeze([]), records:Object.freeze([]), events:Object.freeze([]), chapters:Object.freeze([]),
        getCharacter:function(){return null;}, getRecord:function(){return null;}, getChapter:function(){return null;}, getEventsFor:function(){return Object.freeze([]);}, getEventsByChapter:function(){return Object.freeze([]);}, validate:function(){return Object.freeze({ok:true,errors:Object.freeze([]),characters:0,records:0,events:0,chapters:0});}
    });
    let storyPlaybackChain = Promise.resolve();
    let activeChroniclesView = 'overview';
    let storyDialogPreviousFocus = null;
    let recordReaderPreviousFocus = null;

    function storyHasId(list, id) { return Array.isArray(list) && list.includes(Number(id)); }
    function storyEventEligible(event) {
        if (!event) return false;
        if (event.once !== false && storyHasId(expansionProgress.storySeenIds, event.id)) return false;
        const conditions=event.conditions&&typeof event.conditions==='object'?event.conditions:{};
        if (Number(conditions.minChapter||0) > Number(expansionProgress.storyChapter||0)) return false;
        if (conditions.requiredFlags && ((Number(expansionProgress.contentFlags)||0) & Number(conditions.requiredFlags)) !== Number(conditions.requiredFlags)) return false;
        if (Array.isArray(conditions.requiresSeenIds) && !conditions.requiresSeenIds.every(id => storyHasId(expansionProgress.storySeenIds,id))) return false;
        if (Array.isArray(conditions.requiresRecordIds) && !conditions.requiresRecordIds.every(id => storyHasId(expansionProgress.storyRecordIds,id))) return false;
        return true;
    }
    function storyCatalogEvents(trigger, level) {
        const source = STORY_DATA && typeof STORY_DATA.getEventsFor === 'function' ? STORY_DATA.getEventsFor(trigger,level) : [];
        return (Array.isArray(source) ? source : []).filter(storyEventEligible);
    }
    function addStoryProgressId(key, id) {
        const numeric = Number(id);
        if (!Number.isInteger(numeric) || numeric < 1 || numeric > 65535) return false;
        const current = normalizeProgressIdList(expansionProgress[key]);
        if (current.includes(numeric)) return false;
        current.push(numeric);
        expansionProgress[key] = normalizeProgressIdList(current);
        return true;
    }
    function completeStoryEvent(event) {
        if (!event) return false;
        let changed = addStoryProgressId('storySeenIds', event.id);
        if (event.recordId != null) changed = addStoryProgressId('storyRecordIds', event.recordId) || changed;
        const chapter = Math.max(0, Number(event.chapter) || 0);
        if (chapter > expansionProgress.storyChapter) { expansionProgress.storyChapter = Math.min(255, chapter); changed = true; }
        if (event.setContentFlags) {
            const next = expansionProgress.contentFlags | (Number(event.setContentFlags) >>> 0);
            if (next !== expansionProgress.contentFlags) { expansionProgress.contentFlags = next; changed = true; }
        }
        if (changed && window.GameSave && saveStatus.ready) GameSave.save('story-event:' + event.id);
        const metaScreen=document.getElementById('screen-meta');
        if (changed && metaScreen && !metaScreen.classList.contains('hidden')) renderChronicles();
        return changed;
    }
    function focusableElements(root) {
        return Array.from(root ? root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') : []).filter(function(el){ return el.offsetParent !== null; });
    }
    function trapDialogKeydown(event, overlay, onEscape) {
        if (!overlay || overlay.classList.contains('hidden')) return;
        if (event.key === 'Escape') { if (typeof onEscape === 'function') { event.preventDefault(); onEscape(); } return; }
        if (event.key !== 'Tab') return;
        const items=focusableElements(overlay); if (!items.length) return;
        const first=items[0], last=items[items.length-1];
        if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); }
    }
    function ensureStoryOverlay() {
        let overlay=document.getElementById('story-overlay');
        if (overlay) return overlay;
        overlay=document.createElement('div'); overlay.id='story-overlay'; overlay.className='story-overlay hidden'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-hidden','true'); overlay.setAttribute('aria-labelledby','story-title'); overlay.setAttribute('aria-describedby','story-text');
        const card=document.createElement('article'); card.className='story-card';
        const portrait=document.createElement('div'); portrait.id='story-portrait'; portrait.className='story-portrait'; portrait.setAttribute('aria-hidden','true');
        const fallback=document.createElement('span'); fallback.id='story-portrait-fallback'; fallback.textContent='📜';
        const image=document.createElement('img'); image.id='story-portrait-image'; image.alt='';
        portrait.append(fallback,image);
        const copy=document.createElement('div'); copy.className='story-copy';
        const kicker=document.createElement('div'); kicker.id='story-kicker'; kicker.className='story-kicker'; kicker.textContent='ХРОНИКИ ОСАДЫ';
        const title=document.createElement('h2'); title.id='story-title'; title.textContent='Сюжетное событие';
        const speaker=document.createElement('div'); speaker.id='story-speaker'; speaker.className='story-speaker';
        const body=document.createElement('p'); body.id='story-text';
        const hint=document.createElement('div'); hint.id='story-record-hint'; hint.className='story-record-hint hidden';
        const actions=document.createElement('div'); actions.className='story-actions';
        const skip=document.createElement('button'); skip.id='story-skip-btn'; skip.type='button'; skip.className='story-secondary'; skip.textContent='ПРОПУСТИТЬ';
        const next=document.createElement('button'); next.id='story-continue-btn'; next.type='button'; next.className='story-primary'; next.textContent='ПРОДОЛЖИТЬ';
        actions.append(skip,next); copy.append(kicker,title,speaker,body,hint,actions); card.append(portrait,copy); overlay.appendChild(card); document.body.appendChild(overlay);
        return overlay;
    }
    function showStoryEvent(event, options) {
        options = options && typeof options === 'object' ? options : {};
        const archiveMode = !!options.archiveMode;
        return new Promise(function (resolve) {
            const overlay=ensureStoryOverlay();
            const character=event.characterId != null && STORY_DATA.getCharacter ? STORY_DATA.getCharacter(event.characterId) : null;
            const record=event.recordId != null && STORY_DATA.getRecord ? STORY_DATA.getRecord(event.recordId) : null;
            const title=document.getElementById('story-title'), speaker=document.getElementById('story-speaker'), body=document.getElementById('story-text');
            const kicker=document.getElementById('story-kicker'), hint=document.getElementById('story-record-hint');
            const image=document.getElementById('story-portrait-image'), fallback=document.getElementById('story-portrait-fallback');
            const next=document.getElementById('story-continue-btn'), skip=document.getElementById('story-skip-btn');
            if (kicker) kicker.textContent=archiveMode ? 'АРХИВ ХРОНИК' : (event.kicker || (event.trigger==='after'?'ПОСЛЕ БОЯ':'ХРОНИКИ ОСАДЫ'));
            if (title) title.textContent=event.title || (record && record.title) || 'Сюжетное событие';
            if (speaker) speaker.textContent=character ? [character.name,character.role].filter(Boolean).join(' · ') : (event.speaker || '');
            if (body) body.textContent=String(event.text || '');
            if (hint) {
                if (record) { hint.textContent='📜 В архив добавится: ' + record.title; hint.classList.remove('hidden'); }
                else { hint.textContent=''; hint.classList.add('hidden'); }
            }
            if (image && fallback) {
                image.classList.remove('ready'); image.removeAttribute('src'); image.alt=''; image.onload=null; image.onerror=null;
                fallback.textContent=(character && character.icon) || event.icon || '📜'; fallback.style.display='';
                const portraitKey=character && character.portraitKey;
                if (portraitKey) {
                    const src=releaseImageSrc(portraitKey);
                    if (src) {
                        image.onload=function(){ image.classList.add('ready'); fallback.style.display='none'; };
                        image.onerror=function(){ image.classList.remove('ready'); fallback.style.display=''; image.removeAttribute('src'); };
                        image.alt=character.name || ''; image.src=src;
                    }
                }
            }
            const canSkip=!archiveMode && event.skippable!==false;
            if (skip) skip.style.display=canSkip?'':'none';
            if (next) next.textContent=archiveMode?'ЗАКРЫТЬ':'ПРОДОЛЖИТЬ';
            storyDialogPreviousFocus=document.activeElement instanceof HTMLElement ? document.activeElement : null;
            overlay.classList.remove('hidden'); overlay.setAttribute('aria-hidden','false');
            let closed=false;
            const finish=function(skipped){
                if (closed) return; closed=true;
                overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden','true'); overlay.removeEventListener('keydown',keydown);
                if (next) next.onclick=null; if (skip) skip.onclick=null;
                if (!archiveMode) completeStoryEvent(event);
                if (storyDialogPreviousFocus && storyDialogPreviousFocus.isConnected) storyDialogPreviousFocus.focus({preventScroll:true});
                resolve({eventId:Number(event.id),skipped:!!skipped});
            };
            const keydown=function(e){ trapDialogKeydown(e,overlay,canSkip?function(){finish(true);}:null); };
            overlay.addEventListener('keydown',keydown);
            if (next) next.onclick=function(){ finish(false); };
            if (skip) skip.onclick=function(){ finish(true); };
            if (next) next.focus({preventScroll:true});
        });
    }
    async function runStoryTrigger(trigger, level) {
        const events=storyCatalogEvents(trigger,level), results=[];
        for (const event of events) results.push(await showStoryEvent(event));
        return results;
    }
    function playStoryTrigger(trigger, level) {
        const task=function(){ return runStoryTrigger(String(trigger||''), Math.max(0,Number(level)||0)); };
        storyPlaybackChain=storyPlaybackChain.then(task,task);
        return storyPlaybackChain;
    }

    function storyCatalogSnapshot() {
        return {
            chapters:Array.isArray(STORY_DATA.chapters)?STORY_DATA.chapters.slice():[],
            characters:Array.isArray(STORY_DATA.characters)?STORY_DATA.characters.slice():[],
            records:Array.isArray(STORY_DATA.records)?STORY_DATA.records.slice():[],
            events:Array.isArray(STORY_DATA.events)?STORY_DATA.events.slice():[]
        };
    }
    function storyCharacterKnown(character, seen, found) {
        if (!character) return false;
        if (character.defaultKnown===true) return true;
        if (character.unlockEventId!=null && seen.has(Number(character.unlockEventId))) return true;
        if (character.unlockRecordId!=null && found.has(Number(character.unlockRecordId))) return true;
        if (character.unlockChapter!=null && Number(expansionProgress.storyChapter||0)>=Number(character.unlockChapter||0)) return true;
        if (character.unlockContentFlags && ((Number(expansionProgress.contentFlags)||0)&Number(character.unlockContentFlags))===Number(character.unlockContentFlags)) return true;
        return (STORY_DATA.events||[]).some(function(event){ return event && String(event.characterId)===String(character.id) && seen.has(Number(event.id)); });
    }
    function storyStatsSnapshot() {
        const catalog=storyCatalogSnapshot();
        const seen=new Set(normalizeProgressIdList(expansionProgress.storySeenIds));
        const found=new Set(normalizeProgressIdList(expansionProgress.storyRecordIds));
        const validEventIds=new Set(catalog.events.map(function(e){return Number(e&&e.id);}).filter(Number.isInteger));
        const validRecordIds=new Set(catalog.records.map(function(r){return Number(r&&r.id);}).filter(Number.isInteger));
        let seenEvents=0; seen.forEach(function(id){ if (validEventIds.has(id)) seenEvents++; });
        let foundRecords=0; found.forEach(function(id){ if (validRecordIds.has(id)) foundRecords++; });
        const knownCharacters=catalog.characters.filter(function(c){ return storyCharacterKnown(c,seen,found); }).length;
        const eventPct=catalog.events.length?Math.round((seenEvents/catalog.events.length)*100):0;
        return {catalog,seen,found,seenEvents,foundRecords,knownCharacters,eventPct};
    }
    function appendChroniclesEmpty(box, title, body) {
        const empty=document.createElement('div'); empty.className='chronicles-empty';
        const wrap=document.createElement('div'); const b=document.createElement('b'); b.textContent=title; const span=document.createElement('span'); span.textContent=body;
        wrap.append(b,span); empty.appendChild(wrap); box.appendChild(empty);
    }
    function updateChroniclesHeader(stats) {
        const title=document.getElementById('chronicles-progress-title'), caption=document.getElementById('chronicles-progress-caption'), fill=document.getElementById('chronicles-progress-fill'), percent=document.getElementById('chronicles-progress-percent'), grid=document.getElementById('chronicles-stats');
        const chapterCount=stats.catalog.chapters.length, chapter=Math.max(0,Number(expansionProgress.storyChapter)||0);
        const currentChapter=chapter && STORY_DATA.getChapter ? STORY_DATA.getChapter(Math.min(chapter,chapterCount||chapter)) : null;
        if (title) {
            if (!stats.catalog.events.length) title.textContent='Хроники пока пусты';
            else if (stats.eventPct>=100) title.textContent='История завершена · Сердце Предела';
            else if (currentChapter) title.textContent=`Глава ${currentChapter.id} · ${currentChapter.title}`;
            else title.textContent='Ожидается первое сюжетное событие';
        }
        if (caption) caption.textContent=stats.catalog.events.length ? `${stats.seenEvents}/${stats.catalog.events.length} сцен · ${stats.foundRecords}/${stats.catalog.records.length} материалов · прогресс сохраняется автоматически.` : 'Сюжетный каталог не загружен.';
        if (fill) fill.style.width=Math.max(0,Math.min(100,stats.eventPct))+'%';
        if (percent) percent.textContent=stats.eventPct+'%';
        if (grid) {
            grid.replaceChildren();
            const items=[
                [chapterCount ? `${Math.min(chapter,chapterCount)}/${chapterCount}` : '—','Глава'],
                [`${stats.seenEvents}/${stats.catalog.events.length}`,'Сцены'],
                [`${stats.foundRecords}/${stats.catalog.records.length}`,'Материалы'],
                [`${stats.knownCharacters}/${stats.catalog.characters.length}`,'Персонажи']
            ];
            items.forEach(function(item){ const card=document.createElement('div'); card.className='chronicles-stat'; const strong=document.createElement('strong'); strong.textContent=item[0]; const span=document.createElement('span'); span.textContent=item[1]; card.append(strong,span); grid.appendChild(card); });
        }
    }
    function chapterEvents(chapterId, events) { return (events||[]).filter(function(e){ return Number(e&&e.chapter)===Number(chapterId); }); }
    function renderChroniclesOverview(box, stats) {
        const chapters=stats.catalog.chapters;
        if (!chapters.length) { appendChroniclesEmpty(box,'Каркас глав готов','Сюжетный каталог временно недоступен. Перезапустите игру или проверьте целостность story-data.js.'); return; }
        const list=document.createElement('div'); list.className='chapter-list';
        const ordered=chapters.slice().sort(function(a,b){ return (Number(a.order)||Number(a.id)||0)-(Number(b.order)||Number(b.id)||0); });
        const currentChapter=Math.max(0,Number(expansionProgress.storyChapter)||0);
        ordered.forEach(function(chapter,index){
            const id=Number(chapter.id)||index+1, events=chapterEvents(id,stats.catalog.events), seenCount=events.filter(function(e){return stats.seen.has(Number(e.id));}).length;
            let status='locked', statusText='ЗАКРЫТО';
            if (currentChapter===0 && index===0) { status='current'; statusText='НАЧАЛО'; }
            else if (id<currentChapter) { status='completed'; statusText='ПРОЙДЕНО'; }
            else if (id===currentChapter) { status='current'; statusText='ТЕКУЩАЯ'; }
            const pct=events.length?Math.round(seenCount/events.length*100):(status==='completed'?100:0);
            const card=document.createElement('article'); card.className='chapter-card r83-chapter '+status;
            const cover=document.createElement('img');cover.className='r83-chapter-cover';cover.alt='';cover.setAttribute('aria-hidden','true');cover.loading='lazy';cover.dataset.r83Asset=status==='locked'?'sealed':'world';cover.src=status==='locked'?'images/ui-r83/sealed_entry.webp':r80Cover(id);
            const num=document.createElement('div'); num.className='chapter-number'; num.textContent=String(id).padStart(2,'0');
            const copy=document.createElement('div'); copy.className='chapter-copy'; const b=document.createElement('b'); b.textContent=status==='locked' ? 'Неизвестная глава' : (chapter.title||`Глава ${id}`); const span=document.createElement('span');
            const levels=(status!=='locked' && chapter.levelStart&&chapter.levelEnd)?`Уровни ${chapter.levelStart}–${chapter.levelEnd}`:''; const subtitle=(status==='locked')?'Продвигайтесь по кампании, чтобы открыть.':String(chapter.subtitle||levels||'Сюжетная глава'); span.textContent=[levels,subtitle].filter(Boolean).filter(function(v,i,a){return a.indexOf(v)===i;}).join(' · ');
            const track=document.createElement('div'); track.className='chapter-mini-progress'; const bar=document.createElement('i'); bar.style.width=Math.max(0,Math.min(100,pct))+'%'; track.appendChild(bar); copy.append(b,span,track);
            const state=document.createElement('div'); state.className='chapter-status'; state.textContent=events.length?`${statusText} · ${seenCount}/${events.length}`:statusText;
            card.append(cover,num,copy,state); list.appendChild(card);
        }); box.appendChild(list);
        if(window.R83Archive) R83Archive.refresh('chronicles');
    }
    function storyTriggerLabel(trigger) {
        const labels={before:'Перед боем',after:'После боя',boss_before:'Перед боссом',boss_after:'После босса',discovery:'Открытие'};
        return labels[String(trigger||'')] || 'Сюжет';
    }
    function openStoryScene(eventId) {
        const id=Number(eventId);
        const event=(STORY_DATA.events||[]).find(function(item){return Number(item&&item.id)===id;});
        if (!event || !storyHasId(expansionProgress.storySeenIds,id)) return false;
        showStoryEvent(event,{archiveMode:true});
        return true;
    }
    function renderChroniclesScenes(box, stats) {
        if (!stats.catalog.events.length) { appendChroniclesEmpty(box,'Сцен пока нет','Сюжетный каталог временно недоступен.'); return; }
        const host=document.createElement('div'); host.className='story-scene-list';
        const chapters=stats.catalog.chapters.slice().sort(function(a,b){return (Number(a.order)||Number(a.id)||0)-(Number(b.order)||Number(b.id)||0);});
        chapters.forEach(function(chapter,index){
            const chapterId=Number(chapter.id)||index+1;
            const events=chapterEvents(chapterId,stats.catalog.events).slice().sort(function(a,b){
                return (Number(a.level)||0)-(Number(b.level)||0) || Number(a.id||0)-Number(b.id||0);
            });
            if (!events.length) return;
            const section=document.createElement('section'); section.className='story-scene-chapter';
            const heading=document.createElement('h3');const currentChapter=Math.max(1,Number(expansionProgress.storyChapter)||1);const chapterKnown=chapterId<=currentChapter||events.some(ev=>stats.seen.has(Number(ev.id)));heading.textContent=chapterKnown?`Глава ${chapterId} · ${chapter.title||'Хроники'}`:`Глава ${chapterId} · Неоткрытая история`;section.appendChild(heading);
            const grid=document.createElement('div'); grid.className='story-scene-grid';
            events.forEach(function(event){
                const unlocked=stats.seen.has(Number(event.id));
                const card=document.createElement('article'); card.className='story-scene-card'+(unlocked?'':' locked');
                const meta=document.createElement('div'); meta.className='story-scene-meta'; meta.textContent=unlocked?`Уровень ${event.level} · ${storyTriggerLabel(event.trigger)}`:'НЕИЗВЕСТНЫЙ ЭПИЗОД';
                const title=document.createElement('b'); title.textContent=unlocked ? String(event.title||'Сюжетная сцена') : 'Закрытая сцена';
                const character=event.characterId!=null&&STORY_DATA.getCharacter?STORY_DATA.getCharacter(event.characterId):null;
                const body=document.createElement('p'); body.textContent=unlocked ? ([character&&character.name, String(event.text||'').slice(0,96)+(String(event.text||'').length>96?'…':'')].filter(Boolean).join(' · ')) : 'Пройдите соответствующий сюжетный момент, чтобы открыть сцену.';
                const button=document.createElement('button'); button.type='button'; button.className='story-scene-open'; button.dataset.storySceneId=String(event.id); button.disabled=!unlocked; button.textContent=unlocked?'ПЕРЕЧИТАТЬ':'🔒 ЗАКРЫТО';
                card.append(meta,title,body,button); grid.appendChild(card);
            });
            section.appendChild(grid); host.appendChild(section);
        });
        box.appendChild(host);
    }
    function selectStoryReplayStart() {
        state.level=1; campaignPageIndex=0; campaignLastRenderedLevel=null;
        updateLevelSelector(); renderMenuPresentation();
        if (typeof showMetaToast==='function') showMetaToast('Выбран уровень 1. Прогресс кампании не сброшен.');
    }
    function ensureStoryReplayConfirm() {
        let overlay=document.getElementById('story-replay-overlay'); if(overlay) return overlay;
        overlay=document.createElement('div'); overlay.id='story-replay-overlay'; overlay.className='story-replay-overlay hidden'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-hidden','true');
        const card=document.createElement('article'); card.className='story-replay-card';
        const title=document.createElement('h2'); title.textContent='Перепройти историю?';
        const body=document.createElement('p'); body.innerHTML='Будут сброшены <strong>только отметки просмотра сюжета</strong>. Уровни, звёзды, улучшения, статистика и открытый контент кампании останутся на месте.';
        const actions=document.createElement('div'); actions.className='story-replay-actions';
        const cancel=document.createElement('button'); cancel.type='button'; cancel.className='story-replay-cancel'; cancel.textContent='ОТМЕНА';
        const confirm=document.createElement('button'); confirm.type='button'; confirm.className='story-replay-confirm'; confirm.textContent='СБРОСИТЬ ТОЛЬКО СЮЖЕТ';
        cancel.onclick=closeStoryReplayConfirm; confirm.onclick=resetStoryProgressForReplay;
        actions.append(cancel,confirm); card.append(title,body,actions); overlay.appendChild(card); document.body.appendChild(overlay); return overlay;
    }
    function openStoryReplayConfirm() {
        const overlay=ensureStoryReplayConfirm(); overlay.classList.remove('hidden'); overlay.setAttribute('aria-hidden','false');
        const btn=overlay.querySelector('.story-replay-cancel'); if(btn) btn.focus({preventScroll:true});
    }
    function closeStoryReplayConfirm() {
        const overlay=document.getElementById('story-replay-overlay'); if(!overlay) return; overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden','true');
    }
    function resetStoryProgressForReplay() {
        expansionProgress.storyChapter=0;
        expansionProgress.storySeenIds=[];
        expansionProgress.storyRecordIds=[];
        expansionProgress.contentFlags=0;
        closeStoryReplayConfirm();
        selectStoryReplayStart();
        if (window.GameSave) { GameSave.save('story-replay-reset'); GameSave.flush(); }
        activeChroniclesView='scenes'; renderChronicles();
        if (typeof showMetaToast==='function') showMetaToast('Сюжет готов к перепрохождению с уровня 1. Игровой прогресс сохранён.');
    }
    function renderChroniclesCharacters(box, stats) {
        if (!stats.catalog.characters.length) { appendChroniclesEmpty(box,'Персонажи ещё не добавлены','Каталог персонажей временно недоступен. Проверьте загрузку story-data.js.'); return; }
        const grid=document.createElement('div'); grid.className='character-grid';
        stats.catalog.characters.slice().sort(function(a,b){return (Number(a.order)||0)-(Number(b.order)||0);}).forEach(function(character){
            const known=storyCharacterKnown(character,stats.seen,stats.found); const card=document.createElement('article'); card.className='character-card'+(known?'':' locked');
            const portrait=document.createElement('div'); portrait.className='character-portrait'; const fallback=document.createElement('span'); fallback.textContent=known?(character.icon||'👤'):'?'; portrait.appendChild(fallback);
            if (known && character.portraitKey) { const src=releaseImageSrc(character.portraitKey); if(src){ const img=document.createElement('img'); img.alt=character.name||''; img.loading='lazy'; img.onload=function(){fallback.style.display='none';}; img.onerror=function(){img.remove();fallback.style.display='';}; img.src=src; portrait.appendChild(img); } }
            const copy=document.createElement('div'); copy.className='character-copy'; const small=document.createElement('small'); small.textContent=known?(character.role||'Персонаж'):'Личность не установлена'; const b=document.createElement('b'); b.textContent=known?(character.name||'Без имени'):'???'; const p=document.createElement('p'); p.textContent=known?String(character.summary||'Запись о персонаже открыта.'):'Встретьте этого персонажа по ходу истории, чтобы открыть досье.'; copy.append(small,b,p); card.append(portrait,copy); grid.appendChild(card);
        }); box.appendChild(grid);
    }
    function renderChroniclesRecords(box, stats) {
        if (!stats.catalog.records.length) { appendChroniclesEmpty(box,'Архив материалов пуст','Каталог материалов временно недоступен. Проверьте загрузку story-data.js.'); return; }
        const grid=document.createElement('div'); grid.className='record-grid';
        stats.catalog.records.slice().sort(function(a,b){return (Number(a.order)||Number(a.id)||0)-(Number(b.order)||Number(b.id)||0);}).forEach(function(record){
            const unlocked=stats.found.has(Number(record.id)); const card=document.createElement('article'); card.className='chronicle-card'+(unlocked?'':' locked');
            const category=document.createElement('small'); category.textContent=unlocked?(record.category||'Материал'):'Закрытый материал'; const title=document.createElement('b'); title.textContent=unlocked?(record.title||'Без названия'):'Неизвестный документ'; const body=document.createElement('p'); body.textContent=unlocked?String(record.summary||'Материал найден. Откройте, чтобы прочитать полностью.'):'Найдите этот материал по ходу кампании.';
            const button=document.createElement('button'); button.type='button'; button.className='chronicle-open-btn'; button.dataset.storyRecordId=String(record.id); button.disabled=!unlocked; button.textContent=unlocked?'ОТКРЫТЬ':'🔒 ЗАКРЫТО';
            card.append(category,title,body,button); grid.appendChild(card);
        }); box.appendChild(grid);
    }
    function ensureRecordReader() {
        let overlay=document.getElementById('record-reader-overlay'); if (overlay) return overlay;
        overlay=document.createElement('div'); overlay.id='record-reader-overlay'; overlay.className='record-reader-overlay hidden'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-hidden','true'); overlay.setAttribute('aria-labelledby','record-reader-title');
        const card=document.createElement('article'); card.className='record-reader-card'; const head=document.createElement('div'); head.className='record-reader-head'; const category=document.createElement('small'); category.id='record-reader-category'; const title=document.createElement('h2'); title.id='record-reader-title'; head.append(category,title); const body=document.createElement('div'); body.id='record-reader-body'; body.className='record-reader-body'; const actions=document.createElement('div'); actions.className='record-reader-actions'; const close=document.createElement('button'); close.id='record-reader-close'; close.type='button'; close.textContent='ЗАКРЫТЬ'; actions.appendChild(close); card.append(head,body,actions); overlay.appendChild(card); document.body.appendChild(overlay); return overlay;
    }
    function closeRecordReader() {
        const overlay=document.getElementById('record-reader-overlay'); if (!overlay || overlay.classList.contains('hidden')) return;
        overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden','true'); overlay.onkeydown=null;
        if (recordReaderPreviousFocus && recordReaderPreviousFocus.isConnected) recordReaderPreviousFocus.focus({preventScroll:true});
    }
    function openStoryRecord(recordId) {
        const id=Number(recordId), record=STORY_DATA.getRecord?STORY_DATA.getRecord(id):null;
        if (!record || !storyHasId(expansionProgress.storyRecordIds,id)) return false;
        const overlay=ensureRecordReader(), category=document.getElementById('record-reader-category'), title=document.getElementById('record-reader-title'), body=document.getElementById('record-reader-body'), close=document.getElementById('record-reader-close');
        if (category) category.textContent=[record.category||'Материал',record.chapter?`Глава ${record.chapter}`:''].filter(Boolean).join(' · '); if (title) title.textContent=record.title||'Без названия'; if (body) body.textContent=String(record.body||record.summary||'');
        recordReaderPreviousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null; overlay.classList.remove('hidden'); overlay.setAttribute('aria-hidden','false');
        const keydown=function(e){trapDialogKeydown(e,overlay,closeRecordReader);}; overlay.onkeydown=keydown; if(close) close.onclick=closeRecordReader; if(close) close.focus({preventScroll:true}); return true;
    }
    function renderChronicles() {
        const box=document.getElementById('chronicles-ui'); if (!box) return;
        const stats=storyStatsSnapshot(); updateChroniclesHeader(stats); box.replaceChildren();
        document.querySelectorAll('#chronicles-nav .chronicles-nav-btn').forEach(function(btn){ const active=btn.dataset.chroniclesView===activeChroniclesView; btn.classList.toggle('active',active); btn.setAttribute('aria-selected',active?'true':'false'); btn.tabIndex=active?0:-1; });
        if (activeChroniclesView==='scenes') renderChroniclesScenes(box,stats); else if (activeChroniclesView==='characters') renderChroniclesCharacters(box,stats); else if (activeChroniclesView==='records') renderChroniclesRecords(box,stats); else renderChroniclesOverview(box,stats);
        if(window.R83Archive) R83Archive.refresh('chronicles');
    }
    const chroniclesNav=document.getElementById('chronicles-nav');
    if (chroniclesNav) chroniclesNav.addEventListener('click',function(event){ const btn=event.target.closest('.chronicles-nav-btn[data-chronicles-view]'); if(!btn)return; const view=btn.dataset.chroniclesView; if(!['overview','scenes','characters','records'].includes(view))return; activeChroniclesView=view; renderChronicles(); });
    const chroniclesUi=document.getElementById('chronicles-ui');
    if (chroniclesUi) chroniclesUi.addEventListener('click',function(event){ const btn=event.target.closest('[data-story-record-id]'); if(btn&&!btn.disabled) openStoryRecord(btn.dataset.storyRecordId); const sceneBtn=event.target.closest('[data-story-scene-id]'); if(sceneBtn&&!sceneBtn.disabled) openStoryScene(sceneBtn.dataset.storySceneId); });

    window.GameStory = Object.freeze({
        dataVersion:Number(STORY_DATA.meta&&STORY_DATA.meta.dataVersion)||0,
        validate:function(){ return STORY_DATA.validate ? STORY_DATA.validate() : {ok:true,errors:[]}; },
        playTrigger:playStoryTrigger,
        getProgress:function(){ return {chapter:expansionProgress.storyChapter,seenIds:expansionProgress.storySeenIds.slice(),recordIds:expansionProgress.storyRecordIds.slice(),contentFlags:expansionProgress.contentFlags}; },
        getEvents:function(trigger,level){ return storyCatalogEvents(trigger,level).slice(); },
        getRecords:function(){ return (STORY_DATA.records||[]).slice(); },
        getCharacters:function(){ return (STORY_DATA.characters||[]).slice(); },
        getChapters:function(){ return (STORY_DATA.chapters||[]).slice(); },
        setChroniclesView:function(view){ if(['overview','scenes','characters','records'].includes(view)){activeChroniclesView=view;renderChronicles();return true;} return false; },
        openRecord:openStoryRecord,
        openScene:openStoryScene,
        resetForReplay:resetStoryProgressForReplay
    });
    // ================= /UPDATE60 R13 — Story Engine + Chronicles UI runtime =================

    // ================= R24 UPDATE60.1 — Update Notice + Mobile HUD Runtime Guard =================
    const UPDATE60_1_NOTICE_ID='reforged_r92_final_worlds';
    const UPDATE60_1_NOTICE_KEY='td_update_notice_'+UPDATE60_1_NOTICE_ID+'_seen';
    const UPDATE60_1_RELEASE_LABEL="\u041e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b \u0430\u0440\u0435\u043d\u044b \u0438 \u043e\u0431\u043e\u0440\u043e\u043d\u0430";
    let updateNoticePreviousFocus=null;
    // In privacy-restricted / file:// browsers localStorage can be inaccessible.
    // Never reopen a dismissed release notice on every menu transition in one session.
    let updateNoticeDismissedInSession=false;

    function updateNoticeSeen() { if (updateNoticeDismissedInSession) return true; try { return localStorage.getItem(UPDATE60_1_NOTICE_KEY)==='1'; } catch (_) { return false; } }
    function markUpdateNoticeSeen() { updateNoticeDismissedInSession=true; try { localStorage.setItem(UPDATE60_1_NOTICE_KEY,'1'); } catch (_) {} }
    function ensureUpdateNotice() {
        let overlay=document.getElementById('update-notice-overlay'); if(overlay) return overlay;
        overlay=document.createElement('div'); overlay.id='update-notice-overlay'; overlay.className='update-notice-overlay hidden'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-hidden','true'); overlay.setAttribute('aria-labelledby','update-notice-title');
        const card=document.createElement('article'); card.className='update-notice-card';
        const kicker=document.createElement('div'); kicker.className='update-notice-kicker'; kicker.textContent='TOWER DEFENSE: REFORGED';
        const title=document.createElement('h2'); title.id='update-notice-title'; title.textContent='ИГРА ОБНОВИЛАСЬ';
        const date=document.createElement('div'); date.className='update-notice-date'; date.textContent='Обновлено: '+UPDATE60_1_RELEASE_LABEL;
        const lead=document.createElement('p'); lead.className='update-notice-lead'; lead.textContent="\u041d\u043e\u0432\u044b\u0435 \u043c\u0430\u0440\u0448\u0440\u0443\u0442\u044b \u0432\u0440\u0430\u0433\u043e\u0432 \u0438 \u0443\u043b\u0443\u0447\u0448\u0435\u043d\u043d\u044b\u0435 \u0441\u0442\u0440\u043e\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u0437\u0438\u0446\u0438\u0438 \u043d\u0430 \u043a\u0430\u0440\u0442\u0430\u0445 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0445 \u043c\u0438\u0440\u043e\u0432. \u0414\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u0432\u0441\u0435\u0445 \u0434\u0435\u0441\u044f\u0442\u0438 \u0431\u0430\u0448\u0435\u043d \u0443\u0432\u0435\u043b\u0438\u0447\u0435\u043d\u0430. \u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f \u0438\u0437 90 \u0443\u0440\u043e\u0432\u043d\u0435\u0439 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0430, \u0432\u0430\u0448 \u043f\u0440\u043e\u0433\u0440\u0435\u0441\u0441 \u043e\u0441\u0442\u0430\u0451\u0442\u0441\u044f \u043d\u0430 \u043c\u0435\u0441\u0442\u0435.";
        const grid=document.createElement('div'); grid.className='update-notice-grid';
        [["\u041d\u041e\u0412\u042b\u0415 \u0410\u0420\u0415\u041d\u042b","\u041f\u0435\u0440\u0435\u0440\u0430\u0431\u043e\u0442\u0430\u043d\u044b \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f \u0437\u0430\u043a\u043b\u044e\u0447\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0445 \u043c\u0438\u0440\u043e\u0432, \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d \u0438\u0445 \u0445\u0443\u0434\u043e\u0436\u0435\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u0441\u0442\u0438\u043b\u044c."],["\u0414\u041e\u0420\u041e\u0413\u0418 \u0418 \u0411\u0410\u0428\u041d\u0418","\u0412\u0440\u0430\u0433\u0438 \u0441\u043b\u0435\u0434\u0443\u044e\u0442 \u043f\u043e \u043e\u0431\u043d\u043e\u0432\u043b\u0451\u043d\u043d\u044b\u043c \u0434\u043e\u0440\u043e\u0433\u0430\u043c, \u0430 \u0442\u043e\u0447\u043a\u0438 \u0441\u0442\u0440\u043e\u0438\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u0430 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u044b \u0441 \u043a\u0430\u0440\u0442\u0430\u043c\u0438."],["\u0414\u0410\u041b\u042c\u041d\u041e\u0421\u0422\u042c","\u0420\u0430\u0434\u0438\u0443\u0441 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u043a\u0430\u0436\u0434\u043e\u0439 \u0431\u0430\u0448\u043d\u0438 \u0443\u0432\u0435\u043b\u0438\u0447\u0435\u043d \u043d\u0430 10 \u0435\u0434\u0438\u043d\u0438\u0446."],["\u041f\u0420\u041e\u0413\u0420\u0415\u0421\u0421","\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f, \u0434\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u044f \u0438 \u0443\u043b\u0443\u0447\u0448\u0435\u043d\u0438\u044f \u043e\u0441\u0442\u0430\u044e\u0442\u0441\u044f \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b."]].forEach(function(item){const el=document.createElement('div');el.className='update-notice-item';const b=document.createElement('b');b.textContent=item[0];el.append(b,document.createElement('br'),document.createTextNode(item[1]));grid.appendChild(el);});
        
        const actions=document.createElement('div'); actions.className='update-notice-actions';
        const ok=document.createElement('button'); ok.type='button'; ok.className='update-notice-primary'; ok.textContent='ПОНЯТНО, В БОЙ';
        const chronicles=document.createElement('button'); chronicles.type='button'; chronicles.className='update-notice-secondary'; chronicles.textContent='ОТКРЫТЬ ХРОНИКИ';
        ok.onclick=function(){ closeUpdateNotice(false); };
        chronicles.onclick=function(){ closeUpdateNotice(true); };
        actions.append(ok,chronicles); card.append(kicker,title,date,lead,grid,actions); overlay.appendChild(card); document.body.appendChild(overlay); return overlay;
    }
    function closeUpdateNotice(openChroniclesAfter) {
        const overlay=document.getElementById('update-notice-overlay'); if(!overlay) return;
        markUpdateNoticeSeen(); overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden','true');
        if(openChroniclesAfter) openMetaHub('chronicles');
        else if(updateNoticePreviousFocus&&updateNoticePreviousFocus.isConnected) updateNoticePreviousFocus.focus({preventScroll:true});
    }
    function maybeShowUpdateNotice() {
        if(updateNoticeSeen() || state.screen!=='menu') return false;
        const overlay=ensureUpdateNotice(); updateNoticePreviousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
        overlay.classList.remove('hidden'); overlay.setAttribute('aria-hidden','false');
        const primary=overlay.querySelector('.update-notice-primary'); if(primary) primary.focus({preventScroll:true});
        return true;
    }

    function scheduleR24HudGuard() { Reforged.fitCanvas(); }
    // ================= /R24 UPDATE60.1 =================

    // ================= V25 — Meta Hub runtime =================
    let activeMetaTab = 'castle';
    let selectedMagicLoadoutSlot = 0;
    let metaToastTimer = null;

    function countBits(value) {
        let n = Number(value) >>> 0, count = 0;
        while (n) { n &= (n - 1); count++; }
        return count;
    }

    function campaignStarsTotal() { return levelBestStars.reduce((sum, value) => sum + Number(value || 0), 0); }
    function completedLevelsTotal() { return levelBestStars.filter(value => value > 0).length; }
    function castleUpgradePoints() { return Object.values(metaStats).reduce((sum, value) => sum + Number(value || 0), 0); }
    function bestiaryEntriesTotal() { return countBits(metaProgress.enemySeenMask) + countBits(metaProgress.bossSeenMask); }
    function worldMasteryCount() {
        let total = 0;
        for (let worldId=1; worldId<=GAME_DATA.meta.worldCount; worldId++) {
            const world=GAME_DATA.getWorld(worldId);
            if (world.levels.reduce((sum,id)=>sum+getLevelBestStars(id),0) >= world.levels.length * 3) total++;
        }
        return total;
    }
    function getCastleRank() {
        const points = castleUpgradePoints();
        let rank = META_PROGRESSION.rankTiers[0];
        META_PROGRESSION.rankTiers.forEach(tier => { if (points >= tier.min) rank = tier; });
        return rank;
    }
    function getAchievementMetric(achievement) {
        if (!achievement) return 0;
        if (achievement.metric === 'campaignStars') return campaignStarsTotal();
        if (achievement.metric === 'completedLevels') return completedLevelsTotal();
        if (achievement.metric === 'bestiaryEntries') return bestiaryEntriesTotal();
        if (achievement.metric === 'darkKingDefeated') { const idx=GAME_DATA.getBossIndex(30); return idx >= 0 && (metaProgress.bossKills[idx] || 0) > 0 ? 1 : 0; }
        return Number(metaProgress.stats[achievement.metric] || 0);
    }
    function achievementDone(index) { return !!(metaProgress.achievementMask & (1 << index)); }
    function showMetaToast(message) {
        const el = document.getElementById('meta-toast'); if (!el) return;
        if (metaToastTimer) clearTimeout(metaToastTimer);
        el.textContent = message; el.classList.add('show');
        metaToastTimer = setTimeout(() => el.classList.remove('show'), 3200);
    }
    function evaluateAchievements(showToast) {
        let unlocked = 0, rewardTotal = 0;
        META_PROGRESSION.achievements.forEach(function (achievement, index) {
            if (achievementDone(index)) return;
            if (getAchievementMetric(achievement) >= achievement.goal) {
                metaProgress.achievementMask |= (1 << index);
                state.stars += achievement.reward;
                unlocked++; rewardTotal += achievement.reward;
                if (showToast) showMetaToast(`🏅 ${achievement.title} · +${achievement.reward}⭐`);
            }
        });
        if (unlocked && window.GameSave && saveStatus.ready) GameSave.save('achievement-unlocked');
        updateMetaQuickSummary();
        return { unlocked, rewardTotal };
    }
    function noteEnemySeen(type) {
        const idx = Number(type);
        if (!Number.isInteger(idx) || idx < 0 || idx >= GAME_COUNTS.enemyCount) return false;
        const bit = 1 << idx;
        if (metaProgress.enemySeenMask & bit) return false;
        metaProgress.enemySeenMask |= bit;
        evaluateAchievements(false);
        if (window.GameSave && saveStatus.ready) GameSave.save('bestiary-enemy:' + idx);
        return true;
    }
    function noteBossSeen(bossId) {
        const idx = GAME_DATA.getBossIndex(bossId);
        if (idx < 0 || idx >= GAME_COUNTS.bossCount) return false;
        const bit = 1 << idx;
        if (metaProgress.bossSeenMask & bit) return false;
        metaProgress.bossSeenMask |= bit;
        evaluateAchievements(false);
        if (window.GameSave && saveStatus.ready) GameSave.save('bestiary-boss:' + bossId);
        return true;
    }
    function addMetaStat(key, amount) {
        if (!(key in metaProgress.stats)) return;
        metaProgress.stats[key] = Math.max(0, Number(metaProgress.stats[key] || 0) + Number(amount || 1));
    }
    function registerEnemyKill(enemy) {
        if (!enemy || enemy.metaKillCounted || enemy.hp > 0 || enemy.pathIndex >= enemy.path.length) return;
        enemy.metaKillCounted = true;
        addMetaStat('enemiesKilled', 1);
        if (enemy.isBoss) {
            state.bossKilledThisBattle = true;
            addMetaStat('bossesKilled', 1);
            const idx = GAME_DATA.getBossIndex(enemy.bossProfile && enemy.bossProfile.level || state.level);
            if (idx >= 0) { metaProgress.bossKills[idx] = (metaProgress.bossKills[idx] || 0) + 1; metaProgress.bossSeenMask |= (1 << idx); }
        } else {
            const idx = Number(enemy.type);
            if (Number.isInteger(idx) && idx >= 0 && idx < GAME_COUNTS.enemyCount) { metaProgress.enemyKills[idx] = (metaProgress.enemyKills[idx] || 0) + 1; metaProgress.enemySeenMask |= (1 << idx); }
        }
        evaluateAchievements(true);
    }
    function getNextRankInfo() {
        const points = castleUpgradePoints();
        const tiers = META_PROGRESSION.rankTiers || [];
        const current = getCastleRank();
        const next = tiers.find(t => Number(t.min) > points) || null;
        return { points, current, next, remaining: next ? Math.max(0, Number(next.min) - points) : 0 };
    }
    function getStarRules() {
        const maxHp = 20 + (metaStats.hp * 5);
        return {
            maxHp,
            three: Math.ceil(maxHp * 0.9),
            two: Math.ceil(maxHp * 0.5)
        };
    }
    function starText(count) {
        const n = Math.max(0, Math.min(3, Number(count || 0)));
        return n > 0 ? '★'.repeat(n) + '☆'.repeat(3 - n) : '☆☆☆';
    }
    function findRecommendedCastleUpgrade() {
        const priority = ['hp','towerCap','skill1','skill2','skill3','unlock4','unlock5'];
        let best = null;
        priority.forEach(function (key, idx) {
            const u = CASTLE_UPGRADES[key]; if (!u) return;
            const lvl = Number(metaStats[key] || 0);
            if (lvl >= u.max) return;
            const cost = Number(u.cost[lvl] || 0);
            const item = { key, upgrade:u, lvl, cost, affordable: state.stars >= cost, priority: idx };
            if (!best || (item.affordable && !best.affordable) || (item.affordable === best.affordable && (item.cost < best.cost || (item.cost === best.cost && item.priority < best.priority)))) best = item;
        });
        return best;
    }
    function findNextUnlockedUnbeatenLevel() {
        for (let i = 1; i <= state.maxUnlockedLevel; i++) if (getLevelBestStars(i) <= 0) return i;
        return Math.min(state.maxUnlockedLevel, GAME_DATA.meta.totalLevels);
    }
    function getNextProgressGoal() {
        const upgrade = findRecommendedCastleUpgrade();
        if (upgrade && upgrade.affordable) return { iconAsset:'castle_tab.svg', title:'Улучшите штаб', text:`Доступно ${state.stars}★. Лучше сейчас купить: ${upgrade.upgrade.title}.`, action:'openMetaHub("castle")' };
        const nextLevel = findNextUnlockedUnbeatenLevel();
        const level = GAME_DATA.getLevel(nextLevel);
        const world = GAME_DATA.getWorld(level.worldId);
        if (getLevelBestStars(nextLevel) <= 0) return { iconAsset:'menu_story.svg', title:`Следующая миссия: уровень ${nextLevel}`, text:`${level.title}. ${level.bossId ? 'Это бой с боссом: подготовьте штаб и способности.' : (level.objective || level.tip || 'Удержите рубеж.')}`, action:null };
        if (upgrade) return { iconAsset:'ach_stars.svg', title:'Накопите звёзды', text:`Для следующего улучшения «${upgrade.upgrade.title}» нужно ещё ${Math.max(0, upgrade.cost - state.stars)}★. Переиграйте уровни на 2–3★ или пройдите следующий рубеж.`, action:null };
        return { iconAsset:'crown-rank.svg', title:'Кампания почти завершена', text:'Доберите 3★ на уровнях, закройте достижения и заполните бестиарий.', action:null };
    }
    function syncCurrencyDisplays() {
        const value = Math.max(0, Number(state.stars) || 0);
        const text = String(Math.floor(value));
        const menuBalance = document.getElementById('menu-stars-balance');
        if (menuBalance && menuBalance.textContent !== text) menuBalance.textContent = text;
        const menuPill = document.getElementById('menu-currency-pill');
        if (menuPill) menuPill.setAttribute('aria-label', `Доступно звёзд: ${text}`);
        const metaBalance = document.getElementById('ui-stars');
        if (metaBalance && metaBalance.textContent !== text) metaBalance.textContent = text;
        const commandBalance=document.getElementById('r65-available-stars');
        if (commandBalance && commandBalance.textContent !== text) commandBalance.textContent = text;
    }
    function updateMetaQuickSummary() {
        syncCurrencyDisplays();
        const el = document.getElementById('meta-quick-summary'); if (!el) { renderProgressAdvisor(); return; }
        const rank = getCastleRank();
        el.textContent = `${rank.name} · ${campaignStarsTotal()}/${MAX_CAMPAIGN_STARS}★ · доступно ${state.stars}★ · награды ${countBits(metaProgress.achievementMask)}/${META_PROGRESSION.achievements.length} · бестиарий ${bestiaryEntriesTotal()}/${BESTIARY_TOTAL}`;
        renderProgressAdvisor();
    }
    function renderProgressAdvisor() {
        const el = document.getElementById('progress-advisor'); if (!el) return;
        const goal = getNextProgressGoal();
        el.innerHTML = `<img class="r91-advisor-icon" src="images/ui-r78/icons/${goal.iconAsset}" alt="" aria-hidden="true"> <b>${goal.title}</b><br>${goal.text}`;
    }
    function renderMetaHeader() {
        const rankInfo=getNextRankInfo(), rank=rankInfo.current, points=rankInfo.points;
        const ids={ 'meta-rank-icon':rank.icon, 'meta-rank-name':rank.name, 'meta-rank-progress':`${points} / ${META_PROGRESSION.castleMaxPoints} улучшений замка`, 'meta-stars-total':`${campaignStarsTotal()}/${MAX_CAMPAIGN_STARS}`, 'meta-achievements-total':`${countBits(metaProgress.achievementMask)}/${META_PROGRESSION.achievements.length}`, 'meta-bestiary-total':`${bestiaryEntriesTotal()}/${BESTIARY_TOTAL}` };
        Object.entries(ids).forEach(([id,text])=>{ const el=document.getElementById(id); if(el) el.textContent=text; });
        const bar=document.getElementById('meta-rank-bar'); if(bar) bar.style.width=`${Math.min(100, Math.round(points / META_PROGRESSION.castleMaxPoints * 100))}%`;
        const next=document.getElementById('meta-rank-next'); if(next) next.textContent = rankInfo.next ? `Следующий ранг: ${rankInfo.next.icon} ${rankInfo.next.name} через ${rankInfo.remaining} улучш.` : `Максимальный ранг получен. Добирайте ${MAX_CAMPAIGN_STARS}★ и достижения.`;
    }
    function renderAchievements() {
        const box=document.getElementById('achievements-ui'); if (!box) return; box.replaceChildren();
        META_PROGRESSION.achievements.forEach(function(a,index){
            const done=achievementDone(index), value=Math.min(a.goal,getAchievementMetric(a));
            const pct=Math.min(100,Math.round(value/a.goal*100));
            const status=done?'earned':value>0?'progress':'waiting';
            const card=document.createElement('article');
            card.className='achievement-card r83-achievement-card'+(done?' done':'');
            card.dataset.r83Status=status;
            const label=done?'ПОЛУЧЕНО':status==='progress'?'В ПРОЦЕССЕ':'НЕ НАЧАТО';
            const file='images/ui-r83/achievement_'+a.id+'.webp';
            card.innerHTML=`<div class="r83-ach-seal"><img loading="lazy" src="${file}" alt="" aria-hidden="true"/></div>
              <div class="r83-ach-detail"><div class="r83-ach-headline"><b>${a.title}</b><span class="r83-ach-state ${status}">${label}</span></div>
              <p>${a.desc}</p><div class="r83-ach-progress" role="progressbar" aria-label="Прогресс достижения ${a.title}" aria-valuemin="0" aria-valuemax="${a.goal}" aria-valuenow="${value}"><i style="width:${pct}%"></i></div>
              <div class="r83-ach-bottom"><span>${value.toLocaleString('ru-RU')} / ${a.goal.toLocaleString('ru-RU')}</span><span>${done?'НАГРАДА ПОЛУЧЕНА':'НАГРАДА · '+a.reward+' ★'}</span></div></div>`;
            box.appendChild(card);
        });
        if(window.R83Archive) R83Archive.refresh('achievements');
    }
    function renderBestiary() {
        const box=document.getElementById('bestiary-ui'); if(!box)return; box.replaceChildren();
        function addCard(config){
            const {known,kind,entryName,role,mechanic,kills,asset,caption}=config;
            const card=document.createElement('article');
            card.className='bestiary-card r83-bestiary-card'+(known?'':' locked');
            card.dataset.r83Kind=kind; card.dataset.r83Known=known?'yes':'no';
            const art=known && asset ? `<img loading="lazy" class="r83-bestiary-art" src="${releaseImageSrc(asset)}" alt="" aria-hidden="true"/>` : '<img loading="lazy" class="r83-bestiary-art r83-sealed" src="images/ui-r83/sealed_entry.webp" alt="" aria-hidden="true"/>';
            const title=known?entryName:(kind==='boss'?'Неизвестный владыка':'Неизвестный противник');
            const note=known?mechanic:(kind==='boss'?'Победите этого владыку, чтобы открыть сведения о нём.':'Встретьте противника в бою, чтобы открыть его запись.');
            const kindLabel=kind==='boss'?'ВЛАДЫКА':'ПРОТИВНИК';
            card.innerHTML=`<div class="r83-bestiary-stage">${art}<span class="r83-best-type">${kindLabel}</span></div>
              <div class="r83-bestiary-copy"><small>${known?role:'ЗАПЕЧАТАННОЕ ДОСЬЕ'}</small><b>${title}</b><p>${note}</p>
              <div class="r83-bestiary-footer">${known?caption+': '+Number(kills||0).toLocaleString('ru-RU'):'ЗАПИСЬ ЗАКРЫТА'}</div></div>`;
            box.appendChild(card);
        }
        Object.values(GAME_DATA.enemies).sort((a,b)=>a.type-b.type).forEach(function(enemy){
            const known=!!(metaProgress.enemySeenMask&(1<<enemy.type));
            addCard({known,kind:'enemy',entryName:enemy.name,role:enemy.role,mechanic:enemy.mechanic,kills:metaProgress.enemyKills[enemy.type],asset:enemy.imgKey,caption:'ПОБЕЖДЕНО'});
        });
        BOSS_LEVELS.forEach(function(level,index){
            const boss=GAME_DATA.getBoss(level), known=!!(metaProgress.bossSeenMask&(1<<index));
            addCard({known,kind:'boss',entryName:boss&&boss.name||'Владыка',role:'Босс · уровень '+level,mechanic:boss&&boss.mechanic||'',kills:metaProgress.bossKills[index],asset:boss&&boss.imgKey,caption:'ПОБЕД'});
        });
        if(window.R83Archive) R83Archive.refresh('bestiary');
    }
    function renderProfile() {
        const box=document.getElementById('profile-stats-ui');if(box){
            const items=[
                ['menu_start','Победы',metaProgress.stats.victories],
                ['bestiary_tab','Врагов побеждено',metaProgress.stats.enemiesKilled],
                ['castle_tab','Башен построено',metaProgress.stats.towersBuilt],
                ['upgrading-anvil','Улучшений куплено',metaProgress.stats.towerUpgradesBought],
                ['boss_alert','Боссов побеждено',metaProgress.stats.bossesKilled],
                ['resource_lives','Идеальных побед',metaProgress.stats.perfectWins],
                ['arcane-spark','Способностей',metaProgress.stats.abilitiesUsed],
                ['plan_tab','Миров освоено на 15★',worldMasteryCount()]
            ];
            box.innerHTML=items.map(row=>`<article class="profile-card r83-stat-card"><img loading="lazy" src="${R78Icons.path(row[0])}" alt="" aria-hidden="true"/><span>${row[1]}</span><strong>${Number(row[2]||0).toLocaleString('ru-RU')}</strong></article>`).join('');
        }
        const worlds=document.getElementById('world-mastery-ui');if(worlds){worlds.replaceChildren();
            for(let worldId=1;worldId<=GAME_DATA.meta.worldCount;worldId++){
                const world=GAME_DATA.getWorld(worldId),stars=world.levels.reduce((sum,id)=>sum+getLevelBestStars(id),0),maximum=world.levels.length*3,pct=Math.round(stars/maximum*100);
                const card=document.createElement('article');card.className='world-mastery-card r83-world-card'+(stars>=maximum?' mastered':'');
                card.style.setProperty('--world-accent',world.accent);
                card.innerHTML=`<img loading="lazy" class="r83-world-cover" src="${r80Cover(worldId)}" alt="" aria-hidden="true"/><div class="r83-world-body"><b>${R78Icons.html(R78Icons.world(worldId))} ${world.name}</b><p>${world.subtitle}</p><div class="meta-progress"><i style="width:${pct}%;background:${world.accent}"></i></div><div class="meta-progress-label"><span>${stars}/${maximum} ★</span><span>${stars>=maximum?'ОСВОЕН':'В ПРОЦЕССЕ'}</span></div></div>`;
                worlds.appendChild(card);
            }
        }
        if(window.R83Archive) R83Archive.refresh('profile');
    }
    function arsenalRequirementMet(entry) {
        return !!(entry && getLevelBestStars(entry.requiredLevel) > 0);
    }
    function getArsenalPurchaseState(towerId) {
        const entry = ARSENAL[towerId], tower = TOWER_TYPES[towerId];
        if (!entry || !tower) return null;
        const owned = isTowerUnlocked(towerId);
        const requirementMet = arsenalRequirementMet(entry);
        const affordable = state.stars >= entry.priceStars;
        return { entry, tower, owned, requirementMet, affordable, missing:Math.max(0,entry.priceStars-state.stars) };
    }
    function renderTowerLoadout() {
        const host = document.getElementById('tower-loadout');
        const reserve = document.getElementById('tower-reserves');
        const summary = document.getElementById('tower-loadout-summary');
        if (!host || !reserve) return;
        const equipped = equippedTowerIds();
        selectedTowerLoadoutSlot = Math.max(0, Math.min(TOWER_ACTIVE_SLOTS-1, selectedTowerLoadoutSlot));
        const available = TOWER_IDS.filter(isTowerUnlocked).length;
        if (summary) summary.textContent = `В бою ${equipped.length} из ${TOWER_ACTIVE_SLOTS} · открыто ${available} из ${TOWER_IDS.length} башен. ` +
          (TOWER_IDS.length <= TOWER_ACTIVE_SLOTS ? 'Новые чертежи появляются после боссов.' : 'Выберите слот, затем башню из резерва.');
        host.replaceChildren(); reserve.replaceChildren();
        for (let i=0; i<equipped.length; i++) {
            const id=equipped[i], tower=TOWER_TYPES[id];
            const btn=document.createElement('button'); btn.type='button';
            btn.className='r67-tower-slot'+(i===selectedTowerLoadoutSlot?' selected':'')+(isTowerUnlocked(id)?'':' locked');
            btn.dataset.towerSlot=String(i);
            btn.setAttribute('aria-label', `Слот ${i+1}: ${tower.name}${isTowerUnlocked(id)?'':', закрыта'}`);
            btn.setAttribute('aria-pressed', i===selectedTowerLoadoutSlot?'true':'false');
            const img=document.createElement('img'); img.src=`images/ui_${tower.assetKey}.webp?v=r91-6-1.6.21.6`; img.alt=''; img.loading='lazy';
            const label=document.createElement('span'); label.textContent=tower.name;
            const num=document.createElement('small'); num.textContent=String(i+1);
            btn.append(img,label,num); host.appendChild(btn);
        }
        const reserves=TOWER_IDS.filter(id=>!equipped.includes(id));
        reserve.hidden=reserves.length===0;
        for (const id of reserves) {
            const tower=TOWER_TYPES[id], unlocked=isTowerUnlocked(id);
            const btn=document.createElement('button'); btn.type='button';
            btn.className='r67-reserve-tower'; btn.dataset.reserveTower=id; btn.disabled=!unlocked;
            const img=document.createElement('img'); img.src=`images/ui_${tower.assetKey}.webp?v=r91-6-1.6.21.6`; img.alt=''; img.loading='lazy';
            const label=document.createElement('span'); label.textContent=unlocked?tower.name:`${tower.name} · закрыта`;
            btn.append(img,label); reserve.appendChild(btn);
        }
        if (host.dataset.delegated!=='1') {
            host.addEventListener('click',event=>{
                const btn=event.target.closest('[data-tower-slot]'); if(!btn) return;
                selectedTowerLoadoutSlot=Number(btn.dataset.towerSlot)||0; renderArsenal();
            }); host.dataset.delegated='1';
        }
        if (reserve.dataset.delegated!=='1') {
            reserve.addEventListener('click',event=>{
                const btn=event.target.closest('[data-reserve-tower]'); if(!btn || btn.disabled) return;
                assignTowerToLoadout(selectedTowerLoadoutSlot,btn.dataset.reserveTower);
            }); reserve.dataset.delegated='1';
        }
    }
    // R82 Renaissance catalogue: all ten canonical towers, with no gameplay data overrides.
    function renderArsenal() {
        renderTowerLoadout();
        const box=document.getElementById('arsenal-ui'); if(!box) return;
        const equipped=equippedTowerIds();
        const entries=TOWER_IDS.map(function(id){
            const tower=TOWER_TYPES[id], info=ARSENAL[id]?getArsenalPurchaseState(id):null;
            return info?Object.assign({base:false},info):{entry:null,tower,base:true,owned:isTowerUnlocked(id),requirementMet:true,affordable:true,missing:0};
        }).sort((a,b)=>a.tower.order-b.tower.order);
        const total=TOWER_IDS.filter(isTowerUnlocked).length;
        const summary=document.getElementById('arsenal-summary');
        if(summary){
            summary.replaceChildren();
            const strong=document.createElement('strong'); strong.textContent=`Открыто ${total} из ${TOWER_IDS.length} башен`;
            const text=document.createElement('span'); text.textContent=`${TOWER_ACTIVE_SLOTS} активных слотов · ${state.stars}★ доступно · выберите слот и замените башню из резерва.`;
            summary.append(strong,text);
        }
        box.replaceChildren(); const fragment=document.createDocumentFragment();
        entries.forEach(function(info){
            const {tower,entry,base,owned,requirementMet,affordable,missing}=info;
            const activeIndex=equipped.indexOf(tower.id);
            const category=(tower.attackMode==='support'||tower.attackMode==='seal')?'support':(tower.damageKind==='physical'?'physical':'energy');
            const card=document.createElement('article');
            card.className='arsenal-card r82-tower-card '+(owned?'owned':'locked')+(activeIndex>=0?' equipped':'');
            card.dataset.r82Kind=category;card.dataset.r82Tower=tower.id;
            const artStage=document.createElement('div');artStage.className='r82-tower-art-stage';
            const picture=document.createElement('img');picture.className='r82-tower-art';picture.src=`images/ui-r82/tower-${tower.id}.webp`;picture.alt='';picture.loading='lazy';picture.decoding='async';
            const serial=document.createElement('span');serial.className='r82-art-serial';serial.textContent=`КЛАСС ${String(tower.order).padStart(2,'0')}`;
            artStage.append(picture,serial);
            const body=document.createElement('div');body.className='r82-tower-info';
            const row=document.createElement('div');row.className='r82-name-row';
            const heading=document.createElement('h3');heading.textContent=tower.name;
            const badge=document.createElement('span');badge.className='r82-role-tag';badge.textContent=tower.role;
            row.append(heading,badge);
            const hint=document.createElement('p');hint.className='r82-tower-hint';hint.textContent=tower.roleHint;
            const facts=document.createElement('dl');facts.className='r82-facts';
            const appendFact=(label,value)=>{const term=document.createElement('div');term.className='r82-fact';const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=String(value);term.append(dt,dd);facts.appendChild(term);};
            appendFact('ПОСТРОЙКА',`${tower.cost} зол.`);appendFact('РАДИУС',`${tower.range} ед.`);
            appendFact('ТИП',category==='support'?'Поддержка':tower.damageKind==='physical'?'Физический':'Энергия');
            appendFact(tower.attackMode==='support'||tower.attackMode==='seal'?'ДЕЙСТВИЕ':'УРОН',
                tower.attackMode==='support'?'Аура':tower.attackMode==='seal'?'Печать':`${tower.damage} / удар`);
            const status=document.createElement('div');status.className='r82-status';
            const action=document.createElement('button');action.type='button';action.className='arsenal-buy r82-tower-action';
            if(owned){
                if(activeIndex>=0){status.textContent=`Оснащена · слот ${activeIndex+1} из ${TOWER_ACTIVE_SLOTS}`;action.textContent='В БОЕВОМ НАБОРЕ';action.disabled=true;}
                else{status.textContent=base?'Базовая башня · доступна':'Чертёж приобретён · в резерве';
                    action.dataset.r82Equip=tower.id;action.textContent=`ПОСТАВИТЬ В СЛОТ ${selectedTowerLoadoutSlot+1}`;}
            }else if(!requirementMet){status.textContent=entry.unlockText;action.textContent=`НУЖЕН УР. ${entry.requiredLevel}`;action.disabled=true;}
            else if(!affordable){status.textContent=`Недостаёт ${missing}★`;action.textContent=`ЧЕРТЁЖ · ${entry.priceStars}★`;action.disabled=true;}
            else{status.textContent='Чертёж доступен за звёзды кампании';action.textContent=`ОТКРЫТЬ · ${entry.priceStars}★`;action.dataset.arsenalTower=tower.id;}
            body.append(row,hint,facts,status,action);card.append(artStage,body);fragment.appendChild(card);
        });
        box.appendChild(fragment);
        if(box.dataset.arsenalDelegated!=='1'){
            box.addEventListener('click',function(event){
                const equip=event.target.closest('[data-r82-equip]');
                if(equip&&!equip.disabled){assignTowerToLoadout(selectedTowerLoadoutSlot,equip.dataset.r82Equip);return;}
                const purchase=event.target.closest('[data-arsenal-tower]');
                if(purchase&&!purchase.disabled)buyArsenalTower(purchase.dataset.arsenalTower);
            });box.dataset.arsenalDelegated='1';
        }
        if(window.R82Gallery)R82Gallery.refresh('tower');
    }
    function buyArsenalTower(towerId) {
        const info=getArsenalPurchaseState(towerId); if(!info||info.owned||!info.requirementMet||!info.affordable) return false;
        const bit=towerUnlockBit(towerId); if(bit<LEGACY_BASE_TOWER_COUNT||bit>=TOWER_SYSTEM.capacity) return false;
        state.stars-=info.entry.priceStars;
        expansionProgress.towerUnlockMask = Number(expansionProgress.towerUnlockMask||0) | Math.pow(2,bit);
        playSfx('upgrade'); syncCurrencyDisplays(); renderTowerButtons(); renderArsenal(); updateMetaQuickSummary(); renderProgressPlan();
        GameSave.save('arsenal-unlock:'+towerId);
        showMetaToast(`⚙️ ${info.tower.name} открыта. Теперь башня доступна в бою.`, 'achievement');
        return true;
    }

    function arcanaRequirementMet(entry) {
        return !!(entry && getLevelBestStars(entry.requiredLevel) > 0);
    }
    function getArcanaPurchaseState(skillId) {
        const id=Number(skillId), entry=ARCANA[id], skill=GAME_DATA.skills && GAME_DATA.skills[id];
        if(!entry||!skill) return null;
        const owned=isSkillUnlocked(id), requirementMet=arcanaRequirementMet(entry), affordable=state.stars>=entry.priceStars;
        return { id, entry, skill, owned, requirementMet, affordable, missing:Math.max(0,entry.priceStars-state.stars) };
    }
    function buyArcanaSkill(skillId) {
        const info=getArcanaPurchaseState(skillId);
        if(!info||info.owned||!info.requirementMet||!info.affordable) return false;
        const bit=expansionSkillUnlockBit(info.id);
        if(bit<0||bit>=(SKILL_SYSTEM.expansionSkillIds||[]).length) return false;
        state.stars-=info.entry.priceStars;
        expansionProgress.newSpellUnlockMask = Number(expansionProgress.newSpellUnlockMask||0) | Math.pow(2,bit);
        playSfx('upgrade'); syncCurrencyDisplays(); renderSkillsUI(); renderMagic(); updateMetaQuickSummary(); renderProgressPlan();
        GameSave.save('arcana-unlock:'+info.id);
        showMetaToast(`${info.skill.icon} ${info.skill.shortName} изучено. Выберите слот боевой колоды.`, 'achievement');
        return true;
    }
    function assignSkillToLoadout(slotIndex, skillId) {
        const slotCount=Math.max(1,Number(SKILL_SYSTEM.activeSlots)||5);
        const slot=Math.max(0,Math.min(slotCount-1,Number(slotIndex)||0));
        const id=Number(skillId);
        if(!GAME_DATA.skills[id]||!isSkillUnlocked(id)) return false;
        const loadout=normalizeSkillLoadout(expansionProgress.skillLoadout);
        const existing=loadout.indexOf(id);
        if(existing===slot) return false;
        const displaced=loadout[slot];
        if(existing>=0) loadout[existing]=displaced;
        loadout[slot]=id;
        if(!setSkillLoadout(loadout,'skill-loadout')) return false;
        selectedMagicLoadoutSlot=slot;
        renderMagic();
        showMetaToast(`${GAME_DATA.skills[id].icon} ${GAME_DATA.skills[id].shortName} назначено в слот ${slot+1}.`, 'info');
        return true;
    }
    // R82: consistent medallion masters across Royal Arsenal and Royal Magic.
    function createRoyalRune(skillId) {
        const img=document.createElement('img');
        img.className='r62-rune-art r82-rune-art';img.alt='';img.setAttribute('aria-hidden','true');
        img.width=64;img.height=64;img.src=`images/ui-r82/spell-${Number(skillId)}.webp`+([1,9].includes(Number(skillId))?'?v=r91-4-1.6.21.4':'');
        return img;
    }
    function renderMagic() {
        const box=document.getElementById('magic-ui'), slots=document.getElementById('magic-loadout');
        if(!box||!slots) return;
        const loadout=normalizeSkillLoadout(expansionProgress.skillLoadout);
        const slotCount=Math.max(1,Number(SKILL_SYSTEM.activeSlots)||5);
        selectedMagicLoadoutSlot=Math.max(0,Math.min(slotCount-1,selectedMagicLoadoutSlot));
        const unlockedTotal=SKILL_IDS.filter(isSkillUnlocked).length;
        const summary=document.getElementById('magic-summary');
        if(summary){
            summary.replaceChildren();
            const strong=document.createElement('strong');strong.textContent=`Колода ${loadout.length}/${slotCount} · изучено ${unlockedTotal}/${SKILL_IDS.length}`;
            const span=document.createElement('span');span.textContent=`Выбран слот ${selectedMagicLoadoutSlot+1} · доступно ${state.stars}★ · заклинания можно менять без потери других слотов.`;
            summary.append(strong,span);
        }
        slots.replaceChildren();const slotFrag=document.createDocumentFragment();
        loadout.forEach(function(id,index){
            const def=GAME_DATA.skills[id];
            const button=document.createElement('button');button.type='button';
            button.className='magic-slot r82-spell-slot'+(index===selectedMagicLoadoutSlot?' selected':'');
            button.dataset.magicSlot=String(index);button.setAttribute('aria-pressed',String(index===selectedMagicLoadoutSlot));
            button.setAttribute('aria-label',`Слот ${index+1}: ${def.shortName||def.name}`);
            const icon=document.createElement('span');icon.className='magic-slot-icon';icon.appendChild(createRoyalRune(id));
            const copy=document.createElement('span');copy.className='magic-slot-copy';
            const small=document.createElement('small');small.textContent=`СЛОТ ${index+1}`;
            const name=document.createElement('b');name.textContent=def.shortName;
            copy.append(small,name);button.append(icon,copy);slotFrag.appendChild(button);
        });slots.appendChild(slotFrag);
        if(slots.dataset.magicDelegated!=='1'){
            slots.addEventListener('click',function(event){
                const btn=event.target.closest('[data-magic-slot]');if(!btn)return;
                selectedMagicLoadoutSlot=Math.max(0,Math.min(slotCount-1,Number(btn.dataset.magicSlot)||0));renderMagic();
            });slots.dataset.magicDelegated='1';
        }
        box.replaceChildren();const fragment=document.createDocumentFragment();
        SKILL_IDS.forEach(function(id){
            const def=GAME_DATA.skills[id],unlocked=isSkillUnlocked(id),equippedIndex=loadout.indexOf(id),arcana=getArcanaPurchaseState(id);
            const cooldown=Math.round(def.cooldownFrames/GAME_NOMINAL_FPS);
            const card=document.createElement('article');
            card.className='magic-card r82-spell-card'+(equippedIndex>=0?' equipped':(unlocked?' available':' locked'));
            card.dataset.r82Magic=equippedIndex>=0?'equipped':unlocked?'available':'locked';
            card.dataset.r82Skill=String(id);
            const art=document.createElement('div');art.className='r82-magic-art';art.appendChild(createRoyalRune(id));
            const body=document.createElement('div');body.className='r82-magic-body';
            const row=document.createElement('div');row.className='r82-name-row';
            const h=document.createElement('h3');h.textContent=def.shortName;
            const role=document.createElement('span');role.className='r82-role-tag';role.textContent=def.role||'Способность';row.append(h,role);
            const desc=document.createElement('p');desc.textContent=def.description||'';
            const fact=document.createElement('div');fact.className='r82-spell-facts';
            const cd=document.createElement('strong');cd.textContent=`ПЕРЕЗАРЯДКА · ${cooldown} с`;
            const special=document.createElement('span');special.textContent=`Печать ${String(id).padStart(2,'0')} / ${SKILL_IDS.length}`;
            fact.append(cd,special);
            const status=document.createElement('div');status.className='magic-status r82-status';
            const action=document.createElement('button');action.type='button';action.className='magic-action';
            if(equippedIndex>=0){
                status.textContent=`Активно в слоте ${equippedIndex+1}`;action.dataset.magicAssign=String(id);
                action.textContent=equippedIndex===selectedMagicLoadoutSlot?'В ВЫБРАННОМ СЛОТЕ':`ПОМЕНЯТЬ СО СЛОТОМ ${selectedMagicLoadoutSlot+1}`;
                action.disabled=equippedIndex===selectedMagicLoadoutSlot;
            }else if(unlocked){status.textContent='Изучено · готово к назначению';action.dataset.magicAssign=String(id);action.textContent=`НАЗНАЧИТЬ В СЛОТ ${selectedMagicLoadoutSlot+1}`;}
            else if(def.unlockCastleKey){status.textContent='Открывается улучшением крепости в разделе «Замок»';action.textContent='НУЖНО УЛУЧШЕНИЕ ЗАМКА';action.disabled=true;}
            else if(arcana){
                action.classList.add('purchase');action.dataset.magicPurchase=String(id);
                if(!arcana.requirementMet){status.textContent=arcana.entry.unlockText;action.textContent=`НУЖЕН УР. ${arcana.entry.requiredLevel}`;action.disabled=true;}
                else if(!arcana.affordable){status.textContent=`Не хватает ${arcana.missing}★`;action.textContent=`ИЗУЧИТЬ · ${arcana.entry.priceStars}★`;action.disabled=true;}
                else{status.textContent='Можно изучить за звёзды кампании';action.textContent=`ИЗУЧИТЬ · ${arcana.entry.priceStars}★`;}
            }else{status.textContent='Заклинание закрыто';action.textContent='ЗАКРЫТО';action.disabled=true;}
            body.append(row,desc,fact,status,action);card.append(art,body);fragment.appendChild(card);
        });box.appendChild(fragment);
        if(box.dataset.magicDelegated!=='1'){
            box.addEventListener('click',function(event){
                const purchase=event.target.closest('[data-magic-purchase]');
                if(purchase&&!purchase.disabled){buyArcanaSkill(Number(purchase.dataset.magicPurchase));return;}
                const assign=event.target.closest('[data-magic-assign]');
                if(assign&&!assign.disabled)assignSkillToLoadout(selectedMagicLoadoutSlot,Number(assign.dataset.magicAssign));
            });box.dataset.magicDelegated='1';
        }
        if(window.R82Gallery)R82Gallery.refresh('magic');
    }

    function renderCastle() {
        const starsEl=document.getElementById('ui-stars'); if(starsEl) starsEl.innerText=state.stars;
        const c=document.getElementById('castle-ui'); if(!c) return; c.innerHTML='';
        const points=castleUpgradePoints(), rank=getCastleRank();
        const summary=document.getElementById('castle-summary'); if(summary) summary.textContent=`${rank.icon} ${rank.name} · ${points}/${META_PROGRESSION.castleMaxPoints} улучшений · лимит башен ${getTowerLimit()}. Постоянные бонусы действуют на всех уровнях и синхронизируются с облаком.`;
        const recommendation = findRecommendedCastleUpgrade();
        const guidance=document.getElementById('castle-guidance');
        if (guidance) {
            if (recommendation) {
                const need = Math.max(0, recommendation.cost - state.stars);
                guidance.innerHTML = recommendation.affordable
                    ? `⭐ Доступно ${state.stars}★. Рекомендация: купить <b>${recommendation.upgrade.title}</b> — это самый полезный следующий шаг для кампании.`
                    : `⭐ Доступно ${state.stars}★. До следующего полезного улучшения <b>${recommendation.upgrade.title}</b> не хватает ${need}★.`;
            } else guidance.textContent = `🏰 Все улучшения штаба куплены. Теперь цель — ${MAX_CAMPAIGN_STARS}★, достижения и полный бестиарий.`;
        }
        Object.keys(CASTLE_UPGRADES).forEach(function(key){
            const u=CASTLE_UPGRADES[key], lvl=metaStats[key], cost=u.cost[lvl], maxed=lvl>=u.max, missing=Math.max(0, Number(cost||0)-state.stars);
            let dots=''; for(let i=0;i<u.max;i++) dots+=`<span class="dot ${i<lvl?'filled':''}"></span>`;
            const note = maxed ? 'Полностью улучшено' : (missing>0 ? `Нужно ещё ${missing}★` : 'Можно купить сейчас');
            const ready=!maxed&&state.stars>=cost;
            c.innerHTML+=`<article class="castle-card r65-upgrade ${maxed?'maxed':(ready?'affordable':'pending')}" data-r65-upgrade="${key}"><div class="r65-upgrade-head"><span class="r65-upgrade-icon" aria-hidden="true"></span><div class="r65-upgrade-title"><small>УЛУЧШЕНИЕ КРЕПОСТИ</small><h3>${u.title}</h3></div><span class="r65-upgrade-rank">${lvl} / ${u.max}</span></div><div class="r65-upgrade-track" aria-label="Куплено уровней: ${lvl} из ${u.max}"><div class="lvl-dots">${dots}</div><span>РАНГ</span></div><p>${u.desc}</p><div class="r65-upgrade-actions"><button class="btn-upgrade" ${maxed||!ready?'disabled':''} onclick="buyCastle('${key}')">${maxed?'✓ УЛУЧШЕНО':`УСИЛИТЬ · ${cost} ★`}</button><span class="castle-cost-note">${note}</span></div></article>`;
        });
        if (window.R81HQ) window.R81HQ.decorate(state.stars, metaStats, CASTLE_UPGRADES, points, rank.name);
    }
    function renderProgressPlan() {
        const box=document.getElementById('progress-plan-ui'); if(!box) return;
        const nextLevel=findNextUnlockedUnbeatenLevel();
        const nextLevelObj=GAME_DATA.getLevel(nextLevel);
        const nextWorld=GAME_DATA.getWorld(nextLevelObj.worldId);
        const upgrade=findRecommendedCastleUpgrade();
        const rankInfo=getNextRankInfo();
        const steps=[
            { iconAsset:'menu_story.svg', title:'Кампания', text:`Пройдено ${completedLevelsTotal()}/${TOTAL_LEVELS} уровней. Текущий доступный рубеж: ${state.maxUnlockedLevel}/${TOTAL_LEVELS}.`, state: completedLevelsTotal()>=TOTAL_LEVELS?'done':'current', status: `${campaignStarsTotal()}/${MAX_CAMPAIGN_STARS}★` },
            { iconAsset:'quest-target.svg', title:`Следующий уровень: ${nextLevel}`, text:`${nextWorld.name} · ${nextLevelObj.title}. ${nextLevelObj.bossId ? 'Боссовый бой, проверьте штаб перед стартом.' : (nextLevelObj.objective || nextLevelObj.tip || 'Удержите рубеж.')}`, state: getLevelBestStars(nextLevel)>0?'done':'current', status: starText(getLevelBestStars(nextLevel)) },
            { iconAsset:'castle_tab.svg', title:'Штаб', text: upgrade ? (upgrade.affordable ? `Купите «${upgrade.upgrade.title}» за ${upgrade.cost}★.` : `Накопите ещё ${Math.max(0,upgrade.cost-state.stars)}★ на «${upgrade.upgrade.title}».`) : 'Все постоянные улучшения куплены.', state: upgrade ? (upgrade.affordable?'current':'locked') : 'done', status: `${castleUpgradePoints()}/${META_PROGRESSION.castleMaxPoints}` },
            { iconAsset:'arsenal_tab.svg', title:'Арсенал', text:(function(){ const pending=Object.keys(ARSENAL).map(getArsenalPurchaseState).filter(x=>x&&!x.owned); if(!pending.length) return 'Все дополнительные башни открыты.'; const ready=pending.find(x=>x.requirementMet); return ready ? (ready.affordable ? `Доступен чертёж «${ready.tower.name}» за ${ready.entry.priceStars}★.` : `Для чертежа «${ready.tower.name}» нужно ещё ${ready.missing}★.`) : pending[0].entry.unlockText; })(), state:Object.keys(ARSENAL).every(id=>isTowerUnlocked(id))?'done':'locked', status:`${Object.keys(ARSENAL).filter(id=>isTowerUnlocked(id)).length}/${Object.keys(ARSENAL).length}` },
            { iconAsset:'magic_tab.svg', title:'Боевая магия', text:(function(){ const pending=Object.keys(ARCANA).map(getArcanaPurchaseState).filter(x=>x&&!x.owned); if(!pending.length) return 'Все дополнительные тактики изучены — настройте колоду 5 из 9.'; const ready=pending.find(x=>x.requirementMet); return ready ? (ready.affordable ? `Можно изучить «${ready.skill.shortName}» за ${ready.entry.priceStars}★.` : `Для «${ready.skill.shortName}» нужно ещё ${ready.missing}★.`) : pending[0].entry.unlockText; })(), state:Object.keys(ARCANA).every(id=>isSkillUnlocked(Number(id)))?'done':'locked', status:`${Object.keys(ARCANA).filter(id=>isSkillUnlocked(Number(id))).length}/${Object.keys(ARCANA).length}` },
            { iconAsset:'crown-rank.svg', title:'Ранг защитника', text: rankInfo.next ? `До ранга «${rankInfo.next.name}» осталось ${rankInfo.remaining} улучш.` : 'Максимальный ранг уже получен.', state: rankInfo.next?'locked':'done', status: rankInfo.next ? 'след. ранг' : 'макс.' },
            { iconAsset:'achievement_tab.svg', title:'Достижения и бестиарий', text:`Достижения: ${countBits(metaProgress.achievementMask)}/${META_PROGRESSION.achievements.length}. Бестиарий: ${bestiaryEntriesTotal()}/${BESTIARY_TOTAL}.`, state: countBits(metaProgress.achievementMask)>=META_PROGRESSION.achievements.length && bestiaryEntriesTotal()>=BESTIARY_TOTAL ? 'done':'locked', status:'доп. цели' }
        ];
        box.innerHTML = steps.map(step=>`<article class="progress-plan-step ${step.state}"><div class="step-icon"><img src="images/ui-r78/icons/${step.iconAsset}" alt="" aria-hidden="true"></div><div><b>${step.title}</b><span>${step.text}</span></div><strong>${step.status}</strong></article>`).join('');
    }
    function renderMetaHub(){ renderMetaHeader(); renderCastle(); renderArsenal(); renderMagic(); renderChronicles(); renderAchievements(); renderBestiary(); renderProfile(); renderProgressPlan(); updateMetaQuickSummary(); }
    function switchMetaTab(tab){
        activeMetaTab=['castle','arsenal','magic','chronicles','achievements','bestiary','profile','plan'].includes(tab)?tab:'castle';
        document.querySelectorAll('.meta-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.metaTab===activeMetaTab));
        document.querySelectorAll('.meta-panel').forEach(panel=>panel.classList.toggle('active',panel.id==='meta-panel-'+activeMetaTab));
        if(activeMetaTab==='castle') renderCastle(); else if(activeMetaTab==='arsenal') renderArsenal(); else if(activeMetaTab==='magic') renderMagic(); else if(activeMetaTab==='chronicles') renderChronicles(); else if(activeMetaTab==='achievements') renderAchievements(); else if(activeMetaTab==='bestiary') renderBestiary(); else if(activeMetaTab==='profile') renderProfile(); else renderProgressPlan();
        document.querySelectorAll('.meta-tab').forEach(btn=>{ const on=btn.dataset.metaTab===activeMetaTab; btn.setAttribute('aria-selected', on?'true':'false'); btn.tabIndex=on?0:-1; });
        const activeNav=document.querySelector('.meta-tab.active');
        if(activeNav && window.innerWidth <= 900) { const nav=activeNav.parentElement; if(nav) nav.scrollLeft = Math.max(0, activeNav.offsetLeft - nav.offsetLeft - 10); }
        const activePanel=document.getElementById('meta-panel-'+activeMetaTab); if(activePanel) activePanel.scrollTop=0;
    }
    function openMetaHub(tab){
        state.screen='meta'; setPauseButtonVisible(false); clearWavePreparation(); stopGameLoop();
        document.querySelectorAll('.screen').forEach(el=>el.classList.add('hidden'));
        document.getElementById('screen-meta').classList.remove('hidden');
        const advice=document.getElementById('r65-castle-advice');
        if(advice && advice.dataset.r65Initialized!=='1'){
            advice.open=!(window.innerHeight<=360 && window.innerWidth<=600);
            advice.dataset.r65Initialized='1';
        }
        renderMetaHub(); switchMetaTab(tab||activeMetaTab);
        document.getElementById('r65-tab-'+activeMetaTab)?.focus({preventScroll:true});
    }
    function openCastle(){ openMetaHub('castle'); }
    // ================= /V25 Meta Hub =================

    let prepInterval = null;
    let tutorialStep = 0;
    const TUTORIAL_STEPS = [
        { iconAsset: 'castle_tab', title: 'Защитите замок', text: 'Враги движутся по дороге к крепости. Ваша задача — остановить их башнями, пока здоровье замка не закончилось.' },
        { iconAsset: 'tower_arrow', title: 'Постройте оборону', text: 'Выберите башню в нижней панели. На арене появятся проверенные площадки. Нажмите на или рядом с выбранной площадкой. Одновременно можно иметь 10 башен; штаб расширяет лимит до 16.' },
        { iconAsset: 'upgrading-anvil', title: 'Улучшайте башни', text: 'Нажмите на построенную башню. У каждой есть две ветки развития. Выберите стратегию или продайте башню, если хотите перестроить оборону.' },
        { iconAsset: 'wave_warning', title: 'Готовьтесь к волнам', text: 'Перед каждой атакой есть время на строительство. Используйте способности в трудный момент и не забудьте: каждый пятый уровень заканчивается боссом.' },
        { iconAsset: 'triple-stars', title: 'Звёзды и штаб', text: 'После победы вы получите 1–3 звезды. Тратьте их в штабе на здоровье замка, способности и расширение гарнизона, которое повышает лимит башен.' }
    ];

    // ================= V9 — FPS-independent Game Loop =================
    const GAME_NOMINAL_FPS = 60;
    const GAME_FRAME_MS = 1000 / GAME_NOMINAL_FPS;
    const GAME_MAX_DELTA_MS = 50; // never simulate more than 3 nominal frames at once
    let gameClockLastTs = 0;
    let gameClockWasPlaying = false;
    let gameRafId = 0;

    function resetGameClock() {
        gameClockLastTs = 0;
        gameClockWasPlaying = false;
        state.loopDeltaMs = 0;
        state.loopDeltaFrames = 0;
    }

    function gameDeltaFrames(timestamp) {
        const playing = state.screen === 'play';
        if (!playing) {
            gameClockLastTs = Number(timestamp) || performance.now();
            gameClockWasPlaying = false;
            state.loopDeltaMs = 0;
            state.loopDeltaFrames = 0;
            return 0;
        }
        const now = Number(timestamp) || performance.now();
        if (!gameClockLastTs || !gameClockWasPlaying) {
            gameClockLastTs = now;
            gameClockWasPlaying = true;
            state.loopDeltaMs = 0;
            state.loopDeltaFrames = 0;
            return 0;
        }
        const rawMs = Math.max(0, now - gameClockLastTs);
        Reforged.observe(rawMs);
        gameClockLastTs = now;
        const deltaMs = Math.min(rawMs, GAME_MAX_DELTA_MS);
        const frames = deltaMs / GAME_FRAME_MS;
        state.loopDeltaMs = deltaMs;
        state.loopDeltaFrames = frames;
        return frames;
    }

    function startGameLoop() {
        if (gameRafId || state.screen !== 'play') return;
        if (isTouchPhonePortrait()) { syncPortraitBattleGuard(); return; }
        resetGameClock();
        gameRafId = requestAnimationFrame(gameLoop);
    }

    function stopGameLoop() {
        if (gameRafId) cancelAnimationFrame(gameRafId);
        gameRafId = 0;
        resetGameClock();
    }

    function chancePerNominalFrame(probability, deltaFrames) {
        const p = Math.max(0, Math.min(1, Number(probability) || 0));
        const dt = Math.max(0, Number(deltaFrames) || 0);
        return 1 - Math.pow(1 - p, dt);
    }

    function smoothingFactor(perFrameFactor, deltaFrames) {
        const f = Math.max(0, Math.min(1, Number(perFrameFactor) || 0));
        return 1 - Math.pow(1 - f, Math.max(0, Number(deltaFrames) || 0));
    }

    function nominalEventCount(deltaFrames, eventsPerFrame = 1) {
        const expected = Math.max(0, Number(deltaFrames) || 0) * Math.max(0, Number(eventsPerFrame) || 0);
        const whole = Math.floor(expected);
        return whole + (Math.random() < expected - whole ? 1 : 0);
    }

    function screenShake(mag) { Reforged.camera.impulse(mag, mag > 12 ? 3 : 1); }
    function getCastleMaxLives() {
        const base = activeLevelConfig && Number(activeLevelConfig.baseLives) > 0 ? Number(activeLevelConfig.baseLives) : 20;
        return Math.max(1, base + (Number(metaStats.hp) || 0) * 5);
    }
    function applyCastleDamage(amount) {
        let pending = Math.max(0, Math.round(Number(amount) || 0));
        let absorbed = 0;
        if (pending > 0 && state.bastionTimer > 0 && state.bastionShield > 0) {
            absorbed = Math.min(pending, Math.max(0, Math.round(state.bastionShield)));
            state.bastionShield = Math.max(0, state.bastionShield - absorbed);
            pending -= absorbed;
            if (absorbed > 0) {
                addFloatText(930, 92, `${state.castleShieldSource === 8 ? 'БАРЬЕР' : 'БАСТИОН'} −${absorbed}`, '#60a5fa', 16);
                createParticleExplosion(930, 118, '#60a5fa', 8);
            }
        }
        if (pending > 0) state.lives = Math.max(0, state.lives - pending);
        return { damage: pending, absorbed: absorbed };
    }
    // ================= /V9 =================
    // V10: package/preload optimization is implemented above without changing simulation semantics.

    function addFloatText(x, y, text, color, size) { Reforged.floatText(x,y,text,color,size); }

    // R91.2: displacement stays on the enemy's OWN continuous lane. Never select
    // the nearest point of another branch or jump across a loop of the same path.
    const enemyRouteArcCache = new WeakMap();
    function pullEnemyAlongRoute(enemy, targetX, targetY, fraction) {
        const path = enemy.path;
        if (!Array.isArray(path) || path.length < 2 || !Number.isFinite(enemy.x + enemy.y + targetX + targetY)) return;
        const f = Math.max(0, Math.min(1, Number(fraction) || 0));
        if (!f) return;
        let arcs = enemyRouteArcCache.get(path);
        if (!arcs) {
            arcs = [0];
            for (let i = 1; i < path.length; i++) arcs.push(arcs[i-1] + Math.hypot(path[i].x-path[i-1].x, path[i].y-path[i-1].y));
            enemyRouteArcCache.set(path, arcs);
        }
        const segment = Math.max(1, Math.min(path.length-1, Math.floor(enemy.pathIndex) || 1));
        const a = path[segment-1], b = path[segment];
        const vx = b.x-a.x, vy = b.y-a.y, length = arcs[segment]-arcs[segment-1];
        const offset = length > 0 ? Math.max(0, Math.min(1, ((enemy.x-a.x)*vx+(enemy.y-a.y)*vy)/(length*length))) : 0;
        const current = arcs[segment-1] + offset*length;
        const wantedX = enemy.x+(targetX-enemy.x)*f, wantedY = enemy.y+(targetY-enemy.y)*f;
        const budget = Math.hypot(wantedX-enemy.x, wantedY-enemy.y);
        if (budget < 1e-9) return;
        const low = Math.max(0, current-budget), high = Math.min(arcs[arcs.length-1], current+budget);
        let first = segment;
        while (first > 1 && arcs[first-1] >= low) first--;
        let bestX = a.x+vx*offset, bestY = a.y+vy*offset, bestArc = current, bestSegment = segment;
        let bestDistance = (bestX-wantedX)**2+(bestY-wantedY)**2;
        for (let i = first; i < path.length && arcs[i-1] <= high; i++) {
            const from = path[i-1], to = path[i], len = arcs[i]-arcs[i-1];
            if (len <= 1e-9 || arcs[i] < low) continue;
            const dx = to.x-from.x, dy = to.y-from.y;
            const lo = Math.max(0, (low-arcs[i-1])/len), hi = Math.min(1, (high-arcs[i-1])/len);
            const t = Math.max(lo, Math.min(hi, ((wantedX-from.x)*dx+(wantedY-from.y)*dy)/(len*len)));
            const x = from.x+dx*t, y = from.y+dy*t, candidateArc = arcs[i-1]+len*t;
            const distance = (x-wantedX)**2+(y-wantedY)**2;
            if (distance < bestDistance-1e-9 || (Math.abs(distance-bestDistance)<1e-9 && Math.abs(candidateArc-current)<Math.abs(bestArc-current))) {
                bestX=x; bestY=y; bestArc=candidateArc; bestSegment=i; bestDistance=distance;
            }
        }
        enemy.x=bestX; enemy.y=bestY;
        // Keep the next segment coherent when pulled backwards through a corner.
        // At the exit leave the last node pending: Enemy.update owns castle damage.
        enemy.pathIndex = bestArc >= arcs[bestSegment]-1e-7 && bestSegment < path.length-1 ? bestSegment+1 : bestSegment;
    }

    class HazardZone {
        constructor(x, y, aoe, type="napalm") {
            this.x = x; this.y = y; this.aoe = aoe;
            this.life = type === "blackhole" ? 180 : 120;
            this.type = type;
            this.damageTick = 0;
        }
        update(dtFrames, movementDtFrames = dtFrames) {
            const dt = Math.min(Math.max(0, dtFrames || 0), Math.max(0, this.life));
            if (dt <= 0) return this.life > 0;
            if (this.type === "blackhole") {
                state.enemies.forEach(e => {
                    const d = Math.hypot(e.x - this.x, e.y - this.y);
                    // Time Stop, freeze, stun and the boss entrance suspend movement,
                    // not the spell's existing lifetime or its damage tick schedule.
                    const motionDt = Math.max(0, Math.min(dt, Number(movementDtFrames) || 0)
                        - Math.max(0, e.effects?.stun || 0) - Math.max(0, e.effects?.freeze || 0));
                    if (e.hp > 0 && d <= this.aoe && motionDt > 0 && !(e.isBoss && e.bossSpawnTimer > 0)) {
                        pullEnemyAlongRoute(e, this.x, this.y, 1 - Math.pow(0.95, motionDt));
                    }
                });
                this.damageTick += dt;
                while (this.damageTick >= 5) {
                    this.damageTick -= 5;
                    state.enemies.forEach(e => { if (e.hp > 0 && Math.hypot(e.x - this.x, e.y - this.y) <= this.aoe) e.takeDamage(10, null); });
                }
                if (Math.random() < chancePerNominalFrame(0.5, dt)) createParticle(this.x + (Math.random()*this.aoe*2 - this.aoe), this.y + (Math.random()*this.aoe*2 - this.aoe), '#7c3aed', 1, 1, true);
            } else {
                this.damageTick += dt;
                while (this.damageTick >= 10) {
                    this.damageTick -= 10;
                    state.enemies.forEach(e => { if (e.hp > 0 && Math.hypot(e.x - this.x, e.y - this.y) <= this.aoe) { e.takeDamage(2, null); e.hitFlash = Math.max(e.hitFlash, 2); } });
                }
                if (Math.random() < chancePerNominalFrame(0.3, dt)) createParticle(this.x + (Math.random()*this.aoe - this.aoe/2), this.y + (Math.random()*this.aoe - this.aoe/2), '#ea580c', 1, 1, false, true);
            }
            this.life -= dt;
            return this.life > 0;
        }
        draw() { Reforged.hazard(ctx,this); }
    }

    function createParticle(x,y,color,count,sizeMult=1,isSmoke=false,isLine=false) { Reforged.legacyParticles(x,y,color,count,sizeMult,isSmoke,isLine); }
    function createParticleExplosion(x,y,color,count,isSmoke=false) { Reforged.legacyExplosion(x,y,color,count,isSmoke); }

    // UPDATE60 R7 — short-lived Tesla arcs. The array is tightly capped so chain visuals cannot accumulate.
    class LightningArc {
        constructor(x1, y1, x2, y2, color, width = 3) {
            this.x1=x1; this.y1=y1; this.x2=x2; this.y2=y2; this.color=color || '#67e8f9'; this.width=width;
            this.life=5; this.maxLife=5;
        }
        update(dtFrames) { this.life -= Math.max(0, Number(dtFrames) || 0); return this.life > 0; }
        draw() {
            const alpha=Math.max(0,Math.min(1,this.life/this.maxLife));
            const dx=this.x2-this.x1, dy=this.y2-this.y1;
            const len=Math.max(1,Math.hypot(dx,dy));
            const nx=-dy/len, ny=dx/len;
            const segments=5;
            ctx.save(); ctx.globalAlpha=alpha; ctx.lineCap='round'; ctx.lineJoin='round';
            ctx.shadowColor=this.color; ctx.shadowBlur=10; ctx.strokeStyle=this.color; ctx.lineWidth=this.width;
            ctx.beginPath(); ctx.moveTo(this.x1,this.y1);
            for(let i=1;i<segments;i++) {
                const t=i/segments;
                const jitter=(i%2===0?-1:1)*(3 + ((i*7)%5));
                ctx.lineTo(this.x1+dx*t+nx*jitter,this.y1+dy*t+ny*jitter);
            }
            ctx.lineTo(this.x2,this.y2); ctx.stroke();
            ctx.shadowBlur=0; ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=Math.max(1,this.width*0.38); ctx.stroke();
            ctx.restore();
        }
    }
    function createLightningArc(x1,y1,x2,y2,color,width) {
        if (!Array.isArray(state.lightningArcs)) state.lightningArcs=[];
        if (state.lightningArcs.length >= 24) state.lightningArcs.splice(0,state.lightningArcs.length-23);
        state.lightningArcs.push(new LightningArc(x1,y1,x2,y2,color,width));
    }

    class Enemy {
        constructor(hp, speed, reward, color, radius, type, ccResist = 0, options = {}) {
            this.routeIndex = Math.max(0, Math.min(PATHS.length - 1, Math.floor(Number(options.routeIndex) || 0)));
            this.path = PATHS[this.routeIndex] || PATH;
            this.x = this.path[0].x; this.y = this.path[0].y;
            this.pathIndex = 1; this.maxHp = hp; this.hp = hp;
            this.baseSpeed = speed; this.speed = speed; this.reward = reward; this.radius = radius; 
            this.type = type; this.color = color;
            this.ccResist = ccResist;
            this.isBoss = options.isBoss || false;
            this.bossProfile = options.bossProfile || null;
            this.bossPhase = 0;
            this.bossAbilityTimer = this.bossProfile ? Math.max(45, (Number(this.bossProfile.abilityCooldownFrames) || 0) * 0.55) : 0;
            this.bossAbilityCursor = 0;
            this.bossPendingAbility = null;
            this.bossTelegraphTimer = 0;
            this.bossTelegraphMax = 0;
            this.bossPhaseGuard = 0;
            this.bossCastCount = 0; this.r68SealDelayUsed = 0;
            this.bossTime = Reforged.random() * 180;
            this.bossPhaseFlash = 0;
            this.bossSpawnMax = this.bossProfile ? Math.max(0, Number(this.bossProfile.spawnFrames) || 0) : 0;
            this.bossSpawnTimer = this.bossSpawnMax;
            this.bossDeathMax = this.bossProfile ? Math.max(30, Number(this.bossProfile.deathFrames) || 30) : 30;
            this.bossDeathFxTimer = 0;
            this.bossTelegraphTargets = [];
            this.bossTelegraphTargetsLocked = false;
            this.imgKey = options.imgKey || 'enemy_light';
            this.drawSize = options.drawSize || (this.isBoss ? 130 : 72);
            this.animation = options.animation || null;
            this.animState = 'idle';
            this.animFrame = Math.floor(Reforged.random() * 6);
            this.animCursor = this.animFrame;
            this.animHitRemaining = 0;
            this.physResist = Math.max(0, Math.min(0.65, Number(options.physResist) || 0));
            this.energyResist = Math.max(0, Math.min(0.65, Number(options.energyResist) || 0));
            this.dodgeChance = options.dodgeChance || 0;
            this.isHealer = options.isHealer || false;
            this.castleDamage = Number(options.castleDamage) || (this.isBoss ? 5 : 1);
            this.healBase = Number(options.healBase) || 20;
            this.healPerLevel = Number(options.healPerLevel) || 2;
            this.healRadius = Number(options.healRadius) || 140;
            this.healCooldownFrames = Number(options.healCooldownFrames) || 120;
            this.healCooldown = 0;
            this.archetypeId = options.archetypeId || '';
            this.role = options.role || '';
            this.badge = options.badge || '';
            this.mechanic = options.mechanic || '';
            this.rageThreshold = Number(options.rageThreshold) || 0;
            this.rageSpeedMult = Number(options.rageSpeedMult) || 1;
            this.rageCastleDamage = Number(options.rageCastleDamage) || this.castleDamage;
            this.rageTriggered = false;
            this.shieldMax = Math.max(0, this.maxHp * (Number(options.shieldHpMultiplier) || 0));
            this.shieldHp = this.shieldMax;
            this.hasteAura = !!options.hasteAura;
            this.hasteRadius = Number(options.hasteRadius) || 0;
            this.hasteAuraMult = Number(options.hasteMult) || 1;
            this.hastePulseFrames = Number(options.hastePulseFrames) || 30;
            this.hasteDurationFrames = Number(options.hasteDurationFrames) || 50;
            this.hasteAuraTimer = 0;
            this.hasteMultiplier = 1;
            this.slowImmune = !!options.slowImmune;
            this.freezeImmune = !!options.freezeImmune;
            this.deathSpawnType = Number.isFinite(Number(options.deathSpawnType)) ? Number(options.deathSpawnType) : null;
            this.deathSpawnCount = Math.max(0, Number(options.deathSpawnCount) || 0);
            this.deathSpawnHpFactor = Math.max(0, Number(options.deathSpawnHpFactor) || 0);
            this.deathSpawnRewardFactor = Math.max(0, Number(options.deathSpawnRewardFactor) || 0);
            this.deathSpawnQueued = false;
            this.disableTower = !!options.disableTower;
            this.disableRadius = Number(options.disableRadius) || 0;
            this.disableFrames = Number(options.disableFrames) || 0;
            this.disableCooldownFrames = Number(options.disableCooldownFrames) || 240;
            this.disableCooldown = this.disableCooldownFrames * 0.45;
            this.blink = !!options.blink;
            this.blinkCooldownFrames = Number(options.blinkCooldownFrames) || 210;
            this.blinkNodes = Math.max(1, Number(options.blinkNodes) || 1);
            this.blinkCooldown = this.blinkCooldownFrames;
            // R69 expansion mechanics: fields are zero by default, preserving all legacy enemies.
            this.r69Mechanic = {
                shieldRegenFraction: Math.max(0,Math.min(.10,Number(options.shieldRegenFraction)||0)),
                shieldRegenCooldown: Number(options.shieldRegenCooldownFrames)||360,
                shieldAuraFraction: Math.max(0,Math.min(.12,Number(options.shieldAuraFraction)||0)),
                shieldAuraCap: Math.max(0,Math.min(.20,Number(options.shieldAuraCap)||0)),
                shieldAuraCooldown: Number(options.shieldAuraCooldownFrames)||300,
                shieldAuraRadius: Number(options.shieldAuraRadius)||120,
                shieldAuraTargets: Math.min(4,Number(options.shieldAuraTargets)||3),
                tempoBurstMult: Math.max(1,Math.min(1.5,Number(options.tempoBurstMult)||1)),
                tempoBurstFrames: Number(options.tempoBurstFrames)||70,
                tempoBurstCooldown: Number(options.tempoBurstCooldownFrames)||350,
                tempoBurstRemaining: 0,
                reloadPulseCooldown: Number(options.reloadPulseFrames)||345,
                reloadPulseRadius: Number(options.reloadPulseRadius)||125,
                reloadPulseDelay: Math.min(30,Number(options.reloadPulseDelayFrames)||20),
                rootHealFraction: Math.max(0,Math.min(.06,Number(options.rootHealFraction)||0)),
                rootHealCooldown: Number(options.rootHealCooldownFrames)||270,
                rootHealRadius: Number(options.rootHealRadius)||135,
                rootHealTargets: Math.min(4,Number(options.rootHealTargets)||3),
                stanceCycleFrames: Number(options.stanceCycleFrames)||0,
                stanceTimer: Number(options.stanceCycleFrames)||0,
                stancePhysical: Math.min(.45,Number(options.stancePhysical)||0),
                stanceEnergy: Math.min(.45,Number(options.stanceEnergy)||0),
                stanceOff: Math.min(.12,Number(options.stanceOffResist)||0),
                stance: 0,
                gustPulseCooldown: Number(options.gustPulseFrames)||330,
                gustPulseRadius: Number(options.gustPulseRadius)||135,
                gustAdvanceNodes: Math.min(5,Number(options.gustAdvanceNodes)||3),
                gustTargets: Math.min(4,Number(options.gustTargets)||3)
            };
            this.originalReward = reward;
            this.poisonTick = 0; this.poisonDamage = 2; this.poisonTickFrames = 30; this.poisonSource = null; this.bleedTick = 0; this.bleedSource = null;
            
            this.angle = 0; this.effects = { slow: 0, poison: 0, stun: 0, bleed: 0, freeze: 0, haste: 0 };
            this.brittle = false; this.brittleTimer = 0; this.armorShred = 0; this.armorShredTimer = 0; this.energyVulnerability = 0; this.energyVulnerabilityTimer = 0; this.synergyTextCooldown = 0; this.armorFeedbackCooldown = 0; this.impactFxCooldown = 0; this.lastDamageTower = null; this.hitFlash = 0;
            Reforged.emit('enemy:spawn',this);
        }

        setAnimationState(nextState, reset = false) {
            if (!this.animation || this.isBoss) return;
            if (this.animState === 'death' && nextState !== 'death') return;
            if (this.animState !== nextState || reset) {
                this.animState = nextState;
                this.animCursor = 0;
                this.animFrame = 0;
            }
        }

        animationFpsFor(stateName) {
            if (!this.animation) return 0;
            if (stateName === 'walk') return this.animation.walkFps || 8;
            if (stateName === 'hit') return this.animation.hitFps || 16;
            if (stateName === 'death') return this.animation.deathFps || 8;
            return this.animation.idleFps || 5;
        }

        advanceAnimation(dtFrames, moving = false) {
            const pose=Reforged.advanceEnemy(this,dtFrames,moving);
            if (!this.animation || this.isBoss || this.effects.freeze>0 || this.effects.stun>0) return;
            const dt = Math.max(0, Number(dtFrames) || 0);
            if (this.hp <= 0) {
                if (this.animState !== 'death') this.setAnimationState('death', true);
            } else if (this.animHitRemaining > 0) {
                this.animHitRemaining = Math.max(0, this.animHitRemaining - dt);
                if (this.animState !== 'hit') this.setAnimationState('hit', true);
            } else {
                const desired = moving ? 'walk' : 'idle';
                if (this.animState !== desired) this.setAnimationState(desired, true);
            }
            const frames=Math.max(1,Math.floor((ASSETS[this.animation.assetKey]?.naturalWidth||768)/(this.animation.frameWidth||128)));
            const fps = this.animationFpsFor(this.animState)*(frames/6);
            const frameStep = Math.max(0.001, GAME_NOMINAL_FPS / Math.max(1, fps));
            if(this.animState==='walk')this.animCursor=pose.walk/ (Math.PI*2)*frames;
            else this.animCursor += dt / frameStep;
            this.animFrame=(this.animState==='death'||this.animState==='hit')?Math.min(frames-1,Math.floor(this.animCursor)):Math.floor(this.animCursor)%frames;
        }

        drawAnimationFrame(drawSize, context=ctx) {
            if (!this.animation || this.isBoss) return false;
            const asset = ASSETS[this.animation.assetKey];
            if (!asset || !asset.ready) return false;
            const row=this.animState==='walk'?1:this.animState==='hit'?2:this.animState==='death'?3:0;
            const fw = this.animation.frameWidth || 128, fh = this.animation.frameHeight || 128;
            const frame = Math.max(0, Math.min(Math.floor(asset.naturalWidth/fw)-1, this.animFrame | 0));
            Reforged.drawFrame(context, asset, frame * fw, row * fh, fw, fh, -drawSize/2, -drawSize/2, drawSize, drawSize);
            return true;
        }

        canBeTargeted() {
            // R91.5: finishing a route is terminal even if the object still has HP.
            return this.hp > 0 && this.pathIndex < this.path.length && (!this.isBoss || this.bossSpawnTimer <= 0);
        }

        bossTelegraphTargetPlan(ability) {
            if (!this.bossProfile) return { count:0, mode:'nearest' };
            const p = this.bossProfile, phase = this.bossPhase;
            if (ability === 'ice_seal') return { count:Math.floor(this.bossPhaseValue(p.disableTowerCountByPhase,1)), mode:'nearest' };
            if (ability === 'whiteout') return { count:Math.floor(this.bossPhaseValue(p.whiteoutTowerCountByPhase,2)), mode:'highest' };
            if (ability === 'earthquake') return { count:Math.floor(this.bossPhaseValue(p.disableTowerCountByPhase,1)), mode:'nearest' };
            if (ability === 'boulder_step') return { count:1 + phase, mode:'nearest' };
            if (ability === 'fire_breath') return { count:Math.floor(this.bossPhaseValue(p.disableTowerCountByPhase,1)), mode:'nearest' };
            if (ability === 'meteor_dive') return { count:Math.floor(this.bossPhaseValue(p.meteorTowerCountByPhase,2)), mode:'highest' };
            if (ability === 'shadow_seal') return { count:Math.floor(this.bossPhaseValue(p.shadowSealCountByPhase,2)), mode:'highest' };
            if (ability === 'crown_burst') return { count:Number(p.crownBurstTowerCount) || 4, mode:'highest' };
            if (['anchor_strike','time_lock','root_surge','forge_quake','sky_jolt','origin_break'].includes(ability)) return {count:Math.floor(this.bossPhaseValue(p.controlTowerCountByPhase,1)),mode:'highest'};
            if (ability === 'fracture_seal' || ability === 'future_cut' || ability === 'anvil_strike' || ability === 'name_theft' || ability === 'tempest_roar' || ability === 'reality_break') {
                const mode = (ability === 'future_cut' || ability === 'name_theft' || ability === 'reality_break') ? 'highest' : 'nearest';
                return { count:Math.floor(this.bossPhaseValue(p.controlTowerCountByPhase,1)), mode:mode };
            }
            return { count:0, mode:'nearest' };
        }

        bossPhaseIndex() {
            if (!this.isBoss || !this.bossProfile) return 0;
            const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
            const thresholds = this.bossProfile.phaseThresholds || [];
            if (thresholds.length > 1 && ratio <= thresholds[1] + 1e-12) return 2;
            if (thresholds.length > 0 && ratio <= thresholds[0] + 1e-12) return 1;
            return 0;
        }

        bossPhaseValue(values, fallback = 0) {
            const list = values || [];
            if (!list.length) return fallback;
            const value = list[this.bossPhase] != null ? list[this.bossPhase] : list[list.length - 1];
            return Number(value == null ? fallback : value);
        }

        bossAbilityLabel(id) {
            const labels = {
                war_cry: 'Боевой клич', blood_banner: 'Кровавое знамя', last_charge: 'Последний натиск',
                ice_seal: 'Ледяная печать', whiteout: 'Белая мгла', crystal_aegis: 'Кристальный барьер',
                raise_dead: 'Зов некрополя', soul_drain: 'Похищение души', grave_pact: 'Погребальный договор',
                earthquake: 'Удар Колосса', stone_aegis: 'Каменный бастион', boulder_step: 'Неумолимая поступь',
                fire_breath: 'Огненное дыхание', meteor_dive: 'Метеорный налёт', winged_charge: 'Пламенный рывок',
                void_summon: 'Зов Бездны', shadow_seal: 'Печать Тьмы', shadow_blink: 'Теневой скачок', crown_burst: 'Взрыв Короны',
                rift_guard: 'Осколочный щит', fracture_seal: 'Печать Раскола', rift_charge: 'Рывок Раскола',
                mirror_veil: 'Зеркальная завеса', future_cut: 'Отсечение будущего', mirror_step: 'Шаг отражения',
                forge_servants: 'Ковка сосудов', molten_armor: 'Расплавленный панцирь', anvil_strike: 'Удар наковальни',
                archive_ward: 'Архивная печать', name_theft: 'Кража имени', memory_step: 'Шаг забвения',
                storm_haste: 'Грозовой разгон', tempest_roar: 'Рёв бури', sky_charge: 'Небесный рывок',
                heart_aegis: 'Щит Сердца', void_echo: 'Эхо Пустоты', reality_break: 'Разрыв реальности', rift_step: 'Шаг за грань',
                tidal_guard:'Барьер прилива',depth_muster:'Флот Глубин',anchor_strike:'Удар якоря',
                hourglass_ward:'Песочные часы',time_lock:'Остановка механизма',clock_step:'Шаг времени',
                briar_hatch:'Порождение терновника',root_surge:'Корневой удар',thorn_bloom:'Цветение тернов',
                obsidian_stance:'Смена оболочки',slag_aegis:'Шлаковая защита',forge_quake:'Сотрясение кузни',
                storm_muster:'Штормовой призыв',sky_jolt:'Грозовой разряд',wind_charge:'Небесный рывок',
                origin_echo:'Эхо Истока',origin_aegis:'Печать Истока',origin_break:'Разрушение порядка',origin_step:'Последний шаг'
            };
            return labels[id] || id || 'Способность';
        }

        queueBossMinions(count, phase) {
            if (!this.bossProfile || count <= 0) return;
            const types = this.bossProfile.summonTypes || [];
            if (!types.length) return;
            const hpFactor = Number(this.bossProfile.summonHpFactor) || 0.05;
            const rewardFactor = Number(this.bossProfile.summonRewardFactor) || 0.05;
            for (let i = 0; i < count; i++) {
                const type = types[(i + phase) % types.length];
                state.pendingEnemySpawns.push({
                    type,
                    hp: Math.max(80, this.maxHp * hpFactor * (1 + phase * 0.12)),
                    reward: Math.max(1, Math.round(this.reward * rewardFactor)),
                    // R76: summons use the exact authored lane; lateral sprite offsets
                    // made them visibly walk across forbidden terrain before rejoining.
                    x: this.path[Math.max(0, Math.min(this.path.length - 2, this.pathIndex - 2 - i * 2))].x,
                    y: this.path[Math.max(0, Math.min(this.path.length - 2, this.pathIndex - 2 - i * 2))].y,
                    pathIndex: Math.max(1, Math.min(this.path.length - 1, this.pathIndex - 1 - i * 2)),
                    routeIndex: this.routeIndex,
                    bossSummon: true
                });
            }
        }

        bossTowerTargets(count, mode = 'nearest') {
            const towers = state.towers.filter(Boolean).slice();
            if (mode === 'highest') towers.sort((a, b) => (b.totalInvested || 0) - (a.totalInvested || 0));
            else if (mode === 'farthest') towers.sort((a, b) => Math.hypot(b.x - this.x, b.y - this.y) - Math.hypot(a.x - this.x, a.y - this.y));
            else towers.sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));
            return towers.slice(0, Math.max(0, Math.floor(count || 0)));
        }

        disableBossTowers(count, duration, label, color, mode = 'nearest') {
            const planned = (this.bossTelegraphTargets || []).filter(t => state.towers.includes(t)).slice(0, Math.max(0, Math.floor(count || 0)));
            const targets = this.bossTelegraphTargetsLocked ? planned : this.bossTowerTargets(count, mode);
            targets.forEach(t => {
                t.disabledTimer = Math.max(t.disabledTimer || 0, Math.max(1, duration || 1));
                addFloatText(t.x, t.y - 40, label, color, 13);
                createParticleExplosion(t.x, t.y, color, 8);
            });
            return targets.length;
        }

        restoreBossShield(factor, label, color) {
            const amount = Math.max(0, Math.round(this.maxHp * Math.max(0, Number(factor) || 0)));
            if (!amount) return 0;
            this.shieldMax = Math.max(this.shieldMax, amount);
            const before = this.shieldHp;
            this.shieldHp = Math.min(this.shieldMax, this.shieldHp + amount);
            const restored = Math.max(0, this.shieldHp - before);
            if (restored > 0) addFloatText(this.x, this.y - 55, `${label} +${restored}`, color, 15);
            return restored;
        }

        advanceBossPath(nodes, label, color) {
            const legacyNodes = Math.max(0, Number(nodes) || 0);
            const step = Math.max(0, Math.round(legacyNodes * 28 / 8));
            if (!step || this.pathIndex >= this.path.length - 1) return false;
            createParticleExplosion(this.x, this.y, color, 10);
            Reforged.emit('enemy:blink-out',this);
            this.pathIndex = Math.min(this.path.length - 1, this.pathIndex + step);
            const p = this.path[this.pathIndex];
            if (p) { this.x = p.x; this.y = p.y; }
            Reforged.emit('enemy:blink-in',this);
            createParticleExplosion(this.x, this.y, color, 12);
            addFloatText(this.x, this.y - 54, label, color, 16);
            return true;
        }

        enterBossPhase(nextPhase) {
            if (!this.isBoss || !this.bossProfile || nextPhase <= this.bossPhase) return;
            this.bossPhase = Math.min(2, nextPhase);
            Reforged.emit('boss:phase',this);
            this.bossPhaseFlash = 90;
            this.bossPhaseGuard = Math.max(this.bossPhaseGuard, Number(this.bossProfile.phaseGuardFrames) || 0);
            this.bossPendingAbility = null;
            this.bossTelegraphTimer = 0;
            this.bossTelegraphMax = 0;
            this.bossAbilityCursor = 0;
            this.bossTelegraphTargets = [];
            this.bossTelegraphTargetsLocked = false;
            const phaseNames = this.bossProfile.phaseNames || [];
            const label = phaseNames[this.bossPhase] || `Фаза ${this.bossPhase + 1}`;
            showBossPhaseTransition(this, label);
            addFloatText(this.x, this.y - 84, `ФАЗА ${this.bossPhase + 1}: ${label}`.toUpperCase(), this.bossProfile.phaseColor || '#f59e0b', 21);
            createParticleExplosion(this.x, this.y, this.bossProfile.phaseColor || '#f59e0b', 28);
            screenShake(20 + this.bossPhase * 7);

            const shieldFactor = this.bossPhaseValue(this.bossProfile.phaseShieldByPhase, 0);
            if (shieldFactor > 0) {
                const shieldLabel = this.bossProfile.shieldLabel || (this.bossProfile.mechanicId === 'stone_colossus' ? 'КАМЕННЫЙ ЩИТ' : (this.bossProfile.mechanicId === 'dark_king' ? 'ЩИТ БЕЗДНЫ' : 'ФАЗОВЫЙ БАРЬЕР'));
                const shieldColor = this.bossProfile.shieldColor || (this.bossProfile.mechanicId === 'dark_king' ? '#c084fc' : (this.bossProfile.mechanicId === 'stone_colossus' ? '#5eead4' : (this.bossProfile.phaseColor || '#67e8f9')));
                this.restoreBossShield(shieldFactor, shieldLabel, shieldColor);
            }

            const transitionSummons = Math.floor(this.bossPhaseValue(this.bossProfile.phaseTransitionSummonsByPhase, 0));
            if (transitionSummons > 0) {
                this.queueBossMinions(transitionSummons, this.bossPhase);
                addFloatText(this.x, this.y - 57, 'ПОДКРЕПЛЕНИЕ!', this.bossProfile.phaseColor || '#f59e0b', 16);
            }
            this.bossAbilityTimer = 18; this.r68SealDelayUsed = 0;
        }

        beginBossTelegraph() {
            if (!this.bossProfile || this.bossPendingAbility) return false;
            const decks = this.bossProfile.abilityDeckByPhase || [];
            const deck = decks[this.bossPhase] || decks[decks.length - 1] || [];
            if (!deck.length) return false;
            const ability = deck[this.bossAbilityCursor % deck.length];
            this.bossAbilityCursor = (this.bossAbilityCursor + 1) % Math.max(1, deck.length);
            this.bossPendingAbility = ability;
            const targetPlan = this.bossTelegraphTargetPlan(ability);
            this.bossTelegraphTargets = targetPlan.count > 0 ? this.bossTowerTargets(targetPlan.count, targetPlan.mode) : [];
            this.bossTelegraphTargetsLocked = true;
            const phaseTelegraphMult = [1.00, 0.92, 0.84][this.bossPhase] || 1;
            this.bossTelegraphMax = Math.max(12, (Number(this.bossProfile.telegraphFrames) || 30) * phaseTelegraphMult);
            this.bossTelegraphTimer = this.bossTelegraphMax;
            Reforged.emit('boss:telegraph',this);
            const label = this.bossAbilityLabel(ability);
            addFloatText(this.x, this.y - 70, `ВНИМАНИЕ: ${label.toUpperCase()}`, this.bossProfile.phaseColor || '#f59e0b', 17);
            createParticleExplosion(this.x, this.y, this.bossProfile.phaseColor || '#f59e0b', 7);
            return true;
        }

        castBossAbility(ability) {
            if (!ability || !this.bossProfile || this.hp <= 0) return;
            const phase = this.bossPhase;
            const p = this.bossProfile;
            const color = p.phaseColor || '#f59e0b';
            const summonCount = Math.floor(this.bossPhaseValue(p.summonCountByPhase, 2));
            this.bossCastCount++;
            Reforged.emit('boss:ability',this);

            if (ability === 'war_cry') {
                this.queueBossMinions(summonCount, phase);
                addFloatText(this.x, this.y - 52, 'БОЕВОЙ КЛИЧ!', '#fb7185', 18);
            } else if (ability === 'blood_banner') {
                const frames = Number(p.bannerHasteFrames) || 150, mult = Number(p.bannerHasteMult) || 1.18;
                let buffed = 0;
                state.enemies.forEach(e => {
                    if (e.hp > 0 && e !== this && Math.hypot(e.x - this.x, e.y - this.y) <= 280) {
                        e.hasteMultiplier = Math.max(e.hasteMultiplier || 1, mult); e.applyEffect('haste', frames); buffed++;
                    }
                });
                this.hasteMultiplier = Math.max(this.hasteMultiplier || 1, mult); this.applyEffect('haste', frames * 0.7);
                addFloatText(this.x, this.y - 52, `КРОВАВОЕ ЗНАМЯ ×${Math.max(1,buffed)}`, '#f43f5e', 17);
            } else if (ability === 'last_charge') {
                this.restoreBossShield(0.05, 'ЩИТ ВОЖДЯ', '#fb7185');
                this.advanceBossPath(this.bossPhaseValue(p.chargeNodesByPhase, 1), 'ПОСЛЕДНИЙ НАТИСК', '#fb7185');
            } else if (ability === 'ice_seal') {
                const count = Math.floor(this.bossPhaseValue(p.disableTowerCountByPhase, 1));
                this.disableBossTowers(count, Number(p.disableTowerFrames) || 120, 'ЛЕДЯНАЯ ПЕЧАТЬ', '#7dd3fc');
                addFloatText(this.x, this.y - 52, 'ЛЕДЯНАЯ ПЕЧАТЬ', '#bae6fd', 17);
            } else if (ability === 'whiteout') {
                const count = Math.floor(this.bossPhaseValue(p.whiteoutTowerCountByPhase, 2));
                this.disableBossTowers(count, Number(p.whiteoutDisableFrames) || 90, 'БЕЛАЯ МГЛА', '#bae6fd', 'highest');
                screenShake(10); addFloatText(this.x, this.y - 52, 'БЕЛАЯ МГЛА', '#e0f2fe', 18);
            } else if (ability === 'crystal_aegis') {
                this.restoreBossShield(this.bossPhaseValue(p.aegisShieldByPhase, 0.1), 'КРИСТАЛЬНЫЙ БАРЬЕР', '#67e8f9');
            } else if (ability === 'raise_dead') {
                this.queueBossMinions(summonCount, phase); addFloatText(this.x, this.y - 52, 'ЗОВ НЕКРОПОЛЯ', '#86efac', 18);
            } else if (ability === 'soul_drain') {
                const factor = this.bossPhaseValue(p.soulDrainHealByPhase, 0.02);
                const heal = Math.max(1, Math.round(this.maxHp * factor));
                const before = this.hp; this.hp = Math.min(this.maxHp, this.hp + heal);
                addFloatText(this.x, this.y - 52, `ПОХИЩЕНИЕ ДУШИ +${Math.round(this.hp-before)}`, '#4ade80', 17);
            } else if (ability === 'grave_pact') {
                const bonus = Math.floor(this.bossPhaseValue(p.gravePactBonusByPhase, 1));
                this.queueBossMinions(summonCount + bonus + 1, phase);
                const heal = Math.round(this.maxHp * 0.01); this.hp = Math.min(this.maxHp, this.hp + heal);
                addFloatText(this.x, this.y - 52, 'ПОГРЕБАЛЬНЫЙ ДОГОВОР', '#4ade80', 17);
            } else if (ability === 'earthquake') {
                const count = Math.floor(this.bossPhaseValue(p.disableTowerCountByPhase, 1));
                this.disableBossTowers(count, Number(p.disableTowerFrames) || 54, 'СОТРЯСЕНИЕ', '#5eead4');
                screenShake(14 + phase * 5); addFloatText(this.x, this.y - 54, 'УДАР КОЛОССА', '#99f6e4', 18);
            } else if (ability === 'stone_aegis') {
                this.restoreBossShield(this.bossPhaseValue(p.stoneAegisByPhase, 0.09), 'КАМЕННЫЙ БАСТИОН', '#5eead4');
            } else if (ability === 'boulder_step') {
                this.advanceBossPath(this.bossPhaseValue(p.boulderNodesByPhase, 1), 'НЕУМОЛИМАЯ ПОСТУПЬ', '#99f6e4');
                this.disableBossTowers(1 + phase, 42, 'УДАРНАЯ ВОЛНА', '#5eead4');
            } else if (ability === 'fire_breath') {
                const count = Math.floor(this.bossPhaseValue(p.disableTowerCountByPhase, 1));
                this.disableBossTowers(count, Number(p.disableTowerFrames) || 72, 'ПЕРЕГРЕВ', '#fdba74');
                addFloatText(this.x, this.y - 54, 'ОГНЕННОЕ ДЫХАНИЕ', '#fed7aa', 17);
            } else if (ability === 'meteor_dive') {
                const count = Math.floor(this.bossPhaseValue(p.meteorTowerCountByPhase, 2));
                this.disableBossTowers(count, Number(p.meteorDisableFrames) || 120, 'МЕТЕОРНЫЙ УДАР', '#fb923c', 'highest');
                screenShake(20); addFloatText(this.x, this.y - 54, 'МЕТЕОРНЫЙ НАЛЁТ', '#fed7aa', 18);
            } else if (ability === 'winged_charge') {
                const nodes = this.bossPhaseValue(p.wingedChargeNodesByPhase, this.bossPhaseValue(p.leapNodesByPhase, 1));
                this.advanceBossPath(nodes, 'ПЛАМЕННЫЙ РЫВОК', '#fdba74');
            } else if (ability === 'void_summon') {
                this.queueBossMinions(summonCount, phase); addFloatText(this.x, this.y - 56, 'ЗОВ БЕЗДНЫ', '#d8b4fe', 18);
            } else if (ability === 'shadow_seal') {
                const count = Math.floor(this.bossPhaseValue(p.shadowSealCountByPhase, 2));
                this.disableBossTowers(count, Number(p.shadowSealFrames) || 90, 'ПЕЧАТЬ ТЬМЫ', '#c084fc', 'highest');
                addFloatText(this.x, this.y - 56, 'ПЕЧАТЬ ТЬМЫ', '#d8b4fe', 17);
            } else if (ability === 'shadow_blink') {
                this.advanceBossPath(this.bossPhaseValue(p.blinkNodesByPhase, 1), 'ТЕНЕВОЙ СКАЧОК', '#c084fc');
            } else if (ability === 'crown_burst') {
                this.disableBossTowers(Number(p.crownBurstTowerCount) || 4, Number(p.crownBurstFrames) || 60, 'ВЗРЫВ КОРОНЫ', '#e879f9', 'highest');
                this.queueBossMinions(Math.max(2, summonCount), phase);
                this.restoreBossShield(0.06, 'КОРОНА БЕЗДНЫ', '#c084fc');
                screenShake(28); addFloatText(this.x, this.y - 56, 'ВЗРЫВ КОРОНЫ', '#f0abfc', 19);
            } else if (ability === 'rift_guard' || ability === 'mirror_veil' || ability === 'molten_armor' || ability === 'archive_ward' || ability === 'heart_aegis') {
                const labels = { rift_guard:'ОСКОЛОЧНЫЙ ЩИТ', mirror_veil:'ЗЕРКАЛЬНАЯ ЗАВЕСА', molten_armor:'РАСПЛАВЛЕННЫЙ ПАНЦИРЬ', archive_ward:'АРХИВНАЯ ПЕЧАТЬ', heart_aegis:'ЩИТ СЕРДЦА' };
                this.restoreBossShield(this.bossPhaseValue(p.utilityShieldByPhase, 0.05), labels[ability] || 'БАРЬЕР', color);
            } else if (ability === 'fracture_seal' || ability === 'future_cut' || ability === 'anvil_strike' || ability === 'name_theft' || ability === 'tempest_roar' || ability === 'reality_break') {
                const labels = { fracture_seal:'ПЕЧАТЬ РАСКОЛА', future_cut:'БУДУЩЕЕ ОТСЕЧЕНО', anvil_strike:'УДАР НАКОВАЛЬНИ', name_theft:'ИМЯ СТЁРТО', tempest_roar:'РЁВ БУРИ', reality_break:'РАЗРЫВ РЕАЛЬНОСТИ' };
                const modes = { future_cut:'highest', name_theft:'highest', reality_break:'highest' };
                const count = Math.floor(this.bossPhaseValue(p.controlTowerCountByPhase, 1));
                this.disableBossTowers(count, Number(p.controlFrames) || 54, labels[ability] || 'ПОДАВЛЕНИЕ', color, modes[ability] || 'nearest');
                if (ability === 'anvil_strike' || ability === 'tempest_roar' || ability === 'reality_break') screenShake(12 + phase * 4);
                addFloatText(this.x, this.y - 56, labels[ability] || 'ПОДАВЛЕНИЕ', color, 17);
            } else if (ability === 'rift_charge' || ability === 'mirror_step' || ability === 'memory_step' || ability === 'sky_charge' || ability === 'rift_step') {
                const labels = { rift_charge:'РЫВОК РАСКОЛА', mirror_step:'ШАГ ОТРАЖЕНИЯ', memory_step:'ШАГ ЗАБВЕНИЯ', sky_charge:'НЕБЕСНЫЙ РЫВОК', rift_step:'ШАГ ЗА ГРАНЬ' };
                this.advanceBossPath(this.bossPhaseValue(p.advanceNodesByPhase, 1), labels[ability] || 'РЫВОК', color);
            } else if (ability === 'forge_servants' || ability === 'void_echo') {
                this.queueBossMinions(Math.max(1, summonCount), phase);
                addFloatText(this.x, this.y - 54, ability === 'forge_servants' ? 'КОВКА СОСУДОВ' : 'ЭХО ПУСТОТЫ', color, 17);
            } else if (['tidal_guard','hourglass_ward','slag_aegis','origin_aegis'].includes(ability)) {
                this.restoreBossShield(this.bossPhaseValue(p.utilityShieldByPhase,.045),this.bossAbilityLabel(ability).toUpperCase(),color);
            } else if (['depth_muster','briar_hatch','storm_muster','origin_echo'].includes(ability)) {
                this.queueBossMinions(Math.min(3,Math.max(1,summonCount)),phase);
                addFloatText(this.x,this.y-52,this.bossAbilityLabel(ability).toUpperCase(),color,15);
            } else if (['anchor_strike','time_lock','root_surge','forge_quake','sky_jolt','origin_break'].includes(ability)) {
                this.disableBossTowers(Math.min(2,Math.floor(this.bossPhaseValue(p.controlTowerCountByPhase,1))),Math.min(70,Number(p.controlFrames)||45),this.bossAbilityLabel(ability).toUpperCase(),color,'highest');
                addFloatText(this.x,this.y-54,this.bossAbilityLabel(ability).toUpperCase(),color,15);
            } else if (ability === 'thorn_bloom') {
                const before=this.hp;
                this.hp=Math.min(this.maxHp,this.hp+this.maxHp*.013);
                addFloatText(this.x,this.y-51,'ЦВЕТЕНИЕ +'+Math.round(this.hp-before),color,15);
            } else if (ability === 'obsidian_stance') {
                const physical=this.r69BossStance==='energy';
                this.r69BossStance=physical?'physical':'energy';
                this.r69BossStanceTimer=240;
                this.physResist=physical?.34:.08;
                this.energyResist=physical?.08:.34;
                addFloatText(this.x,this.y-52,physical?'ФИЗИЧЕСКАЯ БРОНЯ':'ЭНЕРГОБРОНЯ',color,15);
            } else if (['clock_step','wind_charge','origin_step'].includes(ability)) {
                // R75: Regent and the final lord advance only along their assigned route, with a warning.
                const maxNodes = (ability === 'wind_charge' || ability === 'origin_step') ? 1.10 : .55;
                this.advanceBossPath(Math.min(maxNodes,Number(this.bossPhaseValue(p.advanceNodesByPhase,.4))||.4),this.bossAbilityLabel(ability).toUpperCase(),color);
            } else if (ability === 'storm_haste') {
                const frames = Math.max(45, Number(p.selfHasteFrames) || 120), mult = Math.max(1, Number(p.selfHasteMult) || 1.15);
                this.hasteMultiplier = Math.max(this.hasteMultiplier || 1, mult); this.applyEffect('haste', frames);
                addFloatText(this.x, this.y - 54, 'ГРОЗОВОЙ РАЗГОН', '#93c5fd', 17);
            }
            createParticleExplosion(this.x, this.y, color, 16 + phase * 3);
            this.bossTelegraphTargets = [];
            this.bossTelegraphTargetsLocked = false;
        }

        updateBossMechanics(activeDt) {
            if (!this.isBoss || !this.bossProfile || this.hp <= 0) return;
            this.bossTime += activeDt;
            if (this.bossPhaseFlash > 0) this.bossPhaseFlash = Math.max(0, this.bossPhaseFlash - activeDt);
            if (this.bossPhaseGuard > 0) this.bossPhaseGuard = Math.max(0, this.bossPhaseGuard - activeDt);

            const desiredPhase = this.bossPhaseIndex();
            if (desiredPhase > this.bossPhase && this.bossPhaseGuard <= 0) this.enterBossPhase(this.bossPhase + 1);

            const speedMults = this.bossProfile.speedMultByPhase || [1];
            this.speed *= Number(speedMults[this.bossPhase] || speedMults[speedMults.length - 1] || 1);
            const castleByPhase = this.bossProfile.castleDamageByPhase || [];
            if (castleByPhase.length) this.castleDamage = Number(castleByPhase[this.bossPhase] || castleByPhase[castleByPhase.length - 1] || this.castleDamage);
            const resistByPhase = this.bossProfile.physResistByPhase || [];
            if (resistByPhase.length) this.physResist = this.bossPhaseValue(resistByPhase, 0);
            const energyResistByPhase = this.bossProfile.energyResistByPhase || [];
            this.energyResist = this.bossPhaseValue(energyResistByPhase, 0);
            // R69 Obsidian Titan: stance persists for four seconds; prior boss profiles are unaffected.
            if (this.r69BossStanceTimer > 0) {
                this.r69BossStanceTimer=Math.max(0,this.r69BossStanceTimer-activeDt);
                if (this.r69BossStanceTimer > 0) {
                    this.physResist=this.r69BossStance==='physical'?.34:.08;
                    this.energyResist=this.r69BossStance==='energy'?.34:.08;
                }
            }

            if (this.bossPendingAbility) {
                this.bossTelegraphTimer = Math.max(0, this.bossTelegraphTimer - activeDt);
                if (this.bossTelegraphTimer <= 0) {
                    const ability = this.bossPendingAbility;
                    this.bossPendingAbility = null;
                    this.bossTelegraphMax = 0;
                    this.castBossAbility(ability);
                    this.r68SealDelayUsed = 0;
                    const baseCooldown = Number(this.bossProfile.abilityCooldownFrames) || 300;
                    const mult = this.bossPhaseValue(this.bossProfile.phaseCooldownMult, 1);
                    this.bossAbilityTimer = Math.max(90, baseCooldown * Math.max(0.45, mult));
                }
                return;
            }

            this.bossAbilityTimer -= activeDt;
            if (this.bossAbilityTimer <= 0) this.beginBossTelegraph();
        }

        applyEffect(name, duration) {
            const wasActive=this.effects[name]>0;
            if (this.isBoss && this.bossSpawnTimer > 0) return false;
            const frames = Math.max(0, Number(duration) || 0);
            if (!frames || !Object.prototype.hasOwnProperty.call(this.effects, name)) return false;
            if (name === 'slow' && this.slowImmune) { addFloatText(this.x, this.y - 34, 'Иммунитет', '#7dd3fc', 14); return false; }
            if (name === 'freeze' && this.freezeImmune) { addFloatText(this.x, this.y - 34, 'Иммунитет', '#7dd3fc', 14); return false; }
            this.effects[name] = Math.max(this.effects[name], frames);
            if (!wasActive && this.effects[name]>0) Reforged.emit('enemy:status',this);
            return true;
        }

        applyPoison(durationFrames, damagePerTick = 2, tickFrames = 30, sourceTower = null) {
            const frames = Math.max(0, Number(durationFrames) || 0);
            const damage = Math.max(0.25, Number(damagePerTick) || 2);
            const cadence = Math.max(6, Number(tickFrames) || 30);
            if (!frames) return false;
            const wasInactive = this.effects.poison <= 0;
            if (wasInactive) this.poisonTick = 0;
            if (wasInactive || damage >= (Number(this.poisonDamage) || 2)) {
                this.poisonDamage = damage; this.poisonTickFrames = cadence; this.poisonSource = sourceTower || null;
            }
            this.effects.poison = Math.max(this.effects.poison, frames); if(wasInactive)Reforged.emit('enemy:status',this);
            return true;
        }

        applyEnergyVulnerability(value, durationFrames) {
            const vulnerability = Math.max(0, Math.min(0.30, Number(value) || 0));
            const frames = Math.max(0, Number(durationFrames) || 0);
            if (!vulnerability || !frames) return false;
            this.energyVulnerability = Math.max(this.energyVulnerability || 0, vulnerability);
            this.energyVulnerabilityTimer = Math.max(this.energyVulnerabilityTimer || 0, frames);
            return true;
        }

        applyBrittle(durationFrames) {
            const frames = Math.max(0, Number(durationFrames) || 0);
            if (!frames) return false;
            this.brittle = true;
            this.brittleTimer = Math.max(this.brittleTimer || 0, frames);
            return true;
        }

        applyArmorShred(value, durationFrames) {
            const shred = Math.max(0, Math.min(0.8, Number(value) || 0));
            const frames = Math.max(0, Number(durationFrames) || 0);
            if (!shred || !frames) return false;
            this.armorShred = Math.max(this.armorShred || 0, shred);
            this.armorShredTimer = Math.max(this.armorShredTimer || 0, frames);
            return true;
        }

        takeDamage(amount, sourceTower, isPhysical = false, visualCritical = false, damageOwner = sourceTower) {
            if (amount <= 0 || !this.canBeTargeted()) return;
            if (isPhysical && this.dodgeChance > 0 && Math.random() < this.dodgeChance) {
                addFloatText(this.x, this.y - 30, "Уклонение!", '#38bdf8', 18);
                return;
            }
            if (isPhysical && this.physResist > 0) {
                const rawPhysical = amount;
                const shred = this.armorShredTimer > 0 ? Math.max(0, Math.min(0.8, this.armorShred || 0)) : 0;
                const pierce = sourceTower ? Math.max(0, Math.min(0.95, Number(sourceTower.stats.armorPierce) || 0)) : 0;
                const remainingArmor = Math.max(0, this.physResist - shred) * (1 - pierce);
                amount *= (1 - remainingArmor);
                const prevented = Math.max(0, Math.round(rawPhysical - amount));
                if (prevented >= 4 && this.armorFeedbackCooldown <= 0) { addFloatText(this.x, this.y - 48, `БРОНЯ −${prevented}`, '#f59e0b', 12); this.armorFeedbackCooldown = 34; }
            } else if (!isPhysical && sourceTower && sourceTower.stats && sourceTower.stats.damageKind === 'energy' && this.energyResist > 0) {
                const rawEnergy = amount;
                amount *= (1 - Math.max(0, Math.min(0.65, Number(this.energyResist) || 0)));
                const prevented = Math.max(0, Math.round(rawEnergy - amount));
                if (prevented >= 4 && this.armorFeedbackCooldown <= 0) { addFloatText(this.x, this.y - 48, `ЭНЕРГИЯ −${prevented}`, '#67e8f9', 12); this.armorFeedbackCooldown = 34; }
            }
            if (this.brittleTimer > 0) amount *= 1.25;
            if (sourceTower && Number(sourceTower.stats.chillBonus) > 1 && (this.effects.slow > 0 || this.effects.freeze > 0)) {
                amount *= Math.max(1, Number(sourceTower.stats.chillBonus) || 1);
                if (this.synergyTextCooldown <= 0) { addFloatText(this.x, this.y - 42, sourceTower.stats.controlledTargetBonusLabel || 'СИНЕРГИЯ', '#fbbf24', 13); this.synergyTextCooldown = 45; }
            }
            if (sourceTower && Number(sourceTower.stats.poisonBonus) > 1 && this.effects.poison > 0) {
                amount *= Math.max(1, Number(sourceTower.stats.poisonBonus) || 1);
                if (this.synergyTextCooldown <= 0) { addFloatText(this.x, this.y - 42, sourceTower.stats.poisonTargetBonusLabel || 'СИНЕРГИЯ', '#c084fc', 12); this.synergyTextCooldown = 45; }
            }
            if (sourceTower && Number(sourceTower.stats.bossBonus) > 1 && this.isBoss) amount *= Math.max(1, Number(sourceTower.stats.bossBonus) || 1);
            if (sourceTower && sourceTower.stats && sourceTower.stats.damageKind === 'energy' && this.energyVulnerabilityTimer > 0 && this.energyVulnerability > 0) {
                amount *= (1 + Math.max(0, Math.min(0.30, Number(this.energyVulnerability) || 0)));
                if (this.synergyTextCooldown <= 0) { addFloatText(this.x, this.y - 42, 'ИОНИЗАЦИЯ', '#bef264', 11); this.synergyTextCooldown = 45; }
            }
            if (sourceTower && sourceTower.stats.execute && (this.hp / this.maxHp) < 0.3) amount *= 2;
            
            const fractionalEnergyDamage = !!(sourceTower && sourceTower.stats && sourceTower.stats.fractionalDamage);
            amount = fractionalEnergyDamage ? Math.max(0.05, amount) : Math.max(1, Math.round(amount));
            if (this.shieldHp > 0) {
                const shieldBonus = sourceTower && sourceTower.stats ? Math.max(1, Number(sourceTower.stats.shieldBonus) || 1) : 1;
                const shieldDamage = amount * shieldBonus;
                const absorbed = Math.min(this.shieldHp, shieldDamage);
                this.shieldHp -= absorbed;
                Reforged.emit(this.shieldHp<=0?'enemy:shield-break':'enemy:shield-hit',this);
                // Convert absorbed shield damage back to the unmodified base damage so shield bonus never leaks into HP damage.
                amount -= absorbed / shieldBonus;
                this.hitFlash = 2;
                this.animHitRemaining = Math.max(this.animHitRemaining, this.animation ? (GAME_NOMINAL_FPS / Math.max(1, this.animation.hitFps || 16)) * 4 : 9);
                addFloatText(this.x, this.y - 25, `-${Math.max(1, Math.round(absorbed))} щит`, '#67e8f9', 15);
                if (shieldBonus > 1 && this.synergyTextCooldown <= 0) { addFloatText(this.x, this.y - 43, 'ПРОБОЙ ЩИТА', '#67e8f9', 12); this.synergyTextCooldown = 45; }
                if (amount <= 0) return;
            }
            if (this.isBoss && this.bossProfile) {
                if (this.bossPhaseGuard > 0) amount *= Math.max(0.05, Number(this.bossProfile.phaseGuardDamageMult) || 0.35);
                const thresholds = this.bossProfile.phaseThresholds || [];
                if (this.bossPhase < thresholds.length) {
                    const gateHp = Math.max(1, this.maxHp * Number(thresholds[this.bossPhase] || 0));
                    if (this.hp <= gateHp) return;
                    amount = Math.min(amount, Math.max(0, this.hp - gateHp));
                }
                amount = fractionalEnergyDamage ? Math.max(0, amount) : Math.max(1, Math.round(amount));
                if (this.bossPhase < thresholds.length) {
                    const gateHp = Math.max(1, this.maxHp * Number(thresholds[this.bossPhase] || 0));
                    amount = Math.min(amount, Math.max(0, this.hp - gateHp));
                }
            }
            // R91.3: attribution is separate from damage modifiers. DOT/environment kills
            // cannot inherit a previous laser's on-kill explosion.
            this.hp -= amount; this.lastDamageTower = damageOwner || null; this.hitFlash = 3;
            Reforged.emit('enemy:hit',this,sourceTower,amount,visualCritical);
            this.animHitRemaining = Math.max(this.animHitRemaining, this.animation ? (GAME_NOMINAL_FPS / Math.max(1, this.animation.hitFps || 16)) * 4 : 9);
            if (this.impactFxCooldown <= 0 && !(sourceTower && sourceTower.stats && sourceTower.stats.isLaser)) { createParticle(this.x, this.y, isPhysical ? '#fde68a' : '#c4b5fd', Math.min(5, 2 + Math.floor(amount / 120)), 1.1, false, true); this.impactFxCooldown = 4; }
            addFloatText(this.x, this.y - 25, amount, amount > 50 ? '#ef4444' : '#fff', amount > 50 ? 24 : 18);
            if (this.hp <= 0) {
                this.hp = 0;
                this.setAnimationState('death', true);
                onEnemyDeath(this);
            }
        }

        updateR69Mechanics(activeDt) {
            if (!this.archetypeId || this.type < 18 || this.type > 25 || this.hp <= 0) return;
            const m=this.r69Mechanic;
            const pulse=function(c){createParticleExplosion(this.x,this.y,c,5);}.bind(this);
            if(m.shieldRegenFraction>0){
                m.shieldRegenCooldown-=activeDt;
                if(m.shieldRegenCooldown<=0){
                    m.shieldRegenCooldown+=Math.max(180,Number(GAME_DATA.getExpansionEnemy(this.type)?.shieldRegenCooldownFrames)||330);
                    const gain=Math.min(this.shieldMax-this.shieldHp,this.maxHp*m.shieldRegenFraction);
                    if(gain>0){this.shieldHp+=gain;pulse('#67e8f9');addFloatText(this.x,this.y-32,'ПРИЛИВНЫЙ ЩИТ','#a5f3fc',12);}
                }
            }
            if(m.shieldAuraFraction>0){
                m.shieldAuraCooldown-=activeDt;
                if(m.shieldAuraCooldown<=0){
                    m.shieldAuraCooldown+=Math.max(210,Number(GAME_DATA.getExpansionEnemy(this.type)?.shieldAuraCooldownFrames)||300);
                    let count=0;
                    const nearby=state.enemies.filter(e=>e!==this&&!e.isBoss&&e.hp>0&&Math.hypot(e.x-this.x,e.y-this.y)<=m.shieldAuraRadius).sort((a,b)=>a.shieldHp-b.shieldHp);
                    for(const e of nearby){
                        if(count>=m.shieldAuraTargets)break;
                        const allowed=e.maxHp*m.shieldAuraCap;
                        const original=e.shieldMax;
                        e.shieldMax=Math.max(original,allowed);
                        const gain=Math.min(e.shieldMax-e.shieldHp,e.maxHp*m.shieldAuraFraction);
                        if(gain<=0)continue;
                        e.shieldHp+=gain;count++;createParticle(e.x,e.y,'#5eead4',2,1);
                    }
                    if(count){pulse('#5eead4');addFloatText(this.x,this.y-34,'ВОДНЫЙ ОБЕРЕГ','#5eead4',12);}
                }
            }
            if(m.tempoBurstMult>1){
                m.tempoBurstCooldown-=activeDt;
                m.tempoBurstRemaining=Math.max(0,m.tempoBurstRemaining-activeDt);
                if(m.tempoBurstCooldown<=0){
                    m.tempoBurstCooldown+=Math.max(220,Number(GAME_DATA.getExpansionEnemy(this.type)?.tempoBurstCooldownFrames)||350);
                    m.tempoBurstRemaining=m.tempoBurstFrames;pulse('#fde68a');addFloatText(this.x,this.y-34,'УСКОРЕНИЕ','#fcd34d',13);
                }
                if(m.tempoBurstRemaining>0)this.speed*=m.tempoBurstMult;
            }
            if(Number(GAME_DATA.getExpansionEnemy(this.type)?.reloadPulseFrames)>0){
                m.reloadPulseCooldown-=activeDt;
                if(m.reloadPulseCooldown<=0){
                    m.reloadPulseCooldown+=Math.max(250,Number(GAME_DATA.getExpansionEnemy(this.type).reloadPulseFrames)||345);
                    const target=state.towers.filter(t=>t&&t.stats&&!['support','seal'].includes(t.stats.attackMode)&&!t.stats.isLaser&&Math.hypot(t.x-this.x,t.y-this.y)<m.reloadPulseRadius).sort((a,b)=>Math.hypot(a.x-this.x,a.y-this.y)-Math.hypot(b.x-this.x,b.y-this.y))[0];
                    if(target){target.fireTimer=Math.min(Math.max(0,target.fireTimer)+m.reloadPulseDelay,Math.max(35,target.stats.fireRate||100));addFloatText(target.x,target.y-31,'СБОЙ РИТМА','#fcd34d',12);pulse('#fbbf24');}
                }
            }
            if(m.rootHealFraction>0){
                m.rootHealCooldown-=activeDt;
                if(m.rootHealCooldown<=0){
                    m.rootHealCooldown+=Math.max(210,Number(GAME_DATA.getExpansionEnemy(this.type)?.rootHealCooldownFrames)||270);
                    const wounded=state.enemies.filter(e=>e!==this&&!e.isBoss&&e.hp>0&&e.hp<e.maxHp&&Math.hypot(e.x-this.x,e.y-this.y)<=m.rootHealRadius).sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp)).slice(0,m.rootHealTargets);
                    wounded.forEach(e=>{e.hp=Math.min(e.maxHp,e.hp+e.maxHp*m.rootHealFraction);createParticle(e.x,e.y,'#84cc16',3,1.2);});
                    if(wounded.length){pulse('#84cc16');addFloatText(this.x,this.y-32,'ПЛЕТЕНИЕ КОРНЕЙ','#bef264',12);}
                }
            }
            if(m.stanceCycleFrames>0){
                m.stanceTimer-=activeDt;
                if(m.stanceTimer<=0){
                    m.stanceTimer+=m.stanceCycleFrames;m.stance=1-m.stance;
                    pulse('#fb923c');addFloatText(this.x,this.y-34,m.stance?'ЭНЕРГОЩИТ':'ФИЗИЧЕСКИЙ ЩИТ','#fdba74',12);
                }
                this.physResist=m.stance?m.stanceOff:m.stancePhysical;
                this.energyResist=m.stance?m.stanceEnergy:m.stanceOff;
            }
            if(Number(GAME_DATA.getExpansionEnemy(this.type)?.gustPulseFrames)>0){
                m.gustPulseCooldown-=activeDt;
                if(m.gustPulseCooldown<=0){
                    m.gustPulseCooldown+=Math.max(260,Number(GAME_DATA.getExpansionEnemy(this.type).gustPulseFrames)||330);
                    let moved=0;
                    for(const e of state.enemies){
                        if(moved>=m.gustTargets)break;
                        // R91.2: external wind movement obeys the same freeze/stun as walking.
                        if(e===this||e.isBoss||e.hp<=0||e.effects.freeze>0||e.effects.stun>0||Math.hypot(e.x-this.x,e.y-this.y)>m.gustPulseRadius||e.pathIndex>=e.path.length-5)continue;
                        const next=Math.min(e.path.length-2,e.pathIndex+m.gustAdvanceNodes);
                        if(next<=e.pathIndex)continue;
                        e.x=e.path[next-1].x;e.y=e.path[next-1].y;e.pathIndex=next;
                        moved++;createParticle(e.x,e.y,'#93c5fd',3,1.1);
                    }
                    if(moved){pulse('#7dd3fc');addFloatText(this.x,this.y-35,'ПОПУТНЫЙ ВЕТЕР','#bfdbfe',12);}
                }
            }
        }

        update(dtFrames) {
            const dt = Math.max(0, dtFrames || 0);
            if (dt <= 0) return true;
            if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
            if (this.armorFeedbackCooldown > 0) this.armorFeedbackCooldown = Math.max(0, this.armorFeedbackCooldown - dt);
            if (this.impactFxCooldown > 0) this.impactFxCooldown = Math.max(0, this.impactFxCooldown - dt);
            if (this.hp <= 0 || this.pathIndex >= this.path.length) return false;

            if (this.isBoss && this.bossSpawnTimer > 0) {
                this.bossTime += dt;
                const before = this.bossSpawnTimer;
                this.bossSpawnTimer = Math.max(0, this.bossSpawnTimer - dt);
                if (before > 0 && this.bossSpawnTimer <= 0) {
                    this.bossAbilityTimer = Math.max(24, this.bossAbilityTimer);
                    createParticleExplosion(this.x, this.y, this.bossProfile.phaseColor || '#ef4444', 34);
                    addFloatText(this.x, this.y - 72, 'БОЙ НАЧАЛСЯ', this.bossProfile.phaseColor || '#ef4444', 19);
                    screenShake(18);
                }
                this.advanceAnimation(dt,false);
                return true;
            }

            let simDt = dt;
            if (this.effects.stun > 0) {
                const consumed = Math.min(simDt, this.effects.stun);
                this.effects.stun = Math.max(0, this.effects.stun - consumed);
                simDt -= consumed;
                if (simDt <= 0) { this.advanceAnimation(0, false); return true; }
            }
            if (this.effects.freeze > 0) {
                const consumed = Math.min(simDt, this.effects.freeze);
                this.effects.freeze = Math.max(0, this.effects.freeze - consumed);
                simDt -= consumed;
                if (simDt <= 0) { this.advanceAnimation(0, false); return true; }
            }

            const activeDt = simDt;
            if (this.brittleTimer > 0) { this.brittleTimer = Math.max(0, this.brittleTimer - activeDt); if (this.brittleTimer <= 0) this.brittle = false; }
            if (this.armorShredTimer > 0) { this.armorShredTimer = Math.max(0, this.armorShredTimer - activeDt); if (this.armorShredTimer <= 0) this.armorShred = 0; }
            if (this.energyVulnerabilityTimer > 0) { this.energyVulnerabilityTimer = Math.max(0, this.energyVulnerabilityTimer - activeDt); if (this.energyVulnerabilityTimer <= 0) this.energyVulnerability = 0; }
            if (this.synergyTextCooldown > 0) this.synergyTextCooldown = Math.max(0, this.synergyTextCooldown - activeDt);
            this.speed = this.baseSpeed;
            if (this.effects.slow > 0) { this.effects.slow = Math.max(0, this.effects.slow - activeDt); this.speed = this.baseSpeed * 0.4; }
            if (this.effects.poison > 0) {
                const active = Math.min(activeDt, this.effects.poison);
                this.effects.poison = Math.max(0, this.effects.poison - activeDt);
                this.speed *= 0.85;
                this.poisonTick += active;
                const poisonCadence = Math.max(6, Number(this.poisonTickFrames) || 30);
                const poisonDamage = Math.max(0.25, Number(this.poisonDamage) || 2);
                while (this.poisonTick >= poisonCadence) { this.poisonTick -= poisonCadence; this.takeDamage(poisonDamage, null, false, false, this.poisonSource); if (this.hp <= 0) { this.advanceAnimation(dt, false); return true; } }
            } else { this.poisonTick = 0; this.poisonDamage = 2; this.poisonTickFrames = 30; this.poisonSource = null; }
            if (this.effects.bleed > 0) {
                const active = Math.min(activeDt, this.effects.bleed);
                this.effects.bleed = Math.max(0, this.effects.bleed - activeDt);
                this.bleedTick += active;
                while (this.bleedTick >= 15) { this.bleedTick -= 15; this.takeDamage(5, null, false, false, this.bleedSource); createParticle(this.x, this.y, '#ef4444', 1, 1.5); if (this.hp <= 0) { this.advanceAnimation(dt, false); return true; } }
            } else { this.bleedTick = 0; this.bleedSource = null; }

            if (this.effects.haste > 0) {
                this.effects.haste = Math.max(0, this.effects.haste - activeDt);
                this.speed *= Math.max(1, this.hasteMultiplier);
            } else { this.hasteMultiplier = 1; }

            if (this.rageThreshold > 0 && this.hp > 0 && (this.hp / this.maxHp) <= this.rageThreshold) {
                this.speed *= this.rageSpeedMult;
                this.castleDamage = this.rageCastleDamage;
                if (!this.rageTriggered) { this.rageTriggered = true; Reforged.emit('enemy:ability',this); addFloatText(this.x, this.y - 38, 'ЯРОСТЬ!', '#fb7185', 18); createParticleExplosion(this.x, this.y, '#dc2626', 10); }
            }

            if (this.isBoss && this.bossProfile) this.updateBossMechanics(activeDt);
            else if (this.type >= 18 && this.type <= 25) this.updateR69Mechanics(activeDt);

            if (this.hasteAura) {
                this.hasteAuraTimer += activeDt;
                while (this.hasteAuraTimer >= this.hastePulseFrames) {
                    this.hasteAuraTimer -= this.hastePulseFrames;
                    state.enemies.forEach(e => {
                        if (e !== this && e.hp > 0 && Math.hypot(e.x - this.x, e.y - this.y) <= this.hasteRadius) {
                            e.hasteMultiplier = Math.max(e.hasteMultiplier || 1, this.hasteAuraMult);
                            e.applyEffect('haste', this.hasteDurationFrames);
                        }
                    });
                    createParticle(this.x, this.y, '#a855f7', 2, 1.5);
                }
            }

            if (this.disableTower) {
                this.disableCooldown -= activeDt;
                if (this.disableCooldown <= 0) {
                    const candidates = state.towers.filter(t => Math.hypot(t.x - this.x, t.y - this.y) <= this.disableRadius);
                    if (candidates.length) {
                        candidates.sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));
                        const tower = candidates[0];
                        tower.disabledTimer = Math.max(tower.disabledTimer || 0, this.disableFrames); Reforged.emit('enemy:ability',this);
                        addFloatText(tower.x, tower.y - 38, 'ОТКЛЮЧЕНО', '#f59e0b', 15);
                        createParticleExplosion(tower.x, tower.y, '#f59e0b', 8);
                        this.disableCooldown = this.disableCooldownFrames;
                    } else this.disableCooldown = Math.min(45, this.disableCooldownFrames);
                }
            }

            if (this.blink) {
                this.blinkCooldown -= activeDt;
                if (this.blinkCooldown <= 0 && this.pathIndex < this.path.length - 2) {
                    const targetIndex = Math.min(this.path.length - 2, this.pathIndex + Math.max(1, Math.round(this.blinkNodes * 28 / 8)) - 1);
                    createParticleExplosion(this.x, this.y, '#c084fc', 8);
                    Reforged.emit('enemy:blink-out',this);
                    this.x = this.path[targetIndex].x; this.y = this.path[targetIndex].y; this.pathIndex = targetIndex + 1;
                    Reforged.emit('enemy:blink-in',this);
                    createParticleExplosion(this.x, this.y, '#c084fc', 8);
                    addFloatText(this.x, this.y - 34, 'СКАЧОК', '#d8b4fe', 14);
                    this.blinkCooldown = this.blinkCooldownFrames;
                }
            }

            if (this.isHealer) {
                this.healCooldown += activeDt;
                while (this.healCooldown >= this.healCooldownFrames) {
                    this.healCooldown -= this.healCooldownFrames; Reforged.emit('enemy:ability',this);
                    createParticleExplosion(this.x, this.y, '#10b981', 12);
                    state.enemies.forEach(e => {
                        if (e !== this && e.hp > 0 && Math.hypot(e.x - this.x, e.y - this.y) <= this.healRadius) {
                            e.hp = Math.min(e.maxHp, e.hp + this.healBase + state.level * this.healPerLevel);
                            createParticle(e.x, e.y, '#10b981', 3, 1.2);
                        }
                    });
                }
            }

            let target = this.path[this.pathIndex];
            if (!target) return false;
            let dx = target.x - this.x, dy = target.y - this.y;
            let dist = Math.hypot(dx, dy);
            if (dist > 0.1) {
                this.angle = Math.atan2(dy, dx);
            }

            const intendedMove = this.speed * activeDt;
            let remainingMove = intendedMove;
            while (remainingMove > 0 && this.pathIndex < this.path.length) {
                target = this.path[this.pathIndex];
                dx = target.x - this.x; dy = target.y - this.y; dist = Math.hypot(dx, dy);
                if (dist <= remainingMove) {
                    this.x = target.x; this.y = target.y; remainingMove -= dist; this.pathIndex++;
                    if (this.pathIndex >= this.path.length) {
                        const penalty = this.castleDamage;
                        if (this.isBoss) {
                            state.bossEscapedThisBattle = true;
                            if (this.bossProfile) showBossBanner(`${this.bossProfile.name.toUpperCase()} ПРОРВАЛСЯ К ЗАМКУ`, 2100, 'breach');
                        }
                        const castleHit = applyCastleDamage(penalty);
                        screenShake(castleHit.damage > 0 ? 25 : 10); createParticleExplosion(this.x, this.y, castleHit.damage > 0 ? '#ef4444' : '#60a5fa', castleHit.damage > 0 ? 50 : 18); updateHUD();
                        let livesEl = document.getElementById('lives-container');
                        if (castleHit.damage > 0 && livesEl) { livesEl.classList.remove('damage-flash'); void livesEl.offsetWidth; livesEl.classList.add('damage-flash'); }
                        return false;
                    }
                } else {
                    if (dist > 0) { this.x += (dx / dist) * remainingMove; this.y += (dy / dist) * remainingMove; }
                    remainingMove = 0;
                }
            }
            this.advanceAnimation(activeDt, intendedMove > 0.01);
            return true;
        }

        draw() { Reforged.enemy(ctx,this); }
    }

    // R68 tactical engineering: nonstacking support auras and bounded boss sealing.
    // Values are evaluated from real deployed, active towers and do not mutate base stats.
    // R91.3: comparable "first" priority on unequal lanes is the distance still
    // left to the exit, not the number of sampled nodes already visited.
    function remainingEnemyRouteDistance(enemy) {
        const path = enemy.path || PATH;
        if (!Array.isArray(path) || path.length < 2) return Infinity;
        let arcs = enemyRouteArcCache.get(path);
        if (!arcs) {
            arcs = [0];
            for (let i=1; i<path.length; i++) arcs.push(arcs[i-1]+Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y));
            enemyRouteArcCache.set(path,arcs);
        }
        const next=Math.max(1,Math.min(path.length-1,Math.floor(enemy.pathIndex)||1));
        const a=path[next-1],b=path[next],length=arcs[next]-arcs[next-1];
        const fraction=length>0?Math.max(0,Math.min(1,((enemy.x-a.x)*(b.x-a.x)+(enemy.y-a.y)*(b.y-a.y))/(length*length))):0;
        return Math.max(0,arcs[arcs.length-1]-arcs[next-1]-fraction*length);
    }

    function supportHasteForTower(recipient) {
        if (recipient.stats.attackMode === 'support') return 1;
        let strongest = 1;
        for (const support of state.towers) {
            if (support === recipient || support.disabledTimer > 0 || support.stats.attackMode !== 'support') continue;
            if (Math.hypot(support.x - recipient.x, support.y - recipient.y) > support.stats.range) continue;
            strongest = Math.max(strongest, Number(support.stats.supportHaste) || 1);
        }
        return Math.min(1.16, strongest); // multiple standards never stack
    }
    class Tower {
        constructor(x, y, typeInfo) {
            this.x = x; this.y = y; this.type = typeInfo; this.stats = Object.assign({}, typeInfo);
            this.path = 0; this.tier = 0; this.totalInvested = typeInfo.cost;
            this.fireTimer = 0; this.target = null; this.angle = 0;
            this.shotCount = 0; this.heatTarget = null; this.heatMult = 1.0; this.auraTimer = 0; this.laserTickAccumulator = 0; this.disabledTimer = 0;
        }

        upgrade(pathNum) {
            if (this.path !== 0 && this.path !== pathNum) return false;
            if (this.tier >= 3) return false;
            const towerUpgrade = UPGRADES[this.type.id];
            const branch = towerUpgrade && towerUpgrade[`path${pathNum}`];
            const upgData = branch && branch[this.tier];
            if (!upgData || typeof upgData.apply !== 'function') return false;
            if (state.gold >= upgData.cost) {
                state.gold -= upgData.cost; this.totalInvested += upgData.cost; this.path = pathNum; this.tier++; upgData.apply(this.stats);
                Reforged.emit('tower:upgraded',this);
                addMetaStat('towerUpgradesBought', 1); evaluateAchievements(true);
                createParticleExplosion(this.x, this.y, '#f59e0b', 20); addFloatText(this.x, this.y - 30, "УЛУЧШЕНО!", '#f59e0b', 22);
                updateHUD(); return true;
            }
            return false;
        }

        fireChainAttack(primary) {
            if (!primary || primary.hp <= 0) return;
            const maxJumps=Math.max(0,Math.min(6,Math.floor(Number(this.stats.chainJumps)||0)));
            const chainRange=Math.max(40,Number(this.stats.chainRange)||110);
            const falloff=Math.max(0.35,Math.min(0.95,Number(this.stats.chainFalloff)||0.72));
            const minScale=Math.max(0.20,Math.min(1,Number(this.stats.chainMinScale)||0.35));
            const struck=[primary];
            let anchor=primary;
            for(let jump=0;jump<maxJumps;jump++) {
                let nearest=null, nearestDist=Infinity;
                for (const enemy of state.enemies) {
                    if (!enemy || enemy.hp <= 0 || struck.includes(enemy) || !enemy.canBeTargeted()) continue;
                    const dist=Math.hypot(enemy.x-anchor.x,enemy.y-anchor.y);
                    if (dist <= chainRange && dist < nearestDist) { nearest=enemy; nearestDist=dist; }
                }
                if (!nearest) break;
                struck.push(nearest); anchor=nearest;
            }
            let fromX=this.x+Math.cos(this.angle)*20, fromY=this.y+Math.sin(this.angle)*20;
            struck.forEach((enemy,index) => {
                const scale=index===0?1:Math.max(minScale,Math.pow(falloff,index));
                enemy.takeDamage(this.stats.damage*scale,this,false);
                if (Number(this.stats.chainStunFrames)>0) enemy.applyEffect('stun',Number(this.stats.chainStunFrames)*(1-enemy.ccResist));
                createLightningArc(fromX,fromY,enemy.x,enemy.y,this.stats.color,index===0?3.4:2.5);
                createParticle(enemy.x,enemy.y,this.stats.color,index===0?3:2,1.1,false,true);
                fromX=enemy.x; fromY=enemy.y;
            });
        }

        update(dtFrames) {
            const dt = Math.max(0, dtFrames || 0);
            if (dt <= 0) return;
            if (this.disabledTimer > 0) {
                this.disabledTimer = Math.max(0, this.disabledTimer - dt);
                this.target = null; this.targets = []; this.laserTickAccumulator = 0;
                return;
            }
            const globalHaste = state.warBannerTimer > 0 ? WAR_BANNER_HASTE_MULT : 1;
            const attackHaste = Math.min(1.40, globalHaste * supportHasteForTower(this));
            const attackDt = dt * attackHaste;
            // Support and seal towers use bounded pulses. They never spawn dummy projectiles.
            if (this.stats.attackMode === 'support') {
                this.auraTimer += dt;
                if (this.auraTimer >= 180) {
                    this.auraTimer %= 180;
                    const nearby = state.towers.filter(t => t !== this && t.disabledTimer > 0 && Math.hypot(t.x-this.x,t.y-this.y) <= this.stats.range);
                    if (Number(this.stats.supportCleanse) > 0) nearby.forEach(t => {t.disabledTimer = Math.max(0,t.disabledTimer - this.stats.supportCleanse);});
                    createParticle(this.x, this.y, this.stats.color, 3, 1.0, false, true);
                }
                return;
            }
            if (this.stats.attackMode === 'seal') {
                this.auraTimer += dt;
                const interval = Math.max(80, Number(this.stats.sealPulseFrames) || 175);
                if (this.auraTimer >= interval) {
                    this.auraTimer %= interval;
                    const targets = state.enemies.filter(e => e.hp > 0 && e.canBeTargeted() && Math.hypot(e.x-this.x,e.y-this.y) <= this.stats.range);
                    // The boss seal can only delay a cooldown, not a telegraphed attack or phase change.
                    const boss = targets.find(e=>e.isBoss && e.bossProfile && !e.bossPendingAbility && e.bossSpawnTimer<=0);
                    if (boss && boss.bossAbilityTimer > 0) {
                        const used = Math.max(0,Number(boss.r68SealDelayUsed)||0);
                        const grant = Math.min(Math.max(0,this.stats.sealDelayCap-used), Number(this.stats.sealDelayFrames)||0);
                        if (grant > 0) {boss.bossAbilityTimer += grant;boss.r68SealDelayUsed=used+grant;addFloatText(boss.x,boss.y-55,'ПЕЧАТЬ +'+Math.round(grant/60*10)/10+'с',this.stats.color,13);}
                    }
                    for (const enemy of targets.slice(0,4)) {
                        if (enemy.shieldHp > 0) enemy.shieldHp=Math.max(0,enemy.shieldHp - Math.min(enemy.shieldHp,Number(this.stats.sealShieldDrain)||0));
                        if (Number(this.stats.sealEnergyVuln)>0) enemy.applyEnergyVulnerability(this.stats.sealEnergyVuln,180);
                        createParticle(enemy.x,enemy.y,this.stats.color,2,1.1,false,true);
                    }
                }
                return;
            }
            const fireTimerBefore = this.fireTimer;
            if (this.fireTimer > 0) this.fireTimer -= attackDt;
            const fireOvershoot = fireTimerBefore > 0 && this.fireTimer <= 0 ? Math.max(0, -this.fireTimer) : 0;
            if (this.stats.aura) {
                this.auraTimer += dt;
                while (this.auraTimer >= 30) {
                    this.auraTimer -= 30;
                    createParticleExplosion(this.x, this.y, 'rgba(6, 182, 212, 0.1)', 5);
                    state.enemies.forEach(e => { if (e.hp > 0 && Math.hypot(e.x - this.x, e.y - this.y) <= this.stats.range) e.applyEffect('slow', 40 * (1 - e.ccResist)); });
                }
            }

            let targets = [];
            for (let e of state.enemies) {
                if (!e.canBeTargeted()) continue;
                if (Math.hypot(e.x - this.x, e.y - this.y) <= this.stats.range) {
                    targets.push({ enemy: e, progress: -remainingEnemyRouteDistance(e) });
                }
            }
            const mode = this.stats.targetMode || this.type.targetMode || 'first';
            if (mode === 'strong') {
                targets.sort((a, b) => ((b.enemy.isBoss ? 1 : 0) - (a.enemy.isBoss ? 1 : 0)) || (b.enemy.hp - a.enemy.hp) || (b.progress - a.progress));
            } else if (mode === 'fast') {
                targets.sort((a, b) => (b.enemy.baseSpeed - a.enemy.baseSpeed) || (b.progress - a.progress));
            } else if (mode === 'unpoisoned') {
                targets.sort((a, b) => ((a.enemy.effects.poison > 0 ? 1 : 0) - (b.enemy.effects.poison > 0 ? 1 : 0)) || (b.progress - a.progress));
            } else if (mode === 'cluster') {
                targets.forEach(item => {
                    item.density = state.enemies.reduce((count, other) => count + (other.hp > 0 && Math.hypot(other.x - item.enemy.x, other.y - item.enemy.y) <= Math.max(60, this.stats.aoe || 80) ? 1 : 0), 0);
                });
                targets.sort((a, b) => (b.density - a.density) || (b.progress - a.progress));
            } else targets.sort((a, b) => b.progress - a.progress);

            let maxTargets = this.stats.multiTarget || 1;
            this.targets = targets.slice(0, maxTargets).map(t => t.enemy);
            this.target = this.targets[0] || null;

            if (this.stats.heatMode && this.target !== this.heatTarget) { this.heatTarget = this.target; this.heatMult = 1.0; }

            if (this.target) {
                let diff = Math.atan2(this.target.y - this.y, this.target.x - this.x) - this.angle;
                while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2;
                this.angle += diff * smoothingFactor(0.3, dt);

                if (this.stats.isLaser) {
                    if (!this.rfLaserSoundAt || Reforged.time-this.rfLaserSoundAt>.25) { this.rfLaserSoundAt=Reforged.time; Reforged.emit('tower:fired',this); }
                    // The original laser dealt one integer damage tick per 60 Hz frame. Keep that exact cadence
                    // through an accumulator so 30/60/90/120/144 Hz all resolve the same number of damage ticks.
                    this.laserTickAccumulator += attackDt;
                    while (this.laserTickAccumulator >= 1 - 1e-9) {
                        this.laserTickAccumulator = Math.max(0, this.laserTickAccumulator - 1);
                        if (this.stats.heatMode && this.target === this.heatTarget) this.heatMult = Math.min(this.heatMult + 0.015, 3.0);
                        // R5: laser keeps fractional per-frame damage instead of jumping abruptly from 1 to 2 after one upgrade.
                        const nominalDamagePerFrame = Math.max(0.05, this.stats.damage * (this.stats.heatMode ? this.heatMult : 1));
                        this.targets.forEach(t => {
                            if (t.hp > 0) t.takeDamage(nominalDamagePerFrame, this, false);
                            createParticle(t.x, t.y, this.stats.color, 1, 3);
                        });
                    }
                } else if (this.fireTimer <= 0 && Math.abs(diff) < 0.2) {
                    this.shotCount++;
                    Reforged.emit('tower:fired',this);
                    let sX = this.x + Math.cos(this.angle) * 20, sY = this.y + Math.sin(this.angle) * 20;
                    let isCrit = this.stats.headshot && this.shotCount % 4 === 0;

                    if (this.stats.attackMode === 'chain') {
                        this.fireChainAttack(this.target);
                    } else {
                        // V27 Gameplay QA: rapid-fire must preserve the previously purchased Double Shot upgrade.
                        if (this.stats.fireRate < 10 && this.stats.doubleShot) {
                            let o1 = this.angle + 0.2, o2 = this.angle - 0.2;
                            state.projectiles.push(Projectile.acquire(sX + Math.cos(o1)*10, sY + Math.sin(o1)*10, this.target, this, isCrit, true));
                            state.projectiles.push(Projectile.acquire(sX + Math.cos(o2)*10, sY + Math.sin(o2)*10, this.target, this, isCrit, true));
                        } else if (this.stats.fireRate < 10) {
                            state.projectiles.push(Projectile.acquire(sX, sY, this.target, this, isCrit, true));
                        } else if (this.stats.doubleShot) {
                            let o1 = this.angle + 0.2, o2 = this.angle - 0.2;
                            state.projectiles.push(Projectile.acquire(sX + Math.cos(o1)*10, sY + Math.sin(o1)*10, this.target, this, isCrit));
                            state.projectiles.push(Projectile.acquire(sX + Math.cos(o2)*10, sY + Math.sin(o2)*10, this.target, this, isCrit));
                        } else { state.projectiles.push(Projectile.acquire(sX, sY, this.target, this, isCrit)); }
                    }
                    this.fireTimer = Math.max(0.001, this.stats.fireRate - Math.min(fireOvershoot, Math.max(0, this.stats.fireRate - 0.001)));
                    createParticle(sX, sY, this.stats.attackMode === 'chain' ? this.stats.color : '#fbbf24', this.stats.attackMode === 'chain' ? 2 : 3, this.stats.attackMode === 'chain' ? 1.3 : 4);
                    if (Number(this.stats.fireShake) > 0) screenShake(Number(this.stats.fireShake));
                }
            }
        }

        draw() { Reforged.tower(ctx,this); }
    }

    class Projectile {
        static free = [];
        static acquire(x,y,target,sourceTower,isCrit=false,isTracer=false) {
            const projectile=Projectile.free.pop();
            return projectile ? projectile.reset(x,y,target,sourceTower,isCrit,isTracer) : new Projectile(x,y,target,sourceTower,isCrit,isTracer);
        }
        static release(projectile) {
            projectile.target=null;projectile.sourceTower=null;projectile.stats=null;
            if(Projectile.free.length<512)Projectile.free.push(projectile);
        }
        constructor(x,y,target,sourceTower,isCrit=false,isTracer=false) {
            this.fxX=new Float32Array(8);this.fxY=new Float32Array(8);
            this.reset(x,y,target,sourceTower,isCrit,isTracer);
        }
        reset(x,y,target,sourceTower,isCrit=false,isTracer=false) {
            this.x=x;this.y=y;this.target=target;this.sourceTower=sourceTower;this.stats=sourceTower.stats;
            // R91.3: volley identity belongs to the projectile, never to a later shot.
            this.sourceShotCount=Math.max(0,Math.floor(Number(sourceTower.shotCount)||0));
            this.speed=this.stats.projSpeed;this.isCrit=isCrit;this.isTracer=isTracer;
            this.targetX=target.x;this.targetY=target.y;this.vx=0;this.vy=0;this.calcVel();
            this.fxDistance=Math.max(1,Math.hypot(this.targetX-x,this.targetY-y));
            this.fxX.fill(x);this.fxY.fill(y);Reforged.emit('projectile:spawn',this);return this;
        }
        calcVel() { let dx = this.targetX - this.x, dy = this.targetY - this.y; let dist = Math.max(0.000001, Math.hypot(dx, dy)); this.vx = (dx / dist) * this.speed; this.vy = (dy / dist) * this.speed; }
        update(dtFrames) {
            const dt = Math.max(0, dtFrames || 0);
            if (dt <= 0) return true;
            if (this.target && this.target.canBeTargeted()) { this.targetX = this.target.x; this.targetY = this.target.y; this.calcVel(); }
            let dx = this.targetX - this.x, dy = this.targetY - this.y;
            const move = this.speed * dt;
            if (Math.hypot(dx, dy) <= move) { this.x = this.targetX; this.y = this.targetY; this.hit(); return false; }
            this.x += this.vx * dt; this.y += this.vy * dt; Reforged.projectileStep(this,dt); return true;
        }
        hit() {
            Reforged.emit('projectile:impact',this);
            let baseDmg = this.stats.damage * (this.isCrit ? 4 : 1);
            if (this.isCrit) { addFloatText(this.targetX, this.targetY - 52, 'КРИТ ×4', '#fde047', 18); createParticleExplosion(this.targetX, this.targetY, '#fde047', 9); }
            const isPhysicalHit = this.stats.damageKind === 'physical';
            const applyDirectEffects = (enemy) => {
                if (!enemy || enemy.hp <= 0) return;
                if (this.stats.slow) enemy.applyEffect('slow', this.stats.slowDur * (1 - enemy.ccResist));
                if (this.stats.bleed && enemy.applyEffect('bleed', 120)) enemy.bleedSource = this.sourceTower;
                if (this.stats.poison) enemy.applyPoison(this.stats.poisonDuration || 180, this.stats.poisonDamage || 2, this.stats.poisonTickFrames || 30, this.sourceTower);
                if (this.stats.brittle) enemy.applyBrittle(this.stats.brittleDuration || 180);
                if (this.stats.armorShred) enemy.applyArmorShred(this.stats.armorShred, this.stats.armorShredDuration || 180);
                if (this.stats.energyVulnerability) enemy.applyEnergyVulnerability(this.stats.energyVulnerability, this.stats.energyVulnerabilityDuration || this.stats.poisonDuration || 180);
                if (this.stats.suppressive && this.sourceShotCount > 0 && this.sourceShotCount % 5 === 0) enemy.applyArmorShred(0.10, 90);
                if (this.stats.freezeChance && Math.random() < this.stats.freezeChance) enemy.applyEffect('freeze', 120 * (1 - enemy.ccResist));
            };
            if (this.stats.aoe) {
                createParticleExplosion(this.x, this.y, '#ef4444', 20, true);
                if (this.stats.napalm) state.hazards.push(new HazardZone(this.x, this.y, this.stats.aoe, 'napalm'));
                state.enemies.forEach(e => {
                    if (e.hp <= 0) return;
                    let dist = Math.hypot(e.x - this.x, e.y - this.y);
                    if (dist <= this.stats.aoe) {
                        let dmg = baseDmg;
                        if (this.stats.epicenter && dist < 20) dmg *= 2;
                        e.takeDamage(dmg, this.sourceTower, isPhysicalHit, this.isCrit);
                        if (this.stats.stun) e.applyEffect('stun', this.stats.stun * (1 - e.ccResist));
                        if (this.stats.poison) e.applyPoison(this.stats.poisonDuration || 180, this.stats.poisonDamage || 2, this.stats.poisonTickFrames || 30, this.sourceTower);
                    }
                });
                if (this.stats.cluster) {
                    const count = Math.max(1, Number(this.stats.clusterCount) || 3);
                    const radius = Math.max(20, Number(this.stats.clusterRadius) || 38);
                    const splash = Math.max(0.1, Number(this.stats.clusterDamage) || 0.35);
                    for (let i = 0; i < count; i++) {
                        const angle = (Math.PI * 2 * i / count) + Math.PI / 6;
                        const cx = this.x + Math.cos(angle) * Math.min(52, this.stats.aoe * 0.48);
                        const cy = this.y + Math.sin(angle) * Math.min(52, this.stats.aoe * 0.48);
                        createParticleExplosion(cx, cy, '#fb923c', 8, true);
                        state.enemies.forEach(e => { if (e.hp > 0 && Math.hypot(e.x - cx, e.y - cy) <= radius) e.takeDamage(baseDmg * splash, this.sourceTower, isPhysicalHit, this.isCrit); });
                    }
                }
            } else {
                let hitTarget = null;
                if (this.target && this.target.canBeTargeted() && Math.hypot(this.target.x - this.x, this.target.y - this.y) < Math.max(45, Number(this.target.radius) || 0)) hitTarget = this.target;
                if (hitTarget) {
                    hitTarget.takeDamage(baseDmg, this.sourceTower, isPhysicalHit, this.isCrit);
                    applyDirectEffects(hitTarget);
                    if (this.stats.pierceTargets > 0 && this.sourceTower) {
                        const dx=hitTarget.x-this.sourceTower.x, dy=hitTarget.y-this.sourceTower.y;
                        const len=Math.max(1,Math.hypot(dx,dy)), ux=dx/len, uy=dy/len;
                        const extra=state.enemies.filter(e => e!==hitTarget && e.hp>0 && e.canBeTargeted()).map(e=>{
                            const rx=e.x-hitTarget.x, ry=e.y-hitTarget.y;
                            return {enemy:e, forward:rx*ux+ry*uy, sideways:Math.abs(rx*uy-ry*ux)};
                        }).filter(item => item.forward>=8 && item.forward<=(this.stats.pierceRange||145) && item.sideways<=24)
                        .sort((a,b)=>a.forward-b.forward).slice(0,Math.min(4,this.stats.pierceTargets));
                        extra.forEach(({enemy},index)=>{
                            enemy.takeDamage(baseDmg*(this.stats.pierceFactor||.55)*Math.pow(.82,index),this.sourceTower,isPhysicalHit);
                            createParticle(enemy.x,enemy.y,this.stats.color,2,1.0,false,true);
                        });
                    }
                    const statusRadius = Math.max(0, Number(this.stats.statusRadius) || 0);
                    if (statusRadius > 0) {
                        let spreadCount = 0;
                        for (const enemy of state.enemies) {
                            if (!enemy || enemy === hitTarget || enemy.hp <= 0) continue;
                            if (Math.hypot(enemy.x - hitTarget.x, enemy.y - hitTarget.y) > statusRadius) continue;
                            applyDirectEffects(enemy); spreadCount++;
                            if (spreadCount >= 6) break;
                        }
                        if (spreadCount > 0) createParticle(hitTarget.x, hitTarget.y, this.stats.color, 3, 2, true, true);
                    }
                    if (this.stats.chain) {
                        const chainTargets = state.enemies
                            .filter(e => e !== hitTarget && e.hp > 0 && Math.hypot(e.x - hitTarget.x, e.y - hitTarget.y) <= (this.stats.chainRange || 125))
                            .sort((a, b) => Math.hypot(a.x - hitTarget.x, a.y - hitTarget.y) - Math.hypot(b.x - hitTarget.x, b.y - hitTarget.y))
                            .slice(0, this.stats.chain);
                        chainTargets.forEach((e, idx) => {
                            const scale = idx === 0 ? 0.65 : 0.45;
                            e.takeDamage(baseDmg * scale, this.sourceTower, isPhysicalHit, this.isCrit);
                            if (this.stats.slow) e.applyEffect('slow', this.stats.slowDur * (1 - e.ccResist));
                            createLightningArc(hitTarget.x,hitTarget.y,e.x,e.y,'#a9e3ec',2);
                        });
                    }
                }
                createParticle(this.x, this.y, this.isCrit ? '#ef4444' : this.stats.color, 5, 1, false, true);
            }
        }
        draw() { Reforged.projectile(ctx,this); }
    }

    function onEnemyDeath(enemy) {
        if (!enemy || enemy.deathHandled || enemy.hp > 0 || enemy.pathIndex >= enemy.path.length) return;
        enemy.deathHandled = true;
        Reforged.emit('enemy:death',enemy);
        registerEnemyKill(enemy);
        if (enemy.isBoss && enemy.bossProfile) {
            enemy.bossPendingAbility = null; enemy.bossTelegraphTargets = []; enemy.bossTelegraphTargetsLocked = false;
            showBossDefeated(enemy);
            createParticleExplosion(enemy.x, enemy.y, enemy.bossProfile.phaseColor || '#ef4444', 46, true);
            screenShake(34);
        }
        if (enemy.deathSpawnType !== null && enemy.deathSpawnCount > 0 && !enemy.deathSpawnQueued) {
            enemy.deathSpawnQueued = true;
            for (let i = 0; i < enemy.deathSpawnCount; i++) {
                state.pendingEnemySpawns.push({
                    type: enemy.deathSpawnType,
                    hp: Math.max(1, enemy.maxHp * enemy.deathSpawnHpFactor),
                    reward: Math.max(0, Math.floor(enemy.originalReward * enemy.deathSpawnRewardFactor)),
                    // R76: split offspring appear on parent lane, never beside the road.
                    x: enemy.path[Math.max(0, Math.min(enemy.path.length - 2, enemy.pathIndex - 1 - i * 2))].x,
                    y: enemy.path[Math.max(0, Math.min(enemy.path.length - 2, enemy.pathIndex - 1 - i * 2))].y,
                    pathIndex: Math.max(1, Math.min(enemy.path.length - 1, enemy.pathIndex - i * 2)),
                    routeIndex: enemy.routeIndex
                });
            }
        }
        const killerTower = enemy.lastDamageTower;
        if (killerTower && killerTower.stats && killerTower.stats.detonate && !enemy.detonateHandled) {
            enemy.detonateHandled = true;
            const radius = Math.max(30, Number(killerTower.stats.detonateRadius) || 75);
            const damage = Math.max(1, Number(killerTower.stats.detonateDamage) || 90);
            createParticleExplosion(enemy.x, enemy.y, '#c084fc', 24, true);
            state.enemies.forEach(other => {
                if (other !== enemy && other.hp > 0 && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= radius) other.takeDamage(damage, killerTower, false);
            });
        }
        if (enemy.hp <= 0 && enemy.reward > 0) {
            let bonus = 0; state.towers.forEach(t => { if(t.stats.bounty && Math.hypot(t.x-enemy.x, t.y-enemy.y) <= t.stats.range) bonus += t.stats.bounty; });
            const payout = enemy.reward + bonus;
            state.gold += payout; enemy.reward = 0;
            createParticleExplosion(enemy.x, enemy.y, enemy.color, 15, true);
            addFloatText(enemy.x, enemy.y, `+${payout}`, '#fbbf24', 22); updateHUD();
        }
    }

    // R1 Core Playability Recovery — placement must always explain why it succeeds or fails.
    // This helper was accidentally missing in V30, causing a ReferenceError on every build attempt.
    function distToSegmentSquared(point, a, b) {
        const vx = b.x - a.x, vy = b.y - a.y;
        const wx = point.x - a.x, wy = point.y - a.y;
        const lenSq = vx * vx + vy * vy;
        if (lenSq <= 1e-9) return (point.x - a.x) ** 2 + (point.y - a.y) ** 2;
        const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
        const px = a.x + vx * t, py = a.y + vy * t;
        return (point.x - px) ** 2 + (point.y - py) ** 2;
    }

    const TOWER_FOOTPRINT_RADIUS = 29;
    const TOWER_SLOT_MIN_SPACING = TOWER_FOOTPRINT_RADIUS * 2; // R76: two 29px tower footprints must never overlap. Closer marked pads become unavailable when occupied.
    const BUILD_SLOT_PICK_RADIUS = 42; // Finger/mouse forgiveness; nearest anchor wins.
    const BUILD_SLOT_RENDER_RADIUS = 11;
    const BASE_TOWER_LIMIT = 10;
    const TOWER_LIMIT_PER_CASTLE_LEVEL = 2;
    function getTowerLimit() { return BASE_TOWER_LIMIT + Math.max(0, Number(metaStats.towerCap || 0)) * TOWER_LIMIT_PER_CASTLE_LEVEL; }
    let buildFeedbackTimer = null;
    let pendingMobileBuild = null;
    function isMobileBuildInteraction() {
        return (window.R49UI && R49UI.isMobile && R49UI.isMobile()) ||
            matchMedia('(pointer:coarse)').matches || state.pointerType === 'touch' || state.pointerType === 'pen';
    }
    function updateMobileBuildControls() {
        const dock = document.getElementById('bottom-panel');
        const accept = document.getElementById('r50-build-accept');
        const panel = document.getElementById('r50-build-confirm');
        if (!dock || !accept || !panel) return;
        const on = !!pendingMobileBuild && state.screen === 'play';
        dock.classList.toggle('r50-confirming', on);
        panel.setAttribute('aria-hidden', String(!on));
        if (!on) return;
        const t = TOWER_TYPES[pendingMobileBuild.towerKey];
        const n = t ? t.cost : 0;
        accept.textContent = `Построить · ${n}`;
        accept.setAttribute('aria-label', `Подтвердить строительство: ${t ? t.name : 'башня'}, ${n} золота, площадка ${pendingMobileBuild.slot.id}`);
        accept.disabled = !getBuildSlotStatus(pendingMobileBuild.slot, pendingMobileBuild.towerKey).valid;
        panel.setAttribute('aria-label', `Подтверждение строительства: ${t ? t.name : 'башня'} на площадке ${pendingMobileBuild.slot.id}`);
    }
    function cancelPendingMobileBuild() {
        pendingMobileBuild = null;
        updateMobileBuildControls();
    }
    function beginMobileBuildPreview(status, towerKey) {
        pendingMobileBuild = {towerKey,slot:status.slot,level:state.level,run:state.battlesStartedSerial||0};
        // No modal, backdrop or focus capture: the map and running battle remain interactive.
        updateMobileBuildControls();
        // Preview is conveyed by the highlighted pad and the fixed action row.
        // Do not show a toast over the battlefield during selection on mobile.
        showBuildFeedback('', 'info');
    }
    function placeApprovedTower(status,towerKey) {
        const t=TOWER_TYPES[towerKey];
        if (!t || !status || !status.valid || !status.slot || state.screen!=='play') return false;
        const slot=status.slot;
        state.gold-=t.cost;
        const builtTower=new Tower(slot.x,slot.y,t);
        Reforged.emit('tower:placed',builtTower);
        builtTower.buildSlotIndex=status.slotIndex;
        state.towers.push(builtTower);
        addMetaStat('towersBuilt',1);evaluateAchievements(true);playSfx('build');
        createParticleExplosion(slot.x,slot.y,'#f8fafc',15);screenShake(4);updateHUD();
        clearTowerSelection(false);
        showBuildFeedback(`${t.name} построена · башни ${state.towers.length}/${getTowerLimit()} · ${state.gold}💰.`, 'valid');
        return true;
    }
    function confirmPendingMobileBuild() {
        const pending=pendingMobileBuild;
        if (!pending) return false;
        // Consume pending transaction BEFORE any game-state mutation (double tap safety).
        cancelPendingMobileBuild();
        if (state.screen!=='play' || !isMobileBuildInteraction() || state.level!==pending.level ||
            (state.battlesStartedSerial||0)!==pending.run || state.selectedTowerBtn!==pending.towerKey ||
            !isTowerUnlocked(pending.towerKey)) {showBuildFeedback('Постройка отменена: условия изменились.', 'info');return false;}
        const freshSlot=normalizedBuildSlots().find(sl=>sl.index===pending.slot.index&&sl.id===pending.slot.id&&
            sl.x===pending.slot.x&&sl.y===pending.slot.y);
        const status=getBuildSlotStatus(freshSlot,pending.towerKey);
        if (!status.valid) {showBuildFeedback(status.reason,'error');playSfx('error');return false;}
        return placeApprovedTower(status,pending.towerKey);
    }
    function rejectPendingMobileBuild() {
        if (!pendingMobileBuild) return;
        cancelPendingMobileBuild();
        showBuildFeedback('Постройка отменена: золото не списано.','info');
    }
    const r50Accept=document.getElementById('r50-build-accept');
    const r50Cancel=document.getElementById('r50-build-cancel');
    if (r50Accept) r50Accept.addEventListener('click', confirmPendingMobileBuild);
    if (r50Cancel) r50Cancel.addEventListener('click', rejectPendingMobileBuild);


    function showBuildFeedback(message, kind = 'info', sticky = false) {
        const el = document.getElementById('build-feedback');
        if (!el) return;
        if (buildFeedbackTimer) { clearTimeout(buildFeedbackTimer); buildFeedbackTimer = null; }
        el.textContent = message || '';
        el.className = `${message ? 'show ' : ''}${kind}`.trim();
        if (message && (!sticky || window.matchMedia('(max-width:1023px), (max-height:600px)').matches)) buildFeedbackTimer = setTimeout(() => { el.className = ''; }, 1800);
    }

    function clearTowerSelection(clearFeedback = true) {
        cancelPendingMobileBuild();
        state.selectedTowerBtn = null;
        // The visual and accessible states must match after any cancel, including
        // tab changes, leaving a battle and preparing the next level.
        document.querySelectorAll('.tower-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');
        });
        if (clearFeedback) showBuildFeedback('', 'info');
    }

    // Narrow public UI bridge. Gameplay and save state remain private to game.js.
    // R49 lives in another classic-script closure; it cannot call the local
    // clearTowerSelection function by name.
    window.TD_R91_BATTLE_UI = Object.freeze({
        cancelArmedTower: function () {
            if (state.screen !== 'play') return false;
            if (!state.selectedTowerBtn && !pendingMobileBuild) return false;
            clearTowerSelection();
            return true;
        },
        snapshot: function () { return Object.freeze({screen:state.screen,armedTower:state.selectedTowerBtn||null,pendingBuild:!!pendingMobileBuild}); }
    });

    function normalizedBuildSlots() {
        return (Array.isArray(BUILD_SLOTS) ? BUILD_SLOTS : []).map((slot, index) => ({
            id: Number(slot.id) || index + 1,
            index,
            x: Number(slot.x),
            y: Number(slot.y)
        })).filter(slot => Number.isFinite(slot.x) && Number.isFinite(slot.y));
    }

    function getNearestBuildSlot(x, y, maxRadius = BUILD_SLOT_PICK_RADIUS) {
        let best = null;
        let bestDistance = Math.max(0, Number(maxRadius) || 0);
        for (const slot of normalizedBuildSlots()) {
            const d = Math.hypot(slot.x - x, slot.y - y);
            if (d <= bestDistance) { best = slot; bestDistance = d; }
        }
        return best ? Object.assign({}, best, { distance:bestDistance }) : null;
    }

    function towerAtSlot(slot) {
        if (!slot) return null;
        return state.towers.find(t => (Number.isInteger(t.buildSlotIndex) && t.buildSlotIndex === slot.index) || Math.hypot(t.x - slot.x, t.y - slot.y) < 8) || null;
    }

    function getBuildSlotStatus(slot, towerKey = state.selectedTowerBtn) {
        if (state.screen !== 'play') return { valid:false, code:'screen', reason:'Строительство доступно только во время уровня.' };
        if (!towerKey || !TOWER_TYPES[towerKey]) return { valid:false, code:'selection', reason:'Сначала выберите башню.' };
        if (!slot) return { valid:false, code:'slot', reason:'Выберите одну из подсвеченных площадок для башни.' };
        const ground = TD_ARENA_GEOMETRY.slotStatus(activeMapConfig, slot);
        if (!ground.valid) return { valid:false, code:ground.code, slot, slotIndex:slot.index,
            reason:ground.code === 'road' ? 'Башня перекрывает дорогу. Выберите другую площадку.' : 'Здесь нет безопасной площадки для башни.' };
        if (towerAtSlot(slot)) return { valid:false, code:'occupied', slot, slotIndex:slot.index, reason:'Эта площадка уже занята.' };
        const towerLimit = getTowerLimit();
        if (state.towers.length >= towerLimit) {
            return { valid:false, code:'limit', slot, slotIndex:slot.index, reason:`Лимит башен: ${state.towers.length}/${towerLimit}. Улучшите «Расширение гарнизона» в штабе или продайте башню.` };
        }
        if (state.towers.some(t => Math.hypot(t.x - slot.x, t.y - slot.y) < TOWER_SLOT_MIN_SPACING)) {
            return { valid:false, code:'spacing', slot, slotIndex:slot.index, reason:'Соседняя площадка занята: башни здесь будут перекрывать друг друга.' };
        }
        const typeInfo = TOWER_TYPES[towerKey];
        if (state.gold < typeInfo.cost) return { valid:false, code:'gold', slot, slotIndex:slot.index, reason:`Недостаточно золота: нужно ${typeInfo.cost}💰.` };
        return { valid:true, code:'ok', slot, slotIndex:slot.index, x:slot.x, y:slot.y, reason:`Можно строить: ${typeInfo.name} · ${typeInfo.cost}💰` };
    }

    function getBuildPositionStatus(x, y, towerKey = state.selectedTowerBtn) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return { valid:false, code:'coords', reason:'Не удалось определить место строительства.' };
        const slot = getNearestBuildSlot(x, y);
        const status = getBuildSlotStatus(slot, towerKey);
        if (slot && !status.slot) return Object.assign({}, status, { slot, slotIndex:slot.index, x:slot.x, y:slot.y });
        return status;
    }

    // Compatibility helpers retained for old diagnostics. Gameplay no longer classifies arbitrary painted terrain.
    function pointInBuildZone(x, y, zone) {
        if (!zone) return false;
        const zx = Number(zone.x), zy = Number(zone.y);
        return Number.isFinite(zx) && Number.isFinite(zy) && Math.hypot(x - zx, y - zy) <= BUILD_SLOT_PICK_RADIUS;
    }
    function isTerrainBuildable(x, y) { return !!getNearestBuildSlot(x, y, BUILD_SLOT_PICK_RADIUS); }

    const BUILD_DEBUG = (() => { try { return new URLSearchParams(location.search).get('builddebug') === '1'; } catch (_) { return false; } })();

    function drawBuildZoneOverlay() {
        const towerKey = state.selectedTowerBtn;
        if (!towerKey || !TOWER_TYPES[towerKey]) return;
        ctx.save();
        for (const slot of normalizedBuildSlots()) {
            const status = getBuildSlotStatus(slot, towerKey);
            const occupied = !!towerAtSlot(slot);
            if (occupied) continue;
            ctx.beginPath(); ctx.arc(slot.x, slot.y, BUILD_SLOT_RENDER_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = status.valid ? 'rgba(16,185,129,.23)' : 'rgba(100,116,139,.12)';
            ctx.fill();
            ctx.strokeStyle = status.valid ? 'rgba(74,222,128,.86)' : 'rgba(148,163,184,.34)';
            ctx.lineWidth = status.valid ? 2 : 1.3; ctx.stroke();
            ctx.beginPath(); ctx.arc(slot.x, slot.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = status.valid ? '#bbf7d0' : 'rgba(203,213,225,.45)'; ctx.fill();
            if (BUILD_DEBUG) {
                ctx.fillStyle = '#fef3c7'; ctx.font = 'bold 11px system-ui';
                ctx.fillText(String(slot.id), slot.x + 12, slot.y - 10);
            }
        }
        if (BUILD_DEBUG) {
            ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ROAD_PATHS.forEach(road => { if (!road.length) return; ctx.beginPath(); ctx.moveTo(road[0].x, road[0].y); for (let i = 1; i < road.length; i++) ctx.lineTo(road[i].x, road[i].y); ctx.stroke(); });
            const cap = normalizedBuildSlots().length;
            ctx.fillStyle = '#fef3c7'; ctx.font = 'bold 13px system-ui';
            ctx.fillText(`Площадки: ${cap} · лимит: ${state.towers.length}/${getTowerLimit()}`, 18, 28);
        }
        ctx.restore();
    }

    function isBuildPositionValid(x, y) { return getBuildPositionStatus(x, y).valid; }

    function renderTowerButtons() {
        const tb = document.getElementById('tower-buttons');
        if (!tb) return;
        tb.replaceChildren();
        const battleTowers = equippedTowerIds();
        tb.style.setProperty('--tower-columns', String(battleTowers.length));
        tb.dataset.activeTowerSlots = String(TOWER_ACTIVE_SLOTS);
        tb.classList.toggle('tower-catalog-expanded', TOWER_IDS.length > (TOWER_SYSTEM.legacyBaseCount || 5));
        const fragment = document.createDocumentFragment();
        battleTowers.forEach(function (key) {
            const t = TOWER_TYPES[key]; if (!t) return;
            const unlocked = isTowerUnlocked(key);
            const button = document.createElement('button');
            button.className = 'btn tower-btn' + (unlocked ? '' : ' tower-locked');
            button.type = 'button'; button.id = `btn-${key}`; button.dataset.towerId = key;
            button.title = unlocked ? `${t.name} — ${t.role}: ${t.roleHint}` : `${t.name} — башня пока не открыта`;
            button.setAttribute('aria-label', unlocked ? `${t.name}, ${t.role}, ${t.cost} золота` : `${t.name}, заблокировано`);
            button.disabled = !unlocked;
            const icon = document.createElement('div'); icon.className = 'tower-icon-wrapper'; icon.style.borderColor = t.color;
            const img = document.createElement('img'); img.src = 'images/ui_' + t.assetKey + '.webp?v=r91-6-1.6.21.6'; img.alt = t.name; img.addEventListener('error', function () { img.style.display='none'; }, { once:true });
            icon.appendChild(img);
            const name = document.createElement('div'); name.className='tower-name'; name.textContent=t.battleName||t.name;
            const cost = document.createElement('div'); cost.className='tower-cost'; cost.textContent=unlocked ? String(t.cost) : 'Закрыта';
            button.append(icon,name,cost); fragment.appendChild(button);
        });
        tb.appendChild(fragment);
        if (!tb.dataset.towerDelegated) {
            tb.addEventListener('click', function (event) {
                const button = event.target.closest('.tower-btn[data-tower-id]');
                if (!button || button.disabled) return;
                selectTowerBtn(button.dataset.towerId);
            });
            tb.dataset.towerDelegated='1';
        }
    }

    function initUI() {
        document.getElementById('screen-boot').classList.remove('hidden');
        const metaTabs=document.querySelector('.meta-tabs');
        if(metaTabs && !metaTabs.dataset.delegated){
            metaTabs.addEventListener('click',function(event){
                const btn=event.target.closest('.meta-tab[data-meta-tab]'); if(!btn) return;
                switchMetaTab(btn.dataset.metaTab);
            });
            // Keyboard users can reach all eight sections, including on small screens.
            metaTabs.addEventListener('keydown',function(event){
                const keys=['castle','arsenal','magic','chronicles','achievements','bestiary','profile','plan'];
                const next={'ArrowRight':1,'ArrowDown':1,'ArrowLeft':-1,'ArrowUp':-1}[event.key];
                if(next===undefined && event.key!=='Home' && event.key!=='End') return;
                const current=keys.indexOf(document.activeElement?.dataset?.metaTab || activeMetaTab);
                const index=event.key==='Home'?0:event.key==='End'?keys.length-1:(current+next+keys.length)%keys.length;
                event.preventDefault();switchMetaTab(keys[index]);
                metaTabs.querySelector('[data-meta-tab="'+keys[index]+'"]')?.focus({preventScroll:true});
            });
            metaTabs.dataset.delegated='1';
        }
        renderTowerButtons();
        updateLevelSelector(); renderSkillsUI(); updateMetaQuickSummary();
    }

    function equippedSkillIds() {
        const stored = expansionProgress && Array.isArray(expansionProgress.skillLoadout) ? expansionProgress.skillLoadout : DEFAULT_SKILL_LOADOUT;
        const max = Math.max(1, Number(SKILL_SYSTEM.activeSlots) || DEFAULT_SKILL_LOADOUT.length);
        return stored.slice(0, max).filter(function (id) { return !!(GAME_DATA.skills && GAME_DATA.skills[id]); });
    }
    function isSkillEquipped(skillId) {
        const stored = expansionProgress && Array.isArray(expansionProgress.skillLoadout) ? expansionProgress.skillLoadout : DEFAULT_SKILL_LOADOUT;
        return stored.includes(Number(skillId));
    }
    function setSkillLoadout(nextIds, saveReason) {
        // R68: all nine IDs are real; reject unknown or duplicate selections.
        if (!Array.isArray(nextIds) || nextIds.some(id => !GAME_DATA.skills[Number(id)])) return false;
        const next = normalizeSkillLoadout(nextIds);
        const current = expansionProgress && Array.isArray(expansionProgress.skillLoadout) ? normalizeSkillLoadout(expansionProgress.skillLoadout) : normalizeSkillLoadout(DEFAULT_SKILL_LOADOUT);
        const changed = next.length !== current.length || next.some(function (id,index) { return id !== current[index]; });
        if (!changed) return false;
        expansionProgress.skillLoadout = next;
        renderSkillsUI(); updateSkillAvailabilityUI();
        if (saveReason && window.GameSave && saveStatus.ready) GameSave.save(saveReason);
        return true;
    }
    function renderSkillsUI() {
        const sp = document.getElementById('skills-panel'); if (!sp) return;
        sp.replaceChildren();
        // R84: render all five equipped slots, including explicitly locked abilities.
        const ids = equippedSkillIds();
        sp.dataset.skillSlots = String(SKILL_SYSTEM.activeSlots || 5);
        sp.dataset.skillVisible = String(ids.length);
        sp.style.setProperty('--skill-columns', String(Math.max(1, Math.min(Number(SKILL_SYSTEM.activeSlots)||5, ids.length || 1))));
        const fragment = document.createDocumentFragment();
        ids.forEach(function (id) {
            const def = GAME_DATA.skills[id];
            const button = document.createElement('button');
            button.className = 'btn r54-skill'; button.type = 'button'; button.id = `btn-skill${id}`; button.dataset.skillId = String(id);
            button.setAttribute('aria-label', def.ariaLabel || def.name); button.title=def.ariaLabel || def.name;
            const icon = document.createElement('span'); icon.className = 'skill-icon r62-skill-icon'; icon.appendChild(createRoyalRune(id));
            const name = document.createElement('div'); name.className = 'skill-name'; name.textContent = def.shortName || def.name;
            const cooldown = document.createElement('div'); cooldown.className = 'skill-cooldown'; cooldown.id = `cooldown${id}`; cooldown.textContent = !isSkillUnlocked(id) ? 'Закрыта' : (state.waveActive && !state.prepActive ? 'Готов' : 'В бою');
            button.append(icon, name, cooldown); fragment.appendChild(button);
        });
        sp.appendChild(fragment);
        if (sp.dataset.delegated !== '1') {
            sp.addEventListener('click', function (event) {
                const button = event.target && event.target.closest ? event.target.closest('button[data-skill-id]') : null;
                if (!button || !sp.contains(button)) return;
                useSkill(Number(button.dataset.skillId));
            });
            sp.dataset.delegated = '1';
        }
    }

    // R91.4: derive display from actual battle effects, not from another spell's timer.
    function getActiveSkillLabel(id) {
        if(id===1 && state.meteorBurnTimer>0) return 'Горение';
        if(id===2 && state.timeStop>0) return 'Стоп '+Math.ceil(state.timeStop/GAME_NOMINAL_FPS)+'с';
        if(id===5 && state.hazards.some(h=>h.type==='blackhole' && h.life>0)) return 'Вихрь';
        if(id===6 && state.warBannerTimer>0) return 'Баф '+Math.ceil(state.warBannerTimer/GAME_NOMINAL_FPS)+'с';
        if((id===7 || id===8) && state.castleShieldSource===id && state.bastionTimer>0 && state.bastionShield>0) return 'Щит '+Math.max(0,Math.round(state.bastionShield));
        return '';
    }
    function updateSkillAvailabilityUI() {
        const available = state.screen === 'play' && state.waveActive && !state.prepActive && !systemPauseActive && !adBusy;
        equippedSkillIds().forEach(function (rawId) {
            const id=Number(rawId),btn=document.getElementById(`btn-skill${id}`);if(!btn)return;
            const skill=SKILLS[id],def=GAME_DATA.skills[id],unlocked=isSkillUnlocked(id);
            const cooling=!!(skill && skill.timer>0),effect=getActiveSkillLabel(id);
            const disabled=!available || cooling || !unlocked;
            const effectActive=unlocked && !!effect;
            btn.disabled=disabled;btn.classList.toggle('skill-locked',disabled);btn.setAttribute('aria-disabled',String(disabled));
            const text=!unlocked?'Закрыта':cooling?Math.ceil(skill.timer/GAME_NOMINAL_FPS)+'с':available?'Готов':'В бою';
            const cd=document.getElementById(`cooldown${id}`);if(cd && cd.textContent!==text)cd.textContent=text;
            const ratio=skill?Math.max(0,Math.min(1,1-skill.timer/Math.max(1,skill.cooldown))):0;
            btn.style.setProperty('--r54-progress',(ratio*100).toFixed(1)+'%');
            btn.classList.toggle('active',effectActive);btn.classList.toggle('r54-active',effectActive);
            btn.classList.toggle('r54-cooling',cooling);btn.classList.toggle('r54-ready',!disabled);
            const display=!unlocked?'locked':effectActive?'active':cooling?'cooldown':available?'ready':'waiting';
            btn.dataset.r84State=display;btn.dataset.r91Effect=effectActive?effect:'';
            const label=!unlocked?'Способность пока не открыта':(effectActive?effect+'. ':'')+(cooling?'Перезарядка: '+Math.ceil(skill.timer/GAME_NOMINAL_FPS)+' с. ':available?'Готово. ':'')+(!available?'Доступно только во время активной волны.':'');
            btn.title=(def.ariaLabel||def.shortName)+'. '+label;
            btn.setAttribute('aria-label',btn.title);
        });
    }

    // V26 Presentation helpers + R4 boss encounter presentation
    let bossIntroTimer = null;
    let bossBannerTimer = null;
    let r63WaveEventTimer = null;
    function showR63WaveEvent(kicker, title, tone='wave', duration=1800) {
        const el = document.getElementById('r63-battle-event');
        if (!el || state.screen !== 'play') return;
        if (r63WaveEventTimer) clearTimeout(r63WaveEventTimer);
        const a = document.getElementById('r63-event-kicker');
        const b = document.getElementById('r63-event-title');
        if (a) a.textContent = String(kicker || 'КОРОЛЕВСКАЯ ОБОРОНА');
        if (b) b.textContent = String(title || 'ВОЛНА');
        el.dataset.tone = tone;
        el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
        r63WaveEventTimer = setTimeout(() => { el.classList.remove('show'); r63WaveEventTimer = null; }, Math.max(800,duration));
    }
    function hideR63WaveEvent() {
        const el = document.getElementById('r63-battle-event');
        if (el) el.classList.remove('show');
        if (r63WaveEventTimer) {clearTimeout(r63WaveEventTimer); r63WaveEventTimer=null;}
    }
    function safeAssetUrl(assetKey) { return assetKey ? `url("${releaseImageSrc(assetKey)}")` : 'none'; }

    function showBossBanner(message, duration = 1700, tone='phase') {
        const banner = document.getElementById('boss-banner'); if (!banner) return;
        const label = document.getElementById('r63-banner-text');
        if (label) label.textContent = message; else banner.textContent = message;
        banner.dataset.r63Tone = tone;
        banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
        if (bossBannerTimer) clearTimeout(bossBannerTimer);
        bossBannerTimer = setTimeout(() => { banner.classList.remove('show'); bossBannerTimer = null; }, Math.max(500, duration));
    }

    function showBossPhaseTransition(enemy, label) {
        if (!enemy || !enemy.bossProfile) return;
        showBossBanner(`${enemy.bossProfile.name.toUpperCase()} · ФАЗА ${enemy.bossPhase + 1}: ${String(label || '').toUpperCase()}`, 1750, 'phase');
    }

    function showBossDefeated(enemy) {
        if (!enemy || !enemy.bossProfile) return;
        showBossBanner(`${enemy.bossProfile.name.toUpperCase()} ПОВЕРЖЕН`, 2300, 'defeated');
    }

    function updateBossHUD() {
        const hud = document.getElementById('boss-hud'); if (!hud) return;
        const boss = state.enemies.find(e => e && e.isBoss && e.hp > 0);
        if (!boss || !boss.bossProfile) { hud.classList.remove('show','r63-casting'); delete hud.dataset.r63Phase; document.getElementById('r58-boss-alert')?.classList.remove('show'); return; }
        const p = boss.bossProfile, hpRatio = Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.maxHp)));
        hud.classList.add('show'); hud.style.setProperty('--boss-color', p.phaseColor || p.color || '#ef4444');
        if (hud.dataset.r63Phase !== String(boss.bossPhase)) {
            hud.dataset.r63Phase = String(boss.bossPhase);
            hud.classList.remove('r63-phase-shift'); void hud.offsetWidth; hud.classList.add('r63-phase-shift');
        }
        hud.classList.toggle('r63-casting', !!boss.bossPendingAbility);
        const art = document.getElementById('boss-hud-art'); if (art && art.dataset.assetKey !== p.imgKey) { art.src = releaseImageSrc(p.imgKey); art.dataset.assetKey = p.imgKey; art.alt = p.name || 'Босс'; }
        const name = document.getElementById('boss-hud-name'); if (name) name.textContent = p.name || 'Босс';
        const phase = document.getElementById('boss-hud-phase'); if (phase) phase.textContent = `Фаза ${boss.bossPhase + 1}/3 · ${(p.phaseNames || [])[boss.bossPhase] || ''}`;
        const fill = document.getElementById('boss-hp-fill'); if (fill) fill.style.width = `${hpRatio * 100}%`;
        const shield = document.getElementById('r63-boss-shield');
        if (shield) {
            const amount = Math.max(0, Math.ceil(Number(boss.shieldHp) || 0));
            shield.hidden = amount === 0;
            const value = document.getElementById('r63-boss-shield-value');
            if (value && amount > 0) value.textContent = amount.toLocaleString('ru-RU');
            hud.classList.toggle('r63-shielded', amount > 0);
        }
        const hpText = document.getElementById('boss-hp-text'); if (hpText) hpText.textContent = `${Math.ceil(boss.hp).toLocaleString('ru-RU')} / ${Math.ceil(boss.maxHp).toLocaleString('ru-RU')} · ${Math.ceil(hpRatio * 100)}%`;
        const thresholds = p.phaseThresholds || [];
        const m1 = document.getElementById('boss-hp-mark-1'), m2 = document.getElementById('boss-hp-mark-2');
        if (m1) m1.style.left = `${Math.max(0, Math.min(100, Number(thresholds[0] || .7) * 100))}%`;
        if (m2) m2.style.left = `${Math.max(0, Math.min(100, Number(thresholds[1] || .35) * 100))}%`;
        document.querySelectorAll('.boss-phase-dot').forEach((dot, i) => dot.classList.toggle('active', i <= boss.bossPhase));
        // R58: a non-interactive, battlefield-side telegraph for small screens.
        // Derived only from the boss's actual pending cast, never a speculative
        // timer; inactive outside the <=3.5 second warning window.
        const combatAlert = document.getElementById('r58-boss-alert');
        if (combatAlert) {
            const sec = Math.max(0, Number(boss.bossTelegraphTimer || 0) / GAME_NOMINAL_FPS);
            const show = !!boss.bossPendingAbility && sec > 0 && sec <= 3.5;
            combatAlert.classList.toggle('show', show);
            if (show) {
                const label = boss.bossAbilityLabel(boss.bossPendingAbility);
                const name = document.getElementById('r63-alert-name');
                const timer = document.getElementById('r63-alert-seconds');
                if (name && name.textContent !== label) name.textContent = label;
                if (timer) {const remain = String(Math.ceil(sec)); if (timer.textContent !== remain) timer.textContent = remain;}
                // Progress is driven by the real telegraph timer, not a separate countdown.
                const elapsed = 1-Math.max(0,Math.min(1,Number(boss.bossTelegraphTimer)/Math.max(1,Number(boss.bossTelegraphMax)||1)));
                const progress = String(Math.round(elapsed*100))+'%';
                if (combatAlert.dataset.r63Progress !== progress) {
                    combatAlert.dataset.r63Progress = progress;
                    combatAlert.style.setProperty('--r63-cast-progress', progress);
                }
            }
        }
        const ability = document.getElementById('boss-hud-ability');
        if (ability) {
            // On compact phone HUDs, spell timing must remain visible rather than
            // truncating a full-length description. The battlefield alert owns
            // the actual ability name in the final seconds of the telegraph.
            const compact = document.documentElement.classList.contains('device-touch') && window.innerHeight <= 600;
            if (boss.bossSpawnTimer > 0) ability.textContent = compact ? `Входит · ${(boss.bossSpawnTimer / GAME_NOMINAL_FPS).toFixed(1)}с` : `Вступает в бой · ${(boss.bossSpawnTimer / GAME_NOMINAL_FPS).toFixed(1)}с`;
            else if (boss.bossPendingAbility) ability.textContent = compact ? `Атака · ${(boss.bossTelegraphTimer / GAME_NOMINAL_FPS).toFixed(1)}с` : `⚠ ${boss.bossAbilityLabel(boss.bossPendingAbility)} · ${(boss.bossTelegraphTimer / GAME_NOMINAL_FPS).toFixed(1)}с`;
            else ability.textContent = compact ? `Навык · ~${Math.max(0, boss.bossAbilityTimer / GAME_NOMINAL_FPS).toFixed(1)}с` : `Следующая способность · ~${Math.max(0, boss.bossAbilityTimer / GAME_NOMINAL_FPS).toFixed(1)}с`;
        }
    }

    function hideBossHUD() { const hud = document.getElementById('boss-hud'); if (hud) hud.classList.remove('show','r63-casting'); document.getElementById('r58-boss-alert')?.classList.remove('show'); }
    function renderMenuPresentation() {
        syncCurrencyDisplays();
        const screen = document.getElementById('screen-menu');
        if (state.level > state.maxUnlockedLevel) state.level = state.maxUnlockedLevel;
        const level = GAME_DATA.getLevel(Math.max(1, Math.min(GAME_DATA.meta.totalLevels, state.level || 1)));
        const world = GAME_DATA.getWorld(level.worldId);
        const map = GAME_DATA.getMap(level.mapId);
        if (!screen || !level || !world || !map) return;
        screen.style.setProperty('--menu-backdrop', safeAssetUrl(map.assetKey));
        const art = document.getElementById('menu-current-map-art'); if (art) { art.src = releaseImageSrc(map.assetKey); art.dataset.assetKey = map.assetKey; }
        const dispatch = document.getElementById('rb60-briefing-num'); if(dispatch) dispatch.textContent = String(level.id).padStart(2, '0');
        const worldEl = document.getElementById('menu-current-world'); if (worldEl) worldEl.textContent = `МИР ${world.id} · ${world.name.toUpperCase()}`;
        const levelEl = document.getElementById('menu-current-level'); if (levelEl) levelEl.textContent = `Уровень ${level.id} · ${level.title}`;
        const objective = document.getElementById('menu-current-objective'); if (objective) objective.textContent = `${map.name} · ${level.objective || level.tip || 'Удержите рубеж и защитите замок.'}`;
        renderSelectedLevelPanel(level, world, map);
        renderProgressAdvisor();
    }
    function renderSelectedLevelPanel(level, world, map) {
        const box = document.getElementById('selected-level-panel'); if (!box || !level || !world || !map) return;
        const best = getLevelBestStars(level.id);
        const rules = getStarRules();
        const threat = level.threat || (level.bossId ? 'БОСС' : 'Обычная атака');
        const nextReward = best >= 3 ? '3★ уже получены' : `Можно улучшить результат до ${best + 1}–3★`;
        box.innerHTML = `
            <div class="r80-briefing-cover"><img loading="lazy" decoding="async" src="${r80Cover(world.id)}" alt=""/><span>КАРТА РУБЕЖА</span></div>
            <div class="r80-briefing-copy"><div class="selected-level-top">
                <div class="selected-level-title"><span>${R78Icons.html(R78Icons.world(world.id))} Мир ${world.id} · ${map.name}</span><b>Уровень ${level.id}: ${level.title}</b></div>
                <div class="selected-level-stars" aria-label="Лучший результат">${starText(best)}</div>
            </div>
            <div class="selected-level-desc">${level.objective || level.tip || 'Постройте оборону и не дайте врагам прорваться к замку.'}</div>
            <div class="selected-level-tags">
                <span class="selected-level-tag">${level.waveCount} волн</span>
                <span class="selected-level-tag">${threat}</span>
                ${level.bossId ? '<span class="selected-level-tag boss">БОСС</span>' : ''}
                <span class="selected-level-tag star">${nextReward}</span>
                <span class="selected-level-tag">3★: ${rules.three}/${rules.maxHp} ❤️</span>
                <span class="selected-level-tag">2★: ${rules.two}/${rules.maxHp} ❤️</span>
            </div></div>`;
        const startBtn = document.getElementById('menu-start-selected-btn');
        if (startBtn) startBtn.innerHTML = `<img class="r78-icon" src="images/ui-r78/icons/${level.bossId ? 'boss_alert' : 'menu_start'}.svg" alt="" aria-hidden="true"/> ${level.bossId ? 'НАЧАТЬ БОСС-БОЙ' : 'НАЧАТЬ ВЫБРАННЫЙ УРОВЕНЬ'}`;
    }
    function showBossIntro(boss) {
        if (!boss) return;
        const box = document.getElementById('boss-intro'); if (!box) return;
        const art = document.getElementById('boss-intro-art');
        if (art) { art.src = releaseImageSrc(boss.imgKey); art.dataset.assetKey = boss.imgKey; art.alt = boss.name || 'Босс'; }
        const kicker = document.getElementById('boss-intro-kicker'); if (kicker) kicker.textContent = `БОСС · УРОВЕНЬ ${boss.level || state.level}`;
        const name = document.getElementById('boss-intro-name'); if (name) name.textContent = boss.name || 'Владыка рубежа';
        const role = document.getElementById('boss-intro-role'); if (role) role.textContent = boss.role || 'Многофазный противник';
        const mechanic = document.getElementById('boss-intro-mechanic'); if (mechanic) mechanic.textContent = boss.mechanic || 'Следите за телеграфами способностей и переходами фаз.';
        const card = box.querySelector('.boss-intro-card'); if (card) card.style.setProperty('--boss-color', boss.phaseColor || boss.color || '#ef4444');
        box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
        playSfx('boss');
        hideR63WaveEvent();
        if (bossIntroTimer) clearTimeout(bossIntroTimer);
        bossIntroTimer = setTimeout(() => box.classList.remove('show'), 2800);
    }
    function hideBossIntro() {
        const box = document.getElementById('boss-intro'); if (box) box.classList.remove('show');
        if (bossIntroTimer) { clearTimeout(bossIntroTimer); bossIntroTimer = null; }
    }
    function renderResultStars(count, victory) {
        const box = document.getElementById('result-stars'); if (!box) return;
        box.innerHTML = '';
        const amount = victory ? Math.max(1, Math.min(3, Number(count) || 1)) : 0;
        for (let i=0; i<3; i++) {
            const star=document.createElement('span');
            star.className='result-star rb64-result-star'+(i<amount?' earned':' unearned');
            star.setAttribute('aria-hidden','true');
            star.style.setProperty('--rb64-delay', (i*.14)+'s');
            box.appendChild(star);
        }
        box.dataset.grade = String(amount);
        box.setAttribute('aria-label', victory ? `${amount} из 3 звёзд` : 'Поражение: звёзды не получены');
    }

    function presentR64Result(victory, starsEarned, newStars) {
        const grade = document.getElementById('rb64-result-grade');
        const reward = document.getElementById('rb64-result-reward');
        const screen = document.getElementById('screen-result');
        if (screen) screen.dataset.rb64Grade = victory ? String(starsEarned) : '0';
        if (grade) grade.textContent = victory ? `${starsEarned} ИЗ 3 ЗВЁЗД` : 'РУБЕЖ НЕ УДЕРЖАН';
        if (reward) reward.textContent = !victory ? 'НОВЫХ ЗВЁЗД: 0' : newStars > 0
            ? `В КАЗНУ: +${newStars} НОВЫХ ЗВЁЗД` : 'ЛУЧШИЙ РЕЗУЛЬТАТ УЖЕ СОХРАНЁН';
    }

    // R5 UPDATE60 — campaign pagination keeps only 3 worlds / 15 level buttons mounted.
    const CAMPAIGN_WORLDS_PER_PAGE = 3;
    let campaignPageIndex = null;
    let campaignLastRenderedLevel = null;
    let campaignLevelDelegationBound = false;

    function campaignPageCount() {
        return Math.max(1, Math.ceil(Number(GAME_DATA.meta.worldCount || 1) / CAMPAIGN_WORLDS_PER_PAGE));
    }
    function clampCampaignPage(pageIndex) {
        return Math.max(0, Math.min(campaignPageCount() - 1, Number(pageIndex) || 0));
    }
    function campaignPageForWorld(worldId) {
        return clampCampaignPage(Math.floor((Math.max(1, Number(worldId) || 1) - 1) / CAMPAIGN_WORLDS_PER_PAGE));
    }
    function campaignPageForLevel(levelId) {
        const level = GAME_DATA.getLevel(Math.max(1, Math.min(TOTAL_LEVELS, Number(levelId) || 1)));
        return campaignPageForWorld(level ? level.worldId : 1);
    }
    function campaignPageWorldRange(pageIndex) {
        const page = clampCampaignPage(pageIndex);
        const first = page * CAMPAIGN_WORLDS_PER_PAGE + 1;
        return { first, last: Math.min(GAME_DATA.meta.worldCount, first + CAMPAIGN_WORLDS_PER_PAGE - 1) };
    }
    function campaignPageStats(pageIndex) {
        const range = campaignPageWorldRange(pageIndex);
        let stars = 0, completed = 0, levels = 0;
        for (let worldId = range.first; worldId <= range.last; worldId++) {
            const world = GAME_DATA.getWorld(worldId);
            if (!world) continue;
            levels += world.levels.length;
            world.levels.forEach(levelId => {
                const best = getLevelBestStars(levelId);
                stars += best;
                if (best > 0) completed++;
            });
        }
        return { stars, completed, levels, maxStars: levels * 3 };
    }
    // R80: 18-world visual atlas is a NON-PERSISTENT view of the existing V9 campaign.
    // It never changes unlocks, economy, best stars, or world content.
    function r80Cover(worldId) { if(Number(worldId)>=1 && Number(worldId)<=12) return 'images/ui-r80/world-'+String(worldId).padStart(2,'0')+'.webp?v=r91-1-1.6.21.1'; return 'images/ui-r80/world-' + String(worldId).padStart(2, '0') + '.webp' + (([13,14,15,16].includes(Number(worldId)))?((Number(worldId)===15||Number(worldId)===16)?'?v=r87-1.6.17.1-foundations':'?v=r86-1.6.16-ai5'):(([17,18].includes(Number(worldId)))?'?v=r88-1.6.18-art':'')); }
    let r80AtlasWasOpened = false;
    function r80CloseAtlas(restoreFocus = true) {
        const panel = document.getElementById('r80-atlas-panel');
        const trigger = document.getElementById('r80-atlas-open');
        if (panel) panel.hidden = true;
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        if (restoreFocus && r80AtlasWasOpened && trigger) trigger.focus();
        r80AtlasWasOpened = false;
    }
    function r80WorldSnapshot(world) {
        const values = world.levels.map(id => getLevelBestStars(id));
        const earned = values.reduce((a,b) => a + Number(b||0), 0);
        const cleared = values.filter(n => n > 0).length;
        return { earned, cleared, unlocked: state.maxUnlockedLevel >= world.firstLevel,
            selected: state.level >= world.firstLevel && state.level <= world.lastLevel };
    }
    function r80AtlasRender() {
        const grid=document.getElementById('r80-atlas-grid');
        if (!grid) return;
        const fragment=document.createDocumentFragment();
        for(let worldId=1;worldId<=GAME_DATA.meta.worldCount;worldId++) {
            const world=GAME_DATA.getWorld(worldId);
            if(!world) continue;
            const status=r80WorldSnapshot(world);
            const btn=document.createElement('button');btn.type='button';
            btn.className='r80-atlas-tile'+(status.unlocked?' is-unlocked':' is-locked')+(status.selected?' is-selected':'');
            btn.dataset.r80World=String(worldId);
            btn.style.setProperty('--r80-world-accent',world.accent);
            btn.setAttribute('aria-label',`Мир ${worldId}: ${world.name}. ${status.cleared} из ${world.levels.length} уровней, ${status.earned} из ${world.levels.length*3} звёзд. ${status.unlocked?'Открыт':'Закрыт, можно просмотреть'}.`);
            btn.innerHTML = `<img loading="lazy" decoding="async" class="r80-atlas-cover" alt="" src="${r80Cover(worldId)}"><span class="r80-atlas-vignette"></span><span class="r80-atlas-crest">${R78Icons.html(R78Icons.world(worldId))}</span><span class="r80-atlas-info"><span class="r80-atlas-index">ГЛАВА ${String(worldId).padStart(2,'0')} · ${world.firstLevel}–${world.lastLevel}</span><strong>${world.name}</strong><small>${status.cleared}/${world.levels.length} · ${status.earned}/${world.levels.length*3} ★</small></span><span class="r80-atlas-state">${status.unlocked?'ОТКРЫТО':R78Icons.html('status_lock')+' ЗАКРЫТО'}</span>`;
            btn.addEventListener('click',()=>r80GoToWorld(worldId));
            fragment.appendChild(btn);
        }
        grid.replaceChildren(fragment);
        const counter=document.getElementById('r80-atlas-progress');
        if(counter) counter.textContent=`${completedLevelsTotal()} / ${TOTAL_LEVELS} рубежей удержано`;
    }
    function r80OpenAtlas() {
        const panel=document.getElementById('r80-atlas-panel');
        if(!panel) return;
        r80AtlasRender();panel.hidden=false;r80AtlasWasOpened=true;
        document.getElementById('r80-atlas-open')?.setAttribute('aria-expanded','true');
        document.getElementById('r80-atlas-close')?.focus();
    }
    function r80GoToWorld(worldId) {
        const world=GAME_DATA.getWorld(worldId);
        if(!world) return;
        // Browsing closed worlds is permitted; starting locked levels is not.
        r80CloseAtlas(false);
        const page=campaignPageForWorld(worldId);
        if(page!==campaignPageIndex) setCampaignPage(page);
        if(window.R49UI?.previewWorld)window.R49UI.previewWorld(worldId);
        const card=document.querySelector(`#level-selector .world-card[data-world-id="${worldId}"]`);
        if(card) {
            const list=document.getElementById('level-selector');
            const outer=list.getBoundingClientRect(),target=card.getBoundingClientRect();
            // Instant jump, not smooth: the selected world must be readable after the first tap.
            const top=Math.max(0,list.scrollTop+target.top-outer.top-Math.max(0,(outer.height-target.height)/2));
            list.scrollTo({top,behavior:'instant'});
            card.classList.remove('r80-reveal');void card.offsetWidth;card.classList.add('r80-reveal');
            // Close the modal onto a focusable world card (including locked worlds).
            // Never leave keyboard focus in the now-hidden atlas dialog.
            card.tabIndex=-1;card.focus({preventScroll:true});
        }else{document.getElementById('campaign-page-tabs')?.querySelector('button.active')?.focus({preventScroll:true});}
        const header=document.querySelector('#screen-menu .rb60-campaign-heading-copy');
        if(header) header.setAttribute('data-r80-preview-world',String(worldId));
    }
    function r80JumpCurrent() {
        // "current" means the last unlocked frontline; the game itself validates selection.
        const frontline=Math.max(1,Math.min(TOTAL_LEVELS,Number(state.maxUnlockedLevel)||1));
        selectLevel(frontline);
        r80GoToWorld(GAME_DATA.getLevel(frontline).worldId);
    }
    function r80BindAtlasControls() {
        const open=document.getElementById('r80-atlas-open');
        if(open&&!open.dataset.r80Bound){open.dataset.r80Bound='yes';open.addEventListener('click',r80OpenAtlas);}
        const close=document.getElementById('r80-atlas-close');
        if(close&&!close.dataset.r80Bound){close.dataset.r80Bound='yes';close.addEventListener('click',()=>r80CloseAtlas());}
        const current=document.getElementById('r80-atlas-current');
        if(current&&!current.dataset.r80Bound){current.dataset.r80Bound='yes';current.addEventListener('click',r80JumpCurrent);}
        const start=document.getElementById('r80-campaign-start');
        if(start&&!start.dataset.r80Bound){start.dataset.r80Bound='yes';start.addEventListener('click',()=>startGame());}
        const dialog=document.getElementById('r80-atlas-panel');
        if(dialog&&!dialog.dataset.r80Bound){
            dialog.dataset.r80Bound='yes';
            dialog.addEventListener('keydown',event=>{
                if(event.key==='Escape'){event.preventDefault();r80CloseAtlas();return;}
                if(event.key==='Tab'){
                    const visible=[...dialog.querySelectorAll('button:not([disabled])')];
                    if(!visible.length)return;
                    const first=visible[0],last=visible[visible.length-1];
                    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
                    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
                }
            });
        }
        const count=document.getElementById('r80-current-frontline');
        if(count)count.textContent=`УР. ${Math.max(1,Math.min(TOTAL_LEVELS,Number(state.maxUnlockedLevel)||1))}`;
    }
    window.R80Campaign = Object.freeze({ openAtlas:r80OpenAtlas, closeAtlas:r80CloseAtlas,
        goToWorld:r80GoToWorld, jumpCurrent:r80JumpCurrent,
        snapshot:()=>({page:campaignPageIndex,selectedLevel:state.level,unlockedLevel:state.maxUnlockedLevel,
            atlasOpen:!!document.getElementById('r80-atlas-panel')&&!document.getElementById('r80-atlas-panel').hidden}) });

    function bindCampaignNavigation() {
        r80BindAtlasControls();
        const sel = document.getElementById('level-selector');
        if (sel && !campaignLevelDelegationBound) {
            sel.addEventListener('click', function (event) {
                const button = event.target && event.target.closest ? event.target.closest('button[data-level-id]') : null;
                if (!button || !sel.contains(button) || button.disabled) return;
                const levelId = Number(button.dataset.levelId || 0);
                if (levelId > 0) selectLevel(levelId);
            });
            campaignLevelDelegationBound = true;
        }
        const prev = document.getElementById('campaign-page-prev');
        const next = document.getElementById('campaign-page-next');
        if (prev && !prev.dataset.bound) {
            prev.dataset.bound = 'true';
            prev.addEventListener('click', () => setCampaignPage((campaignPageIndex ?? 0) - 1));
        }
        if (next && !next.dataset.bound) {
            next.dataset.bound = 'true';
            next.addEventListener('click', () => setCampaignPage((campaignPageIndex ?? 0) + 1));
        }
    }
    function renderCampaignPageNav() {
        bindCampaignNavigation();
        const tabs = document.getElementById('campaign-page-tabs');
        if (!tabs) return;
        tabs.replaceChildren();
        const pages = campaignPageCount();
        const currentPage = clampCampaignPage(campaignPageIndex ?? campaignPageForLevel(state.level));
        const selectedPage = campaignPageForLevel(state.level);
        for (let page = 0; page < pages; page++) {
            const range = campaignPageWorldRange(page);
            const stats = campaignPageStats(page);
            const firstWorld = GAME_DATA.getWorld(range.first);
            const accessible = !!firstWorld && state.maxUnlockedLevel >= firstWorld.firstLevel;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `campaign-page-tab${page === currentPage ? ' active' : ''}${page === selectedPage ? ' selected-range' : ''}${accessible ? '' : ' future'}`;
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', page === currentPage ? 'true' : 'false');
            button.setAttribute('aria-label', `Миры ${range.first}–${range.last}. Пройдено ${stats.completed} из ${stats.levels}. ${stats.stars} из ${stats.maxStars} звёзд.${page === selectedPage ? ' Здесь находится выбранный уровень.' : ''}`);
            const label = document.createElement('span');
            label.textContent = `${range.first}–${range.last}`;
            const progress = document.createElement('small');
            progress.textContent = `${stats.completed}/${stats.levels} · ${stats.stars}★`;
            button.append(label, progress);
            button.addEventListener('click', () => setCampaignPage(page));
            tabs.appendChild(button);
        }
        const prev = document.getElementById('campaign-page-prev');
        const next = document.getElementById('campaign-page-next');
        if (prev) prev.disabled = currentPage <= 0;
        if (next) next.disabled = currentPage >= pages - 1;
    }
    function setCampaignPage(pageIndex) {
        const nextPage = clampCampaignPage(pageIndex);
        if (campaignPageIndex === nextPage) return;
        campaignPageIndex = nextPage;
        updateLevelSelector();
        const sel = document.getElementById('level-selector');
        if (sel) sel.scrollTop = 0;
        playSfx('ui');
    }

    function updateLevelSelector() {
        const sel = document.getElementById('level-selector');
        if (!sel) return;
        bindCampaignNavigation();

        // Follow a level change (victory/next/select), but preserve manual page browsing while level stays unchanged.
        if (campaignPageIndex === null || campaignLastRenderedLevel !== state.level) {
            campaignPageIndex = campaignPageForLevel(state.level);
        }
        campaignPageIndex = clampCampaignPage(campaignPageIndex);
        campaignLastRenderedLevel = state.level;

        sel.replaceChildren();
        let campaignStars = 0;
        let completedLevels = 0;
        for (let worldId = 1; worldId <= GAME_DATA.meta.worldCount; worldId++) {
            const world = GAME_DATA.getWorld(worldId);
            if (!world) continue;
            world.levels.forEach(levelId => {
                const best = getLevelBestStars(levelId);
                campaignStars += best;
                if (best > 0) completedLevels++;
            });
        }

        const visible = campaignPageWorldRange(campaignPageIndex);
        for (let worldId = visible.first; worldId <= visible.last; worldId++) {
            const world = GAME_DATA.getWorld(worldId);
            if (!world) continue;
            const worldStars = world.levels.reduce((sum, levelId) => sum + getLevelBestStars(levelId), 0);
            const worldCompleted = world.levels.filter(levelId => getLevelBestStars(levelId) > 0).length;
            const worldUnlocked = state.maxUnlockedLevel >= world.firstLevel;
            const isCurrentWorld = state.level >= world.firstLevel && state.level <= world.lastLevel;

            const card = document.createElement('section');
            card.className = `world-card${worldUnlocked ? '' : ' locked-world'}${isCurrentWorld ? ' current-world' : ''}`;
            card.dataset.worldId = String(worldId);
            card.dataset.placeholder = world.arenaIds.every(arenaId => GAME_DATA.getMap(arenaId).placeholder) ? 'true' : 'false';
            card.style.setProperty('--world-accent', world.accent); card.style.setProperty('--rf-world-map',safeAssetUrl(GAME_DATA.getMap(world.arenaIds[0]).assetKey));
            const worldDisplayName = String(world.name || '').toLowerCase().startsWith(`мир ${world.id}`) ? world.name : `Мир ${world.id}. ${world.name}`;
            card.innerHTML = `
                <div class="r80-world-scene" aria-hidden="true"><img loading="lazy" decoding="async" src="${r80Cover(worldId)}" alt=""><span class="r80-scene-ordinal">ГЛАВА ${String(worldId).padStart(2,'0')}</span></div>
                <div class="world-card-head">
                    <div class="world-icon" aria-hidden="true">${R78Icons.html(R78Icons.world(world.id))}</div>
                    <div class="world-title"><b>${worldDisplayName}</b><span>${world.subtitle}</span></div>
                    <div class="world-progress"><span>${worldCompleted}/${world.levels.length}</span><br><span class="world-stars">${worldStars}/${world.levels.length*3}★</span></div>
                </div>
                <div class="rb60-world-progress"><span>${worldUnlocked ? 'РУБЕЖ ОТКРЫТ' : 'ЗЕМЛИ ЗАКРЫТЫ'}</span><span>${worldStars}/${world.levels.length*3} ★</span><div class="rb60-world-progress-track"><i style="width:${world.levels.length ? worldStars * 100/(world.levels.length*3) : 0}%"></i></div></div>
                <div class="world-levels" role="group" aria-label="${world.name}"></div>`;
            const levelsBox = card.querySelector('.world-levels');
            world.levels.forEach(levelId => {
                const level = GAME_DATA.getLevel(levelId);
                const status = levelId <= state.maxUnlockedLevel ? 'unlocked' : 'locked';
                const bossClass = level.bossId ? 'boss' : '';
                const currentClass = levelId === state.level ? 'current-level selected-level' : '';
                const bestStars = getLevelBestStars(levelId);
                const bestLabel = status === 'locked' ? R78Icons.html('status_lock','r80-level-lock') : (bestStars > 0 ? '★'.repeat(bestStars) : '<span class="r80-level-empty" aria-hidden="true">—</span>');
                const button = document.createElement('button');
                button.className = `level-btn ${status} ${bossClass} ${currentClass}`.trim();
                button.disabled = status === 'locked';
                button.type = 'button';
                button.dataset.levelId = String(levelId);
                button.dataset.r80Status = status === 'locked' ? 'LOCKED' : bestStars > 0 ? `CLEARED_${bestStars}` : levelId === state.level ? 'CURRENT' : 'READY';
                if (level.bossId) button.dataset.r80Boss = 'yes';
                button.title = status === 'locked' ? `Уровень ${levelId} закрыт. Пройдите уровень ${levelId - 1}.` : `Уровень ${levelId}: ${level.title} · ${level.scenarioName || ''} · ${GAME_DATA.getMap(level.mapId).name}${level.objective ? ' · ' + level.objective : ''}`;
                button.setAttribute('aria-label', `Уровень ${levelId}. ${level.title}${level.bossId ? '. Босс' : ''}${status==='locked' ? '. Закрыт' : bestStars ? `. Лучший результат: ${bestStars} из 3 звёзд` : '. Доступен'}${levelId===state.level ? '. Выбран' : ''}`);
                button.setAttribute('aria-pressed', levelId===state.level ? 'true' : 'false');
                button.innerHTML = `<span class="r80-level-number">${levelId}</span><span class="level-best">${bestLabel}</span>${level.bossId ? `<span class="r80-boss-mark" aria-hidden="true">${R78Icons.html('boss_alert')}</span>` : ''}`;
                levelsBox.appendChild(button);
            });
            sel.appendChild(card);
        }
        const summary = document.getElementById('campaign-progress');
        if (summary) summary.textContent = `${completedLevels}/${TOTAL_LEVELS} пройдено · ${campaignStars}/${MAX_CAMPAIGN_STARS}★ · доступно ${state.stars}★`;
        const campaignMeter = document.getElementById('rb60-campaign-meter-fill');
        if (campaignMeter) campaignMeter.style.width = `${TOTAL_LEVELS ? completedLevels * 100 / TOTAL_LEVELS : 0}%`;
        const campaignProgress = document.querySelector('.rb60-campaign-progress');
        if (campaignProgress) { campaignProgress.setAttribute('aria-valuemax', String(TOTAL_LEVELS)); campaignProgress.setAttribute('aria-valuenow', String(completedLevels)); }
        renderCampaignPageNav();
        r80BindAtlasControls();
        renderMenuPresentation();
        const currentCard = sel.querySelector('.current-world');
        if (currentCard && !window.matchMedia('(max-width:1023px), (max-height:600px)').matches && !document.getElementById('screen-menu').classList.contains('hidden')) {
            requestAnimationFrame(() => currentCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
        }
    }

    function selectLevel(l) {
        const target = Math.max(1, Math.min(GAME_DATA.meta.totalLevels, Number(l) || 1));
        if(GAME_DATA.isLevelReleased(target) && target <= state.maxUnlockedLevel) {
            state.level = target;
            campaignPageIndex = campaignPageForLevel(target);
            playSfx('ui');
            updateLevelSelector();
            renderMenuPresentation();
            setMenuAssetStatus('', '');
            if (window.GameAssets && typeof GameAssets.ensure === 'function') {
                const level=GAME_DATA.getLevel(target), map=level&&GAME_DATA.getMap(level.mapId);
                if (map&&map.assetKey) GameAssets.ensure([map.assetKey],{concurrency:1,maxAttempts:1}).catch(function(){});
            }
        }
    }

    function setPauseButtonVisible(visible) {
        const btn = document.getElementById('pause-btn');
        if (btn) btn.style.display = visible ? 'flex' : 'none';
    }

    function clearWavePreparation() {
        if (prepInterval) { clearInterval(prepInterval); prepInterval = null; }
        state.prepActive = false; state.prepRemaining = 0;
        const box = document.getElementById('wave-prep');
        if (box) box.classList.remove('show');
        const wrapper = document.getElementById('game-wrapper');
        if (wrapper) wrapper.classList.remove('prep-active','upgrade-prep-compact');
        updateRewardAdUI();
    }

    // R49: attempt-local reward. The preparation flag is consumed before another click.
    // R57: a moderate 29-33% increase, still proportional to unused preparation.
    const EARLY_WAVE_REWARD = Object.freeze({ rate: 0.037, min: 18, max: 48 });
    function calculateEarlyWaveBonus() {
        if (!state.prepActive || state.prepRewardPaid || state.wave >= state.maxWaves) return 0;
        const total = Math.max(1, Number(state.prepTotalSeconds) || 1);
        const remaining = Math.max(0, Math.min(total, Number(state.prepRemaining) || 0));
        const cap = Math.max(EARLY_WAVE_REWARD.min, Math.min(EARLY_WAVE_REWARD.max,
            Math.round(Number(activeLevelConfig.startingGold || 0) * EARLY_WAVE_REWARD.rate)));
        return remaining > 0 ? Math.max(1, Math.floor(cap * remaining / total)) : 0;
    }

    function renderWavePreparation() {
        const nextWave = Math.min(state.wave + 1, state.maxWaves);
        const title = document.getElementById('wave-prep-title');
        const text = document.getElementById('wave-prep-text');
        const rosterBox = document.getElementById('wave-prep-roster');
        const objective = document.getElementById('wave-prep-objective');
        const note = document.getElementById('wave-prep-note');
        const time = document.getElementById('wave-prep-time');
        const nextConfig = activeLevelConfig && activeLevelConfig.waves ? activeLevelConfig.waves[nextWave - 1] : null;
        const preview = GAME_DATA.getWavePreview ? GAME_DATA.getWavePreview(nextConfig) : null;
        if (title) title.innerText = `ВОЛНА ${nextWave}/${state.maxWaves} · ${preview && preview.label ? preview.label.toUpperCase() : 'ПОДГОТОВКА'}`;
        if (text) {
            const stage = `${activeWorldConfig.icon} ${activeWorldConfig.name} · ${activeLevelConfig.title}`;
            text.innerText = nextWave === 1
                ? `${stage}. Сценарий: ${activeLevelConfig.scenarioName}.`
                : `${stage}. Подготовьте контрмеры к следующей атаке.`;
        }
        if (rosterBox) {
            rosterBox.innerHTML = '';
            if (preview && preview.boss) {
                const chip = document.createElement('span'); chip.className = 'wave-chip';
                chip.innerHTML = `👑 <strong>${preview.boss.name}</strong>`; rosterBox.appendChild(chip);
            } else if (preview && preview.enemies) {
                preview.enemies.forEach(item => {
                    const chip = document.createElement('span'); chip.className = 'wave-chip';
                    chip.textContent = `${item.badge || '•'} ${item.name} ×${item.count}`;
                    rosterBox.appendChild(chip);
                });
            }
        }
        if (objective) objective.innerText = `🎯 ${activeLevelConfig.objective}  💡 ${activeLevelConfig.tip}`;
        if (note) {
            const waveNote = preview && preview.note ? preview.note : '';
            const routeWeights = Array.isArray(activeLevelConfig.routeWeights) ? activeLevelConfig.routeWeights : [1];
            const secondaryShare = routeWeights.length > 1 ? Math.max(0, Number(routeWeights[1]) || 0) : 0;
            if (routeWeights.length === 3 && routeWeights[2] > 0) {
                // R75: show all three explicitly authored entrances rather than misleading 'two'.
                const shares=routeWeights.map(w=>Math.round(Math.max(0,Number(w)||0)*100));
                note.innerText = `⚠ Атака с трёх направлений: верхний ≈${shares[0]}%, центральный ≈${shares[1]}%, нижний ≈${shares[2]}%. ${waveNote || activeLevelConfig.threat}`;
            } else if (secondaryShare > 0) {
                const secondaryPct = Math.round(secondaryShare * 100);
                note.innerText = `⚠ Атака с двух направлений: основной путь ≈${100-secondaryPct}%, нижний путь ≈${secondaryPct}%. ${waveNote || activeLevelConfig.threat}`;
            } else note.innerText = waveNote ? `⚠ ${waveNote}` : `⚠ Главная угроза: ${activeLevelConfig.threat}`;
        }
        const remaining = Math.max(0, state.prepRemaining);
        const bonus = calculateEarlyWaveBonus();
        document.querySelectorAll('.wave-prep-btn, #upgrade-prep-start').forEach(button => {
            const shortLandscape = button.classList.contains('wave-prep-btn') && matchMedia('(orientation:landscape) and (max-height:600px)').matches;
            button.textContent = bonus > 0 ? (shortLandscape ? (window.innerWidth <= 700 ? `Старт +${bonus}` : `Начать · +${bonus} 🪙`) : `Начать · +${bonus} золота`) : (shortLandscape && window.innerWidth <= 700 ? 'Старт волны' : 'Начать волну');
            button.dataset.earlyBonus = String(bonus);
        });
        if (time) time.innerText = remaining;
        const compactTime = document.getElementById('upgrade-prep-time');
        if (compactTime) compactTime.innerText = `${remaining}с`;
        const prepBox = document.getElementById('wave-prep');
        if (prepBox) {
            const total = Math.max(1, Number(state.prepTotalSeconds) || 1);
            const ratio = Math.max(0, Math.min(1, Number(state.prepRemaining || 0) / total));
            prepBox.style.setProperty('--prep-progress', `${Math.round(360 * ratio)}deg`);
        }
    }

    const EXTRA_PREPARATION_SECONDS = 10;
    function beginWavePreparation(seconds) {
        clearWavePreparation();
        if (state.screen !== 'play' || state.wave >= state.maxWaves) return;
        // R56: adds ten seconds (five more than R55) to the first and every later wave.
        // Pause, accelerated battle speed, ad breaks and early-launch logic stay intact.
        state.prepActive = true; state.prepRemaining = Math.max(1, Math.floor(Number(seconds) || 0) + EXTRA_PREPARATION_SECONDS);
        state.prepTotalSeconds = state.prepRemaining; state.prepRewardPaid = false;
        const box = document.getElementById('wave-prep');
        if (box) box.classList.add('show');
        const wrapper = document.getElementById('game-wrapper');
        if (wrapper) wrapper.classList.add('prep-active');
        renderWavePreparation();
        if (state.activeTowerUI) requestAnimationFrame(syncUpgradePrepLayout);
        updateRewardAdUI();
        preloadRewardedForRun();
        prepInterval = setInterval(() => {
            if (!state.prepActive) return;
            if (state.screen !== 'play' || systemPauseActive || adBusy) return;
            state.prepRemaining--;
            renderWavePreparation();
            if (state.prepRemaining <= 0) finishWavePreparation();
        }, 1000);
    }

    function finishWavePreparation() {
        if (!state.prepActive) return;
        if (prepInterval) { clearInterval(prepInterval); prepInterval = null; }
        state.prepActive = false;
        const box = document.getElementById('wave-prep');
        if (box) box.classList.remove('show');
        const wrapper = document.getElementById('game-wrapper');
        if (wrapper) wrapper.classList.remove('prep-active','upgrade-prep-compact');
        if (state.screen === 'play' && !state.waveActive && state.wave < state.maxWaves) { playSfx('wave'); startNextWave(); }
    }

    // R57: skipping preparations advances *the same clock* that naturally
    // cools abilities while the player waits. Advance cooldowns only; never
    // simulate enemy movement, combat or earn additional wave rewards here.
    // Non-cooldown timed effects must also expire: otherwise early starting
    // could keep an old battle buff while granting its full cooldown back.
    function advanceSkippedPreparationTime(seconds) {
        const frames = Math.max(0, Math.min(60 * 180, Math.round((Number(seconds) || 0) * GAME_NOMINAL_FPS)));
        if (!frames) return;
        for (const id in SKILLS) {
            if (SKILLS[id] && SKILLS[id].timer > 0)
                SKILLS[id].timer = Math.max(0, SKILLS[id].timer - frames);
        }
        state.warBannerTimer = Math.max(0, state.warBannerTimer - frames);
        state.bastionTimer = Math.max(0, state.bastionTimer - frames);
        if (state.bastionTimer === 0) state.bastionShield = 0;
        state.timeStop = Math.max(0, state.timeStop - frames);
        state.meteorBurnTimer = Math.max(0, state.meteorBurnTimer - frames);
        if (!state.meteorBurnTimer) state.meteorBurnTick = 0;
        for (const tower of state.towers) {
            if (tower.disabledTimer > 0) tower.disabledTimer = Math.max(0, tower.disabledTimer - frames);
        }
        // Hazards are temporary battlefield effects. They cannot be carried
        // into the next wave by selecting an instant early launch.
        for (const hazard of state.hazards) {
            if (hazard && Number.isFinite(hazard.life)) hazard.life = Math.max(0, hazard.life - frames);
            if (hazard && Number.isFinite(hazard.timer)) hazard.timer = Math.max(0, hazard.timer - frames);
        }
        state.hazards = state.hazards.filter(h => h && (Number(h.life) > 0 || Number(h.timer) > 0));
    }

    function startWaveNow() {
        if (!state.prepActive || state.screen !== 'play' || state.waveActive ||
            systemPauseActive || adBusy || state.wave >= state.maxWaves || !activeLevelConfig.waves[state.wave]) return;
        const bonus = calculateEarlyWaveBonus();
        const skippedSeconds = Math.max(0, Math.min(Number(state.prepTotalSeconds) || 0, Number(state.prepRemaining) || 0));
        state.prepRewardPaid = true;
        advanceSkippedPreparationTime(skippedSeconds);
        if (bonus > 0) {
            state.gold += bonus;
            state.earlyWaveGold = (state.earlyWaveGold || 0) + bonus;
            updateHUD();
            if (window.R49UI) R49UI.rewardToast(bonus);
        }
        state.prepRemaining = 0; renderWavePreparation(); finishWavePreparation();
    }

    function showTutorial() {
        clearWavePreparation();
        state.screen = 'tutorial'; setPauseButtonVisible(false);
        document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
        document.getElementById('screen-tutorial').classList.remove('hidden');
        const tutorialCard=document.querySelector('#screen-tutorial .tutorial-card'); if(tutorialCard) tutorialCard.scrollTop=0;
        tutorialStep = 0; renderTutorialStep();
        document.getElementById('tutorial-next')?.focus({preventScroll:true});
    }

    function renderTutorialStep() {
        const step = TUTORIAL_STEPS[tutorialStep];
        document.getElementById('tutorial-step-label').innerText = `ШАГ ${tutorialStep + 1} ИЗ ${TUTORIAL_STEPS.length}`;
        const tutorialIcon=document.getElementById('tutorial-icon');
        const tutorialArt=document.createElement('img');
        tutorialArt.src='images/ui-r78/icons/'+step.iconAsset+'.svg';
        tutorialArt.alt=''; tutorialArt.setAttribute('aria-hidden','true');
        tutorialIcon.replaceChildren(tutorialArt);
        document.getElementById('tutorial-title').innerText = step.title;
        document.getElementById('tutorial-text').innerText = step.text;
        document.getElementById('tutorial-next').innerText = tutorialStep === TUTORIAL_STEPS.length - 1 ? 'НАЧАТЬ ПОДГОТОВКУ' : 'ДАЛЕЕ';
    }

    function nextTutorialStep() {
        if(state.screen!=='tutorial')return;
        if (tutorialStep < TUTORIAL_STEPS.length - 1) { tutorialStep++; renderTutorialStep(); return; }
        finishTutorial();
    }

    function finishTutorial() {
        if(state.screen!=='tutorial')return; // repeated tap cannot start a second preparation
        tutorialCompleted = true;
        GameSave.save('tutorial-completed');
        document.getElementById('screen-tutorial').classList.add('hidden');
        state.screen = 'play'; setPauseButtonVisible(true);
        beginWavePreparation(activeLevelConfig && activeLevelConfig.firstPrepSeconds ? activeLevelConfig.firstPrepSeconds : 10); startGameLoop();
    }

    function openRules() {
        clearWavePreparation();
        state.screen = 'rules'; setPauseButtonVisible(false);
        document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
        document.getElementById('screen-rules').classList.remove('hidden');
        const rulesList=document.querySelector('#screen-rules .rules-grid'); if(rulesList) rulesList.scrollTop=0;
        document.querySelector('#screen-rules .screen-actions button')?.focus({preventScroll:true});
    }

    function closeRules() { returnToMenu(); }

    let levelStartBusy = false;
    async function startGame() {
        if (levelStartBusy) return false;
        levelStartBusy = true;
        const launchLevel = state.level;
        const launchFromScreen = state.screen;
        const launchFromResult = launchFromScreen === 'result';
        // A pending asset/story promise must not launch gameplay after navigation
        // or after the player has selected a different level.
        const launchIsCurrent = () => state.screen === launchFromScreen && state.level === launchLevel;
        const menuStartButton = document.getElementById('menu-start-selected-btn');
        const previousStartHtml = menuStartButton ? menuStartButton.innerHTML : '';
        // A retry/next action also launches from the result page: its errors must
        // appear THERE instead of only in the now-hidden menu asset status.
        const resultNotice=launchFromResult?document.getElementById('result-progression'):null;
        const resultButtons=launchFromResult?[document.getElementById('result-next-btn'),document.getElementById('result-retry-btn')].filter(Boolean):[];
        const resultDisabled=resultButtons.map(button=>button.disabled);
        resultButtons.forEach(button=>{button.disabled=true;});
        function reportLaunchStatus(message,tone){
            if(resultNotice){resultNotice.textContent=message;resultNotice.dataset.launchStatus=tone;}
            else setMenuAssetStatus(message,tone);
        }
        if (menuStartButton) { menuStartButton.disabled = true; menuStartButton.textContent = 'ПРОВЕРКА ГРАФИКИ…'; }
        reportLaunchStatus('Проверяем карту, башни, врагов и снаряды выбранного уровня…','loading');
        try {
            let assetReport={ok:true,failed:[],total:0,loaded:0};
            if (window.GameAssets && typeof GameAssets.ensureLevel === 'function') {
                try {
                    assetReport=await GameAssets.ensureLevel(launchLevel,{
                        onProgress:function(p){
                            if (!launchIsCurrent()) return;
                            if (menuStartButton) menuStartButton.textContent=`ГРАФИКА ${p.settled}/${p.total}`;
                            reportLaunchStatus(`Подготовка уровня: ${p.settled}/${p.total} · ${p.percent}%`,'loading');
                        }
                    });
                } catch(error) {
                    if (!launchIsCurrent()) return false;
                    console.warn('[R91.7.4] Asset preflight failed:',error);
                    reportLaunchStatus('Не удалось загрузить графику уровня. Проверьте сеть и повторите запуск.','error');
                    if(menuStartButton){menuStartButton.disabled=false;menuStartButton.textContent='↻ ПОВТОРИТЬ ЗАГРУЗКУ';}
                    return false;
                }
            }
            if (!launchIsCurrent()) return false;
            if (!assetReport || !assetReport.ok || (window.GameAssets && !GameAssets.isLevelReady(launchLevel))) {
                const failed=assetReport && Array.isArray(assetReport.failed) ? assetReport.failed.map(x=>x.name).filter(Boolean) : [];
                reportLaunchStatus(failed.length
                    ? `Графика не готова: ${failed.join(', ')}. Нажмите старт ещё раз для повтора.`
                    : 'Графика уровня не подтверждена. Нажмите старт ещё раз для повтора.','error');
                if (menuStartButton) { menuStartButton.disabled=false; menuStartButton.textContent='↻ ПОВТОРИТЬ ЗАГРУЗКУ'; }
                return false;
            }
            reportLaunchStatus(`Графика уровня проверена: ${assetReport.loaded}/${assetReport.total}.`,'ready');
            if (window.GameStory && typeof GameStory.playTrigger === 'function') {
                try {
                    await GameStory.playTrigger('before', launchLevel);
                    const launchStoryLevel = GAME_DATA.getLevel(launchLevel);
                    if (launchStoryLevel && launchStoryLevel.bossId) await GameStory.playTrigger('boss_before', launchLevel);
                } catch(error){
                    if (!launchIsCurrent()) return false;
                    console.warn('[R91.7.4] Story preflight failed:',error);
                    reportLaunchStatus('Не удалось завершить вступительную сцену. Повторите запуск уровня.','error');
                    if(menuStartButton){menuStartButton.disabled=false;menuStartButton.textContent='↻ ПОВТОРИТЬ ЗАПУСК';}
                    return false;
                }
            }
            if (!launchIsCurrent()) return false;

            systemPauseActive = false; systemPausePreviousScreen = null; systemPauseReason = '';
            assetRecoveryActive=false; assetRecoveryBusy=false; assetRecoveryMissingKey=''; hideAssetRecoveryOverlay();
            startGoldAdUsed = false; reviveAdUsed = false;
            clearWavePreparation();
            cancelPendingMobileBuild();
            state.screen = 'play'; document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
            hideBossIntro();
            setPauseButtonVisible(true);
            playMusic('Before_the_Gates_Fall');
            const levelConfig = activateLevelData(launchLevel);
            addMetaStat('battlesStarted', 1); if (window.GameSave && saveStatus.ready) GameSave.save('battle-start');
            state.gold = levelConfig.startingGold; state.lives = levelConfig.baseLives + (metaStats.hp * 5);
            state.wave = 0; state.maxWaves = levelConfig.waveCount;
            state.enemies = []; state.pendingEnemySpawns = []; state.towers = []; state.projectiles = []; state.hazards = []; state.lightningArcs = [];
            setBattleSpeed(1); Reforged.reset(activeWorldConfig,ASSETS,state,{paths:PATHS,slots:BUILD_SLOTS}); if (window.R85VFX) R85VFX.reset();if(window.R91SpellFX)R91SpellFX.reset();
            state.earlyWaveGold = 0; state.prepRewardPaid = false;
            state.bossKilledThisBattle = false; state.bossEscapedThisBattle = false;
            clearTowerSelection(); state.activeTowerUI = null; state.waveActive = false; showBuildFeedback('', 'info'); state.pointerInside = false; state.pointerDown = false; state.pointerId = null; closeUpgradeUI();
            state.meteorBurnTimer = 0; state.meteorBurnTick = 0; state.timeStop = 0; state.warBannerTimer = 0; state.bastionTimer = 0; state.bastionShield = 0; state.castleShieldSource = 0; resetGameClock();
            for(let k in SKILLS) SKILLS[k].timer = 0;
            updateHUD();
            if (launchLevel === 1 && !tutorialCompleted) showTutorial();
            else { beginWavePreparation(levelConfig.firstPrepSeconds); startGameLoop(); }
            return true;
        } finally {
            levelStartBusy = false;
            resultButtons.forEach((button,index)=>{button.disabled=resultDisabled[index];});
            if (menuStartButton && !menuStartButton.textContent.includes('ПОВТОРИТЬ')) { menuStartButton.disabled = false; menuStartButton.innerHTML = previousStartHtml || '<img class="r78-icon" src="images/ui-r78/icons/menu_start.svg" alt="" aria-hidden="true"/> НАЧАТЬ ВЫБРАННЫЙ УРОВЕНЬ'; }
        }
    }

    function startNextWave() {
        if (state.waveActive || state.screen !== 'play') return;
        const nextWaveNumber = state.wave + 1;
        const waveConfig = activeLevelConfig && activeLevelConfig.waves[nextWaveNumber - 1];
        if (!waveConfig) return;

        state.wave = nextWaveNumber;
        Reforged.emit('wave:start',state);
        state.waveActive = true;
        state.spawner.waveConfig = waveConfig;
        state.spawner.isBossWave = waveConfig.kind === 'boss';
        state.spawner.bossId = waveConfig.bossId || null;
        state.spawner.count = waveConfig.count;
        state.spawner.timer = waveConfig.initialDelayFrames;
        state.spawner.interval = waveConfig.spawnIntervalFrames;
        state.spawner.spawnIndex = 0;
        updateHUD();

        if (state.spawner.isBossWave) {
            const boss = GAME_DATA.getBoss(state.spawner.bossId);
            if (boss) showBossIntro(boss);
            else showBossBanner('НАСТУПАЕТ БОСС', 1700, 'arrival');
        } else {
            showR63WaveEvent(`АТАКА ${state.wave} / ${state.maxWaves}`, 'ПРОТИВНИК НАСТУПАЕТ', 'wave', 1500);
            state.spawner.type = GAME_DATA.resolveEnemyType(waveConfig, Math.random, 0);
            state.spawner.hp = waveConfig.baseHp;
        }
    }

    function buildEnemyOptions(archetype, extra = {}) {
        return Object.assign({
            archetypeId: archetype.id, role: archetype.role, badge: archetype.badge, mechanic: archetype.mechanic,
            imgKey: archetype.imgKey, drawSize: archetype.drawSize, animation: archetype.animation || null,
            physResist: archetype.physResist || 0, energyResist: archetype.energyResist || 0, dodgeChance: archetype.dodgeChance || 0,
            isHealer: !!archetype.isHealer, castleDamage: archetype.castleDamage || 1,
            healBase: archetype.healBase, healPerLevel: archetype.healPerLevel, healRadius: archetype.healRadius, healCooldownFrames: archetype.healCooldownFrames,
            rageThreshold: archetype.rageThreshold, rageSpeedMult: archetype.rageSpeedMult, rageCastleDamage: archetype.rageCastleDamage,
            shieldHpMultiplier: archetype.shieldHpMultiplier,
            hasteAura: archetype.hasteAura, hasteRadius: archetype.hasteRadius, hasteMult: archetype.hasteMult, hastePulseFrames: archetype.hastePulseFrames, hasteDurationFrames: archetype.hasteDurationFrames,
            slowImmune: archetype.slowImmune, freezeImmune: archetype.freezeImmune,
            deathSpawnType: archetype.deathSpawnType, deathSpawnCount: archetype.deathSpawnCount, deathSpawnHpFactor: archetype.deathSpawnHpFactor, deathSpawnRewardFactor: archetype.deathSpawnRewardFactor,
            disableTower: archetype.disableTower, disableRadius: archetype.disableRadius, disableFrames: archetype.disableFrames, disableCooldownFrames: archetype.disableCooldownFrames,
            blink: archetype.blink, blinkCooldownFrames: archetype.blinkCooldownFrames, blinkNodes: archetype.blinkNodes,
            shieldRegenFraction: archetype.shieldRegenFraction, shieldRegenCooldownFrames: archetype.shieldRegenCooldownFrames,
            shieldAuraFraction: archetype.shieldAuraFraction, shieldAuraCap: archetype.shieldAuraCap, shieldAuraCooldownFrames: archetype.shieldAuraCooldownFrames,
            shieldAuraRadius: archetype.shieldAuraRadius, shieldAuraTargets: archetype.shieldAuraTargets,
            tempoBurstMult: archetype.tempoBurstMult, tempoBurstFrames: archetype.tempoBurstFrames, tempoBurstCooldownFrames: archetype.tempoBurstCooldownFrames,
            reloadPulseFrames: archetype.reloadPulseFrames, reloadPulseRadius: archetype.reloadPulseRadius, reloadPulseDelayFrames: archetype.reloadPulseDelayFrames,
            rootHealFraction: archetype.rootHealFraction, rootHealCooldownFrames: archetype.rootHealCooldownFrames, rootHealRadius: archetype.rootHealRadius, rootHealTargets: archetype.rootHealTargets,
            stanceCycleFrames: archetype.stanceCycleFrames, stancePhysical: archetype.stancePhysical, stanceEnergy: archetype.stanceEnergy, stanceOffResist: archetype.stanceOffResist,
            gustPulseFrames: archetype.gustPulseFrames, gustPulseRadius: archetype.gustPulseRadius, gustAdvanceNodes: archetype.gustAdvanceNodes, gustTargets: archetype.gustTargets
        }, extra || {});
    }

    function createArchetypeEnemy(type, hp, reward, extra = {}) {
        const archetype = GAME_DATA.getEnemyByType(type);
        // R5: route-aware speed progression replaces the old level-5 -> level-6 jump from ~0.47x straight to 1.0x.
        const requestedSpeedScale = Number(extra.speedMultiplier);
        const levelSpeedScale = activeLevelConfig && Number(activeLevelConfig.enemySpeedScale);
        const speedScale = Number.isFinite(requestedSpeedScale) && requestedSpeedScale > 0 ? requestedSpeedScale : (Number.isFinite(levelSpeedScale) && levelSpeedScale > 0 ? levelSpeedScale : 1);
        const enemy = new Enemy(
            hp, archetype.speed * speedScale, reward, archetype.color, archetype.radius,
            archetype.type, archetype.ccResist || 0, buildEnemyOptions(archetype, extra)
        );
        if (Number.isFinite(extra.x)) enemy.x = extra.x;
        if (Number.isFinite(extra.y)) enemy.y = extra.y;
        if (Number.isFinite(extra.pathIndex)) enemy.pathIndex = Math.max(1, Math.min(enemy.path.length - 1, Math.floor(extra.pathIndex)));
        return enemy;
    }

    function flushPendingEnemySpawns() {
        if (!state.pendingEnemySpawns.length) return;
        const queued = state.pendingEnemySpawns.splice(0, state.pendingEnemySpawns.length);
        queued.forEach(item => {
            const child = createArchetypeEnemy(item.type, item.hp, item.reward, item);
            child.deathSpawnCount = 0;
            child.deathSpawnType = null;
            state.enemies.push(child);
            noteEnemySeen(child.type);
            createParticleExplosion(child.x, child.y, '#84cc16', 6);
        });
    }

    function chooseSpawnRouteIndex(spawnOrdinal, isBoss) {
        if (PATHS.length <= 1) return 0;
        if (isBoss) return Math.max(0, Math.min(PATHS.length - 1, Math.floor(Number(activeLevelConfig.bossRouteIndex) || 0)));
        const weights = Array.isArray(activeLevelConfig.routeWeights) ? activeLevelConfig.routeWeights : [1];
        let total = 0; weights.forEach(w => { total += Math.max(0, Number(w) || 0); });
        if (total <= 0) return 0;
        // Low-discrepancy deterministic sequence: stable distribution without ugly long random streaks.
        const sample = ((Math.max(0, Number(spawnOrdinal) || 0) * 0.61803398875) + (state.wave * 0.38196601125)) % 1;
        let acc = 0;
        for (let i = 0; i < Math.min(weights.length, PATHS.length); i++) {
            acc += Math.max(0, Number(weights[i]) || 0) / total;
            if (sample <= acc + 1e-9) return i;
        }
        return 0;
    }

    function spawnEnemy() {
        if (state.spawner.isBossWave) {
            const boss = GAME_DATA.getBoss(state.spawner.bossId);
            if (!boss) return;
            const bossEnemy = new Enemy(
                boss.hp, boss.speed, boss.reward, boss.color, boss.radius,
                boss.type, boss.ccResist,
                {
                    isBoss: true, routeIndex: chooseSpawnRouteIndex(0, true), imgKey: boss.imgKey, drawSize: boss.drawSize, castleDamage: boss.castleDamage, bossProfile: boss,
                    slowImmune: !!boss.slowImmune, freezeImmune: !!boss.freezeImmune
                }
            );
            state.enemies.push(bossEnemy);
            noteBossSeen(state.spawner.bossId);
            updateBossHUD();
            return;
        }

        const waveConfig = state.spawner.waveConfig;
        const spawnOrdinal = state.spawner.spawnIndex++;
        const type = GAME_DATA.resolveEnemyType(waveConfig, Math.random, spawnOrdinal);
        const routeIndex = chooseSpawnRouteIndex(spawnOrdinal, false);
        state.spawner.type = type;
        const archetype = GAME_DATA.getEnemyByType(type);
        const hp = state.spawner.hp * archetype.hpMultiplier;
        const rawReward = archetype.rewardBase + Math.floor(state.level * archetype.rewardPerLevel);
        const rewardScale = activeLevelConfig && Number(activeLevelConfig.rewardScale) > 0 ? Number(activeLevelConfig.rewardScale) : 1;
        const reward = Math.max(2, Math.round(rawReward * rewardScale));
        state.enemies.push(createArchetypeEnemy(type, hp, reward, { routeIndex }));
        noteEnemySeen(type);
    }

    function useSkill(id) {
        if (state.screen !== 'play' || !state.waveActive || state.prepActive || systemPauseActive || adBusy) {
            playSfx('error');
            showBuildFeedback('Боевые способности доступны только во время активной волны.', 'error');
            return;
        }
        id = Number(id);
        if (!SKILLS[id] || !isSkillUnlocked(id) || !isSkillEquipped(id) || SKILLS[id].timer > 0) return;
        addMetaStat('abilitiesUsed', 1); evaluateAchievements(true);
        playSfx('skill');
        SKILLS[id].timer = SKILLS[id].cooldown;
        Reforged.emit('spell:cast',id);
        // R91.4: resolved presentation payload follows the actual affected targets;
        // no random target selection and no gameplay writes in the renderer.
        const spellVisual = { id, targets: [] };
        const point = e => ({x:e.x,y:e.y});

        if (id === 1) { 
            screenShake(35); 
            createParticleExplosion(canvas.width/2, canvas.height/2, '#ef4444', 50, true); 
            // R17: preserve the original curve through level 30, then flatten scaling so Meteor stays a panic button instead of deleting late-game waves.
            const meteorLevel = Math.max(1, Number(state.level) || 1);
            const meteorLegacyLevel = Math.min(30, meteorLevel);
            const meteorExpansionLevel = Math.max(0, meteorLevel - 30);
            let dmg = (260 + meteorLegacyLevel * 28 + meteorExpansionLevel * 5) * (1 + metaStats.skill1 * 0.2); 
            spellVisual.targets = state.enemies.filter(e => e.canBeTargeted()).map(point);
            state.enemies.forEach(e => { if (e.hp > 0) { e.takeDamage(dmg, null, false); createParticleExplosion(e.x, e.y, '#ef4444', 10, true); } }); 
            state.meteorBurnTimer = 240; state.meteorBurnTick = 0;
            state.meteorBurnDmg = 8 + meteorLegacyLevel * 1.2 + meteorExpansionLevel * 0.2;
        } 
        else if (id === 2) { state.timeStop = 180 + (metaStats.skill2 * 60); }
        else if (id === 3) { let g = 100 + (metaStats.skill3 * 30); spellVisual.gold=g; state.gold += g; createParticleExplosion(canvas.width/2, 50, '#fbbf24', 20); addFloatText(canvas.width/2, 100, `+${g} ЗОЛОТА`, '#fbbf24', 28); }
        else if (id === 4) { screenShake(15); const lightningDamage = 220 + state.level * 14; let targets = state.enemies.filter(e => e.canBeTargeted()).sort(() => 0.5 - Math.random()).slice(0, 5); spellVisual.targets=targets.map(point); targets.forEach(e => { createLightningArc(e.x,0,e.x,e.y,'#06b6d4',5); e.takeDamage(lightningDamage, null, false); e.applyEffect('stun', 60 * (1 - e.ccResist)); createParticleExplosion(e.x, e.y, '#06b6d4', 15); }); }
        else if (id === 5) { screenShake(40); state.hazards.push(new HazardZone(canvas.width/2, canvas.height/2, 220, "blackhole")); }
        else if (id === 6) {
            const def = GAME_DATA.skills[id];
            state.warBannerTimer = Math.max(state.warBannerTimer, Number(def.durationFrames) || (8 * GAME_NOMINAL_FPS));
            screenShake(8); createParticleExplosion(canvas.width/2, canvas.height/2, '#fbbf24', 26);
            spellVisual.targets=state.towers.filter(tower=>tower.disabledTimer<=0).slice(0,16).map(point);
            state.towers.slice(0, 16).forEach(function(tower){ if (tower && tower.disabledTimer <= 0) createParticle(tower.x, tower.y, '#fbbf24', 2, 1.5, false, true); });
            addFloatText(canvas.width/2 - 90, 88, 'БОЕВОЙ ШТАНДАРТ', '#fde68a', 24);
        }
        else if (id === 7) {
            const def = GAME_DATA.skills[id];
            const maxLives = getCastleMaxLives();
            const heal = Math.max(0, Math.min(Number(def.healLives) || 2, maxLives - state.lives));
            state.lives += heal;
            spellVisual.heal=heal;state.castleShieldSource=7;
            state.bastionShield = Math.max(state.bastionShield, Number(def.shieldPoints) || 4);
            state.bastionTimer = Math.max(state.bastionTimer, Number(def.durationFrames) || (10 * GAME_NOMINAL_FPS));
            createParticleExplosion(930, 112, '#60a5fa', 28); screenShake(8);
            addFloatText(820, 88, heal > 0 ? `БАСТИОН +${heal} HP · ЩИТ ${state.bastionShield}` : `БАСТИОН · ЩИТ ${state.bastionShield}`, '#93c5fd', 19);
        }
        else if (id === 8) {
            const def = GAME_DATA.skills[id];
            state.castleShieldSource=8;
            state.bastionShield = Math.max(state.bastionShield, Number(def.shieldPoints)||5);
            state.bastionTimer = Math.max(state.bastionTimer, Number(def.durationFrames)||660);
            createParticleExplosion(930,112,'#7dd3fc',26);
            addFloatText(790,88,`РУННЫЙ БАРЬЕР · ${state.bastionShield} ЕД. УРОНА`,'#a5eafa',19);
        }
        else if (id === 9) {
            const def = GAME_DATA.skills[id];
            const enemies=state.enemies.filter(e=>e.hp>0 && e.canBeTargeted())
                .sort((a,b)=>(b.isBoss?1:0)-(a.isBoss?1:0) || b.hp-a.hp)
                .slice(0,Math.max(1,Number(def.maxTargets)||8));
            spellVisual.targets=enemies.map(point);
            enemies.forEach(e=>{
                e.applyArmorShred(Number(def.armorShred)||.15,Number(def.durationFrames)||300);
                if (e.shieldHp>0) {
                    const loss=Math.min(Number(def.shieldCap)||100,e.shieldHp*(Number(def.shieldPercent)||.25));
                    e.shieldHp=Math.max(0,e.shieldHp-loss);
                }
                createParticleExplosion(e.x,e.y,'#c6a5fb',7);
            });
            addFloatText(canvas.width/2-100,86,`РАСКОЛ ЗАЩИТЫ ×${enemies.length}`,'#d8b4fe',20);
        }
        Reforged.emit('spell:resolved',spellVisual);
        updateHUD();
    }

    function buyCastle(key) {
        const u=CASTLE_UPGRADES[key], lvl=metaStats[key], cost=u.cost[lvl];
        if (state.stars >= cost && lvl < u.max) {
            playSfx('upgrade'); state.stars -= cost; metaStats[key]++;
            syncCurrencyDisplays();
            evaluateAchievements(true); GameSave.save('castle-upgrade:' + key);
            renderMetaHub(); renderSkillsUI(); updateLevelSelector(); renderMenuPresentation();
        }
    }

    function selectTowerBtn(type) {
        if (state.screen !== 'play') return;
        if (pendingMobileBuild) cancelPendingMobileBuild();
        const info = TOWER_TYPES[type];
        if (!info || !isTowerUnlocked(type) || !isTowerEquipped(type)) return;
        if (state.towers.length >= getTowerLimit()) {
            clearTowerSelection(false);
            showBuildFeedback(`Лимит башен достигнут: ${state.towers.length}/${getTowerLimit()}. Продайте башню или улучшите гарнизон в штабе.`, 'error', true);
            playSfx('error');
            return;
        }
        if (state.selectedTowerBtn === type) { clearTowerSelection(); return; }
        if (state.gold < info.cost) {
            playSfx('error');
            showBuildFeedback(`Недостаточно золота: ${info.name} стоит ${info.cost}💰.`, 'error');
            return;
        }
        state.selectedTowerBtn = type;
        closeUpgradeUI();
        document.querySelectorAll('.tower-btn').forEach(btn => {btn.classList.remove('active');btn.setAttribute('aria-pressed','false');});
        const button = document.getElementById(`btn-${type}`);
        if (button) {button.classList.add('active');button.setAttribute('aria-pressed','true');}
        showBuildFeedback(`Выбрана ${info.name}. Выберите подсвеченную площадку · башни ${state.towers.length}/${getTowerLimit()}.`, 'valid', true);
    }

    // V4 — unified pointer input: mouse + touch + pen.
    // CSS scales the 1000x600 canvas, so every event is translated back to internal canvas coordinates.
    function canvasPointFromPointer(e) {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        return {
            x: Math.max(0, Math.min(canvas.width, nx * canvas.width)),
            y: Math.max(0, Math.min(canvas.height, ny * canvas.height)),
            inside: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1
        };
    }

    function updateCanvasPointer(e) {
        const point = canvasPointFromPointer(e);
        if (!point) return null;
        state.mouseX = point.x;
        state.mouseY = point.y;
        state.pointerInside = point.inside;
        state.pointerType = e.pointerType || 'mouse';
        return point;
    }

    function resetCanvasPointerGesture(e) {
        if (!e || state.pointerId === null || e.pointerId === state.pointerId) {
            state.pointerDown = false;
            state.pointerId = null;
            state.pointerMoved = false;
        }
    }

    canvas.addEventListener('pointerenter', (e) => {
        if (e.isPrimary === false) return;
        updateCanvasPointer(e);
        state.pointerInside = true;
    });

    canvas.addEventListener('pointermove', (e) => {
        if (e.isPrimary === false) return;
        updateCanvasPointer(e);
        if (state.pointerDown && e.pointerId === state.pointerId) {
            const dragDistance = Math.hypot(e.clientX - state.pointerStartClientX, e.clientY - state.pointerStartClientY);
            if (dragDistance > 12) state.pointerMoved = true;
        }
    });

    canvas.addEventListener('pointerdown', (e) => {
        if (e.isPrimary === false) return;
        if ((e.pointerType || 'mouse') === 'mouse' && e.button !== 0) return;
        const point = updateCanvasPointer(e);
        if (!point || !point.inside) return;
        state.pointerType = e.pointerType || 'mouse';
        e.preventDefault();
        state.pointerDown = true;
        state.pointerId = e.pointerId;
        state.pointerStartClientX = e.clientX;
        state.pointerStartClientY = e.clientY;
        state.pointerMoved = false;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }, { passive: false });

    canvas.addEventListener('pointerup', (e) => {
        if (e.isPrimary === false || e.pointerId !== state.pointerId) return;
        const point = updateCanvasPointer(e);
        e.preventDefault();
        const finalDragDistance = Math.hypot(e.clientX - state.pointerStartClientX, e.clientY - state.pointerStartClientY);
        if (finalDragDistance > 12) state.pointerMoved = true;
        // R1: one action path for mouse, touch and pen. Short release = tap/click; drag = no placement.
        if (point && point.inside && !state.pointerMoved) handleCanvasAction(point.x, point.y);
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
        resetCanvasPointerGesture(e);
    }, { passive: false });

    canvas.addEventListener('pointercancel', (e) => {
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
        resetCanvasPointerGesture(e);
    });
    canvas.addEventListener('lostpointercapture', (e) => { resetCanvasPointerGesture(e); });

    canvas.addEventListener('pointerleave', (e) => {
        if (e.isPrimary === false) return;
        if (!state.pointerDown || (e.pointerType || 'mouse') === 'mouse') state.pointerInside = false;
    });

    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (pendingMobileBuild) cancelPendingMobileBuild(); if (state.selectedTowerBtn) clearTowerSelection(); });
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        // The pause-exit confirmation is intercepted by R79 in capture phase.
        // Navigation screens take priority over a stale battle tool selection.
        if (state.screen === 'rules') { closeRules(); return; }
        if (state.screen === 'settings') { closeAudioSettings(); return; }
        if (state.screen === 'meta') { returnToMenu(); return; }
        if (state.screen === 'pause') { resumeGame(); return; }
        if (state.screen !== 'play') return;
        if (pendingMobileBuild) { rejectPendingMobileBuild(); return; }
        if (state.activeTowerUI) { closeUpgradeUI(); return; }
        if (state.selectedTowerBtn) { clearTowerSelection(); }
    });

    function handleCanvasAction(pointerX = state.mouseX, pointerY = state.mouseY) {
        if (state.screen !== 'play') return;
        const mouseX = pointerX; const mouseY = pointerY;
        
        let clickedTower = state.towers.map(t => ({ tower:t, distance:Math.hypot(t.x - mouseX, t.y - mouseY) })).filter(item => item.distance < 30).sort((a,b) => a.distance - b.distance)[0];
        if (clickedTower) { clearTowerSelection();openUpgradeUI(clickedTower.tower);return; }

        closeUpgradeUI(); if (!state.selectedTowerBtn) return;

        const towerKey = state.selectedTowerBtn;
        const status = getBuildPositionStatus(mouseX, mouseY, towerKey);
        if (!status.valid) {
            // A different (invalid) tap must never leave a stale build ready for confirmation.
            if (pendingMobileBuild) cancelPendingMobileBuild();
            playSfx('error'); screenShake(2);
            showBuildFeedback(status.reason, 'error');
            return;
        }

        // R54.1: a valid tap builds immediately on both touch and mouse.
        // All economy, terrain, occupancy and tower-cap checks were already run above.
        // Dragging remains guarded by the existing pointer gesture handler.
        placeApprovedTower(status,towerKey);
    }

    function setUpgradeDescription(desc, branchRole, title, body, noteClass) {
        if (!desc) return;
        desc.replaceChildren();
        if (branchRole) {
            const role = document.createElement('span');
            role.className = 'upg-branch-role';
            role.textContent = branchRole;
            desc.appendChild(role);
        }
        if (title) {
            const name = document.createElement('strong');
            name.className = 'upg-next-name';
            name.textContent = title;
            desc.appendChild(name);
        }
        if (body) {
            const text = document.createElement('span');
            text.className = 'upg-next-desc' + (noteClass ? ' ' + noteClass : '');
            text.textContent = body;
            desc.appendChild(text);
        }
    }

    function positionUpgradeUI() { Reforged.scene(); }
    function syncUpgradePrepLayout() { Reforged.scene(); }

    function openUpgradeUI(tower) {
        cancelPendingMobileBuild();
        state.activeTowerUI = tower;
        const ui = document.getElementById('upgrade-ui');
        const fullUpgradeTitle = tower.type.name + ` · Ур. ${tower.tier}`;
        const smallLandscapeInspector = matchMedia('(orientation:landscape) and (max-width:700px)').matches;
        const upgradeHeading = document.getElementById('upg-title');
        upgradeHeading.innerText = smallLandscapeInspector ? tower.type.name : fullUpgradeTitle;
        upgradeHeading.title = fullUpgradeTitle;
        const roleName = document.getElementById('upg-role-name');
        const roleHint = document.getElementById('upg-role-hint');
        if (roleName) roleName.textContent = tower.type.role || 'Башня';
        if (roleHint) roleHint.textContent = tower.type.roleHint || '';
        // R62: presentation metadata only. Tower upgrade/economy logic is unchanged.
        const forge = document.getElementById('upgrade-ui');
        if (forge) forge.dataset.r62Tower = tower.type.id;
        const forgePortrait = document.getElementById('r62-upg-portrait');
        if (forgePortrait) {
            const portraitSrc = 'images/ui_' + tower.type.assetKey + '.webp?v=r91-6-1.6.21.6';
            if (forgePortrait.getAttribute('src') !== portraitSrc) forgePortrait.src = portraitSrc;
        }
        const rank = document.getElementById('r62-upg-rank');
        if (rank) rank.textContent = tower.tier >= 3 ? 'МАСТЕРСКОЕ РАЗВИТИЕ' : `РАНГ ${tower.tier}/3 · ${tower.type.role || 'Оборона'}`;
        const upgData = UPGRADES[tower.type.id];
        for (let p=1; p<=2; p++) {
            const pathData = upgData[`path${p}`];
            const branchName = upgData[`path${p}Name`] || `Ветка ${p === 1 ? 'А' : 'Б'}`;
            const branchRole = upgData[`path${p}Role`] || '';
            const pathCard = document.getElementById(`path-${p}-container`);
            document.getElementById(`path-${p}-name`).innerText = branchName;
            const branchTab = ui.querySelectorAll('.r54-branch-tabs button')[p - 1];
            if (branchTab) {
                branchTab.title = branchName + (branchRole ? ' — ' + branchRole : '');
                branchTab.setAttribute('aria-label', `Ветка ${p === 1 ? 'А' : 'Б'}: ${branchName}`);
            }
            for (let t=1; t<=3; t++) {
                document.getElementById(`p${p}-t${t}`).className = (tower.path === p && tower.tier >= t) ? 'dot active' : 'dot';
            }
            const btn = document.getElementById(`btn-upg-${p}`);
            const desc = document.getElementById(`path-${p}-desc`);
            btn.removeAttribute('data-cost');
            pathCard.classList.toggle('selected-path', tower.path === p);
            pathCard.classList.toggle('locked-path', tower.path !== 0 && tower.path !== p);
            pathCard.classList.toggle('max-path', tower.path === p && tower.tier >= 3);
            pathCard.classList.remove('unaffordable-path');
            if (tower.path !== 0 && tower.path !== p) {
                btn.innerText = 'ЗАКРЫТО'; btn.disabled = true;
                setUpgradeDescription(desc, branchRole, 'Другой путь выбран', 'Эта ветка больше недоступна.', 'muted');
            } else if (tower.tier >= 3) {
                btn.innerText = 'МАКСИМУМ'; btn.disabled = true;
                setUpgradeDescription(desc, branchRole, 'Предел развития', 'Ветка полностью улучшена.', 'muted');
            } else {
                const nextUpg = pathData[tower.tier];
                setUpgradeDescription(desc, branchRole, nextUpg.name, nextUpg.desc, '');
                btn.innerText = `Купить · ${nextUpg.cost}`;
                btn.disabled = state.gold < nextUpg.cost;
                pathCard.classList.toggle('unaffordable-path', state.gold < nextUpg.cost);
                btn.dataset.cost = String(nextUpg.cost);
                btn.title = state.gold < nextUpg.cost ? `Не хватает ${nextUpg.cost - state.gold} золота` : `${nextUpg.name}: ${nextUpg.desc}`;
            }
        }
        const sellValue = Math.floor(tower.totalInvested * 0.6);
        const sellButton = document.getElementById('btn-sell');
        sellButton.innerText = `Продать · +${sellValue}`;
        sellButton.title = `Вернуть ${sellValue} золота и освободить площадку`;
        positionUpgradeUI(tower);
        const gameWrapper = document.getElementById('game-wrapper');
        if (gameWrapper) gameWrapper.classList.add('upgrade-panel-open');
        ui.classList.add('show');
        ui.classList.add('ready'); Reforged.scene();
    }

    window.addEventListener('resize', () => { if (state.activeTowerUI) { positionUpgradeUI(state.activeTowerUI); requestAnimationFrame(syncUpgradePrepLayout); } }, { passive:true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (state.activeTowerUI) { positionUpgradeUI(state.activeTowerUI); requestAnimationFrame(syncUpgradePrepLayout); } }, { passive:true });
    document.addEventListener('tdviewportchange', () => { if (state.activeTowerUI) { positionUpgradeUI(state.activeTowerUI); requestAnimationFrame(syncUpgradePrepLayout); } }, { passive:true });

    function buyUpgrade(pathNum) { if (state.activeTowerUI && state.activeTowerUI.upgrade(pathNum)) { playSfx('upgrade'); openUpgradeUI(state.activeTowerUI); } }
    function sellTower() { if (state.activeTowerUI) { Reforged.emit('tower:sold',state.activeTowerUI); addMetaStat('towersSold', 1); playSfx('sell'); state.gold += Math.floor(state.activeTowerUI.totalInvested * 0.6); createParticleExplosion(state.activeTowerUI.x, state.activeTowerUI.y, '#ef4444', 30, true); state.towers = state.towers.filter(t => t !== state.activeTowerUI); closeUpgradeUI(); updateHUD(); } }
    function closeUpgradeUI() { const ui = document.getElementById('upgrade-ui'); const gameWrapper = document.getElementById('game-wrapper'); state.activeTowerUI = null; if (gameWrapper) gameWrapper.classList.remove('upgrade-panel-open','upgrade-prep-compact'); if (ui) { ui.classList.remove('show','ready'); ui.removeAttribute('data-side'); } Reforged.scene(); }

    function updateHUD() {
        if (pendingMobileBuild) updateMobileBuildControls();
        const dockCount = document.querySelector('[data-r49-tab="towers"]');
        if (dockCount) dockCount.textContent = `Башни ${state.towers.length}/${getTowerLimit()}`;
        const status = document.querySelector('#r49-wave-state b');
        if (status) status.textContent = `Мир ${activeWorldConfig.id} · Уровень ${state.level} · Волна ${state.wave}/${state.maxWaves}`;
        const r52Summary=document.getElementById('r52-wave-summary');
        if(r52Summary) r52Summary.textContent=`Волна ${state.wave}/${state.maxWaves} · ${state.towers.length} башен`; 
        document.getElementById('ui-gold').innerText = state.gold; document.getElementById('ui-lives').innerText = state.lives;
        const towerCountEl = document.getElementById('ui-tower-count'); if (towerCountEl) towerCountEl.innerText = state.towers.length;
        const towerLimitEl = document.getElementById('ui-tower-limit'); if (towerLimitEl) towerLimitEl.innerText = getTowerLimit();
        const hudLevel = GAME_DATA.getLevel(state.level);
        const hudWorld = GAME_DATA.getWorld(hudLevel.worldId);
        const uiWorld = document.getElementById('ui-world'); if (uiWorld) uiWorld.innerText = hudWorld.id;
        const uiWorldName = document.getElementById('ui-world-name'); if (uiWorldName) uiWorldName.innerText = hudWorld.name;
        document.getElementById('ui-level').innerText = state.level; document.getElementById('ui-wave').innerText = state.wave + '/' + state.maxWaves;
        const waveProgress = document.getElementById('ui-wave-progress'); if (waveProgress) waveProgress.style.width = `${state.maxWaves > 0 ? Math.max(0, Math.min(100, state.wave / state.maxWaves * 100)) : 0}%`;
        TOWER_IDS.forEach(function (key) {
            const el = document.getElementById(`btn-${key}`);
            if (el) {
                const tower = TOWER_TYPES[key];
                const unlocked = isTowerUnlocked(key);
                const atLimit = state.towers.length >= getTowerLimit();
                el.disabled = !unlocked || atLimit || (state.gold < tower.cost);
                el.classList.toggle('tower-locked', !unlocked);
                el.classList.toggle('tower-poor', unlocked && state.gold < tower.cost);
                el.setAttribute('aria-pressed', String(state.selectedTowerBtn === key));
                el.title = !unlocked ? `${tower.name} — башня пока не открыта` : (atLimit ? `Лимит башен ${state.towers.length}/${getTowerLimit()} — расширьте гарнизон в штабе` : `${tower.name} — ${tower.role}: ${tower.roleHint}`);
            }
        });
        if (state.activeTowerUI) openUpgradeUI(state.activeTowerUI);
        updateSkillAvailabilityUI();
        updateBossHUD();
        scheduleR24HudGuard();
    }

    function endGame(victory) {
        clearTowerSelection();
        stopGameLoop(); clearWavePreparation(); hideBossIntro(); hideBossHUD(); hideR63WaveEvent();
        state.screen = 'result'; setPauseButtonVisible(false);
        Reforged.emit(victory?'battle:victory':'battle:defeat',state);
        rfLastFrameAt=performance.now();
        if(!gameRafId)gameRafId=requestAnimationFrame(gameLoop);
        document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
        const resultScreen = document.getElementById('screen-result');
        resultScreen.classList.remove('hidden','victory','defeat'); resultScreen.classList.add(victory ? 'victory' : 'defeat');
        const resultShell=resultScreen.querySelector('.result-shell'); if(resultShell) resultShell.scrollTop=0;
        const resultHeading=document.getElementById('result-title');
        if(resultHeading){resultHeading.tabIndex=-1;resultHeading.focus({preventScroll:true});}
        if (activeMapConfig && activeMapConfig.assetKey) resultScreen.style.setProperty('--menu-backdrop', safeAssetUrl(activeMapConfig.assetKey));
        closeUpgradeUI();
        const nextBtn = document.getElementById('result-next-btn');
        const reviveBtn = document.getElementById('result-revive-btn');
        const mission = document.getElementById('result-mission');
        const kicker = document.getElementById('result-kicker');
        const rank = getCastleRank();
        if (reviveBtn) reviveBtn.style.display = 'none';
        if (mission) mission.textContent = `${activeWorldConfig.icon} Мир ${activeWorldConfig.id} · Уровень ${state.level} · ${activeLevelConfig.title}`;
        const statLives = document.getElementById('result-stat-lives'); if (statLives) statLives.textContent = `${Math.max(0,state.lives)} ❤️`;
        const statWaves = document.getElementById('result-stat-waves'); if (statWaves) statWaves.textContent = `${state.wave}/${state.maxWaves}`;
        const statRank = document.getElementById('result-stat-rank'); if (statRank) statRank.textContent = `${rank.icon} ${rank.name}`;
        const statStars = document.getElementById('result-stat-stars');
        const resultProgress = document.getElementById('result-progression');
        if (victory) {
            playMusic('Banner_Over_The_Ramparts');
            let maxHp = 20 + (metaStats.hp * 5); let starsEarned = state.lives >= maxHp * 0.9 ? 3 : (state.lives >= maxHp * 0.5 ? 2 : 1);
            // R57: escaping the boss still counts as holding the castle, but a
            // perfect three-star defence requires actually defeating the boss.
            if (activeLevelConfig && activeLevelConfig.bossId && state.bossEscapedThisBattle && !state.bossKilledThisBattle)
                starsEarned = Math.min(starsEarned, 2);
            const newStars = GameSave.setLevelBestStars(state.level, starsEarned);
            state.stars += newStars;
            syncCurrencyDisplays();
            addMetaStat('victories', 1); if (starsEarned === 3) addMetaStat('perfectWins', 1);
            if (kicker) kicker.textContent = starsEarned === 3 ? 'ИДЕАЛЬНАЯ ОБОРОНА' : 'МИССИЯ ВЫПОЛНЕНА';
            document.getElementById('result-title').innerText = 'ПОБЕДА!'; document.getElementById('result-title').style.color = 'var(--success)';
            const victoryWorld = GAME_DATA.getWorld(activeLevelConfig.worldId);
            document.getElementById('result-desc').innerText = state.bossEscapedThisBattle && !state.bossKilledThisBattle ? `${victoryWorld.icon} Замок выстоял, но босс прорвался. Для 3 звёзд нужно уничтожить босса. Попробуйте другую расстановку и магию.` : (newStars > 0 ? `${victoryWorld.icon} ${victoryWorld.name} · ${activeMapConfig.name} · новый лучший результат: +${newStars}⭐` : `${victoryWorld.icon} ${victoryWorld.name} · ${activeMapConfig.name} · лучший результат этого уровня уже сохранён.`);
            renderResultStars(starsEarned, true);
            presentR64Result(true, starsEarned, newStars);
            const rules = getStarRules();
            const recommendation = findRecommendedCastleUpgrade();
            if (resultProgress) resultProgress.innerHTML = `<b>Звёзды:</b> 3★ = ${rules.three}/${rules.maxHp} ❤️, 2★ = ${rules.two}/${rules.maxHp} ❤️. ${newStars > 0 ? `Новые звёзды добавлены: +${newStars}★.` : 'Лучший результат уже был сохранён.'} ${recommendation && state.stars >= recommendation.cost ? `В штабе уже можно купить: <b>${recommendation.upgrade.title}</b>.` : 'Следующий шаг: выберите следующий уровень или улучшите результат на прошлых.'}`;
            if (statStars) statStars.textContent = newStars > 0 ? `+${newStars} ⭐` : '0 · рекорд';
            if (state.level === state.maxUnlockedLevel && state.level < GAME_DATA.meta.totalLevels) { state.maxUnlockedLevel++; }
            evaluateAchievements(true);
            GameSave.save('level-victory:' + state.level);
            const postVictoryStory = (window.GameStory && typeof GameStory.playTrigger === 'function') ? (async function () {
                if (activeLevelConfig && activeLevelConfig.bossId && state.bossKilledThisBattle) await GameStory.playTrigger('boss_after', state.level);
                return GameStory.playTrigger('after', state.level);
            })() : Promise.resolve([]);
            updateLevelSelector();
            if (nextBtn) nextBtn.style.display = state.level < GAME_DATA.meta.totalLevels ? '' : 'none';
            updateRewardAdUI();
            Promise.resolve(postVictoryStory).catch(function () { return []; }).finally(function () {
                setTimeout(function () { if (state.screen === 'result' && state.lives > 0) maybeShowInterstitialAfterVictory(); }, 580);
            });
        } else {
            addMetaStat('defeats', 1); evaluateAchievements(true); GameSave.save('level-defeat:' + state.level);
            playMusic('Ashes_of_the_Gate');
            if (kicker) kicker.textContent = 'РУБЕЖ ПОТЕРЯН';
            document.getElementById('result-title').innerText = 'ПОРАЖЕНИЕ'; document.getElementById('result-title').style.color = 'var(--danger)';
            document.getElementById('result-desc').innerText = `${activeWorldConfig.icon} ${activeWorldConfig.name} · ${activeMapConfig.name}. Оборона прорвана — перестройте комбинацию башен и попробуйте снова.`;
            renderResultStars(0, false);
            presentR64Result(false, 0, 0);
            const recommendation = findRecommendedCastleUpgrade();
            if (resultProgress) resultProgress.innerHTML = `<b>Совет:</b> ${recommendation && recommendation.affordable ? `перед повтором зайдите в штаб и купите «${recommendation.upgrade.title}».` : 'попробуйте поставить первые башни ближе к длинным изгибам дороги и улучшать их до опасной волны.'}`;
            if (statStars) statStars.textContent = '—';
            if (nextBtn) nextBtn.style.display = 'none';
            updateRewardAdUI();
            preloadRewardedForRun();
        }
    }

    function retryLevel() { startGame(); }

    async function playNextLevel() {
        if(levelStartBusy)return false;
        if (state.level >= GAME_DATA.meta.totalLevels) { returnToMenu(); return false; }
        const previousLevel=state.level, next=previousLevel + 1;
        if(next>state.maxUnlockedLevel){returnToMenu();return false;}
        // Do not permanently advance a completed result before next-level art
        // and story passes the preflight. Otherwise Retry could silently launch
        // another level when a resource is unavailable.
        state.level=next;
        let started=false;
        try{started=await startGame();}
        catch(error){console.error('[R91.7.4] Next level launch error:',error);
            if(state.screen==='result'){
                const notice=document.getElementById('result-progression');
                if(notice)notice.textContent='Не удалось открыть следующий уровень. Повторите попытку или вернитесь в меню.';
            }
        }finally{if(!started && state.level===next)state.level=previousLevel;}
        return started;
    }

    function returnToMenu() {
        window.R79UI?.dismissExit?.();
        clearTowerSelection();
        stopGameLoop();
        systemPauseActive = false; systemPausePreviousScreen = null; systemPauseReason = '';
        clearWavePreparation();
        state.waveActive = false; state.pointerInside = false; state.pointerDown = false; state.pointerId = null; state.screen = 'menu'; setPauseButtonVisible(false); closeUpgradeUI();
        document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
        syncPortraitBattleGuard();
        hideBossIntro(); hideBossHUD(); hideR63WaveEvent();
        const menuScreen = document.getElementById('screen-menu');
        menuScreen.classList.remove('hidden');
        menuScreen.scrollLeft = 0; menuScreen.scrollTop = 0;
        updateMetaQuickSummary(); updateLevelSelector(); renderMenuPresentation(); if (window.GameSave && saveStatus.ready) GameSave.save('return-menu'); playMusic('menu_theme');
        document.getElementById('menu-start-selected-btn')?.focus({preventScroll:true});
    }
    
    function setPauseMessage(text) {
        const el = document.getElementById('pause-message');
        if (el) el.textContent = text || 'Игра приостановлена.';
    }

    function pauseGame() {
        if (state.screen !== 'play') return;
        cancelPendingMobileBuild();
        systemPauseActive = false; systemPausePreviousScreen = null; systemPauseReason = '';
        state.screen = 'pause'; stopGameLoop(); setPauseButtonVisible(false);
        syncPortraitBattleGuard();
        setPauseMessage('Игра приостановлена.');
        document.getElementById('screen-pause').classList.remove('hidden');
        document.querySelector('#screen-pause .screen-actions .play-btn')?.focus({preventScroll:true});
        pauseMusic(); playSfx('ui');
    }

    function resumeGame() {
        if (state.screen !== 'pause') return;
        window.R79UI?.dismissExit?.();
        systemPauseActive = false; systemPausePreviousScreen = null; systemPauseReason = '';
        state.screen = 'play'; resetGameClock(); startGameLoop(); setPauseButtonVisible(true);
        document.getElementById('screen-pause').classList.add('hidden');
        document.getElementById('pause-btn')?.focus({preventScroll:true});
        setPauseMessage('Игра приостановлена.');
        resumeSfxContextFromSystem(); resumeMusic(); playSfx('ui');
    }

    function suspendGameForSystem(reason) {
        cancelPendingMobileBuild();
        const why = reason || 'system';
        pauseMusic(); suspendSfxContextForSystem();
        if (state.screen !== 'play') return;
        systemPauseActive = true;
        systemPausePreviousScreen = 'play';
        systemPauseReason = why;
        state.lifecyclePauseCount++;
        // R8.1: suspend immediately on every blur/hidden/pagehide event. No document.hasFocus() delay.
        state.screen = 'system-pause';
        stopGameLoop(); setPauseButtonVisible(false);
        if (window.GameSave && saveStatus.ready) GameSave.save('system-suspend');
    }

    function resumeGameFromSystem(reason) {
        // A native ViewRestore/focus may arrive before the ad SDK resolves.
        // Only exitAdBreak() may resume play once the ad is truly finished.
        if (document.hidden || adBusy) return;
        if (isTouchPhonePortrait()) {
            portraitGuardPaused = true;
            syncPortraitBattleGuard();
            return;
        }
        if (systemPauseActive && systemPausePreviousScreen === 'play' && state.screen === 'system-pause') {
            systemPauseActive = false;
            systemPausePreviousScreen = null;
            systemPauseReason = reason || '';
            state.screen = 'play';
            // Rebuild the mobile dock after rotation before unpausing simulation.
            // Otherwise data-scene can retain 'system-pause' and hide the R58 controls.
            Reforged.scene();
            // Reset the timestamp before restarting so no hidden-time delta can ever be simulated.
            resetGameClock(); startGameLoop(); setPauseButtonVisible(true);
            resumeSfxContextFromSystem(); resumeMusic();
            return;
        }
        if (state.screen !== 'pause') { resumeSfxContextFromSystem(); resumeMusic(); }
    }

    // R58.1: portrait displays a non-interactive orientation hint during battles.
    // It is limited to touch-sized phone screens; tablets and desktop keep their layouts.
    let portraitGuardPaused = false;
    function isTouchPhonePortrait() {
        return document.documentElement.classList.contains('device-touch') &&
            window.innerHeight > window.innerWidth && window.innerWidth <= 600 && window.innerHeight <= 1100;
    }
    function syncPortraitBattleGuard() {
        const overlay = document.getElementById('td-portrait-guard');
        if (!overlay) return;
        const combat = state.screen === 'play' || state.screen === 'system-pause' || state.screen === 'pause';
        const blocked = combat && isTouchPhonePortrait();
        overlay.hidden = !blocked;
        if (blocked && state.screen === 'play') {
            portraitGuardPaused = true;
            suspendGameForSystem('orientation:portrait');
        } else if (!blocked && portraitGuardPaused) {
            portraitGuardPaused = false;
            if (state.screen === 'system-pause' && !document.hidden && !adBusy)
                resumeGameFromSystem('orientation:landscape');
        }
    }
    window.addEventListener('resize', syncPortraitBattleGuard, { passive:true });
    window.addEventListener('orientationchange', syncPortraitBattleGuard, { passive:true });
    document.addEventListener('tdviewportchange', syncPortraitBattleGuard);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) suspendGameForSystem('visibilitychange:hidden');
        else resumeGameFromSystem('visibilitychange:visible');
    });
    window.addEventListener('blur', () => {
        if (lifecycleBlurTimer) { clearTimeout(lifecycleBlurTimer); lifecycleBlurTimer = null; }
        // Do not gate on document.hasFocus(): synthetic/runtime hosts and some webviews report it inconsistently.
        suspendGameForSystem('window:blur');
    });
    window.addEventListener('focus', () => {
        if (lifecycleBlurTimer) { clearTimeout(lifecycleBlurTimer); lifecycleBlurTimer = null; }
        if (!document.hidden) resumeGameFromSystem('window:focus');
    });
    window.addEventListener('pagehide', () => { suspendGameForSystem('pagehide'); if (window.GameSave) { GameSave.save('pagehide'); GameSave.flush(); } });
    window.addEventListener('online', () => {
        updateRewardAdUI();
        if (window.GameSave) GameSave.flush();
        preloadRewardedForRun();
    });
    window.addEventListener('offline', () => {
        updateRewardAdUI();
        showAdStatus('Нет сети — прогресс сохранён локально.', 'error', 2200);
    });
    window.addEventListener('pageshow', () => { if (!document.hidden) resumeGameFromSystem('pageshow'); });
    document.addEventListener('freeze', () => { suspendGameForSystem('document:freeze'); if (window.GameSave && saveStatus.ready) GameSave.save('freeze'); });
    document.addEventListener('resume', () => { if (!document.hidden) resumeGameFromSystem('document:resume'); });

    let battleSpeed = 1;
    function setBattleSpeed(value) {
        battleSpeed = value === 2 ? 2 : 1;
        const button=document.getElementById('battle-speed');
        if(button){button.textContent=battleSpeed+'\u00d7';button.setAttribute('aria-label','Скорость боя: '+battleSpeed);button.setAttribute('aria-pressed',String(battleSpeed===2));}
    }
    function toggleBattleSpeed() { if(state.screen==='play'&&!systemPauseActive&&!adBusy){setBattleSpeed(battleSpeed===1?2:1);playSfx('click');} }
    function stepBattle(dtFrames) {
            state.frame += dtFrames;
            Reforged.step(dtFrames);

            for (const id in SKILLS) {
                if (SKILLS[id].timer > 0) SKILLS[id].timer = Math.max(0, SKILLS[id].timer - dtFrames);
            }
            if (state.warBannerTimer > 0) state.warBannerTimer = Math.max(0, state.warBannerTimer - dtFrames);
            if (state.bastionTimer > 0) {
                state.bastionTimer = Math.max(0, state.bastionTimer - dtFrames);
                if (state.bastionTimer <= 0) state.bastionShield = 0;
            } else if (state.bastionShield > 0) state.bastionShield = 0;

            if (state.bastionTimer<=0 || state.bastionShield<=0) state.castleShieldSource=0;
            let enemyDtFrames = dtFrames;
            if (state.timeStop > 0) {
                const stoppedFrames = Math.min(enemyDtFrames, state.timeStop);
                state.timeStop = Math.max(0, state.timeStop - stoppedFrames);
                enemyDtFrames -= stoppedFrames;
                document.getElementById('game-wrapper').classList.add('rf-time-stop');
            } else { document.getElementById('game-wrapper').classList.remove('rf-time-stop'); }

            if (state.meteorBurnTimer > 0) {
                const active = Math.min(dtFrames, state.meteorBurnTimer);
                state.meteorBurnTimer = Math.max(0, state.meteorBurnTimer - dtFrames);
                state.meteorBurnTick += active;
                while (state.meteorBurnTick >= 20) {
                    state.meteorBurnTick -= 20;
                    state.enemies.forEach(e => {
                        if (e.hp <= 0) return;
                        e.takeDamage(state.meteorBurnDmg, null, false);
                        createParticle(e.x, e.y, '#ea580c', 2, 1, false, true);
                    });
                }
                if (state.meteorBurnTimer <= 0) state.meteorBurnTick = 0;
            }

            if (state.waveActive && state.spawner.count > 0) {
                state.spawner.timer -= dtFrames;
                while (state.spawner.timer <= 0 && state.spawner.count > 0) {
                    spawnEnemy(); state.spawner.count--;
                    state.spawner.timer += state.spawner.interval || 30;
                }
            } else if (state.waveActive && state.enemies.length === 0 && state.pendingEnemySpawns.length === 0) {
                state.waveActive = false; Reforged.emit('wave:complete',state); updateHUD();
                if (state.wave < state.maxWaves) {
                    if (!state.spawner.isBossWave) showR63WaveEvent(`ВОЛНА ${state.wave} / ${state.maxWaves}`, 'РУБЕЖ УДЕРЖАН', 'cleared', 1650);
                    beginWavePreparation(activeLevelConfig.betweenWavePrepSeconds);
                } else { endGame(true); return; }
            }

            let maxRouteProgress = 0; state.enemies.forEach(e => { if (e.hp > 0) { const ep = e.path || PATH; maxRouteProgress = Math.max(maxRouteProgress, e.pathIndex / Math.max(1, ep.length - 1)); } });
            let vignette = document.getElementById('danger-vignette');
            if (vignette) { if (maxRouteProgress >= 0.8 && state.enemies.some(e => e.hp > 0)) vignette.classList.add('danger-active'); else vignette.classList.remove('danger-active'); }

            state.hazards = state.hazards.filter(h => h.update(dtFrames, enemyDtFrames));
            state.enemies = state.enemies.filter(e => e.update(enemyDtFrames));
            flushPendingEnemySpawns();
            updateBossHUD();
            state.towers.forEach(t => t.update(dtFrames));
            let liveProjectiles=0;
            for(let i=0;i<state.projectiles.length;i++){
                const projectile=state.projectiles[i];
                if(projectile.update(dtFrames))state.projectiles[liveProjectiles++]=projectile;
                else Projectile.release(projectile);
            }
            state.projectiles.length=liveProjectiles;
            state.lightningArcs = (state.lightningArcs || []).filter(a => a.update(dtFrames));

            if (state.lives <= 0) { endGame(false); return; }
            updateSkillAvailabilityUI();

    }

    function gameLoop(timestamp) {
        gameRafId = 0;
        if (state.screen === 'play' && (assetRecoveryActive || (window.GameAssets && !GameAssets.isLevelReady(state.level)))) {
            if (!assetRecoveryActive) requestRuntimeAssetRecovery('level-gate');
            gameDeltaFrames(timestamp);
            if (!gameRafId) gameRafId = requestAnimationFrame(gameLoop);
            return;
        }
        const dtFrames = gameDeltaFrames(timestamp);
        if (state.screen === 'play') {
            // Fast-forward repeats bounded simulation steps rather than enlarging dt.
            // Preparation, pause and platform lifecycle still use real time.
            const steps = state.prepActive ? 1 : battleSpeed;
            for (let step=0; step<steps && state.screen==='play'; step++) stepBattle(dtFrames);
            renderBattle();
        }
        else if(state.screen==='result' && Reforged.finishRemaining>0) {
            Reforged.step(Math.min(50,Math.max(0,(timestamp||performance.now())-rfLastFrameAt))/GAME_FRAME_MS);
            renderBattle();
        }
        rfLastFrameAt=timestamp||performance.now();
        if ((state.screen==='play'||(state.screen==='result'&&Reforged.finishRemaining>0))&&!gameRafId)gameRafId=requestAnimationFrame(gameLoop);
    }

    const renderOrder=[];
    let rfLastFrameAt=0;
    function renderBattle() {
        ctx.clearRect(0,0,1000,600);
        ctx.save();Reforged.camera.apply(ctx);
            const mapAssetKey = activeMapConfig.assetKey;
            if (ASSETS[mapAssetKey] && ASSETS[mapAssetKey].ready) {
                ctx.drawImage(ASSETS[mapAssetKey], 0, 0, 1000, 600);
            } else {ctx.restore();return;}
            Reforged.worldUnder(ctx);

            state.hazards.forEach(h => h.draw());

            // R9.5 MOBILE MODERATION HOTFIX:
            // Touch devices have no hover. Build anchors must become visible immediately after
            // selecting a tower, before the first tap on the canvas. Pointer position is only
            // needed for the range/ghost preview, never for the anchor overlay itself.
            if (state.selectedTowerBtn) {
                if (!isMobileBuildInteraction()) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'; ctx.fillRect(0,0, canvas.width, canvas.height);
                }
                drawBuildZoneOverlay();
                if (pendingMobileBuild || state.pointerInside) {
                    const buildStatus = pendingMobileBuild ? getBuildSlotStatus(pendingMobileBuild.slot,pendingMobileBuild.towerKey) : getBuildPositionStatus(state.mouseX, state.mouseY, state.selectedTowerBtn);
                    let isValid = buildStatus.valid;
                    const previewSlot = pendingMobileBuild ? pendingMobileBuild.slot : buildStatus.slot || getNearestBuildSlot(state.mouseX, state.mouseY);
                    const previewX = previewSlot ? previewSlot.x : state.mouseX;
                    const previewY = previewSlot ? previewSlot.y : state.mouseY;
                    let radius = TOWER_TYPES[state.selectedTowerBtn].range;
                    ctx.beginPath(); ctx.arc(previewX, previewY, radius, 0, Math.PI*2);
                    ctx.fillStyle = isValid ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.10)'; ctx.fill();
                    ctx.strokeStyle = isValid ? 'rgba(16, 185, 129, 0.72)' : 'rgba(239, 68, 68, 0.58)'; ctx.lineWidth = 2; ctx.stroke();
                    ctx.beginPath(); ctx.arc(previewX, previewY, TOWER_FOOTPRINT_RADIUS + 2, 0, Math.PI*2);
                    ctx.fillStyle = isValid ? 'rgba(34,197,94,.28)' : 'rgba(239,68,68,.25)'; ctx.fill();
                    ctx.strokeStyle = isValid ? '#4ade80' : '#f87171'; ctx.lineWidth = 3; ctx.stroke();
                    ctx.globalAlpha = 0.72;
                    if (ASSETS['tower_base'] && ASSETS['tower_base'].ready) { ctx.drawImage(ASSETS['tower_base'], previewX - 28, previewY - 28, 56, 56); }
                    else { requestRuntimeAssetRecovery('tower_base'); }
                    ctx.globalAlpha = 1.0;
                    if (pendingMobileBuild) {
                        ctx.save();ctx.lineWidth=4;ctx.strokeStyle='#ffe0a1';
                        ctx.beginPath();ctx.arc(previewX,previewY,TOWER_FOOTPRINT_RADIUS+11,0,Math.PI*2);ctx.stroke();
                        ctx.font='bold 15px system-ui';ctx.textAlign='center';ctx.lineWidth=3;
                        ctx.strokeStyle='#152532';ctx.fillStyle='#fff1c6';
                        ctx.strokeText(`№${pendingMobileBuild.slot.id}`,previewX,previewY-42);
                        ctx.fillText(`№${pendingMobileBuild.slot.id}`,previewX,previewY-42);
                        ctx.restore();
                    }
                }
            } else if (state.activeTowerUI) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; ctx.beginPath(); ctx.arc(state.activeTowerUI.x, state.activeTowerUI.y, state.activeTowerUI.stats.range, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx.stroke();
            }

            Reforged.drawGhosts(ctx);
            renderOrder.length=0;
            for(const enemy of state.enemies)if(enemy.hp>0)renderOrder.push(enemy);
            for(const tower of state.towers)renderOrder.push(tower);
            renderOrder.sort((a,b)=>a.y-b.y);
            for(const entity of renderOrder)entity.draw();
            for(const projectile of state.projectiles)projectile.draw();
            for(const arc of state.lightningArcs||[])arc.draw();
            Reforged.drawEffects(ctx);if (window.R85VFX) R85VFX.draw(ctx);if(window.R91SpellFX)R91SpellFX.draw(ctx);Reforged.worldOver(ctx);Reforged.drawTexts(ctx);
            ctx.restore();
    }

    window.TD_R50_BUILD_STATE = Object.freeze({get:function(){return pendingMobileBuild ? {
        slotId:pendingMobileBuild.slot.id,slotIndex:pendingMobileBuild.slot.index,
        towerKey:pendingMobileBuild.towerKey,level:pendingMobileBuild.level
    }:null;}});
    if (window.R85VFX) R85VFX.attach(() => state);
    if (window.R91SpellFX) R91SpellFX.attach(() => state);
    Reforged.initUI(()=>state,playSfx);

    window.addEventListener('load', async () => { initUI(); if (window.GameSave) { try { await GameSave.init(); } catch (error) { console.warn('[GameSave] Init fallback:', error); } } renderTowerButtons(); updateHUD(); preloadRewardedForRun(); }, { once: true });
