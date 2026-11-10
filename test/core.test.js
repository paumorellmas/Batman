const test = require('node:test');
const assert = require('node:assert');
const Core = require('../panel/js/core.js');

const clip = (path, start, end, disabled) => ({ name: Core.baseName(path), path, start, end, disabled: !!disabled });
const seq = (tracks) => ({
    name: 's', fps: 25, zero: 0,
    tracks: tracks.map((clips, i) => ({ index: i, name: 'A' + (i + 1), muted: false, clips }))
});
const all = { 0: true, 1: true, 2: true };

test('trossos enganxats del mateix arxiu són un sol ús', () => {
    const cues = Core.buildCues(seq([[clip('C:\\m\\a.mp3', 10, 20), clip('C:\\m\\a.mp3', 20, 35)]]), all, 0);
    assert.strictEqual(cues.length, 1);
    assert.deepStrictEqual([cues[0].start, cues[0].end], [250, 875]);
});

test('el mateix arxiu amb un forat són dos usos', () => {
    const cues = Core.buildCues(seq([[clip('C:\\m\\a.mp3', 10, 20), clip('C:\\m\\a.mp3', 40, 50)]]), all, 1);
    assert.strictEqual(cues.length, 2);
});

test('arxius diferents enganxats no es fusionen', () => {
    const cues = Core.buildCues(seq([[clip('C:\\m\\a.mp3', 10, 20), clip('C:\\m\\b.mp3', 20, 30)]]), all, 1);
    assert.strictEqual(cues.length, 2);
});

test('el mateix arxiu duplicat en dues pistes no compta doble', () => {
    const cues = Core.buildCues(seq([[clip('C:\\m\\a.mp3', 10, 20)], [clip('c:/M/A.MP3', 10, 20)]]), all, 0);
    assert.strictEqual(cues.length, 1);
    assert.strictEqual(cues[0].end - cues[0].start, 250);
    assert.deepStrictEqual(cues[0].tracks, ['A1', 'A2']);
});

test('clips desactivats i pistes no marcades no compten', () => {
    const s = seq([[clip('a.mp3', 0, 10, true), clip('b.mp3', 10, 20)], [clip('c.mp3', 0, 5)]]);
    const cues = Core.buildCues(s, { 0: true }, 0);
    assert.deepStrictEqual(cues.map((c) => c.name), ['b.mp3']);
});

test('la separació màxima uneix forats petits', () => {
    const s = seq([[clip('a.mp3', 0, 10), clip('a.mp3', 10.08, 20)]]);
    assert.strictEqual(Core.buildCues(s, all, 0).length, 2);
    assert.strictEqual(Core.buildCues(s, all, 2).length, 1);
});

test('formats de temps', () => {
    assert.strictEqual(Core.formatTC(250, 25, 0), '00:00:10');
    assert.strictEqual(Core.formatTC(250, 25, 36000), '10:00:10');
    assert.strictEqual(Core.formatDuration(1560, 25), '01:02');
    assert.strictEqual(Core.formatDuration(25 * 3700, 25), '61:40');
});

test('nom d\'arxiu de llibreria', () => {
    assert.deepStrictEqual(Core.parseFileName('D:\\x\\HPE458_01_1_MY_BABY_GIRL_INSTRUMENTAL.MP3'),
        { discCode: 'HPE458', track: '01', title: 'MY BABY GIRL INSTRUMENTAL' });
    assert.deepStrictEqual(Core.parseFileName('una_musica.wav'), { discCode: '', track: '', title: 'una musica' });
});

test('files i CSV', () => {
    const s = seq([[clip('C:\\m\\HPE458_01_1_MY_BABY_GIRL.mp3', 10, 72)]]);
    const rows = Core.buildRows(s, Core.buildCues(s, all, 0), () => ({ composer: 'A; B', title: 'MY "BABY" GIRL' }));
    assert.strictEqual(rows[0].duration, '01:02');
    assert.strictEqual(rows[0].discCode, 'HPE458');
    const csv = Core.toCSV(rows);
    assert.ok(csv.includes('"A; B"'));
    assert.ok(csv.includes('"MY ""BABY"" GIRL"'));
});
