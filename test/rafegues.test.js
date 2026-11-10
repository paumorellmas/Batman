// Executa el panell de ràfegues contra un Premiere simulat (seqüència, pistes, clips i accions).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TPS = 254016000000, F = TPS / 25;
const SRC = fs.readFileSync(path.join(__dirname, '../rafegues-panel/index.js'), 'utf8');

function makeWorld(opts = {}) {
    const tk = (n) => ({ ticksNumber: n });
    const media = {}; // path -> { path, hasVideo, hasAudio, in, out }
    const addMedia = (p, hasVideo, hasAudio) => (media[p] = { path: p, hasVideo, hasAudio, in: null, out: null, isClip: true });
    const mkTrack = () => ({ items: [], getTrackItems: async function () { return this.items.map((i) => i.api); } });
    const seq = { video: [mkTrack(), mkTrack(), mkTrack()], audio: [mkTrack(), mkTrack(), mkTrack()], pos: 0 };

    function addItem(kind, idx, m, start, inP, outP, selected) {
        const it = { kind, idx, m, start, end: start + (outP - inP), inP, outP, selected: !!selected };
        it.api = {
            _it: it,
            getStartTime: async () => tk(it.start), getEndTime: async () => tk(it.end),
            getInPoint: async () => tk(it.inP), getOutPoint: async () => tk(it.outP),
            getName: async () => path.basename(m.path), getProjectItem: async () => m,
            getSpeed: async () => 1, getIsSelected: async () => it.selected
        };
        seq[kind][idx].items.push(it);
        return it;
    }
    function overwrite(kind, idx, m, at) {
        const outP = m.out + (opts.inclusiveOut ? F : 0); // Premiere pot tractar l'out com a inclusiu
        const end = at + (outP - m.in);
        const tr = seq[kind][idx];
        tr.items = tr.items.filter((i) => i.end <= at || i.start >= end); // simplificat: lleva el que xafa
        addItem(kind, idx, m, at, m.in, outP);
    }

    const log = [];
    const project = {
        guid: { toString: () => 'proj-1' }, path: opts.projectPath || 'D:/proj/setmana46.prproj', name: 'setmana46.prproj',
        getActiveSequence: async () => seqApi,
        getRootItem: async () => ({ isFolder: true, getItems: async () => Object.values(media).filter((m) => m.imported) }),
        importFiles: async (paths) => { paths.forEach((p) => { if (media[p]) media[p].imported = true; }); return true; },
        lockedAccess: (cb) => cb(),
        executeTransaction: (cb, label) => {
            const actions = [];
            cb({ addAction: (a) => actions.push(a) });
            log.push(label);
            if (opts.failOverwrite && /sobreescriu/.test(label)) return false;
            actions.forEach((a) => a());
            return true;
        }
    };
    const seqApi = {
        getTimebase: async () => String(F),
        getVideoTrackCount: async () => seq.video.length, getAudioTrackCount: async () => seq.audio.length,
        getVideoTrack: async (i) => seq.video[i], getAudioTrack: async (i) => seq.audio[i],
        getPlayerPosition: async () => tk(seq.pos), setPlayerPosition: async (t) => { seq.pos = t.n; return true; }
    };
    const editor = {
        createOverwriteItemAction: (m, time, v, a) => () => {
            if (m.hasVideo) overwrite('video', v, m, time.n);
            if (m.hasAudio) overwrite('audio', a, m, time.n);
        },
        createRemoveItemsAction: (sel) => () => sel.items.forEach((api) => {
            const tr = seq[api._it.kind][api._it.idx];
            tr.items = tr.items.filter((i) => i.api !== api);
        })
    };
    const ppro = {
        TickTime: { createWithTicks: (s) => ({ n: Number(s) }) },
        Project: { getActiveProject: async () => project },
        SequenceEditor: { getEditor: () => editor },
        Constants: { TrackItemType: { CLIP: 1 }, MediaType: { AUDIO: 'a', VIDEO: 'v' } },
        ClipProjectItem: {
            cast: (m) => (m && m.isClip ? Object.assign(m, {
                getMediaFilePath: async () => m.path,
                createSetInOutPointsAction: (i, o) => () => { m.in = i.n; m.out = o.n; },
                createClearInOutPointsAction: () => () => { m.in = null; m.out = null; }
            }) : null)
        },
        FolderItem: { cast: (x) => (x && x.isFolder ? x : null) },
        TrackItemSelection: { createEmptySelection: (cb) => { const sel = { items: [], addItem(i) { this.items.push(i); } }; cb(sel); return true; } }
    };

    // DOM mínim
    const els = {};
    const el = (id) => (els[id] = els[id] || {
        id, style: {}, dataset: {}, value: 'preset', textContent: '', className: '', innerHTML: '', children: [],
        addEventListener() {}, appendChild(c) { this.children.push(c); },
        querySelector: () => el('x' + Math.random())
    });
    const store = Object.assign({}, opts.storage);
    const ctx = {
        require: (n) => (n === 'premierepro' ? ppro : { entrypoints: { setup() {} }, storage: {} }),
        document: { getElementById: el, createElement: () => el('n' + Math.random()), addEventListener() {} },
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
        setTimeout, console
    };
    vm.createContext(ctx);
    vm.runInContext(SRC + '\nthis.api = { applyPreset, captureFromSelection, detectProject, isActive, setScope, get presets() { return presets; }, get settings() { return settings; } };', ctx);
    const clips = (kind) => seq[kind].map((t) => t.items.map((i) => [path.basename(i.m.path), i.start / F, i.end / F]));
    return { api: ctx.api, seq, media, addMedia, addItem, clips, log, status: () => els.status.textContent, els, store };
}

test('desar la selecció i aplicar-la: vídeo amb àudio de càmera + so amb desfasament', async () => {
    const w = makeWorld();
    const cam = w.addMedia('D:/r/rafega.mxf', true, true);
    const so = w.addMedia('D:/r/so.wav', false, true);
    cam.imported = so.imported = true;
    // Muntatge original: vídeo a V2 (fotogrames 100-150), el seu àudio a A1, el so a A2 començant 5 fotogrames abans
    w.addItem('video', 1, cam, 100 * F, 10 * F, 60 * F, true);
    w.addItem('audio', 0, cam, 100 * F, 10 * F, 60 * F, true);
    w.addItem('audio', 1, so, 95 * F, 0, 70 * F, true);

    await w.api.captureFromSelection();
    assert.strictEqual(w.api.presets.length, 1, w.status());
    const p = w.api.presets[0];
    assert.strictEqual(p.videoHasAudio, true);
    assert.strictEqual(p.soundHasVideo, false);
    assert.strictEqual(p.offset, -5 * F);

    w.seq.pos = 500 * F;
    await w.api.applyPreset(p);
    assert.match(w.status(), /^✓/);
    assert.deepStrictEqual(w.clips('video')[1].pop(), ['rafega.mxf', 500, 550]);
    assert.deepStrictEqual(w.clips('audio')[1].pop(), ['so.wav', 495, 565]);
    // L'àudio de càmera no queda enlloc al punt nou, i el clip original no es queda amb in/out
    assert.ok(w.clips('audio').flat().every((c) => !(c[0] === 'rafega.mxf' && c[1] === 500)));
    assert.strictEqual(cam.in, null);
    assert.strictEqual(so.in, null);
});

test('si Premiere rebutja l\'overwrite, el clip original no es queda amb l\'in/out posat', async () => {
    const w = makeWorld({ failOverwrite: true });
    const cam = w.addMedia('D:/r/rafega.mxf', true, false);
    cam.imported = true;
    await w.api.applyPreset({ name: 'x', video: { path: cam.path, name: 'r', inP: 10 * F, outP: 60 * F, track: 0 }, audio: null, offset: 0 });
    assert.match(w.status(), /rebutjat/);
    assert.strictEqual(cam.in, null);
    assert.deepStrictEqual(w.log.slice(-1), ['Ràfega: neteja in/out']);
});

test('la correcció d\'un fotograma és per tipus i no creix més d\'un fotograma i mig', async () => {
    const w = makeWorld({ inclusiveOut: true });
    const cam = w.addMedia('D:/r/rafega.mxf', true, false);
    cam.imported = true;
    const p = { name: 'x', video: { path: cam.path, name: 'r', inP: 10 * F, outP: 60 * F, track: 0 }, audio: null, offset: 0 };
    await w.api.applyPreset(p); // la primera queda un fotograma llarga i es calibra
    assert.strictEqual(w.api.settings.outCorr.video, F);
    assert.strictEqual(w.api.settings.outCorr.audio, 0);
    w.seq.pos = 1000 * F;
    await w.api.applyPreset(p); // la segona ja surt exacta
    assert.deepStrictEqual(w.clips('video')[0].pop(), ['rafega.mxf', 1000, 1050]);
    assert.strictEqual(w.api.settings.outCorr.video, F);
});

test('una correcció desada per la versió anterior es conserva', () => {
    const w = makeWorld({ storage: { 'rafegues.settings.v1': JSON.stringify({ outCorrection: F, vDest: '1' }) } });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(w.api.settings.outCorr)), { video: F, audio: F });
    assert.strictEqual(w.api.settings.vDest, '1');
});

test('so amb imatge i cap pista de vídeo lliure: avisa i no col·loca res', async () => {
    const w = makeWorld();
    const cam = w.addMedia('D:/r/rafega.mxf', true, false);
    const so = w.addMedia('D:/r/so.mov', true, true);
    const altre = w.addMedia('D:/r/altre.mxf', true, false);
    cam.imported = so.imported = true;
    [1, 2].forEach((i) => w.addItem('video', i, altre, 0, 0, 1000 * F)); // V2 i V3 plenes; V1 és la destinació
    const before = JSON.stringify([w.clips('video'), w.clips('audio')]);
    await w.api.applyPreset({
        name: 'x', offset: 0, soundHasVideo: true,
        video: { path: cam.path, name: 'r', inP: 0, outP: 50 * F, track: 0 },
        audio: { path: so.path, name: 's', inP: 0, outP: 50 * F, track: 0 }
    });
    assert.match(w.status(), /pista de vídeo lliure/);
    assert.strictEqual(JSON.stringify([w.clips('video'), w.clips('audio')]), before);
});

test('pista triada que no existeix a la seqüència: es fa com al preset', async () => {
    const w = makeWorld({ storage: { 'rafegues.settings.v1': JSON.stringify({ vDest: '7' }) } });
    const cam = w.addMedia('D:/r/rafega.mxf', true, false);
    cam.imported = true;
    await w.api.applyPreset({ name: 'x', video: { path: cam.path, name: 'r', inP: 0, outP: 50 * F, track: 1 }, audio: null, offset: 0 });
    assert.match(w.status(), /^✓.*V2/);
    assert.strictEqual(w.clips('video')[1].length, 1);
});

test('ràfegues de tots els projectes i ràfegues només d\'un projecte', async () => {
    const mk = (name, extra) => Object.assign({ id: name, name, key: null, video: { path: 'D:/r/a.mxf', name: 'a', inP: 0, outP: F, track: 0 }, audio: null, offset: 0 }, extra);
    const stored = [
        mk('antiga'), // desada amb la versió anterior: sense àmbit, val per a tots els projectes
        mk('global', { scope: 'global' }),
        mk('meua', { scope: 'project', project: { id: 'x', path: 'd:\\PROJ\\Setmana46.prproj', name: 's46' } }),
        mk('altra', { scope: 'project', project: { id: 'proj-1', path: 'D:/proj/setmana45.prproj', name: 's45' } })
    ];
    const w = makeWorld({ storage: { 'rafegues.presets.v1': JSON.stringify(stored) } });
    await w.api.detectProject();
    // el projecte es reconeix pel camí del fitxer, no pel guid (les còpies d'una plantilla el comparteixen)
    assert.strictEqual(w.api.presets.map((p) => w.api.isActive(p)).join(), "true,true,true,false");

    // desar la selecció en aquest projecte
    const cam = w.addMedia('D:/r/rafega.mxf', true, false);
    cam.imported = true;
    w.addItem('video', 0, cam, 0, 0, 50 * F, true);
    await w.api.captureFromSelection('project');
    const nova = w.api.presets[4];
    assert.strictEqual(nova.scope, 'project');
    assert.strictEqual(nova.project.path, 'D:/proj/setmana46.prproj');
    assert.strictEqual(w.api.isActive(nova), true);

    // passar-la a tots els projectes i tornar-la a aquest
    w.api.setScope(nova, 'global');
    assert.deepStrictEqual([nova.scope, nova.project], ['global', null]);
    w.api.setScope(w.api.presets[3], 'project');
    assert.strictEqual(w.api.isActive(w.api.presets[3]), true);
});
