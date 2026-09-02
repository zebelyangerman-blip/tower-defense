// Tower Defense R9.4 FINAL data (approved six-map pack, dense routes, dual-entry Haunted Marsh, curated tower slots)
// Pure game definitions: no DOM, no canvas, no platform API calls.
(function (global) {
    'use strict';

    const META = Object.freeze({
        dataVersion: 32,
        balanceVersion: 'r5',
        schemaVersion: 2,
        totalLevels: 30,
        worldCount: 6,
        levelsPerWorld: 5,
        arenasPerWorld: 2,
        nominalFps: 60,
        defaultMapId: 'green_marches_a',
        firstPrepSeconds: 10,
        betweenWavePrepSeconds: 5
    });

    const BASE_PATH = [{"x":9,"y":23},{"x":61,"y":67},{"x":107,"y":94},{"x":157,"y":128},{"x":206,"y":168},{"x":257,"y":203},{"x":262,"y":255},{"x":225,"y":291},{"x":210,"y":340},{"x":218,"y":385},{"x":254,"y":414},{"x":299,"y":414},{"x":326,"y":396},{"x":354,"y":383},{"x":389,"y":358},{"x":428,"y":335},{"x":462,"y":314},{"x":497,"y":294},{"x":531,"y":271},{"x":567,"y":251},{"x":601,"y":244},{"x":632,"y":248},{"x":647,"y":270},{"x":662,"y":279},{"x":687,"y":289},{"x":712,"y":305},{"x":741,"y":319},{"x":766,"y":330},{"x":796,"y":337},{"x":823,"y":334},{"x":853,"y":335},{"x":867,"y":325},{"x":884,"y":314},{"x":897,"y":303}];
    const WORLD_DEFINITIONS = [
        {
            id: 1, slug: 'green_marches', icon: '🌲', name: 'Зелёные рубежи',
            subtitle: 'Пограничные леса и старые королевские тракты', accent: '#65a30d',
            levelNames: ['Пограничная тропа', 'Старый тракт', 'Каменный мост', 'Зелёный перевал', 'Логово вождя'],
            arenaIds: ['green_marches_a', 'green_marches_b'], bossLevel: 5
        },
        {
            id: 2, slug: 'frost_pass', icon: '❄️', name: 'Ледяной перевал',
            subtitle: 'Замёрзшие ущелья, метели и древние заставы', accent: '#38bdf8',
            levelNames: ['Снежная застава', 'Белая теснина', 'Ледяной мост', 'Северный бастион', 'Трон исполина'],
            arenaIds: ['frost_pass_a', 'frost_pass_b'], bossLevel: 10
        },
        {
            id: 3, slug: 'ashen_frontier', icon: '🔥', name: 'Пепельный рубеж',
            subtitle: 'Выжженные земли, руины и проклятые костры', accent: '#f97316',
            levelNames: ['Пепельная дорога', 'Обугленные врата', 'Долина костров', 'Руины легиона', 'Некрополь пепла'],
            arenaIds: ['ashen_frontier_a', 'ashen_frontier_b'], bossLevel: 15
        },
        {
            id: 4, slug: 'haunted_marsh', icon: '🕯️', name: 'Туманные топи',
            subtitle: 'Мёртвые болота, призрачные тропы и забытые камни', accent: '#a78bfa',
            levelNames: ['Тропа в тумане', 'Затонувший тракт', 'Шёпот болот', 'Камни мертвецов', 'Сердце топей'],
            arenaIds: ['haunted_marsh_a', 'haunted_marsh_b'], bossLevel: 20
        },
        {
            id: 5, slug: 'dragon_highlands', icon: '🐉', name: 'Драконьи высоты',
            subtitle: 'Горные серпантины, древние крепости и огненные пики', accent: '#ef4444',
            levelNames: ['Горный путь', 'Разбитый акведук', 'Крепость в скалах', 'Огненный подъём', 'Гнездо дракона'],
            arenaIds: ['dragon_highlands_a', 'dragon_highlands_b'], bossLevel: 25
        },
        {
            id: 6, slug: 'shadow_citadel', icon: '👑', name: 'Цитадель Тьмы',
            subtitle: 'Последний поход к крепости Тёмного Короля', accent: '#e879f9',
            levelNames: ['Чёрная дорога', 'Проклятые ворота', 'Двор без солнца', 'Тронный подъём', 'Последняя осада'],
            arenaIds: ['shadow_citadel_a', 'shadow_citadel_b'], bossLevel: 30
        }
    ];

    const WORLDS = {};
    const LEVEL_TITLES = {};
    WORLD_DEFINITIONS.forEach(function (worldDef) {
        const firstLevel = (worldDef.id - 1) * META.levelsPerWorld + 1;
        const levels = [];
        for (let i = 0; i < META.levelsPerWorld; i++) {
            const globalLevel = firstLevel + i;
            levels.push(globalLevel);
            LEVEL_TITLES[globalLevel] = worldDef.levelNames[i];
        }
        WORLDS[worldDef.id] = Object.freeze({
            id: worldDef.id, slug: worldDef.slug, icon: worldDef.icon, name: worldDef.name,
            subtitle: worldDef.subtitle, accent: worldDef.accent,
            firstLevel: firstLevel, lastLevel: firstLevel + META.levelsPerWorld - 1,
            levels: Object.freeze(levels), arenaIds: Object.freeze(worldDef.arenaIds.slice()),
            bossLevel: worldDef.bossLevel
        });
    });

    const ARENA_BLUEPRINTS = [
        ['green_marches_a', 1, 'Лесная тропа'], ['green_marches_b', 1, 'Речной переход'],
        ['frost_pass_a', 2, 'Ледяная тропа'], ['frost_pass_b', 2, 'Ледяной перевал'],
        ['ashen_frontier_a', 3, 'Пепельная долина'], ['ashen_frontier_b', 3, 'Руины некрополя'],
        ['haunted_marsh_a', 4, 'Туманная тропа'], ['haunted_marsh_b', 4, 'Сердце болот'],
        ['dragon_highlands_a', 5, 'Горный серпантин'], ['dragon_highlands_b', 5, 'Огненная крепость'],
        ['shadow_citadel_a', 6, 'Чёрные врата'], ['shadow_citadel_b', 6, 'Тронная дорога']
    ];

    // V13 Arenas Pack I: first four campaign arenas have their own art and traced routes.
    // V14 Arenas Pack II adds worlds 3–4. V15 Arenas Pack III completes worlds 5–6: all 12 campaign arenas are now unique.
    const V13_ARENAS = Object.freeze({
        green_marches_a: Object.freeze({ assetKey: 'map_green_marches_a', roadBuffer: 55, path: Object.freeze([{"x":460,"y":600},{"x":465,"y":555},{"x":490,"y":520},{"x":535,"y":495},{"x":590,"y":480},{"x":645,"y":465},{"x":690,"y":455},{"x":735,"y":420},{"x":770,"y":380},{"x":795,"y":335},{"x":808,"y":285},{"x":800,"y":235},{"x":775,"y":195},{"x":735,"y":165},{"x":685,"y":145},{"x":625,"y":130},{"x":565,"y":120},{"x":510,"y":105},{"x":470,"y":80},{"x":445,"y":45},{"x":435,"y":0}].map(function (p) { return Object.freeze(p); })) }),
        green_marches_b: Object.freeze({ assetKey: 'map_green_marches_b', roadBuffer: 55, path: Object.freeze([{"x":215,"y":0},{"x":210,"y":70},{"x":220,"y":145},{"x":225,"y":220},{"x":230,"y":300},{"x":245,"y":365},{"x":275,"y":420},{"x":325,"y":455},{"x":390,"y":475},{"x":455,"y":475},{"x":515,"y":450},{"x":560,"y":415},{"x":590,"y":370},{"x":610,"y":315},{"x":615,"y":255},{"x":630,"y":195},{"x":655,"y":135},{"x":690,"y":75},{"x":720,"y":0}].map(function (p) { return Object.freeze(p); })) }),
        frost_pass_a: Object.freeze({ assetKey: 'map_frost_pass_a', roadBuffer: 52, path: Object.freeze([{"x":0,"y":350},{"x":55,"y":355},{"x":110,"y":375},{"x":165,"y":405},{"x":220,"y":410},{"x":260,"y":390},{"x":285,"y":350},{"x":300,"y":305},{"x":300,"y":255},{"x":320,"y":220},{"x":355,"y":185},{"x":405,"y":165},{"x":465,"y":160},{"x":520,"y":175},{"x":560,"y":210},{"x":580,"y":250},{"x":585,"y":300},{"x":575,"y":345},{"x":590,"y":385},{"x":625,"y":420},{"x":680,"y":445},{"x":740,"y":450},{"x":800,"y":440},{"x":855,"y":420},{"x":910,"y":395},{"x":955,"y":380},{"x":1000,"y":380}].map(function (p) { return Object.freeze(p); })) }),
        frost_pass_b: Object.freeze({ assetKey: 'map_frost_pass_b', roadBuffer: 52, path: Object.freeze([{"x":0,"y":390},{"x":55,"y":370},{"x":100,"y":335},{"x":125,"y":290},{"x":140,"y":245},{"x":175,"y":210},{"x":225,"y":185},{"x":285,"y":170},{"x":350,"y":175},{"x":410,"y":195},{"x":470,"y":220},{"x":530,"y":235},{"x":590,"y":230},{"x":650,"y":215},{"x":710,"y":205},{"x":765,"y":220},{"x":810,"y":250},{"x":845,"y":290},{"x":865,"y":340},{"x":875,"y":390},{"x":865,"y":440},{"x":835,"y":480},{"x":800,"y":505},{"x":850,"y":520},{"x":915,"y":520},{"x":1000,"y":510}].map(function (p) { return Object.freeze(p); })) }),
    });

    // V14 Arenas Pack II: new routes for the Ashen Frontier and Haunted Marsh worlds.
    const V14_ARENAS = Object.freeze({
        ashen_frontier_a: Object.freeze({ assetKey: 'map_ashen_frontier_a', roadBuffer: 56, path: Object.freeze([
            {x:500,y:600},{x:555,y:560},{x:610,y:525},{x:650,y:485},{x:665,y:445},{x:650,y:410},{x:615,y:385},{x:570,y:365},{x:520,y:350},{x:470,y:335},{x:430,y:310},{x:410,y:280},{x:415,y:245},{x:445,y:215},{x:490,y:190},{x:545,y:175},{x:605,y:170},{x:665,y:160},{x:720,y:140},{x:770,y:115},{x:810,y:85},{x:840,y:50},{x:860,y:0}
        ].map(function (p) { return Object.freeze(p); })) }),
        ashen_frontier_b: Object.freeze({ assetKey: 'map_ashen_frontier_b', roadBuffer: 56, path: Object.freeze([
            {x:455,y:600},{x:405,y:565},{x:355,y:535},{x:305,y:505},{x:265,y:475},{x:245,y:445},{x:250,y:415},{x:280,y:390},{x:325,y:370},{x:380,y:350},{x:440,y:335},{x:500,y:320},{x:555,y:300},{x:605,y:275},{x:645,y:245},{x:675,y:210},{x:705,y:175},{x:745,y:145},{x:795,y:120},{x:850,y:100},{x:910,y:80},{x:960,y:65},{x:1000,y:55}
        ].map(function (p) { return Object.freeze(p); })) }),
        haunted_marsh_a: Object.freeze({ assetKey: 'map_haunted_marsh_a', roadBuffer: 52, path: Object.freeze([
            {x:1000,y:395},{x:945,y:405},{x:895,y:420},{x:850,y:445},{x:810,y:475},{x:770,y:505},{x:725,y:530},{x:680,y:550},{x:630,y:565},{x:580,y:575},{x:535,y:565},{x:500,y:540},{x:465,y:510},{x:425,y:485},{x:380,y:465},{x:335,y:445},{x:290,y:420},{x:245,y:390},{x:205,y:360},{x:175,y:330},{x:165,y:305},{x:195,y:285},{x:235,y:270},{x:280,y:255},{x:330,y:245},{x:380,y:238},{x:430,y:232},{x:475,y:225}
        ].map(function (p) { return Object.freeze(p); })) }),
        haunted_marsh_b: Object.freeze({ assetKey: 'map_haunted_marsh_b', roadBuffer: 50, path: Object.freeze([
            {x:145,y:600},{x:165,y:565},{x:190,y:530},{x:220,y:500},{x:255,y:470},{x:295,y:440},{x:330,y:415},{x:350,y:390},{x:330,y:365},{x:295,y:345},{x:255,y:325},{x:220,y:300},{x:230,y:275},{x:265,y:250},{x:305,y:225},{x:350,y:200},{x:395,y:175},{x:440,y:155},{x:480,y:140}
        ].map(function (p) { return Object.freeze(p); })) })
    });


    // V15 Arenas Pack III: final unique routes for Dragon Highlands and Shadow Citadel.
    const V15_ARENAS = Object.freeze({
        dragon_highlands_a: Object.freeze({ assetKey: 'map_dragon_highlands_a', roadBuffer: 50, path: Object.freeze([
            {x:390,y:600},{x:410,y:575},{x:435,y:550},{x:465,y:525},{x:495,y:505},{x:530,y:485},{x:565,y:470},{x:600,y:455},{x:640,y:440},{x:680,y:425},{x:720,y:410},{x:760,y:395},{x:800,y:382},{x:840,y:370},{x:880,y:360},{x:920,y:355},{x:960,y:352},{x:1000,y:350}
        ].map(function (p) { return Object.freeze(p); })) }),
        dragon_highlands_b: Object.freeze({ assetKey: 'map_dragon_highlands_b', roadBuffer: 50, path: Object.freeze([
            {x:680,y:600},{x:665,y:575},{x:650,y:550},{x:635,y:525},{x:620,y:500},{x:605,y:475},{x:595,y:450},{x:585,y:425},{x:575,y:400},{x:565,y:375},{x:550,y:350},{x:530,y:330},{x:505,y:315},{x:480,y:310},{x:455,y:318},{x:430,y:332},{x:410,y:350},{x:395,y:370},{x:380,y:390},{x:360,y:405},{x:335,y:415},{x:305,y:420},{x:270,y:418},{x:235,y:410},{x:195,y:400},{x:155,y:390},{x:115,y:382},{x:75,y:375},{x:35,y:370},{x:0,y:368}
        ].map(function (p) { return Object.freeze(p); })) }),
        shadow_citadel_a: Object.freeze({ assetKey: 'map_shadow_citadel_a', roadBuffer: 48, path: Object.freeze([
            {x:205,y:600},{x:235,y:575},{x:265,y:548},{x:300,y:520},{x:335,y:492},{x:370,y:468},{x:405,y:448},{x:445,y:432},{x:485,y:420},{x:525,y:405},{x:565,y:385},{x:600,y:360},{x:625,y:332},{x:642,y:302},{x:650,y:270},{x:645,y:240},{x:632,y:212},{x:610,y:190},{x:585,y:175},{x:560,y:165},{x:545,y:150},{x:560,y:135},{x:590,y:125},{x:625,y:125},{x:665,y:135},{x:705,y:155},{x:745,y:180},{x:785,y:205},{x:825,y:225}
        ].map(function (p) { return Object.freeze(p); })) }),
        shadow_citadel_b: Object.freeze({ assetKey: 'map_shadow_citadel_b', roadBuffer: 46, path: Object.freeze([
            {x:295,y:600},{x:315,y:575},{x:335,y:550},{x:355,y:525},{x:380,y:500},{x:410,y:480},{x:445,y:462},{x:485,y:450},{x:525,y:448},{x:565,y:455},{x:605,y:470},{x:640,y:490},{x:675,y:515},{x:710,y:535},{x:745,y:545},{x:780,y:538},{x:805,y:520},{x:825,y:495},{x:838,y:465},{x:840,y:435},{x:832,y:405},{x:815,y:378},{x:792,y:355},{x:765,y:335},{x:735,y:315},{x:700,y:300},{x:660,y:290},{x:620,y:285},{x:580,y:288},{x:545,y:298},{x:515,y:315},{x:495,y:335},{x:500,y:355}
        ].map(function (p) { return Object.freeze(p); })) })
    });


    // R9.3 — Final Arena Routes & Multi-Entry Marsh.
    // All six regenerated paintings are traced manually in 1000x600 gameplay coordinates.
    // Anchors are linearly densified to <= 8 px so enemies follow bends without corner cutting.
    function freezePath(points) {
        return Object.freeze(points.map(function (p) { return Object.freeze({ x:Number(p[0]), y:Number(p[1]) }); }));
    }
    function densifyPath(points, maxStep) {
        const src = Array.isArray(points) ? points : [];
        const step = Math.max(4, Number(maxStep) || 8);
        if (!src.length) return Object.freeze([]);
        const out = [[Number(src[0][0]), Number(src[0][1])]];
        for (let i = 0; i < src.length - 1; i++) {
            const a = src[i], b = src[i + 1];
            const ax = Number(a[0]), ay = Number(a[1]), bx = Number(b[0]), by = Number(b[1]);
            const len = Math.hypot(bx - ax, by - ay);
            const count = Math.max(1, Math.ceil(len / step));
            for (let n = 1; n <= count; n++) {
                const t = n / count;
                out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
            }
        }
        return freezePath(out);
    }
    function freezePaths(paths) { return Object.freeze((paths || []).map(function (p) { return densifyPath(p, 8); })); }
    function freezeBuildZones(zones) {
        return Object.freeze((zones || []).map(function (z) { return Object.freeze({ type:'circle', x:z[0], y:z[1], r:z[2] }); }));
    }

    function freezeBuildSlots(points) {
        return Object.freeze((points || []).map(function (p, index) {
            return Object.freeze({ id:index + 1, x:Number(p[0]), y:Number(p[1]) });
        }));
    }
    // R9.4 FINAL: exact centers transcribed from the six approved user-marked arena screenshots.
    // They are candidate build anchors, not the simultaneous tower limit. The castle limit remains 10 -> 12 -> 14 -> 16.
    const R94_BUILD_SLOTS = Object.freeze({
        green_marches: freezeBuildSlots([[472,240],[513,245],[555,264],[291,271],[234,272],[597,277],[164,287],[319,294],[205,299],[258,304],[493,348],[774,370],[541,383],[308,390],[217,396],[252,396],[718,401],[611,405],[774,413],[510,417],[568,430],[268,437]]),
        frost_pass: freezeBuildSlots([[426,220],[360,237],[467,244],[761,247],[419,262],[651,263],[707,268],[369,281],[612,287],[307,295],[737,295],[660,303],[882,322],[831,337],[431,345],[375,365],[785,370],[324,374],[831,377],[745,393],[366,412]]),
        ashen_frontier: freezeBuildSlots([[407,142],[452,167],[365,170],[407,177],[569,191],[223,215],[607,267],[208,289],[248,291],[413,293],[626,295],[466,308],[671,309],[427,331],[440,394],[615,416],[670,439]]),
        haunted_marsh: freezeBuildSlots([[603,193],[546,196],[769,200],[367,229],[793,236],[419,239],[740,242],[257,311],[541,313],[869,317],[805,326],[490,327],[288,342],[358,345],[420,348],[828,370]]),
        dragon_highlands: freezeBuildSlots([[594,130],[546,152],[404,172],[712,176],[760,177],[361,188],[763,217],[682,280],[207,282],[281,282],[621,297],[254,312],[688,312],[393,395],[568,396],[348,397],[515,411],[373,443],[546,443]]),
        shadow_citadel: freezeBuildSlots([[677,170],[585,189],[646,192],[519,193],[826,228],[419,275],[803,280],[747,301],[686,304],[621,310],[392,317],[582,356],[363,360],[292,370],[238,393],[187,397],[574,427],[526,459],[463,483],[399,488]]),
    });


    const R93_WORLD_GEOMETRY = Object.freeze({
        green_marches: Object.freeze({ roadBuffer:42, paths:freezePaths([[[0,305],[40,315],[80,328],[120,338],[160,344],[200,345],[240,340],[280,328],[320,312],[360,295],[400,282],[430,280],[460,290],[490,310],[520,330],[555,345],[590,355],[625,358],[660,350],[695,335],[725,315],[750,290],[775,265],[800,245],[830,230],[860,220],[890,215]]]), buildZones:freezeBuildZones([]) }),
        frost_pass: Object.freeze({ roadBuffer:42, paths:freezePaths([[[0,210],[30,225],[60,250],[90,275],[125,300],[165,315],[205,325],[250,330],[295,325],[335,315],[375,295],[415,280],[455,275],[495,282],[535,298],[575,315],[615,330],[655,338],[690,337],[725,325],[755,307],[780,285],[805,260],[830,240],[855,225],[875,218]]]), buildZones:freezeBuildZones([]) }),
        ashen_frontier: Object.freeze({ roadBuffer:42, paths:freezePaths([[[0,185],[35,195],[70,215],[105,245],[130,275],[150,305],[175,325],[205,335],[240,337],[275,330],[305,315],[330,295],[350,270],[365,245],[380,225],[405,215],[435,215],[465,225],[490,245],[505,270],[515,300],[525,325],[545,345],[575,355],[610,360],[650,360],[685,355],[715,345],[740,330],[760,310],[780,285],[795,260],[805,230],[815,205],[835,190],[855,185]]]), buildZones:freezeBuildZones([]) }),
        haunted_marsh: Object.freeze({ roadBuffer:40, paths:freezePaths([[[0,270],[45,275],[90,280],[120,265],[135,235],[145,205],[165,180],[195,165],[225,165],[250,180],[270,205],[285,235],[295,265],[315,285],[350,295],[390,300],[430,298],[470,286],[505,270],[540,265],[575,270],[610,285],[645,300],[680,305],[715,300],[745,290],[775,280],[810,270],[845,250],[875,230],[900,215]],[[620,600],[625,560],[630,520],[640,480],[655,440],[675,400],[700,365],[718,338],[730,318],[738,304],[748,292],[760,286],[775,280],[810,270],[845,250],[875,230],[900,215]]]), buildZones:freezeBuildZones([]) }),
        dragon_highlands: Object.freeze({ roadBuffer:40, paths:freezePaths([[[80,600],[100,565],[125,525],[155,485],[190,445],[230,410],[275,380],[325,365],[375,360],[425,365],[465,350],[490,325],[500,295],[490,270],[465,250],[435,235],[419,231],[406,225],[397,218],[392,211],[392,205],[396,199],[404,194],[414,191],[425,189],[435,190],[470,200],[505,215],[540,230],[575,235],[605,225],[619,214],[627,202],[631,190],[630,181],[625,173],[617,166],[608,162],[600,157],[596,153],[593,149],[592,145],[593,141],[596,137],[600,134],[605,132],[611,130],[617,129],[635,125],[670,125],[705,120],[735,105],[760,90]]]), buildZones:freezeBuildZones([]) }),
        shadow_citadel: Object.freeze({ roadBuffer:40, paths:freezePaths([[[95,600],[120,565],[145,530],[175,495],[205,460],[240,435],[280,420],[325,415],[370,418],[415,415],[455,400],[485,380],[505,355],[515,330],[515,305],[525,285],[545,270],[570,260],[600,258],[630,265],[660,275],[690,280],[720,275],[745,260],[760,240],[765,215],[765,190],[775,170],[795,155],[820,145]]]), buildZones:freezeBuildZones([]) })
    });

    // Placement geometry is synchronized with the regenerated paintings. These are hidden build regions,
    // not visible slots: the player remains free to place anywhere inside them if road/footprint/reach checks pass.
    function freezePointArray(points) { return Object.freeze(points.map(function (p) { return Object.freeze([Number(p[0]), Number(p[1])]); })); }
    function freezePolygonArray(polygons) { return Object.freeze((polygons || []).map(function (poly) { return freezePointArray(poly); })); }
    function freezeCircleArray(circles) { return Object.freeze((circles || []).map(function (c) { return Object.freeze({ x:Number(c[0]), y:Number(c[1]), r:Number(c[2]) }); })); }
    function freezeBuildTerrain(def) {
        return Object.freeze({
            roadHalfWidth:Number(def.roadHalfWidth)||30,
            allowPolygons:freezePolygonArray(def.allow),
            blockPolygons:freezePolygonArray(def.blockPoly),
            blockCircles:freezeCircleArray(def.blockCircle),
            surfaceVersion:'r9.3'
        });
    }
    const R93_BUILD_TERRAIN = Object.freeze({
        green_marches: freezeBuildTerrain({
            roadHalfWidth:30,
            allow:[
                [[120,105],[350,105],[382,145],[378,245],[345,282],[285,305],[210,300],[150,275],[118,220]],
                [[445,105],[745,105],[795,145],[800,225],[770,275],[710,305],[620,315],[535,295],[470,260],[445,205]],
                [[115,360],[360,350],[390,395],[375,470],[330,515],[245,530],[165,505],[120,455]],
                [[445,360],[840,350],[875,395],[862,470],[820,515],[735,535],[630,525],[545,495],[480,455],[450,410]]
            ],
            blockPoly:[],
            blockCircle:[[335,135,24],[305,455,30],[485,465,26],[685,470,28],[735,185,24],[805,330,22]]
        }),
        frost_pass: freezeBuildTerrain({
            roadHalfWidth:31,
            allow:[
                [[150,120],[500,105],[555,130],[560,225],[520,255],[455,265],[365,250],[270,265],[200,245],[160,205]],
                [[575,120],[775,125],[805,165],[800,245],[755,285],[690,305],[625,300],[585,270]],
                [[125,345],[380,345],[430,385],[420,465],[380,500],[300,515],[215,495],[155,455],[128,405]],
                [[430,355],[745,350],[790,390],[780,460],[735,505],[650,520],[555,510],[485,485],[445,440]]
            ],
            blockPoly:[],
            blockCircle:[[285,165,27],[380,165,26],[535,185,31],[370,430,31],[555,425,29],[690,440,25],[735,355,22]]
        }),
        ashen_frontier: freezeBuildTerrain({
            roadHalfWidth:30,
            allow:[
                [[115,80],[460,80],[500,115],[490,190],[445,210],[370,205],[285,195],[205,205],[145,185]],
                [[505,85],[760,90],[800,125],[795,205],[755,230],[690,240],[610,225],[550,205],[515,170]],
                [[95,220],[315,215],[340,255],[335,315],[305,355],[245,375],[165,365],[115,335]],
                [[350,380],[785,380],[820,420],[810,485],[760,525],[665,550],[550,548],[455,530],[385,490]],
                [[585,235],[790,230],[815,270],[805,320],[770,350],[710,370],[645,360],[605,330]]
            ],
            blockPoly:[],
            blockCircle:[[270,260,30],[445,260,26],[605,290,27],[720,310,24],[395,475,31],[545,480,29],[665,445,27],[235,485,28]]
        }),
        haunted_marsh: freezeBuildTerrain({
            roadHalfWidth:27,
            allow:[
                [[330,105],[620,105],[650,140],[647,210],[620,245],[560,255],[495,242],[430,248],[375,235],[340,195]],
                [[190,315],[585,315],[620,350],[615,425],[580,465],[520,490],[430,500],[340,490],[270,460],[220,420]],
                [[685,140],[855,140],[885,175],[885,235],[850,265],[790,278],[730,265],[695,230]],
                [[760,330],[900,325],[915,360],[905,410],[870,445],[805,450],[770,420]]
            ],
            blockPoly:[],
            blockCircle:[[365,175,23],[465,200,22],[590,185,25],[285,400,27],[480,410,25],[560,370,23],[815,185,24],[835,395,22]]
        }),
        dragon_highlands: freezeBuildTerrain({
            roadHalfWidth:29,
            allow:[
                [[175,225],[365,205],[395,235],[392,305],[360,340],[305,355],[235,350],[190,320]],
                [[250,370],[555,365],[590,405],[585,465],[545,505],[455,525],[355,515],[285,485],[255,440]],
                [[555,280],[785,275],[815,310],[810,370],[780,415],[720,445],[640,440],[585,410]],
                [[345,100],[585,95],[615,125],[610,180],[575,205],[505,215],[425,205],[370,180],[345,145]],
                [[625,115],[800,115],[825,145],[820,205],[790,235],[735,250],[680,240],[642,210]]
            ],
            blockPoly:[],
            blockCircle:[[310,280,24],[425,315,24],[535,430,25],[680,365,25],[455,155,24],[555,165,23],[700,190,23]]
        }),
        shadow_citadel: freezeBuildTerrain({
            roadHalfWidth:29,
            allow:[
                [[295,95],[690,95],[730,125],[730,185],[700,220],[630,238],[545,230],[470,238],[390,228],[325,205]],
                [[175,245],[485,240],[510,275],[505,335],[475,375],[410,400],[320,400],[240,382],[190,350]],
                [[525,285],[855,275],[890,310],[888,370],[850,415],[780,438],[690,430],[610,405],[555,365]],
                [[140,405],[500,395],[530,435],[520,485],[480,520],[405,538],[310,530],[220,505],[160,465]]
            ],
            blockPoly:[],
            blockCircle:[[365,205,22],[445,220,20],[610,185,21],[695,205,20],[315,335,22],[420,355,20],[675,355,22],[805,330,24]]
        })
    });

    const R93_ARENA_GEOMETRY = {};
    WORLD_DEFINITIONS.forEach(function (world) {
        const geometry = R93_WORLD_GEOMETRY[world.slug];
        const aId = world.arenaIds[0], bId = world.arenaIds[1];
        [aId, bId].forEach(function (arenaId, index) {
            R93_ARENA_GEOMETRY[arenaId] = Object.freeze({
                path: geometry.paths[0], paths: geometry.paths,
                roadBuffer:geometry.roadBuffer, buildZones:geometry.buildZones,
                buildTerrain:R93_BUILD_TERRAIN[world.slug], buildSlots:R94_BUILD_SLOTS[world.slug], routeVariant:index === 0 ? 'A' : 'B',
                routeName: world.slug === 'haunted_marsh' ? 'Два направления к крепости' : 'Основной путь',
                geometryVersion:'r9.4-final-slots'
            });
        });
    });
    Object.freeze(R93_ARENA_GEOMETRY);


    const MAPS = {};
    ARENA_BLUEPRINTS.forEach(function (def, index) {
        const active = V15_ARENAS[def[0]] || V14_ARENAS[def[0]] || V13_ARENAS[def[0]] || null;
        const geometry = R93_ARENA_GEOMETRY[def[0]] || null;
        MAPS[def[0]] = Object.freeze({
            id: def[0], worldId: def[1], arenaIndex: index + 1, name: def[2],
            // Final package: A/B are route variants on the same approved painting, so both reuse one canonical image file.
            assetKey: active ? ((geometry && geometry.routeVariant === 'B') ? active.assetKey.replace(/_b$/, '_a') : active.assetKey) : 'map',
            roadBuffer: geometry ? geometry.roadBuffer : (active ? active.roadBuffer : 60),
            placeholder: !active,
            path: geometry ? geometry.path : (active ? active.path : Object.freeze(BASE_PATH.map(function (p) { return Object.freeze({ x:p.x, y:p.y }); }))),
            paths: geometry ? geometry.paths : Object.freeze([geometry ? geometry.path : (active ? active.path : Object.freeze(BASE_PATH.map(function (p) { return Object.freeze({ x:p.x, y:p.y }); })))]),
            buildZones: geometry ? geometry.buildZones : Object.freeze([]),
            buildTerrain: geometry ? geometry.buildTerrain : null,
            buildSlots: geometry && geometry.buildSlots ? geometry.buildSlots : Object.freeze([]),
            routeVariant: geometry ? geometry.routeVariant : 'legacy',
            routeName: geometry ? geometry.routeName : '',
            geometryVersion: geometry ? geometry.geometryVersion : 'legacy',
            spawn: geometry ? geometry.path[0] : null,
            spawns: geometry ? Object.freeze(geometry.paths.map(function (p) { return p[0]; })) : null,
            exit: geometry ? geometry.path[geometry.path.length - 1] : null
        });
    });

    // V19: animation atlases preserve the approved V17/V18 art while adding frame-based Idle/Walk/Hit/Death states.
    const V19_ENEMY_ANIMATIONS = Object.freeze({
        runner:       Object.freeze({ assetKey: 'enemy_runner_anim_v19',       frameWidth: 128, frameHeight: 128, columns: 6, idleFps: 5, walkFps: 13, hitFps: 18, deathFps: 9 }),
        heavy:        Object.freeze({ assetKey: 'enemy_heavy_anim_v19',        frameWidth: 128, frameHeight: 128, columns: 6, idleFps: 4, walkFps: 7,  hitFps: 14, deathFps: 7 }),
        knight:       Object.freeze({ assetKey: 'enemy_knight_anim_v19',       frameWidth: 128, frameHeight: 128, columns: 6, idleFps: 5, walkFps: 8,  hitFps: 15, deathFps: 8 }),
        shaman:       Object.freeze({ assetKey: 'enemy_shaman_anim_v19',       frameWidth: 128, frameHeight: 128, columns: 6, idleFps: 5, walkFps: 7,  hitFps: 14, deathFps: 8 }),
        ghost:        Object.freeze({ assetKey: 'enemy_ghost_anim_v19',        frameWidth: 128, frameHeight: 128, columns: 6, idleFps: 6, walkFps: 9,  hitFps: 16, deathFps: 9 }),
        berserker:    Object.freeze({ assetKey: 'enemy_berserker_anim_v19',    frameWidth: 128, frameHeight: 128, columns: 6, idleFps: 5, walkFps: 10, hitFps: 18, deathFps: 9 }),
        shieldguard:  Object.freeze({ assetKey: 'enemy_shieldguard_anim_v19',  frameWidth: 128, frameHeight: 128, columns: 6, idleFps: 4, walkFps: 7,  hitFps: 14, deathFps: 7 }),
        warlock:      Object.freeze({ assetKey: 'enemy_warlock_anim_v19',      frameWidth: 128, frameHeight: 128, columns: 6, idleFps: 5, walkFps: 7,  hitFps: 15, deathFps: 8 }),
        frostborn:    Object.freeze({ assetKey: 'enemy_frostborn_anim_v19',    frameWidth: 128, frameHeight: 128, columns: 6, idleFps: 5, walkFps: 9,  hitFps: 15, deathFps: 8 }),
        necromancer:  Object.freeze({ assetKey: 'enemy_necromancer_anim_v19',  frameWidth: 128, frameHeight: 128, columns: 6, idleFps: 5, walkFps: 6,  hitFps: 14, deathFps: 8 }),
        saboteur:     Object.freeze({ assetKey: 'enemy_saboteur_anim_v19',     frameWidth: 128, frameHeight: 128, columns: 6, idleFps: 6, walkFps: 12, hitFps: 18, deathFps: 10 }),
        voidwalker:   Object.freeze({ assetKey: 'enemy_voidwalker_anim_v19',   frameWidth: 128, frameHeight: 128, columns: 6, idleFps: 6, walkFps: 9,  hitFps: 16, deathFps: 10 })
    });

    // V18: all twelve gameplay-distinct enemy classes now use dedicated optimized transparent sprites.
    // R5 — enemy baseline rebalance. Mechanics stay distinct, but HP, economy and hard counters are softened into a smoother campaign curve.
    const ENEMY_ARCHETYPES = {
        runner: { id: 'runner', type: 0, name: 'Налётчик', role: 'Разведчик', badge: '➤', speed: 3.5, hpMultiplier: 0.42, rewardBase: 6, rewardPerLevel: 0.30, color: '#ea580c', radius: 22, ccResist: 0, imgKey: 'enemy_runner_v17', drawSize: 68, artPack: 'v17', animation: V19_ENEMY_ANIMATIONS.runner, mechanic: 'Очень высокая скорость, мало здоровья' },
        heavy: { id: 'heavy', type: 1, name: 'Тяжёлый', role: 'Танк', badge: '●', speed: 0.95, hpMultiplier: 2.55, rewardBase: 22, rewardPerLevel: 1.20, color: '#7c3aed', radius: 30, ccResist: 0.45, imgKey: 'enemy_heavy_v17', drawSize: 78, artPack: 'v17', animation: V19_ENEMY_ANIMATIONS.heavy, mechanic: 'Много здоровья и 45% сопротивления контролю' },
        knight: { id: 'knight', type: 2, name: 'Рыцарь', role: 'Броня', badge: '◆', speed: 1.45, hpMultiplier: 1.65, rewardBase: 16, rewardPerLevel: 0.85, color: '#3b82f6', radius: 28, ccResist: 0, imgKey: 'enemy_knight_v17', drawSize: 80, artPack: 'v17', animation: V19_ENEMY_ANIMATIONS.knight, physResist: 0.40, mechanic: '40% сопротивления физическому урону' },
        shaman: { id: 'shaman', type: 3, name: 'Шаман', role: 'Поддержка', badge: '+', speed: 1.25, hpMultiplier: 1.35, rewardBase: 20, rewardPerLevel: 1.00, color: '#10b981', radius: 26, ccResist: 0, imgKey: 'enemy_shaman_v17', drawSize: 74, artPack: 'v17', animation: V19_ENEMY_ANIMATIONS.shaman, isHealer: true, healBase: 18, healPerLevel: 1.2, healRadius: 135, healCooldownFrames: 150, mechanic: 'Периодически лечит ближайших союзников' },
        ghost: { id: 'ghost', type: 4, name: 'Призрак', role: 'Уклонение', badge: '◇', speed: 2.2, hpMultiplier: 1.0, rewardBase: 14, rewardPerLevel: 0.75, color: '#06b6d4', radius: 25, ccResist: 0, imgKey: 'enemy_ghost_v17', drawSize: 70, artPack: 'v17', animation: V19_ENEMY_ANIMATIONS.ghost, dodgeChance: 0.25, mechanic: '25% шанс уклониться от физической атаки' },
        berserker: { id: 'berserker', type: 5, name: 'Берсерк', role: 'Ярость', badge: '⚔', speed: 1.65, hpMultiplier: 1.50, rewardBase: 18, rewardPerLevel: 0.95, color: '#dc2626', radius: 27, ccResist: 0.1, imgKey: 'enemy_berserker_v17', drawSize: 78, artPack: 'v17', animation: V19_ENEMY_ANIMATIONS.berserker, rageThreshold: 0.5, rageSpeedMult: 1.55, rageCastleDamage: 2, mechanic: 'При здоровье ниже 50% ускоряется на 55% и наносит 2 урона замку' },
        shieldguard: { id: 'shieldguard', type: 6, name: 'Щитоносец', role: 'Барьер', badge: '▣', speed: 0.98, hpMultiplier: 2.25, rewardBase: 24, rewardPerLevel: 1.10, color: '#64748b', radius: 30, ccResist: 0.25, imgKey: 'enemy_shieldguard_v18', drawSize: 82, artPack: 'v18', animation: V19_ENEMY_ANIMATIONS.shieldguard, physResist: 0.20, shieldHpMultiplier: 0.45, mechanic: 'Имеет дополнительный барьер 45% от максимального HP' },
        warlock: { id: 'warlock', type: 7, name: 'Чернокнижник', role: 'Ускорение', badge: '✦', speed: 1.2, hpMultiplier: 1.30, rewardBase: 21, rewardPerLevel: 1.00, color: '#a855f7', radius: 26, ccResist: 0.1, imgKey: 'enemy_warlock_v18', drawSize: 74, artPack: 'v18', animation: V19_ENEMY_ANIMATIONS.warlock, hasteAura: true, hasteRadius: 125, hasteMult: 1.22, hastePulseFrames: 30, hasteDurationFrames: 50, mechanic: 'Аурой ускоряет ближайших врагов на 22%' },
        frostborn: { id: 'frostborn', type: 8, name: 'Ледорождённый', role: 'Антиконтроль', badge: '❄', speed: 1.55, hpMultiplier: 1.55, rewardBase: 20, rewardPerLevel: 1.00, color: '#38bdf8', radius: 27, ccResist: 0.25, imgKey: 'enemy_frostborn_v18', drawSize: 76, artPack: 'v18', animation: V19_ENEMY_ANIMATIONS.frostborn, slowImmune: true, freezeImmune: true, mechanic: 'Невосприимчив к замедлению и заморозке' },
        necromancer: { id: 'necromancer', type: 9, name: 'Некромант', role: 'Размножение', badge: '☠', speed: 1.05, hpMultiplier: 1.65, rewardBase: 23, rewardPerLevel: 1.10, color: '#84cc16', radius: 27, ccResist: 0.15, imgKey: 'enemy_necromancer_v18', drawSize: 76, artPack: 'v18', animation: V19_ENEMY_ANIMATIONS.necromancer, deathSpawnType: 4, deathSpawnCount: 2, deathSpawnHpFactor: 0.22, deathSpawnRewardFactor: 0.10, mechanic: 'После смерти призывает двух ослабленных призраков' },
        saboteur: { id: 'saboteur', type: 10, name: 'Диверсант', role: 'Антибашня', badge: '⚙', speed: 1.75, hpMultiplier: 1.10, rewardBase: 21, rewardPerLevel: 1.00, color: '#f59e0b', radius: 24, ccResist: 0.1, imgKey: 'enemy_saboteur_v18', drawSize: 68, artPack: 'v18', animation: V19_ENEMY_ANIMATIONS.saboteur, disableTower: true, disableRadius: 125, disableFrames: 75, disableCooldownFrames: 270, mechanic: 'Периодически отключает ближайшую башню на 1,25 секунды' },
        voidwalker: { id: 'voidwalker', type: 11, name: 'Пустотник', role: 'Телепорт', badge: '◈', speed: 1.45, hpMultiplier: 1.45, rewardBase: 24, rewardPerLevel: 1.10, color: '#c084fc', radius: 26, ccResist: 0.2, imgKey: 'enemy_voidwalker_v18', drawSize: 72, artPack: 'v18', animation: V19_ENEMY_ANIMATIONS.voidwalker, dodgeChance: 0.10, blink: true, blinkCooldownFrames: 240, blinkNodes: 2, mechanic: 'Раз в 4 секунды телепортируется вперёд по маршруту' }
    };

    const ENEMY_BY_TYPE = {};
    Object.keys(ENEMY_ARCHETYPES).forEach(function (key) {
        const enemy = ENEMY_ARCHETYPES[key];
        ENEMY_BY_TYPE[enemy.type] = enemy;
    });

    const BOSS_CONCEPTS = {
        5:  { name: 'Вождь Железного Клыка', role: 'Орочий полководец Зелёных рубежей' },
        10: { name: 'Ледяная Королева', role: 'Владычица Северного Пика' },
        15: { name: 'Пепельный Некромант', role: 'Владыка обугленного некрополя' },
        20: { name: 'Каменный Колосс', role: 'Страж сердца туманных топей' },
        25: { name: 'Багровый Дракон', role: 'Хозяин огненных высот' },
        30: { name: 'Тёмный Король', role: 'Финальный владыка цитадели' }
    };

    // V20 — первые три босса получили отдельные профили поведения и фаз.
    const BOSS_REWORK_V20 = Object.freeze({
        5: Object.freeze({
            pack: 'r2', imgKey: 'boss_5_v20', drawSize: 170, mechanicId: 'iron_fang',
            mechanic: 'Боевой клич призывает подкрепление; на низком HP Вождь ускоряется и усиливает прорыв.',
            phaseThresholds: Object.freeze([0.70, 0.35]),
            phaseNames: Object.freeze(['Военный вождь', 'Кровавый зов', 'Последний натиск']),
            abilityCooldownFrames: 360,
            summonTypes: Object.freeze([0, 5]), summonCountByPhase: Object.freeze([2, 3, 4]),
            summonHpFactor: 0.042, summonRewardFactor: 0.05,
            speedMultByPhase: Object.freeze([1.00, 1.12, 1.28]),
            castleDamageByPhase: Object.freeze([5, 6, 8]),
            phaseColor: '#ef4444',
            aiVersion: 'v22', telegraphFrames: 34, phaseGuardFrames: 90, phaseGuardDamageMult: 0.40,
            phaseCooldownMult: Object.freeze([1.00, 0.86, 0.72]),
            abilityDeckByPhase: Object.freeze([Object.freeze(['war_cry']), Object.freeze(['war_cry','blood_banner']), Object.freeze(['war_cry','blood_banner','last_charge'])]),
            phaseTransitionSummonsByPhase: Object.freeze([0, 2, 3]), bannerHasteFrames: 150, bannerHasteMult: 1.18,
            chargeNodesByPhase: Object.freeze([0, 0, 1])
        }),
        10: Object.freeze({
            pack: 'r2', imgKey: 'boss_10_v20', drawSize: 168, mechanicId: 'ice_queen',
            mechanic: 'Ледяная печать временно отключает башни; новые фазы восстанавливают ледяной барьер.',
            phaseThresholds: Object.freeze([0.68, 0.32]),
            phaseNames: Object.freeze(['Ледяной трон', 'Белая буря', 'Абсолютный холод']),
            abilityCooldownFrames: 420,
            disableTowerFrames: 120, disableTowerCountByPhase: Object.freeze([1, 1, 2]),
            phaseShieldByPhase: Object.freeze([0, 0.14, 0.20]),
            speedMultByPhase: Object.freeze([1.00, 1.07, 1.16]),
            castleDamageByPhase: Object.freeze([5, 6, 7]),
            slowImmune: true, freezeImmune: true,
            phaseColor: '#38bdf8',
            aiVersion: 'v22', telegraphFrames: 42, phaseGuardFrames: 100, phaseGuardDamageMult: 0.35,
            phaseCooldownMult: Object.freeze([1.00, 0.88, 0.74]),
            abilityDeckByPhase: Object.freeze([Object.freeze(['ice_seal']), Object.freeze(['ice_seal','whiteout']), Object.freeze(['ice_seal','whiteout','crystal_aegis'])]),
            whiteoutTowerCountByPhase: Object.freeze([1, 2, 3]), whiteoutDisableFrames: 90,
            aegisShieldByPhase: Object.freeze([0.06, 0.09, 0.12])
        }),
        15: Object.freeze({
            pack: 'r2', imgKey: 'boss_15_v20', drawSize: 168, mechanicId: 'ash_necromancer',
            mechanic: 'Поднимает пепельных духов; с каждой фазой призывает больше прислужников и укрепляет броню.',
            phaseThresholds: Object.freeze([0.66, 0.30]),
            phaseNames: Object.freeze(['Повелитель пепла', 'Зов некрополя', 'Погребальный огонь']),
            abilityCooldownFrames: 390,
            summonTypes: Object.freeze([4, 7]), summonCountByPhase: Object.freeze([2, 3, 4]),
            summonHpFactor: 0.028, summonRewardFactor: 0.045,
            physResistByPhase: Object.freeze([0.00, 0.12, 0.22]),
            speedMultByPhase: Object.freeze([1.00, 1.05, 1.12]),
            castleDamageByPhase: Object.freeze([5, 6, 7]),
            phaseColor: '#22c55e',
            aiVersion: 'v22', telegraphFrames: 38, phaseGuardFrames: 95, phaseGuardDamageMult: 0.40,
            phaseCooldownMult: Object.freeze([1.00, 0.85, 0.70]),
            abilityDeckByPhase: Object.freeze([Object.freeze(['raise_dead']), Object.freeze(['raise_dead','soul_drain']), Object.freeze(['raise_dead','soul_drain','grave_pact'])]),
            phaseTransitionSummonsByPhase: Object.freeze([0, 2, 3]),
            soulDrainHealByPhase: Object.freeze([0.012, 0.022, 0.035]), gravePactBonusByPhase: Object.freeze([0, 1, 2])
        })
    });

    // V21 — финальные три босса (миры 4–6) получили собственные арты, фазы и базовые механики.
    const BOSS_REWORK_V21 = Object.freeze({
        20: Object.freeze({
            pack: 'r2', imgKey: 'boss_20_v21', drawSize: 182, mechanicId: 'stone_colossus',
            mechanic: 'Каменный панцирь растёт по фазам; удар по земле временно оглушает ближайшие башни.',
            phaseThresholds: Object.freeze([0.72, 0.34]),
            phaseNames: Object.freeze(['Каменная поступь', 'Живой бастион', 'Ярость Колосса']),
            abilityCooldownFrames: 420,
            disableTowerFrames: 54, disableTowerCountByPhase: Object.freeze([1, 2, 2]),
            phaseShieldByPhase: Object.freeze([0, 0.10, 0.16]),
            physResistByPhase: Object.freeze([0.22, 0.36, 0.50]),
            speedMultByPhase: Object.freeze([1.00, 1.05, 1.12]),
            castleDamageByPhase: Object.freeze([5, 7, 9]),
            phaseColor: '#2dd4bf',
            aiVersion: 'v22', telegraphFrames: 40, phaseGuardFrames: 110, phaseGuardDamageMult: 0.32,
            phaseCooldownMult: Object.freeze([1.00, 0.84, 0.68]),
            abilityDeckByPhase: Object.freeze([Object.freeze(['earthquake']), Object.freeze(['earthquake','stone_aegis']), Object.freeze(['earthquake','stone_aegis','boulder_step'])]),
            stoneAegisByPhase: Object.freeze([0.05, 0.09, 0.13]), boulderNodesByPhase: Object.freeze([0, 0, 1])
        }),
        25: Object.freeze({
            pack: 'r2', imgKey: 'boss_25_v21', drawSize: 192, mechanicId: 'crimson_dragon',
            mechanic: 'Огненное дыхание перегревает башни; в поздних фазах Дракон делает рывок вперёд по маршруту.',
            phaseThresholds: Object.freeze([0.70, 0.33]),
            phaseNames: Object.freeze(['Крылья пламени', 'Багровый шторм', 'Последний полёт']),
            abilityCooldownFrames: 390,
            disableTowerFrames: 72, disableTowerCountByPhase: Object.freeze([1, 2, 2]),
            leapNodesByPhase: Object.freeze([0, 0, 1]),
            speedMultByPhase: Object.freeze([1.00, 1.12, 1.28]),
            castleDamageByPhase: Object.freeze([5, 7, 9]),
            slowImmune: true, freezeImmune: true,
            phaseColor: '#f97316',
            aiVersion: 'v22', telegraphFrames: 32, phaseGuardFrames: 90, phaseGuardDamageMult: 0.42,
            phaseCooldownMult: Object.freeze([1.00, 0.82, 0.66]),
            abilityDeckByPhase: Object.freeze([Object.freeze(['fire_breath']), Object.freeze(['fire_breath','meteor_dive']), Object.freeze(['fire_breath','meteor_dive','winged_charge'])]),
            meteorTowerCountByPhase: Object.freeze([1, 2, 3]), meteorDisableFrames: 120,
            wingedChargeNodesByPhase: Object.freeze([0, 1, 2])
        }),
        30: Object.freeze({
            pack: 'r2', imgKey: 'boss_30_v21', drawSize: 182, mechanicId: 'dark_king',
            mechanic: 'Призывает элиту Цитадели и телепортируется вперёд; последняя фаза усиливает броню и урон по замку.',
            phaseThresholds: Object.freeze([0.72, 0.38]),
            phaseNames: Object.freeze(['Владыка теней', 'Корона Бездны', 'Истинная форма']),
            abilityCooldownFrames: 330,
            summonTypes: Object.freeze([6, 9, 11]), summonCountByPhase: Object.freeze([2, 3, 4]),
            summonHpFactor: 0.014, summonRewardFactor: 0.03,
            blinkNodesByPhase: Object.freeze([0, 1, 2]),
            physResistByPhase: Object.freeze([0.08, 0.16, 0.26]),
            speedMultByPhase: Object.freeze([1.00, 1.10, 1.20]),
            castleDamageByPhase: Object.freeze([5, 8, 12]),
            phaseColor: '#a855f7',
            aiVersion: 'v22', telegraphFrames: 28, phaseGuardFrames: 120, phaseGuardDamageMult: 0.30,
            phaseCooldownMult: Object.freeze([0.92, 0.74, 0.58]),
            abilityDeckByPhase: Object.freeze([Object.freeze(['void_summon','shadow_seal']), Object.freeze(['void_summon','shadow_blink','shadow_seal']), Object.freeze(['void_summon','shadow_blink','crown_burst'])]),
            phaseTransitionSummonsByPhase: Object.freeze([0, 3, 5]), phaseShieldByPhase: Object.freeze([0, 0.08, 0.15]),
            shadowSealCountByPhase: Object.freeze([1, 2, 3]), shadowSealFrames: 90, crownBurstTowerCount: 4, crownBurstFrames: 60
        })
    });

    // R4 — dedicated boss presentation layer for the six newly generated boss assets.
    // R4 focused on readability, scale and encounter staging; R5 applies combat values through the balance table below.
    const R4_BOSS_PRESENTATION = Object.freeze({
        5:  Object.freeze({ drawSize:174, radius:52, spawnFrames:120, deathFrames:105, telegraphFrames:52, phaseScaleByPhase:Object.freeze([1.00,1.04,1.09]) }),
        10: Object.freeze({ drawSize:172, radius:50, spawnFrames:124, deathFrames:112, telegraphFrames:58, phaseScaleByPhase:Object.freeze([1.00,1.03,1.07]) }),
        15: Object.freeze({ drawSize:174, radius:50, spawnFrames:122, deathFrames:110, telegraphFrames:54, phaseScaleByPhase:Object.freeze([1.00,1.04,1.08]) }),
        20: Object.freeze({ drawSize:188, radius:58, spawnFrames:130, deathFrames:120, telegraphFrames:56, phaseScaleByPhase:Object.freeze([1.00,1.05,1.10]) }),
        25: Object.freeze({ drawSize:198, radius:60, spawnFrames:128, deathFrames:124, telegraphFrames:48, phaseScaleByPhase:Object.freeze([1.00,1.04,1.09]) }),
        30: Object.freeze({ drawSize:190, radius:56, spawnFrames:138, deathFrames:132, telegraphFrames:46, phaseScaleByPhase:Object.freeze([1.00,1.05,1.12]) })
    });

    // R5 — boss HP and travel speed are normalized against the very different arena route lengths.
    const R5_BOSS_BALANCE = Object.freeze({
        5:  Object.freeze({ hp:7200,  speed:0.72, reward:320 }),
        10: Object.freeze({ hp:13500, speed:0.86, reward:450 }),
        15: Object.freeze({ hp:22500, speed:1.00, reward:580 }),
        20: Object.freeze({ hp:35000, speed:0.72, reward:720 }),
        25: Object.freeze({ hp:52000, speed:0.90, reward:900 }),
        30: Object.freeze({ hp:74000, speed:0.88, reward:1200 })
    });

    const BOSSES = {};
    [5, 10, 15, 20, 25, 30].forEach(function (level) {
        const concept = BOSS_CONCEPTS[level];
        const rework = BOSS_REWORK_V21[level] || BOSS_REWORK_V20[level] || null;
        const presentation = R4_BOSS_PRESENTATION[level] || Object.freeze({});
        const bossBalance = R5_BOSS_BALANCE[level] || Object.freeze({ hp:1500 + level * 800, speed:0.8, reward:150 + level * 20 });
        BOSSES[level] = Object.freeze({
            id: 'boss_' + level,
            level: level,
            worldId: Math.ceil(level / META.levelsPerWorld),
            name: concept.name,
            role: concept.role,
            hp: bossBalance.hp,
            speed: bossBalance.speed,
            reward: bossBalance.reward,
            color: rework ? rework.phaseColor : '#ef4444',
            radius: presentation.radius || (rework ? 48 : 45),
            type: 99,
            ccResist: 0.75,
            imgKey: rework ? rework.imgKey : ('boss_' + level),
            drawSize: presentation.drawSize || (rework ? rework.drawSize : 130),
            castleDamage: 5,
            bossPack: rework ? rework.pack : 'legacy',
            mechanicId: rework ? rework.mechanicId : 'legacy',
            mechanic: rework ? rework.mechanic : '',
            phaseThresholds: rework ? rework.phaseThresholds : Object.freeze([]),
            phaseNames: rework ? rework.phaseNames : Object.freeze(['Босс']),
            abilityCooldownFrames: rework ? rework.abilityCooldownFrames : 0,
            summonTypes: rework && rework.summonTypes ? rework.summonTypes : Object.freeze([]),
            summonCountByPhase: rework && rework.summonCountByPhase ? rework.summonCountByPhase : Object.freeze([]),
            summonHpFactor: rework ? (rework.summonHpFactor || 0) : 0,
            summonRewardFactor: rework ? (rework.summonRewardFactor || 0) : 0,
            disableTowerFrames: rework ? (rework.disableTowerFrames || 0) : 0,
            disableTowerCountByPhase: rework && rework.disableTowerCountByPhase ? rework.disableTowerCountByPhase : Object.freeze([]),
            leapNodesByPhase: rework && rework.leapNodesByPhase ? rework.leapNodesByPhase : Object.freeze([]),
            blinkNodesByPhase: rework && rework.blinkNodesByPhase ? rework.blinkNodesByPhase : Object.freeze([]),
            phaseShieldByPhase: rework && rework.phaseShieldByPhase ? rework.phaseShieldByPhase : Object.freeze([]),
            physResistByPhase: rework && rework.physResistByPhase ? rework.physResistByPhase : Object.freeze([]),
            speedMultByPhase: rework && rework.speedMultByPhase ? rework.speedMultByPhase : Object.freeze([1]),
            castleDamageByPhase: rework && rework.castleDamageByPhase ? rework.castleDamageByPhase : Object.freeze([5]),
            slowImmune: !!(rework && rework.slowImmune),
            freezeImmune: !!(rework && rework.freezeImmune),
            aiVersion: rework && rework.aiVersion ? rework.aiVersion : 'legacy',
            telegraphFrames: presentation.telegraphFrames || (rework ? (rework.telegraphFrames || 0) : 0),
            phaseGuardFrames: rework ? (rework.phaseGuardFrames || 0) : 0,
            phaseGuardDamageMult: rework ? (rework.phaseGuardDamageMult || 1) : 1,
            phaseCooldownMult: rework && rework.phaseCooldownMult ? rework.phaseCooldownMult : Object.freeze([1]),
            abilityDeckByPhase: rework && rework.abilityDeckByPhase ? rework.abilityDeckByPhase : Object.freeze([Object.freeze([])]),
            phaseTransitionSummonsByPhase: rework && rework.phaseTransitionSummonsByPhase ? rework.phaseTransitionSummonsByPhase : Object.freeze([0,0,0]),
            bannerHasteFrames: rework ? (rework.bannerHasteFrames || 0) : 0, bannerHasteMult: rework ? (rework.bannerHasteMult || 1) : 1,
            chargeNodesByPhase: rework && rework.chargeNodesByPhase ? rework.chargeNodesByPhase : Object.freeze([0,0,0]),
            whiteoutTowerCountByPhase: rework && rework.whiteoutTowerCountByPhase ? rework.whiteoutTowerCountByPhase : Object.freeze([0,0,0]),
            whiteoutDisableFrames: rework ? (rework.whiteoutDisableFrames || 0) : 0, aegisShieldByPhase: rework && rework.aegisShieldByPhase ? rework.aegisShieldByPhase : Object.freeze([0,0,0]),
            soulDrainHealByPhase: rework && rework.soulDrainHealByPhase ? rework.soulDrainHealByPhase : Object.freeze([0,0,0]), gravePactBonusByPhase: rework && rework.gravePactBonusByPhase ? rework.gravePactBonusByPhase : Object.freeze([0,0,0]),
            stoneAegisByPhase: rework && rework.stoneAegisByPhase ? rework.stoneAegisByPhase : Object.freeze([0,0,0]), boulderNodesByPhase: rework && rework.boulderNodesByPhase ? rework.boulderNodesByPhase : Object.freeze([0,0,0]),
            meteorTowerCountByPhase: rework && rework.meteorTowerCountByPhase ? rework.meteorTowerCountByPhase : Object.freeze([0,0,0]), meteorDisableFrames: rework ? (rework.meteorDisableFrames || 0) : 0,
            wingedChargeNodesByPhase: rework && rework.wingedChargeNodesByPhase ? rework.wingedChargeNodesByPhase : Object.freeze([0,0,0]),
            shadowSealCountByPhase: rework && rework.shadowSealCountByPhase ? rework.shadowSealCountByPhase : Object.freeze([0,0,0]), shadowSealFrames: rework ? (rework.shadowSealFrames || 0) : 0,
            crownBurstTowerCount: rework ? (rework.crownBurstTowerCount || 0) : 0, crownBurstFrames: rework ? (rework.crownBurstFrames || 0) : 0,
            phaseColor: rework ? rework.phaseColor : '#ef4444',
            spawnFrames: presentation.spawnFrames || 0,
            deathFrames: presentation.deathFrames || 30,
            phaseScaleByPhase: presentation.phaseScaleByPhase || Object.freeze([1,1,1]),
            presentationVersion: 'r4',
            balanceVersion: 'r5'
        });
    });

    const CASTLE_UPGRADES = {
        hp: { title: "Крепкие стены", desc: "+5 Здоровья", max: 5, cost: [1, 3, 6, 10, 15] },
        skill1: { title: "Метеорит+", desc: "+20% Урона", max: 3, cost: [2, 5, 9] },
        skill2: { title: "Заморозка+", desc: "+1с остановки", max: 3, cost: [2, 5, 8] },
        skill3: { title: "Алхимия", desc: "+30 Золота", max: 3, cost: [2, 5, 8] },
        unlock4: { title: "Магия: Молния", desc: "Открывает Молнию", max: 1, cost: [10] },
        unlock5: { title: "Магия: Дыра", desc: "Открывает Черную Дыру", max: 1, cost: [15] },
        towerCap: { title: "Расширение гарнизона", desc: "+2 к лимиту башен за уровень (10 → 16)", max: 3, cost: [3, 7, 12] }
    };

    // V25 — persistent meta progression: castle rank, achievements and bestiary goals.
    const META_PROGRESSION = Object.freeze({
        castleMaxPoints: 19,
        rankTiers: Object.freeze([
            Object.freeze({ min: 0,  name: 'Страж рубежа', icon: '🛡️' }),
            Object.freeze({ min: 3,  name: 'Капитан гарнизона', icon: '⚔️' }),
            Object.freeze({ min: 7,  name: 'Хранитель крепости', icon: '🏰' }),
            Object.freeze({ min: 11, name: 'Маршал короны', icon: '👑' }),
            Object.freeze({ min: 16, name: 'Верховный защитник', icon: '✨' })
        ]),
        achievements: Object.freeze([
            Object.freeze({ id:'first_hundred', icon:'⚔️', title:'Первая сотня', desc:'Уничтожьте 100 врагов', metric:'enemiesKilled', goal:100, reward:1 }),
            Object.freeze({ id:'thousand_fallen', icon:'💀', title:'Тысяча павших', desc:'Уничтожьте 1000 врагов', metric:'enemiesKilled', goal:1000, reward:2 }),
            Object.freeze({ id:'architect', icon:'🏗️', title:'Архитектор обороны', desc:'Постройте 100 башен', metric:'towersBuilt', goal:100, reward:2 }),
            Object.freeze({ id:'engineer', icon:'⬆️', title:'Военный инженер', desc:'Купите 75 улучшений башен', metric:'towerUpgradesBought', goal:75, reward:2 }),
            Object.freeze({ id:'arcanist', icon:'✨', title:'Арканист', desc:'Примените 100 способностей', metric:'abilitiesUsed', goal:100, reward:2 }),
            Object.freeze({ id:'boss_hunter', icon:'👹', title:'Охотник на владык', desc:'Победите 6 боссов', metric:'bossesKilled', goal:6, reward:3 }),
            Object.freeze({ id:'perfect_guard', icon:'❤️', title:'Безупречная оборона', desc:'Получите 3★ в 5 победах', metric:'perfectWins', goal:5, reward:3 }),
            Object.freeze({ id:'star_keeper', icon:'⭐', title:'Хранитель звёзд', desc:'Наберите 45 звёзд кампании', metric:'campaignStars', goal:45, reward:3 }),
            Object.freeze({ id:'star_master', icon:'🌟', title:'Звёздный маршал', desc:'Наберите 75 звёзд кампании', metric:'campaignStars', goal:75, reward:4 }),
            Object.freeze({ id:'conqueror', icon:'🗺️', title:'Завоеватель', desc:'Пройдите все 30 уровней', metric:'completedLevels', goal:30, reward:4 }),
            Object.freeze({ id:'bestiary_master', icon:'📖', title:'Летописец чудовищ', desc:'Откройте все 18 записей бестиария', metric:'bestiaryEntries', goal:18, reward:3 }),
            Object.freeze({ id:'dark_king', icon:'👑', title:'Конец тёмного царства', desc:'Победите Тёмного Короля', metric:'darkKingDefeated', goal:1, reward:5 })
        ])
    });

    // V23 — five distinct tower roles, named branches and cross-tower synergies.
    const TOWER_UPGRADES = {
        BASIC: {
            path1Name: 'Шквал', path1Role: 'Скорость и двойной огонь',
            path1: [
                { name: 'Автоматика', desc: '+28% скорости огня', cost: 50, apply: (st) => { st.fireRate *= 0.78; } },
                { name: 'Спарка', desc: 'Два снаряда по 62% базового урона', cost: 85, apply: (st) => { st.doubleShot = true; st.damage *= 0.62; } },
                { name: 'Подавление', desc: 'Ещё +60% темпа; каждый 5-й залп раскрывает броню', cost: 140, apply: (st) => { st.fireRate *= 0.62; st.suppressive = true; } }
            ],
            path2Name: 'Бронебой', path2Role: 'Пробитие и ослабление брони',
            path2: [
                { name: 'Вольфрам', desc: '+25% урона, 35% бронепробития', cost: 60, apply: (st) => { st.damage *= 1.25; st.armorPierce = Math.max(st.armorPierce || 0, 0.35); } },
                { name: 'Разметка', desc: '+25% радиус; -20% брони цели на 3с', cost: 85, apply: (st) => { st.range *= 1.25; st.armorShred = 0.20; st.armorShredDuration = 180; } },
                { name: 'Рваная рана', desc: 'Кровотечение + 60% бронепробития', cost: 135, apply: (st) => { st.bleed = true; st.armorPierce = Math.max(st.armorPierce || 0, 0.60); } }
            ]
        },
        SNIPER: {
            path1Name: 'Охотник', path1Role: 'Боссы и тяжёлые цели',
            path1: [
                { name: 'Крупный калибр', desc: '+45% урона; 55% бронепробития', cost: 95, apply: (st) => { st.damage *= 1.45; st.armorPierce = Math.max(st.armorPierce || 0, 0.55); } },
                { name: 'Добивание', desc: 'x2 урон по целям <30% HP', cost: 145, apply: (st) => { st.execute = true; } },
                { name: 'Хедшот', desc: 'Каждый 4-й выстрел x4', cost: 220, apply: (st) => { st.headshot = true; } }
            ],
            path2Name: 'Тактик', path2Role: 'Яд, дальность и осколки',
            path2: [
                { name: 'Токсин', desc: 'Отравление; Лазер +15% по отравленной цели', cost: 100, apply: (st) => { st.poison = true; } },
                { name: 'Дальнобойная оптика', desc: '+45% радиус', cost: 150, apply: (st) => { st.range *= 1.45; } },
                { name: 'Осколки', desc: '50 px AoE; яд поражает всю зону', cost: 210, apply: (st) => { st.aoe = 50; } }
            ]
        },
        CANNON: {
            path1Name: 'Осада', path1Role: 'AoE + термошок по замедленным',
            path1: [
                { name: 'Тяжёлый порох', desc: '+30% радиус взрыва', cost: 110, apply: (st) => { st.aoe *= 1.3; } },
                { name: 'Эпицентр', desc: 'x2 в центре; Термошок +45%', cost: 170, apply: (st) => { st.epicenter = true; st.chillBonus = 1.45; } },
                { name: 'Напалм', desc: 'После взрыва остаётся горящая зона', cost: 260, apply: (st) => { st.napalm = true; } }
            ],
            path2Name: 'Контроль', path2Role: 'Оглушение и каскадные взрывы',
            path2: [
                { name: 'Перезаряд', desc: '+28% скорости огня', cost: 100, apply: (st) => { st.fireRate *= 0.78; } },
                { name: 'Шоковая волна', desc: 'Оглушение 0.5с', cost: 175, apply: (st) => { st.stun = 30; } },
                { name: 'РЗСО', desc: '3 каскадных взрыва по 35% урона', cost: 240, apply: (st) => { st.cluster = true; st.clusterCount = 3; st.clusterDamage = 0.35; st.clusterRadius = 38; } }
            ]
        },
        FROST: {
            path1Name: 'Криостаз', path1Role: 'Долгий control + уязвимость',
            path1: [
                { name: 'Азот', desc: '+50% длительности slow', cost: 80, apply: (st) => { st.slowDur *= 1.5; } },
                { name: 'Хрупкость', desc: 'Цель 3с получает +25% всего урона', cost: 125, apply: (st) => { st.brittle = true; st.brittleDuration = 180; } },
                { name: 'Глыба', desc: '20% шанс полной заморозки', cost: 180, apply: (st) => { st.freezeChance = 0.20; } }
            ],
            path2Name: 'Криосеть', path2Role: 'Урон, аура и цепная молния',
            path2: [
                { name: 'Льдинки', desc: '+12 урона', cost: 70, apply: (st) => { st.damage += 12; } },
                { name: 'Аура', desc: 'Периодически замедляет всех в радиусе', cost: 145, apply: (st) => { st.aura = true; } },
                { name: 'Цепь', desc: 'Отскок ещё в 2 врагов', cost: 200, apply: (st) => { st.chain = 2; st.chainRange = 125; } }
            ]
        },
        LASER: {
            path1Name: 'Перегрузка', path1Role: 'Разгон урона и взрывы при убийстве',
            path1: [
                { name: 'Фокус', desc: '+25% урона', cost: 130, apply: (st) => { st.damage *= 1.25; } },
                { name: 'Нагрев', desc: 'По одной цели урон плавно растёт до x3', cost: 200, apply: (st) => { st.heatMode = true; } },
                { name: 'Перегрузка', desc: 'Убитая цель взрывается (75px / 90 ур.)', cost: 270, apply: (st) => { st.detonate = true; st.detonateRadius = 75; st.detonateDamage = 90; } }
            ],
            path2Name: 'Призма', path2Role: 'Дальность и многоцелевой луч',
            path2: [
                { name: 'Линза', desc: '+30% радиус', cost: 110, apply: (st) => { st.range *= 1.3; } },
                { name: 'Сплит', desc: 'Луч бьёт 2 цели', cost: 210, apply: (st) => { st.multiTarget = 2; } },
                { name: 'Призма', desc: 'Луч бьёт 3 цели', cost: 320, apply: (st) => { st.multiTarget = 3; } }
            ]
        }
    };

    // R5 — base tower economy. Every tower has a clear role; no cheap branch should out-DPS the expensive specialist by an order of magnitude.
    const TOWERS = {
        BASIC: { id: 'BASIC', name: 'Стрелок', role: 'Штурм', roleHint: 'Дешёвый DPS; может раскрывать броню', targetMode: 'first', cost: 55, range: 145, damage: 22, fireRate: 36, color: '#3b82f6', projSpeed: 18, baseColor: '#1e3a8a' },
        SNIPER: { id: 'SNIPER', name: 'Снайпер', role: 'Охотник', roleHint: 'Приоритет сильных и бронированных целей', targetMode: 'strong', bossBonus: 1.15, armorPierce: 0.25, cost: 125, range: 225, damage: 95, fireRate: 105, color: '#10b981', projSpeed: 35, baseColor: '#064e3b' },
        CANNON: { id: 'CANNON', name: 'Пушка', role: 'Осада', roleHint: 'AoE; +25% по slow/freeze целям', targetMode: 'cluster', chillBonus: 1.25, cost: 145, range: 125, damage: 48, fireRate: 75, color: '#ef4444', projSpeed: 10, aoe: 85, baseColor: '#7f1d1d' },
        FROST: { id: 'FROST', name: 'Крио', role: 'Контроль', roleHint: 'Замедляет самые быстрые цели и создаёт синергии', targetMode: 'fast', cost: 95, range: 120, damage: 7, fireRate: 62, color: '#06b6d4', projSpeed: 14, slow: 0.4, slowDur: 95, baseColor: '#164e63' },
        LASER: { id: 'LASER', name: 'Лазер', role: 'Энергия', roleHint: 'Игнорирует физ. броню; +15% по poisoned целям', targetMode: 'first', poisonBonus: 1.15, cost: 210, range: 175, damage: 1.15, fireRate: 1, color: '#8b5cf6', isLaser: true, baseColor: '#4c1d95' }
    };

    const SKILL_DEFINITIONS = {
        1: { name: '☄️ Метеорит', cooldownFrames: 40 * 60 },
        2: { name: '❄️ Время', cooldownFrames: 20 * 60 },
        3: { name: '💰 Золото', cooldownFrames: 30 * 60 },
        4: { name: '⚡ Молния', cooldownFrames: 25 * 60 },
        5: { name: '🌌 Дыра', cooldownFrames: 40 * 60 }
    };

    // V24 — 30 handcrafted campaign scenarios. Each level owns its pacing, threat mix and tactical briefing.
    const LEVEL_SCENARIOS = Object.freeze({"1":{"scenarioName":"Первые следы","objective":"Переживите первые налёты и изучите темп маршрута.","tip":"Ставьте Стрелка на длинном участке дороги; не тратьте всё золото сразу.","threat":"Скорость","waveCount":5,"goldOffset":40,"firstPrepSeconds":20,"betweenWavePrepSeconds":6,"patterns":[{"label":"Разведка","weights":[[0,1.0]],"countMult":0.82,"hpMult":0.88,"spawnMult":0.9,"note":"Небольшая группа быстрых налётчиков."},{"label":"Двойной налёт","weights":[[0,1.0]],"countMult":1.05,"hpMult":0.94,"spawnMult":0.72,"note":"Налётчики выходят плотнее."},{"label":"Длинный забег","weights":[[0,1.0]],"countMult":1.18,"hpMult":1.02,"spawnMult":0.78,"note":"Больше целей, но без брони."},{"label":"Проверка рубежа","weights":[[0,1.0]],"countMult":1.28,"hpMult":1.08,"spawnMult":0.7,"note":"Финальный быстрый поток."}],"plan":[0,1,2,3,3]},"2":{"scenarioName":"Тяжёлый конвой","objective":"Научитесь сочетать дешёвый DPS с фокусом по живучим целям.","tip":"Не позволяйте Тяжёлым закрывать собой быстрых Налётчиков.","threat":"Танки","waveCount":6,"goldOffset":30,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Лёгкий дозор","weights":[[0,3.0],[1,1.0]],"countMult":0.72,"hpMult":0.82,"spawnMult":0.95,"note":"Налётчики сопровождают одного-двух Тяжёлых."},{"label":"Конвой","weights":[[0,2.0],[1,2.0]],"countMult":0.74,"hpMult":0.88,"spawnMult":0.98,"note":"Равномерная колонна."},{"label":"Таран","weights":[[1,3.0],[0,1.0]],"countMult":0.62,"hpMult":1.02,"spawnMult":1.08,"note":"Меньше целей, больше здоровья."},{"label":"Прорыв под прикрытием","weights":[[0,4.0],[1,2.0]],"countMult":0.88,"hpMult":0.9,"spawnMult":0.8,"note":"Быстрые цели за тяжёлой линией."}],"plan":[0,2,3,1,2,3]},"3":{"scenarioName":"Стальная колонна","objective":"Разберите броню Рыцарей и не дайте им дойти до замка.","tip":"Снайпер и бронепробитие Стрелка особенно полезны против Рыцарей.","threat":"Физическая броня","waveCount":7,"goldOffset":20,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Проба брони","weights":[[0,2.0],[2,1.0]],"countMult":0.9,"hpMult":0.95,"spawnMult":0.92,"note":"Первые Рыцари в строю."},{"label":"Стальной клин","weights":[[2,3.0],[0,1.0]],"countMult":0.78,"hpMult":1.18,"spawnMult":1.02,"note":"Бронированная группа."},{"label":"Фланговый бег","weights":[[0,4.0],[2,1.0]],"countMult":1.18,"hpMult":0.96,"spawnMult":0.74,"note":"Налётчики растягивают приоритеты."},{"label":"Железный марш","weights":[[2,3.0],[0,2.0]],"countMult":1.02,"hpMult":1.1,"spawnMult":0.88,"note":"Плотный смешанный натиск."}],"plan":[0,3,1,2,2,1,3]},"4":{"scenarioName":"Три линии атаки","objective":"Одновременно держите скорость, здоровье и броню.","tip":"Разнесите башни по двум ключевым изгибам вместо одной перегруженной точки.","threat":"Смешанный состав","waveCount":8,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Разведка боем","weights":[[0,3.0],[1,1.0],[2,1.0]],"countMult":0.95,"hpMult":0.96,"spawnMult":0.88,"note":""},{"label":"Тяжёлая линия","weights":[[1,3.0],[2,2.0],[0,1.0]],"countMult":0.82,"hpMult":1.16,"spawnMult":0.98,"note":""},{"label":"Бронеклин","weights":[[2,3.0],[0,2.0]],"countMult":0.96,"hpMult":1.12,"spawnMult":0.88,"note":""},{"label":"Тройной натиск","weights":[[0,3.0],[1,2.0],[2,2.0]],"countMult":1.14,"hpMult":1.04,"spawnMult":0.78,"note":""}],"plan":[0,1,2,3,2,2,3,3]},"5":{"scenarioName":"Логово Железного Клыка","objective":"Сохраните экономику к последней волне и победите Вождя.","tip":"Перед боссом держите золото на улучшения, а не только на новые башни.","threat":"Босс + эскорт","waveCount":9,"goldOffset":70,"firstPrepSeconds":12,"betweenWavePrepSeconds":6,"patterns":[{"label":"Орочий дозор","weights":[[0,3.0],[1,1.0],[2,1.0]],"countMult":0.92,"hpMult":1.0,"spawnMult":0.88,"note":""},{"label":"Щит вождя","weights":[[1,3.0],[2,2.0]],"countMult":0.78,"hpMult":1.2,"spawnMult":1.0,"note":""},{"label":"Кровавый забег","weights":[[0,5.0],[2,1.0]],"countMult":1.22,"hpMult":1.0,"spawnMult":0.7,"note":""},{"label":"Гвардия логова","weights":[[0,2.0],[1,2.0],[2,3.0]],"countMult":1.06,"hpMult":1.13,"spawnMult":0.82,"note":""}],"plan":[0,2,3,1,2,3,1,3]},"6":{"scenarioName":"Белые тени","objective":"Научитесь удерживать быстрых Призраков без чрезмерной зависимости от физического урона.","tip":"Лазер надёжнее против уклоняющихся целей.","threat":"Уклонение","waveCount":8,"goldOffset":40,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Снежный дозор","weights":[[0,3.0],[4,1.0]],"countMult":0.96,"hpMult":0.98,"spawnMult":0.86,"note":""},{"label":"Призрачная стая","weights":[[4,4.0],[0,1.0]],"countMult":1.04,"hpMult":1.0,"spawnMult":0.78,"note":""},{"label":"Сквозь метель","weights":[[0,2.0],[4,3.0]],"countMult":1.12,"hpMult":1.04,"spawnMult":0.76,"note":""},{"label":"Белая погоня","weights":[[4,5.0],[0,2.0]],"countMult":1.16,"hpMult":1.08,"spawnMult":0.72,"note":""}],"plan":[0,3,1,2,2,1,2,3,3]},"7":{"scenarioName":"Холодный клин","objective":"Справьтесь с врагами, которых нельзя замедлить Крио.","tip":"Не стройте всю оборону вокруг slow: Ледорождённые его игнорируют.","threat":"Иммунитет к замедлению","waveCount":9,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Холодный разведотряд","weights":[[0,2.0],[4,2.0],[8,1.0]],"countMult":0.96,"hpMult":0.98,"spawnMult":0.88,"note":""},{"label":"Ледяное ядро","weights":[[8,3.0],[4,2.0]],"countMult":0.88,"hpMult":1.12,"spawnMult":0.94,"note":""},{"label":"Призрачный разгон","weights":[[4,4.0],[0,2.0],[8,1.0]],"countMult":1.16,"hpMult":1.0,"spawnMult":0.72,"note":""},{"label":"Северный клин","weights":[[8,3.0],[4,3.0],[0,1.0]],"countMult":1.08,"hpMult":1.1,"spawnMult":0.8,"note":""}],"plan":[0,1,2,3,2,2,3,1,2,3]},"8":{"scenarioName":"Броня во льду","objective":"Совместите борьбу с бронёй, уклонением и иммунитетом к контролю.","tip":"Пушка контролирует плотность, Снайпер снимает приоритетные бронированные цели.","threat":"Контр-композиция","waveCount":10,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Замёрзший патруль","weights":[[2,2.0],[4,2.0],[8,1.0]],"countMult":0.94,"hpMult":1.0,"spawnMult":0.88,"note":""},{"label":"Стальной лёд","weights":[[2,3.0],[8,2.0]],"countMult":0.82,"hpMult":1.18,"spawnMult":0.96,"note":""},{"label":"Тени на фланге","weights":[[4,4.0],[2,1.0],[8,1.0]],"countMult":1.16,"hpMult":1.0,"spawnMult":0.74,"note":""},{"label":"Северная стена","weights":[[2,3.0],[8,3.0],[4,1.0]],"countMult":1.02,"hpMult":1.14,"spawnMult":0.84,"note":""}],"plan":[0,2,3,1,2,3,1,2,3,2,3]},"9":{"scenarioName":"Северная лавина","objective":"Удержите длинные смешанные колонны без провала экономики.","tip":"Старайтесь не переулучшать одну башню: фронт требует нескольких ролей.","threat":"Длинные волны","waveCount":10,"goldOffset":30,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Ледяной конвой","weights":[[1,2.0],[2,2.0],[4,2.0],[8,1.0]],"countMult":1.0,"hpMult":1.06,"spawnMult":0.86,"note":""},{"label":"Тяжёлый снег","weights":[[1,3.0],[2,2.0],[8,1.0]],"countMult":0.86,"hpMult":1.2,"spawnMult":0.96,"note":""},{"label":"Призрачная лавина","weights":[[4,5.0],[0,2.0],[8,1.0]],"countMult":1.25,"hpMult":1.0,"spawnMult":0.68,"note":""},{"label":"Четыре угрозы","weights":[[1,2.0],[2,2.0],[4,2.0],[8,2.0]],"countMult":1.12,"hpMult":1.12,"spawnMult":0.78,"note":""}],"plan":[0,3,1,2,2,1,2,3,1,2,3,3]},"10":{"scenarioName":"Трон метели","objective":"Подготовьте универсальную оборону к Ледяной Королеве.","tip":"Сохраняйте резерв на башни, которые босс может временно отключить.","threat":"Босс + контроль башен","waveCount":11,"goldOffset":80,"firstPrepSeconds":12,"betweenWavePrepSeconds":6,"patterns":[{"label":"Стража перевала","weights":[[1,2.0],[2,2.0],[4,2.0],[8,1.0]],"countMult":0.96,"hpMult":1.08,"spawnMult":0.86,"note":""},{"label":"Белая гвардия","weights":[[2,3.0],[8,3.0],[1,1.0]],"countMult":0.88,"hpMult":1.2,"spawnMult":0.94,"note":""},{"label":"Тени метели","weights":[[4,5.0],[8,2.0]],"countMult":1.18,"hpMult":1.02,"spawnMult":0.72,"note":""},{"label":"Королевский эскорт","weights":[[1,2.0],[2,3.0],[4,2.0],[8,3.0]],"countMult":1.08,"hpMult":1.15,"spawnMult":0.8,"note":""}],"plan":[0,1,2,3,2,2,3,1,2,2,3]},"11":{"scenarioName":"Красная охота","objective":"Не дайте Берсеркам войти в ярость рядом с замком.","tip":"Добивайте раненых Берсерков быстро; их низкое HP делает их быстрее.","threat":"Ярость","waveCount":9,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Охотники","weights":[[2,2.0],[5,2.0]],"countMult":0.96,"hpMult":1.0,"spawnMult":0.84,"note":""},{"label":"Красный рывок","weights":[[5,4.0],[2,1.0]],"countMult":1.12,"hpMult":1.0,"spawnMult":0.7,"note":""},{"label":"Стальной заслон","weights":[[2,3.0],[5,2.0]],"countMult":0.92,"hpMult":1.12,"spawnMult":0.88,"note":""},{"label":"Яростная волна","weights":[[5,5.0],[2,2.0]],"countMult":1.2,"hpMult":1.08,"spawnMult":0.68,"note":""}],"plan":[0,2,3,1,2,3,1,2,3,2,2,3,3]},"12":{"scenarioName":"Щиты в пепле","objective":"Сломайте барьеры Щитоносцев до того, как Берсерки прорвутся за ними.","tip":"Сосредоточьте бронепробитие и AoE в одной огневой зоне.","threat":"Барьер","waveCount":10,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Передовой щит","weights":[[2,2.0],[5,2.0],[6,1.0]],"countMult":0.94,"hpMult":1.02,"spawnMult":0.86,"note":""},{"label":"Щитовая стена","weights":[[6,3.0],[2,2.0]],"countMult":0.8,"hpMult":1.22,"spawnMult":0.98,"note":""},{"label":"Ярость за щитом","weights":[[6,2.0],[5,4.0]],"countMult":1.1,"hpMult":1.08,"spawnMult":0.74,"note":""},{"label":"Пепельный строй","weights":[[2,2.0],[5,2.0],[6,3.0]],"countMult":1.02,"hpMult":1.16,"spawnMult":0.82,"note":""}],"plan":[0,3,1,2,2,1,2,3,1,2,3,1,2,3]},"13":{"scenarioName":"Проклятый марш","objective":"Остановите Чернокнижников, которые ускоряют всю колонну.","tip":"Снайпер должен приоритетно снимать поддержку до того, как она войдёт в плотную группу.","threat":"Ускоряющая аура","waveCount":11,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Проклятый дозор","weights":[[1,1.0],[5,2.0],[6,1.0],[7,1.0]],"countMult":0.92,"hpMult":1.04,"spawnMult":0.86,"note":""},{"label":"Аура марша","weights":[[7,2.0],[5,3.0],[6,1.0]],"countMult":1.06,"hpMult":1.06,"spawnMult":0.74,"note":""},{"label":"Тяжёлое прикрытие","weights":[[1,3.0],[6,2.0],[7,1.0]],"countMult":0.82,"hpMult":1.22,"spawnMult":0.98,"note":""},{"label":"Проклятая колонна","weights":[[1,2.0],[5,2.0],[6,2.0],[7,2.0]],"countMult":1.1,"hpMult":1.14,"spawnMult":0.8,"note":""}],"plan":[0,1,2,3,2,2,3,1,2,2,1,2,3,3]},"14":{"scenarioName":"Огненный клин","objective":"Выдержите комбинированный штурм всех сил Пепельного рубежа.","tip":"Используйте Крио для Хрупкости, а Пушку — для Термошока по плотным группам.","threat":"Синергии врагов","waveCount":11,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Пепельный микс","weights":[[1,1.0],[2,2.0],[5,2.0],[6,1.0],[7,1.0]],"countMult":1.0,"hpMult":1.06,"spawnMult":0.82,"note":""},{"label":"Щит и ярость","weights":[[6,3.0],[5,3.0],[7,1.0]],"countMult":0.98,"hpMult":1.14,"spawnMult":0.76,"note":""},{"label":"Тяжёлая аура","weights":[[1,3.0],[2,2.0],[7,2.0]],"countMult":0.82,"hpMult":1.24,"spawnMult":0.98,"note":""},{"label":"Клин легиона","weights":[[1,2.0],[2,2.0],[5,2.0],[6,2.0],[7,2.0]],"countMult":1.12,"hpMult":1.16,"spawnMult":0.78,"note":""}],"plan":[0,2,3,1,2,3,1,2,3,2,2,3,1,2,3]},"15":{"scenarioName":"Некрополь пепла","objective":"Пройдите элитную охрану и победите Пепельного Некроманта.","tip":"Сохраняйте AoE на призванных духов босса и не позволяйте поддержке накапливаться.","threat":"Босс + призыв","waveCount":12,"goldOffset":90,"firstPrepSeconds":12,"betweenWavePrepSeconds":6,"patterns":[{"label":"Мёртвая стража","weights":[[1,2.0],[2,2.0],[5,2.0],[6,1.0],[7,1.0]],"countMult":0.98,"hpMult":1.08,"spawnMult":0.84,"note":""},{"label":"Огненная фаланга","weights":[[6,3.0],[2,2.0],[7,2.0]],"countMult":0.86,"hpMult":1.22,"spawnMult":0.94,"note":""},{"label":"Берсерк-налёт","weights":[[5,5.0],[7,1.0],[1,1.0]],"countMult":1.18,"hpMult":1.06,"spawnMult":0.68,"note":""},{"label":"Стража некрополя","weights":[[1,2.0],[2,2.0],[5,2.0],[6,2.0],[7,2.0]],"countMult":1.08,"hpMult":1.18,"spawnMult":0.78,"note":""}],"plan":[0,3,1,2,2,1,2,3,1,2,3,1,2,3,3]},"16":{"scenarioName":"Целители тумана","objective":"Уничтожайте Шаманов до того, как они восстановят колонну.","tip":"Снайпер хорош для убийства поддержки, пока Пушка держит массу призраков.","threat":"Лечение","waveCount":10,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Болотный дозор","weights":[[3,1.0],[4,3.0]],"countMult":0.96,"hpMult":1.02,"spawnMult":0.84,"note":""},{"label":"Круг исцеления","weights":[[3,2.0],[4,3.0]],"countMult":1.02,"hpMult":1.08,"spawnMult":0.82,"note":""},{"label":"Призрачная стая","weights":[[4,5.0],[3,1.0]],"countMult":1.2,"hpMult":1.0,"spawnMult":0.68,"note":""},{"label":"Зелёная процессия","weights":[[3,3.0],[4,4.0]],"countMult":1.1,"hpMult":1.12,"spawnMult":0.76,"note":""}],"plan":[0,1,2,3,2,2,3,1,2,2,1,2,3,1,2,3]},"17":{"scenarioName":"Мёртвый прилив","objective":"Переживите волны Некромантов, которые оставляют после себя новых врагов.","tip":"Не оценивайте волну только по начальному числу: смерти Некромантов создают Призраков.","threat":"Размножение после смерти","waveCount":11,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Могильный дозор","weights":[[3,1.0],[4,2.0],[9,1.0]],"countMult":0.94,"hpMult":1.04,"spawnMult":0.84,"note":""},{"label":"Подъём мёртвых","weights":[[9,3.0],[4,2.0]],"countMult":0.86,"hpMult":1.16,"spawnMult":0.9,"note":""},{"label":"Живой щит","weights":[[4,4.0],[3,2.0],[9,1.0]],"countMult":1.14,"hpMult":1.04,"spawnMult":0.72,"note":""},{"label":"Мёртвый прилив","weights":[[9,3.0],[3,2.0],[4,3.0]],"countMult":1.08,"hpMult":1.14,"spawnMult":0.78,"note":""}],"plan":[0,2,3,1,2,3,1,2,3,2,2,3,1,2,2,1,3]},"18":{"scenarioName":"Костяная стена","objective":"Пробейте барьеры Щитоносцев, пока Некроманты насыщают поле призраками.","tip":"РЗСО и Лазерная перегрузка особенно полезны против скоплений после смерти.","threat":"Барьер + размножение","waveCount":12,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Костяной заслон","weights":[[6,2.0],[9,1.0],[4,2.0],[3,1.0]],"countMult":0.94,"hpMult":1.08,"spawnMult":0.84,"note":""},{"label":"Щит могилы","weights":[[6,3.0],[9,2.0]],"countMult":0.82,"hpMult":1.22,"spawnMult":0.94,"note":""},{"label":"Призрачный разрыв","weights":[[4,5.0],[9,2.0],[3,1.0]],"countMult":1.2,"hpMult":1.02,"spawnMult":0.68,"note":""},{"label":"Стена мертвецов","weights":[[6,3.0],[9,3.0],[3,2.0],[4,2.0]],"countMult":1.08,"hpMult":1.16,"spawnMult":0.76,"note":""}],"plan":[0,3,1,2,2,1,2,3,1,2,3,1,2,3,2,2,3,3]},"19":{"scenarioName":"Болотная процессия","objective":"Выдержите длинные поддерживаемые колонны без потери темпа.","tip":"Снимайте Шаманов и Некромантов раньше Щитоносцев, если они находятся в зоне Снайпера.","threat":"Затяжной бой","waveCount":13,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Туманная колонна","weights":[[3,2.0],[4,2.0],[6,1.0],[9,1.0]],"countMult":1.0,"hpMult":1.08,"spawnMult":0.84,"note":""},{"label":"Жреческий строй","weights":[[3,3.0],[6,2.0],[9,2.0]],"countMult":0.88,"hpMult":1.2,"spawnMult":0.94,"note":""},{"label":"Тени над тропой","weights":[[4,5.0],[9,2.0],[3,1.0]],"countMult":1.18,"hpMult":1.02,"spawnMult":0.7,"note":""},{"label":"Процессия топей","weights":[[3,2.0],[4,2.0],[6,2.0],[9,3.0]],"countMult":1.1,"hpMult":1.18,"spawnMult":0.78,"note":""}],"plan":[0,1,2,3,2,2,3,1,2,2,1,2,3,1,2,3,1,3]},"20":{"scenarioName":"Сердце топей","objective":"Удержите элитную болотную стражу и победите Каменного Колосса.","tip":"Оставьте несколько башен разнесёнными: землетрясение босса может временно выключить ключевую точку.","threat":"Босс + оглушение башен","waveCount":14,"goldOffset":100,"firstPrepSeconds":12,"betweenWavePrepSeconds":6,"patterns":[{"label":"Стражи сердца","weights":[[3,2.0],[4,2.0],[6,2.0],[9,1.0]],"countMult":0.98,"hpMult":1.1,"spawnMult":0.84,"note":""},{"label":"Могильная стена","weights":[[6,3.0],[9,3.0],[3,1.0]],"countMult":0.86,"hpMult":1.24,"spawnMult":0.94,"note":""},{"label":"Духи болота","weights":[[4,5.0],[9,2.0],[3,2.0]],"countMult":1.18,"hpMult":1.06,"spawnMult":0.68,"note":""},{"label":"Последняя процессия","weights":[[3,2.0],[4,2.0],[6,3.0],[9,3.0]],"countMult":1.08,"hpMult":1.2,"spawnMult":0.76,"note":""}],"plan":[0,2,3,1,2,3,1,2,3,2,2,3,1,2,2,1,2,3]},"21":{"scenarioName":"Кровавый разгон","objective":"Остановите ускоренных Берсерков до выхода в ярость.","tip":"Чернокнижник — приоритетная цель: его аура делает Берсерков намного опаснее.","threat":"Ярость + ускорение","waveCount":11,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Красный дозор","weights":[[5,3.0],[7,1.0]],"countMult":0.82,"hpMult":0.98,"spawnMult":0.84,"note":""},{"label":"Аура ярости","weights":[[5,4.0],[7,2.0]],"countMult":0.9,"hpMult":1.0,"spawnMult":0.74,"note":""},{"label":"Тяжёлый темп","weights":[[1,2.0],[5,3.0],[7,1.0]],"countMult":0.78,"hpMult":1.08,"spawnMult":0.9,"note":""},{"label":"Кровавый разгон","weights":[[5,5.0],[7,2.0],[1,1.0]],"countMult":0.96,"hpMult":1.02,"spawnMult":0.7,"note":""}],"plan":[0,3,1,2,2,1,2,3,1,2,3,1,2,3,2,2,3,1,3]},"22":{"scenarioName":"Охотники на башни","objective":"Защитите ключевые башни от Диверсантов.","tip":"Не складывайте всю силу в одну башню: отключение может открыть дорогу всей волне.","threat":"Отключение башен","waveCount":12,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Разведка диверсантов","weights":[[5,2.0],[7,1.0],[10,1.0]],"countMult":0.96,"hpMult":1.08,"spawnMult":0.82,"note":""},{"label":"Саботаж","weights":[[10,3.0],[5,3.0],[7,1.0]],"countMult":1.04,"hpMult":1.08,"spawnMult":0.72,"note":""},{"label":"Аура прикрытия","weights":[[7,2.0],[1,2.0],[10,2.0]],"countMult":0.92,"hpMult":1.18,"spawnMult":0.86,"note":""},{"label":"Охота на батареи","weights":[[10,3.0],[5,3.0],[7,2.0]],"countMult":1.14,"hpMult":1.12,"spawnMult":0.68,"note":""}],"plan":[0,1,2,3,2,2,3,1,2,2,1,2,3,1,2,3,1,2,3,3]},"23":{"scenarioName":"Железная охота","objective":"Сломайте щиты, выдержите саботаж и не дайте ауре ускорения собрать лавину.","tip":"Бронепробитие Стрелка и Снайпера должно работать до того, как Диверсанты отключат центр обороны.","threat":"Барьер + саботаж","waveCount":13,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Железный дозор","weights":[[1,2.0],[5,2.0],[6,1.0],[7,1.0],[10,1.0]],"countMult":0.98,"hpMult":1.1,"spawnMult":0.82,"note":""},{"label":"Щиты и бомбы","weights":[[6,3.0],[10,2.0],[5,2.0]],"countMult":0.92,"hpMult":1.2,"spawnMult":0.82,"note":""},{"label":"Ускоренный таран","weights":[[1,2.0],[5,3.0],[7,2.0],[10,1.0]],"countMult":1.06,"hpMult":1.14,"spawnMult":0.72,"note":""},{"label":"Охотничья колонна","weights":[[1,2.0],[5,2.0],[6,2.0],[7,2.0],[10,2.0]],"countMult":1.12,"hpMult":1.18,"spawnMult":0.74,"note":""}],"plan":[0,2,3,1,2,3,1,2,3,2,2,3,1,2,2,1,2,3,1,2,3]},"24":{"scenarioName":"Штурм высот","objective":"Переживите плотные элитные волны перед логовом Дракона.","tip":"Сохраняйте активные способности для волн, где Щитоносцы идут вместе с Диверсантами.","threat":"Элитные группы","waveCount":14,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Горный штурм","weights":[[1,2.0],[5,2.0],[6,2.0],[7,1.0],[10,1.0]],"countMult":1.0,"hpMult":1.12,"spawnMult":0.8,"note":""},{"label":"Крепостная группа","weights":[[1,3.0],[6,3.0],[10,1.0]],"countMult":0.82,"hpMult":1.28,"spawnMult":0.92,"note":""},{"label":"Огненный разгон","weights":[[5,4.0],[7,2.0],[10,2.0]],"countMult":1.12,"hpMult":1.12,"spawnMult":0.68,"note":""},{"label":"Элита высот","weights":[[1,2.0],[5,2.0],[6,3.0],[7,2.0],[10,2.0]],"countMult":1.1,"hpMult":1.22,"spawnMult":0.74,"note":""}],"plan":[0,3,1,2,2,1,2,3,1,2,3,1,2,3,2,2,3,1,2,2,3]},"25":{"scenarioName":"Гнездо дракона","objective":"Пройдите последнюю горную оборону и победите Багрового Дракона.","tip":"Распределяйте башни по карте: огненные способности босса наказывают единственную сверхсильную точку.","threat":"Босс + перегрев башен","waveCount":15,"goldOffset":120,"firstPrepSeconds":12,"betweenWavePrepSeconds":6,"patterns":[{"label":"Стража гнезда","weights":[[1,2.0],[5,2.0],[6,2.0],[7,1.0],[10,1.0]],"countMult":0.98,"hpMult":1.14,"spawnMult":0.8,"note":""},{"label":"Щит дракона","weights":[[6,3.0],[1,2.0],[10,2.0]],"countMult":0.84,"hpMult":1.28,"spawnMult":0.92,"note":""},{"label":"Кровавый налёт","weights":[[5,5.0],[7,2.0],[10,1.0]],"countMult":1.18,"hpMult":1.1,"spawnMult":0.64,"note":""},{"label":"Гвардия вершины","weights":[[1,2.0],[5,2.0],[6,3.0],[7,2.0],[10,2.0]],"countMult":1.1,"hpMult":1.24,"spawnMult":0.72,"note":""}],"plan":[0,1,2,3,2,2,3,1,2,2,1,2,3,1,2,3,1,2,3,2,3]},"26":{"scenarioName":"Чёрный заслон","objective":"Прорвитесь через защитников Цитадели, не теряя ключевые башни.","tip":"Держите вторую линию огня на случай отключения первой Диверсантами.","threat":"Барьер + некромантия","waveCount":12,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Чёрная стража","weights":[[6,2.0],[9,1.0],[10,1.0]],"countMult":0.98,"hpMult":1.14,"spawnMult":0.82,"note":""},{"label":"Мёртвый заслон","weights":[[6,3.0],[9,3.0],[10,1.0]],"countMult":0.92,"hpMult":1.22,"spawnMult":0.84,"note":""},{"label":"Саботаж ворот","weights":[[10,3.0],[6,2.0],[9,1.0]],"countMult":1.08,"hpMult":1.12,"spawnMult":0.7,"note":""},{"label":"Гвардия Цитадели","weights":[[6,3.0],[9,3.0],[10,2.0]],"countMult":1.12,"hpMult":1.2,"spawnMult":0.72,"note":""}],"plan":[0,2,3,1,2,3,1,2,3,2,2,3,1,2,2,1,2,3,1,2,3,1,3]},"27":{"scenarioName":"Разлом Бездны","objective":"Остановите Пустотников, которые перескакивают участки маршрута.","tip":"Не рассчитывайте только на дальние первые повороты — часть врагов перепрыгнет вперёд.","threat":"Телепорт","waveCount":13,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Трещины","weights":[[6,2.0],[9,1.0],[10,1.0],[11,1.0]],"countMult":0.98,"hpMult":1.14,"spawnMult":0.8,"note":""},{"label":"Скачок Бездны","weights":[[11,3.0],[10,2.0],[6,1.0]],"countMult":1.06,"hpMult":1.12,"spawnMult":0.68,"note":""},{"label":"Мёртвый разлом","weights":[[9,3.0],[11,2.0],[6,2.0]],"countMult":0.96,"hpMult":1.22,"spawnMult":0.82,"note":""},{"label":"Врата Бездны","weights":[[6,2.0],[9,2.0],[10,2.0],[11,3.0]],"countMult":1.14,"hpMult":1.2,"spawnMult":0.7,"note":""}],"plan":[0,3,1,2,2,1,2,3,1,2,3,1,2,3,2,2,3,1,2,2,1,2,3,3]},"28":{"scenarioName":"Тени бездны","objective":"Справьтесь с полным набором поздних механик одновременно.","tip":"Приоритет поддержки важнее чистого HP: Чернокнижники и Некроманты быстро умножают угрозу.","threat":"Полный набор механик","waveCount":14,"goldOffset":0,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Теневая смесь","weights":[[4,1.0],[6,2.0],[7,1.0],[9,1.0],[10,1.0],[11,1.0]],"countMult":1.0,"hpMult":1.16,"spawnMult":0.78,"note":""},{"label":"Аура Бездны","weights":[[7,2.0],[11,3.0],[10,1.0],[6,1.0]],"countMult":1.06,"hpMult":1.16,"spawnMult":0.68,"note":""},{"label":"Могильная крепость","weights":[[6,3.0],[9,3.0],[4,2.0]],"countMult":0.92,"hpMult":1.28,"spawnMult":0.86,"note":""},{"label":"Тени бездны","weights":[[4,2.0],[6,2.0],[7,2.0],[9,2.0],[10,2.0],[11,2.0]],"countMult":1.14,"hpMult":1.22,"spawnMult":0.68,"note":""}],"plan":[0,1,2,3,2,2,3,1,2,2,1,2,3,1,2,3,1,2,3,2,2,3,1,2,3]},"29":{"scenarioName":"Королевская гвардия","objective":"Переживите самую тяжёлую обычную осаду кампании.","tip":"Используйте весь набор синергий башен; одиночный тип защиты здесь не работает.","threat":"Элитная осада","waveCount":15,"goldOffset":40,"firstPrepSeconds":10,"betweenWavePrepSeconds":5,"patterns":[{"label":"Гвардейский дозор","weights":[[4,1.0],[6,2.0],[7,1.0],[9,1.0],[10,1.0],[11,1.0]],"countMult":0.98,"hpMult":1.18,"spawnMult":0.78,"note":""},{"label":"Чёрная фаланга","weights":[[6,3.0],[9,2.0],[7,2.0],[10,1.0]],"countMult":0.88,"hpMult":1.32,"spawnMult":0.88,"note":""},{"label":"Разрыв строя","weights":[[11,3.0],[10,3.0],[4,2.0],[7,1.0]],"countMult":1.1,"hpMult":1.16,"spawnMult":0.64,"note":""},{"label":"Королевская гвардия","weights":[[4,2.0],[6,3.0],[7,2.0],[9,3.0],[10,2.0],[11,3.0]],"countMult":1.12,"hpMult":1.28,"spawnMult":0.66,"note":""}],"plan":[0,2,3,1,2,3,1,2,3,2,2,3,1,2,2,1,2,3,1,2,3,1,2,3,2,3]},"30":{"scenarioName":"Последняя осада","objective":"Выдержите финальную армию и победите Тёмного Короля во всех трёх фазах.","tip":"Перед финалом оставьте резерв золота и активных способностей: HP-gates босса не дадут закончить бой одним burst.","threat":"Финальный экзамен","waveCount":16,"goldOffset":160,"firstPrepSeconds":14,"betweenWavePrepSeconds":7,"patterns":[{"label":"Последний марш","weights":[[4,1.0],[6,2.0],[7,1.0],[9,1.0],[10,1.0],[11,1.0]],"countMult":0.98,"hpMult":1.2,"spawnMult":0.76,"note":""},{"label":"Корона Бездны","weights":[[6,3.0],[7,2.0],[9,2.0],[11,2.0]],"countMult":0.94,"hpMult":1.3,"spawnMult":0.82,"note":""},{"label":"Теневой прорыв","weights":[[4,2.0],[10,3.0],[11,4.0],[7,1.0]],"countMult":1.12,"hpMult":1.18,"spawnMult":0.62,"note":""},{"label":"Армия Тёмного Короля","weights":[[4,2.0],[6,3.0],[7,2.0],[9,3.0],[10,3.0],[11,3.0]],"countMult":1.14,"hpMult":1.3,"spawnMult":0.64,"note":""}],"plan":[0,3,1,2,2,1,2,3,1,2,3,1,2,3,2,2,3,1,2,2,1,2,3,1,2,3,3]}});

    // R5 — one reviewed profile per campaign level. This controls pacing and economy without rewriting the handcrafted enemy compositions.
    const R5_LEVEL_BALANCE = Object.freeze([
        Object.freeze({ level:1, waveCount:5, startingGold:360, hpScale:0.9000, countScale:0.9200, rewardScale:0.8400, enemySpeedScale:0.52, spawnScale:1.1200 }),
        Object.freeze({ level:2, waveCount:6, startingGold:380, hpScale:0.9075, countScale:0.9240, rewardScale:0.8240, enemySpeedScale:0.56, spawnScale:1.1140 }),
        Object.freeze({ level:3, waveCount:7, startingGold:400, hpScale:0.9150, countScale:0.9280, rewardScale:0.8080, enemySpeedScale:0.60, spawnScale:1.1080 }),
        Object.freeze({ level:4, waveCount:8, startingGold:420, hpScale:0.9225, countScale:0.9320, rewardScale:0.7920, enemySpeedScale:0.64, spawnScale:1.1020 }),
        Object.freeze({ level:5, waveCount:9, startingGold:480, hpScale:0.9300, countScale:0.9360, rewardScale:0.7760, enemySpeedScale:0.68, spawnScale:1.0960 }),
        Object.freeze({ level:6, waveCount:8, startingGold:450, hpScale:0.9375, countScale:0.9400, rewardScale:0.7600, enemySpeedScale:0.76, spawnScale:1.0900 }),
        Object.freeze({ level:7, waveCount:9, startingGold:470, hpScale:0.9450, countScale:0.9440, rewardScale:0.7440, enemySpeedScale:0.80, spawnScale:1.0840 }),
        Object.freeze({ level:8, waveCount:10, startingGold:490, hpScale:0.9525, countScale:0.9480, rewardScale:0.7280, enemySpeedScale:0.84, spawnScale:1.0780 }),
        Object.freeze({ level:9, waveCount:10, startingGold:520, hpScale:0.9600, countScale:0.9520, rewardScale:0.7120, enemySpeedScale:0.88, spawnScale:1.0720 }),
        Object.freeze({ level:10, waveCount:11, startingGold:590, hpScale:0.9675, countScale:0.9560, rewardScale:0.6960, enemySpeedScale:0.92, spawnScale:1.0660 }),
        Object.freeze({ level:11, waveCount:9, startingGold:540, hpScale:0.9750, countScale:0.9600, rewardScale:0.6800, enemySpeedScale:1.00, spawnScale:1.0600 }),
        Object.freeze({ level:12, waveCount:10, startingGold:560, hpScale:0.9825, countScale:0.9640, rewardScale:0.6640, enemySpeedScale:1.05, spawnScale:1.0540 }),
        Object.freeze({ level:13, waveCount:11, startingGold:590, hpScale:0.9900, countScale:0.9680, rewardScale:0.6480, enemySpeedScale:1.10, spawnScale:1.0480 }),
        Object.freeze({ level:14, waveCount:11, startingGold:620, hpScale:0.9975, countScale:0.9720, rewardScale:0.6320, enemySpeedScale:1.15, spawnScale:1.0420 }),
        Object.freeze({ level:15, waveCount:12, startingGold:700, hpScale:1.0050, countScale:0.9760, rewardScale:0.6160, enemySpeedScale:1.20, spawnScale:1.0360 }),
        Object.freeze({ level:16, waveCount:10, startingGold:640, hpScale:1.0125, countScale:0.9800, rewardScale:0.6000, enemySpeedScale:0.70, spawnScale:1.0300 }),
        Object.freeze({ level:17, waveCount:11, startingGold:670, hpScale:1.0200, countScale:0.9840, rewardScale:0.5840, enemySpeedScale:0.74, spawnScale:1.0240 }),
        Object.freeze({ level:18, waveCount:12, startingGold:700, hpScale:1.0275, countScale:0.9880, rewardScale:0.5680, enemySpeedScale:0.78, spawnScale:1.0180 }),
        Object.freeze({ level:19, waveCount:13, startingGold:740, hpScale:1.1000, countScale:0.9920, rewardScale:0.5520, enemySpeedScale:0.82, spawnScale:1.0120 }),
        Object.freeze({ level:20, waveCount:14, startingGold:830, hpScale:1.0425, countScale:0.9960, rewardScale:0.5360, enemySpeedScale:0.86, spawnScale:1.0060 }),
        Object.freeze({ level:21, waveCount:11, startingGold:760, hpScale:1.0500, countScale:1.0000, rewardScale:0.5200, enemySpeedScale:0.90, spawnScale:1.0000 }),
        Object.freeze({ level:22, waveCount:12, startingGold:790, hpScale:1.0575, countScale:1.0040, rewardScale:0.5040, enemySpeedScale:0.94, spawnScale:0.9940 }),
        Object.freeze({ level:23, waveCount:13, startingGold:830, hpScale:1.0650, countScale:1.0080, rewardScale:0.4880, enemySpeedScale:0.98, spawnScale:0.9880 }),
        Object.freeze({ level:24, waveCount:14, startingGold:870, hpScale:1.0725, countScale:1.0120, rewardScale:0.4720, enemySpeedScale:1.02, spawnScale:0.9820 }),
        Object.freeze({ level:25, waveCount:15, startingGold:970, hpScale:1.0800, countScale:1.0160, rewardScale:0.4560, enemySpeedScale:1.06, spawnScale:0.9760 }),
        Object.freeze({ level:26, waveCount:12, startingGold:900, hpScale:1.0875, countScale:1.0200, rewardScale:0.4400, enemySpeedScale:0.96, spawnScale:0.9700 }),
        Object.freeze({ level:27, waveCount:13, startingGold:940, hpScale:1.0950, countScale:1.0240, rewardScale:0.4240, enemySpeedScale:1.00, spawnScale:0.9640 }),
        Object.freeze({ level:28, waveCount:14, startingGold:980, hpScale:1.1025, countScale:1.0280, rewardScale:0.4080, enemySpeedScale:1.04, spawnScale:0.9580 }),
        Object.freeze({ level:29, waveCount:15, startingGold:1030, hpScale:1.1100, countScale:1.0320, rewardScale:0.3920, enemySpeedScale:1.08, spawnScale:0.9520 }),
        Object.freeze({ level:30, waveCount:16, startingGold:1150, hpScale:1.1175, countScale:1.0360, rewardScale:0.3800, enemySpeedScale:1.12, spawnScale:0.9460 })
    ]);

    function getR5LevelBalance(level) {
        return R5_LEVEL_BALANCE[Math.max(0, Math.min(R5_LEVEL_BALANCE.length - 1, Number(level || 1) - 1))];
    }


    function distributeCount(weights, totalCount) {
        const clean = (weights || []).filter(function (pair) { return pair && pair.length >= 2 && Number(pair[1]) > 0; });
        if (!clean.length) return [{ type: 0, count: Math.max(1, totalCount) }];
        const totalWeight = clean.reduce(function (sum, pair) { return sum + Number(pair[1]); }, 0);
        const groups = clean.map(function (pair) { return { type: Number(pair[0]) || 0, count: Math.max(1, Math.floor(totalCount * Number(pair[1]) / totalWeight)) }; });
        let used = groups.reduce(function (sum, item) { return sum + item.count; }, 0);
        while (used > totalCount && groups.some(function (g) { return g.count > 1; })) {
            const target = groups.slice().sort(function (a,b) { return b.count - a.count; }).find(function (g) { return g.count > 1; });
            target.count--; used--;
        }
        let cursor = 0;
        while (used < totalCount) { groups[cursor % groups.length].count++; used++; cursor++; }
        return groups;
    }

    function weaveComposition(groups) {
        const left = groups.map(function (g) { return { type: g.type, count: g.count }; });
        const sequence = [];
        let remaining = left.reduce(function (sum, g) { return sum + g.count; }, 0);
        while (remaining > 0) {
            left.forEach(function (g) { if (g.count > 0) { sequence.push(g.type); g.count--; remaining--; } });
        }
        return sequence;
    }

    function buildHandcraftedWave(level, waveNumber, scenario, patternIndex) {
        const balance = getR5LevelBalance(level);
        const pattern = scenario.patterns[patternIndex] || scenario.patterns[0];
        const progress = waveNumber / Math.max(1, balance.waveCount);
        // R5: gentler HP/count growth, with difficulty coming increasingly from compositions and mechanics instead of raw inflation.
        const difficulty = 1 + ((level - 1) * 0.095) + ((waveNumber - 1) * 0.065);
        const rawCount = Math.max(pattern.weights.length, Math.round((4.6 + difficulty * 1.75) * (pattern.countMult || 1) * balance.countScale));
        const composition = distributeCount(pattern.weights, rawCount);
        const sequence = weaveComposition(composition);
        const baseSpawn = Math.max(22, 52 - (level * 0.45) - (waveNumber * 0.18));
        return Object.freeze({
            number: waveNumber, kind: 'normal', difficulty: difficulty, progress: progress,
            label: pattern.label || ('Волна ' + waveNumber), note: pattern.note || '',
            count: sequence.length, baseHp: 105 * difficulty * (pattern.hpMult || 1) * balance.hpScale,
            initialDelayFrames: 35,
            spawnIntervalFrames: Math.max(18, Math.round(baseSpawn * (pattern.spawnMult || 1) * balance.spawnScale)),
            composition: Object.freeze(composition.map(function (g) { return Object.freeze({ type:g.type, count:g.count }); })),
            enemySequence: Object.freeze(sequence.slice()),
            enemySelection: Object.freeze({ mode: 'scripted', sequence: Object.freeze(sequence.slice()), pool: Object.freeze(composition.map(function (g) { return g.type; })) })
        });
    }

    function buildLevel(level) {
        const scenario = LEVEL_SCENARIOS[level];
        if (!scenario) throw new Error('Missing handcrafted scenario for level ' + level);
        const balance = getR5LevelBalance(level);
        const isBossLevel = level % 5 === 0;
        const waves = [];
        const normalWaveCount = balance.waveCount - (isBossLevel ? 1 : 0);
        for (let i = 0; i < normalWaveCount; i++) {
            waves.push(buildHandcraftedWave(level, i + 1, scenario, scenario.plan[i % scenario.plan.length]));
        }
        if (isBossLevel) {
            waves.push(Object.freeze({
                number: balance.waveCount, kind: 'boss', bossId: level, count: 1,
                label: 'БОСС', note: scenario.threat, initialDelayFrames: 30, spawnIntervalFrames: 30
            }));
        }
        const worldId = Math.ceil(level / META.levelsPerWorld);
        const levelInWorld = ((level - 1) % META.levelsPerWorld) + 1;
        const world = WORLDS[worldId];
        const mapId = levelInWorld <= 2 ? world.arenaIds[0] : world.arenaIds[1];
        // Haunted Marsh is the campaign's only dual-entry arena. The second route is introduced gradually.
        let routeWeights = Object.freeze([1]);
        let bossRouteIndex = 0;
        if (worldId === 4) {
            const profiles = { 16:[1,0], 17:[0.90,0.10], 18:[0.82,0.18], 19:[0.75,0.25], 20:[0.70,0.30] };
            routeWeights = Object.freeze((profiles[level] || [1,0]).slice());
            bossRouteIndex = 0;
        }
        return Object.freeze({
            id: level, worldId: worldId, levelInWorld: levelInWorld,
            title: LEVEL_TITLES[level] || ('Уровень ' + level), mapId: mapId, routeWeights: routeWeights, bossRouteIndex: bossRouteIndex,
            scenarioName: scenario.scenarioName, objective: scenario.objective, tip: scenario.tip, threat: scenario.threat,
            startingGold: balance.startingGold,
            rewardScale: balance.rewardScale,
            enemySpeedScale: balance.enemySpeedScale,
            balanceHpScale: balance.hpScale,
            balanceCountScale: balance.countScale,
            balanceVersion: 'r5',
            baseLives: 20, waveCount: balance.waveCount, bossId: isBossLevel ? level : null,
            firstPrepSeconds: scenario.firstPrepSeconds || META.firstPrepSeconds,
            betweenWavePrepSeconds: scenario.betweenWavePrepSeconds || META.betweenWavePrepSeconds,
            waves: Object.freeze(waves)
        });
    }

    const LEVELS = {};
    for (let level = 1; level <= META.totalLevels; level++) LEVELS[level] = buildLevel(level);

    const ASSETS = Object.freeze({
        imageKeys: Object.freeze(["bullet_plasma", "bullet_rocket", "enemy_light", "enemy_runner_v17", "enemy_heavy_v17", "enemy_knight_v17", "enemy_shaman_v17", "enemy_ghost_v17", "enemy_berserker_v17", "enemy_shieldguard_v18", "enemy_warlock_v18", "enemy_frostborn_v18", "enemy_necromancer_v18", "enemy_saboteur_v18", "enemy_voidwalker_v18", "enemy_runner_anim_v19", "enemy_heavy_anim_v19", "enemy_knight_anim_v19", "enemy_shaman_anim_v19", "enemy_ghost_anim_v19", "enemy_berserker_anim_v19", "enemy_shieldguard_anim_v19", "enemy_warlock_anim_v19", "enemy_frostborn_anim_v19", "enemy_necromancer_anim_v19", "enemy_saboteur_anim_v19", "enemy_voidwalker_anim_v19", "boss_5_v20", "boss_10_v20", "boss_15_v20", "boss_20_v21", "boss_25_v21", "boss_30_v21", "gun_basic", "gun_cannon", "gun_frost", "gun_laser", "gun_sniper", "tower_base", "map_green_marches_a", "map_frost_pass_a", "map_ashen_frontier_a", "map_haunted_marsh_a", "map_dragon_highlands_a", "map_shadow_citadel_a"]),
        mapKeys: Object.freeze(Array.from(new Set(Object.keys(MAPS).map(function (id) { return MAPS[id].assetKey; }))))
    });

    function getLevel(level) {
        const id = Number(level);
        return LEVELS[id] || LEVELS[1];
    }

    function getMap(mapId) { return MAPS[mapId] || MAPS[META.defaultMapId]; }
    function getWorld(worldId) { return WORLDS[Number(worldId)] || WORLDS[1]; }
    function getWorldByLevel(level) { return getWorld(Math.ceil(Number(level || 1) / META.levelsPerWorld)); }
    function getEnemyByType(type) { return ENEMY_BY_TYPE[Number(type)] || ENEMY_BY_TYPE[0]; }
    function getBoss(bossId) { return BOSSES[Number(bossId)] || null; }

    function resolveEnemyType(waveConfig, randomFn, spawnIndex) {
        const selection = waveConfig && waveConfig.enemySelection;
        if (!selection) return 0;
        if (selection.mode === 'fixed') return Number(selection.type) || 0;
        if (selection.mode === 'scripted') {
            const sequence = selection.sequence || [0];
            const index = Math.max(0, Number(spawnIndex) || 0);
            return Number(sequence[index % sequence.length]) || 0;
        }
        if (selection.mode === 'cycle-pool') {
            const pool = selection.pool || [0];
            const index = Math.max(0, Number(spawnIndex) || 0);
            const rotation = Math.max(0, Number(selection.rotation) || 0);
            return Number(pool[(rotation + index) % pool.length]) || 0;
        }
        if (selection.mode === 'wave-random-offset') {
            const pool = selection.pool || [0, 1, 2, 3, 4];
            const rnd = typeof randomFn === 'function' ? randomFn() : Math.random();
            const offset = Math.floor(Math.max(0, Math.min(0.999999999, Number(rnd) || 0)) * pool.length);
            return pool[(Number(waveConfig.number) + offset) % pool.length];
        }
        return 0;
    }

    function getWaveEnemyTypes(waveConfig) {
        const selection = waveConfig && waveConfig.enemySelection;
        if (!selection) return Object.freeze([]);
        const pool = selection.pool && selection.pool.length ? selection.pool : [selection.type];
        return Object.freeze(Array.from(new Set(pool.map(function (type) { return Number(type) || 0; }))));
    }

    function getWavePreview(waveConfig) {
        if (!waveConfig) return Object.freeze({ label:'', note:'', total:0, enemies:Object.freeze([]) });
        if (waveConfig.kind === 'boss') {
            const boss = getBoss(waveConfig.bossId);
            return Object.freeze({ label: waveConfig.label || 'БОСС', note: waveConfig.note || '', total:1, enemies:Object.freeze([]), boss: boss });
        }
        const composition = waveConfig.composition || [];
        const enemies = composition.map(function (item) {
            const enemy = getEnemyByType(item.type);
            return Object.freeze({ type:item.type, count:item.count, name:enemy.name, badge:enemy.badge, role:enemy.role });
        });
        return Object.freeze({ label:waveConfig.label || ('Волна ' + waveConfig.number), note:waveConfig.note || '', total:waveConfig.count || 0, enemies:Object.freeze(enemies) });
    }

    function createSkillState() {
        const state = {};
        Object.keys(SKILL_DEFINITIONS).forEach(function (id) {
            const def = SKILL_DEFINITIONS[id];
            state[id] = { name: def.name, cooldown: def.cooldownFrames, timer: 0 };
        });
        return state;
    }

    function validate() {
        const errors = [];
        if (META.balanceVersion !== 'r5' || R5_LEVEL_BALANCE.length !== META.totalLevels) errors.push('r5-balance-profile');
        if (Object.keys(LEVELS).length !== META.totalLevels) errors.push('levels-count');
        if (Object.keys(WORLDS).length !== META.worldCount) errors.push('world-count');
        if (Object.keys(MAPS).length !== META.worldCount * META.arenasPerWorld) errors.push('arena-count');
        if (Object.keys(ENEMY_ARCHETYPES).length !== 12) errors.push('enemy-count');
        if (Object.keys(V19_ENEMY_ANIMATIONS).length !== 12) errors.push('enemy-animation-count');
        Object.keys(ENEMY_ARCHETYPES).forEach(function (id) { if (!ENEMY_ARCHETYPES[id].animation || !ENEMY_ARCHETYPES[id].animation.assetKey) errors.push('enemy-animation:' + id); });
        if (Object.keys(BOSSES).length !== 6) errors.push('boss-count');
        Object.keys(BOSSES).forEach(function (id) {
            const boss = BOSSES[id];
            if (boss.aiVersion !== 'v22') errors.push('boss-ai-version:' + id);
            if (!boss.abilityDeckByPhase || boss.abilityDeckByPhase.length !== 3 || boss.abilityDeckByPhase.some(function (deck) { return !deck || !deck.length; })) errors.push('boss-ai-deck:' + id);
            if (!boss.phaseCooldownMult || boss.phaseCooldownMult.length !== 3) errors.push('boss-ai-cooldown:' + id);
            if (!(boss.telegraphFrames > 0) || !(boss.phaseGuardFrames > 0)) errors.push('boss-ai-timing:' + id);
            if (boss.presentationVersion !== 'r4') errors.push('boss-presentation-version:' + id);
            if (boss.balanceVersion !== 'r5' || !(boss.hp > 0) || !(boss.speed > 0)) errors.push('boss-balance-version:' + id);
            if (!(boss.spawnFrames >= 45) || !(boss.deathFrames >= 75)) errors.push('boss-presentation-timing:' + id);
            if (!boss.phaseScaleByPhase || boss.phaseScaleByPhase.length !== 3) errors.push('boss-phase-scale:' + id);
            if (!(boss.drawSize >= 160) || !(boss.radius >= 48)) errors.push('boss-presentation-size:' + id);
        });
        if (Object.keys(TOWERS).length !== 5) errors.push('tower-count');
        Object.keys(TOWERS).forEach(function (id) {
            const tower = TOWERS[id], upgrades = TOWER_UPGRADES[id];
            if (!tower.role || !tower.roleHint || !tower.targetMode) errors.push('tower-role:' + id);
            if (!upgrades || !upgrades.path1Name || !upgrades.path2Name) errors.push('tower-branches:' + id);
            if (!upgrades || !Array.isArray(upgrades.path1) || upgrades.path1.length !== 3 || !Array.isArray(upgrades.path2) || upgrades.path2.length !== 3) errors.push('tower-upgrades:' + id);
        });
        Object.keys(LEVELS).forEach(function (id) {
            const level = LEVELS[id];
            if (!MAPS[level.mapId]) errors.push('missing-map:' + id);
            if (!Array.isArray(level.routeWeights) || level.routeWeights.length < 1 || level.routeWeights.some(function (w) { return !(Number(w) >= 0); })) errors.push('route-weights:' + id);
            if (level.waves.length !== level.waveCount) errors.push('wave-count:' + id);
            if (!level.scenarioName || !level.objective || !level.tip || !level.threat) errors.push('scenario:' + id);
            if (level.balanceVersion !== 'r5' || !(level.rewardScale > 0) || !(level.enemySpeedScale > 0) || level.waveCount > 16) errors.push('level-balance:' + id);
            level.waves.forEach(function (wave) {
                if (wave.kind === 'boss' && !BOSSES[wave.bossId]) errors.push('missing-boss:' + id);
                if (wave.kind === 'normal') {
                    if (!wave.label || !wave.composition || !wave.composition.length) errors.push('wave-script:' + id + ':' + wave.number);
                    const sum = (wave.composition || []).reduce(function (s,g) { return s + g.count; }, 0);
                    if (sum !== wave.count || !wave.enemySequence || wave.enemySequence.length !== wave.count) errors.push('wave-composition:' + id + ':' + wave.number);
                    if (!(wave.baseHp > 0) || wave.spawnIntervalFrames < 18) errors.push('wave-balance:' + id + ':' + wave.number);
                }
            });
        });
        Object.keys(MAPS).forEach(function (id) {
            const map = MAPS[id];
            if (!map.path || map.path.length < 2) errors.push('map-path:' + id);
            if (!Array.isArray(map.paths) || map.paths.length < 1 || map.paths.some(function (p) { return !p || p.length < 2; })) errors.push('map-paths:' + id);
            if (map.geometryVersion !== 'r9.4-final-slots') errors.push('map-geometry-version:' + id);
            if (!Array.isArray(map.buildZones)) errors.push('map-build-zones:' + id);
            if (!Array.isArray(map.buildSlots) || map.buildSlots.length < 16) errors.push('map-build-slots:' + id);
            if (!map.buildTerrain || !Array.isArray(map.buildTerrain.allowPolygons) || map.buildTerrain.allowPolygons.length < 1) errors.push('map-build-terrain:' + id);
            if (!map.buildTerrain || !(map.buildTerrain.roadHalfWidth > 0)) errors.push('map-build-road-width:' + id);
            if (!map.buildTerrain || map.buildTerrain.surfaceVersion !== 'r9.3') errors.push('map-build-surface-version:' + id);
            if (!map.spawn || !map.exit) errors.push('map-endpoints:' + id);
        });
        Object.keys(WORLDS).forEach(function (worldId) {
            const world = WORLDS[worldId], a = MAPS[world.arenaIds[0]], b = MAPS[world.arenaIds[1]];
            if (!a || !b) return;
            if (a.routeVariant !== 'A' || b.routeVariant !== 'B') errors.push('map-route-variant:' + worldId);
            if (a.path[0].x !== b.path[0].x || a.path[0].y !== b.path[0].y || a.path[a.path.length-1].x !== b.path[b.path.length-1].x || a.path[a.path.length-1].y !== b.path[b.path.length-1].y) errors.push('map-route-canonical:' + worldId);
            const expectedSlots = R94_BUILD_SLOTS[world.slug] ? R94_BUILD_SLOTS[world.slug].length : 0;
            if (a.buildSlots.length !== expectedSlots || b.buildSlots.length !== expectedSlots) errors.push('map-build-slot-count:' + worldId);
        });
        if (!META_PROGRESSION || META_PROGRESSION.achievements.length !== 12) errors.push('meta-achievements');
        const achievementIds = new Set(META_PROGRESSION.achievements.map(function (a) { return a.id; }));
        if (achievementIds.size !== META_PROGRESSION.achievements.length) errors.push('meta-achievement-ids');
        if (META_PROGRESSION.castleMaxPoints !== Object.keys(CASTLE_UPGRADES).reduce(function (sum, key) { return sum + CASTLE_UPGRADES[key].max; }, 0)) errors.push('meta-castle-max');
        Object.keys(WORLDS).forEach(function (id) {
            const world = WORLDS[id];
            if (world.levels.length !== META.levelsPerWorld) errors.push('world-level-count:' + id);
            if (world.arenaIds.some(function (arenaId) { return !MAPS[arenaId]; })) errors.push('world-arena:' + id);
            if (world.levels[world.levels.length - 1] !== world.bossLevel) errors.push('world-boss:' + id);
        });
        return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors), worlds: Object.keys(WORLDS).length, levels: Object.keys(LEVELS).length, enemies: Object.keys(ENEMY_ARCHETYPES).length, bosses: Object.keys(BOSSES).length, towers: Object.keys(TOWERS).length, maps: Object.keys(MAPS).length, activeArenas: Object.keys(MAPS).filter(function (id) { return !MAPS[id].placeholder; }).length });
    }

    global.TD_DATA = Object.freeze({
        meta: META, assets: ASSETS, worlds: WORLDS, maps: MAPS, levels: LEVELS, levelScenarios: LEVEL_SCENARIOS,
        enemies: ENEMY_ARCHETYPES, enemiesByType: ENEMY_BY_TYPE, enemyAnimations: V19_ENEMY_ANIMATIONS, bosses: BOSSES,
        balance: Object.freeze({ version:'r5', levelProfiles:R5_LEVEL_BALANCE, bossProfiles:R5_BOSS_BALANCE }),
        towers: TOWERS, towerUpgrades: TOWER_UPGRADES, castleUpgrades: CASTLE_UPGRADES, metaProgression: META_PROGRESSION,
        skills: SKILL_DEFINITIONS, getLevel: getLevel, getMap: getMap, getWorld: getWorld, getWorldByLevel: getWorldByLevel,
        getEnemyByType: getEnemyByType, getBoss: getBoss, resolveEnemyType: resolveEnemyType, getWaveEnemyTypes: getWaveEnemyTypes, getWavePreview: getWavePreview,
        createSkillState: createSkillState, validate: validate
    });
})(window);
