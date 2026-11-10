const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Tags = require('../panel/js/tags.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mstags-'));
const write = (name, buf) => { const p = path.join(dir, name); fs.writeFileSync(p, buf); return p; };

function synch(n) { return Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]); }
function u32be(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; }
function u32le(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }

// Marc ID3v2.3 (mida normal) o v2.4 (mida synchsafe)
function frame(ver, id, data) {
    return Buffer.concat([Buffer.from(id), ver === 4 ? synch(data.length) : u32be(data.length), Buffer.alloc(2), data]);
}
function id3(ver, frames) {
    const body = Buffer.concat(frames);
    return Buffer.concat([Buffer.from('ID3'), Buffer.from([ver, 0, 0]), synch(body.length), body]);
}
const latin = (s) => Buffer.concat([Buffer.from([0]), Buffer.from(s, 'latin1')]);
const utf16 = (s) => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
const utf8 = (s) => Buffer.concat([Buffer.from([3]), Buffer.from(s, 'utf8')]);
function chunk(id, data, le) {
    const pad = data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0);
    return Buffer.concat([Buffer.from(id), le ? u32le(data.length) : u32be(data.length), data, pad]);
}

test('MP3 amb ID3v2.3: salta la caràtula i llegeix la resta', () => {
    const tag = id3(3, [
        frame(3, 'TIT2', utf16('Cançó d\'estiu')),
        frame(3, 'APIC', Buffer.alloc(400000, 1)),
        frame(3, 'TCOM', latin('A. AUTOR\u0000B. AUTORA')),
        frame(3, 'TXXX', latin('LABEL\u0000XCD'))
    ]);
    const t = Tags.readTags(write('a.mp3', Buffer.concat([tag, Buffer.alloc(64)])));
    assert.strictEqual(t.title, 'Cançó d\'estiu');
    assert.strictEqual(t.composer, 'A. AUTOR / B. AUTORA');
    assert.strictEqual(t.extra.LABEL, 'XCD');
});

test('WAV amb bloc id3 (v2.4) i LIST INFO', () => {
    const tag = id3(4, [frame(4, 'TIT2', utf8('Títol')), frame(4, 'TSRC', latin('GB1234567890'))]);
    const info = Buffer.concat([Buffer.from('INFO'), chunk('IART', Buffer.from('Intèrpret\u0000', 'latin1'), true)]);
    const body = Buffer.concat([
        Buffer.from('WAVE'), chunk('fmt ', Buffer.alloc(16), true), chunk('data', Buffer.alloc(101), true),
        chunk('LIST', info, true), chunk('id3 ', tag, true)
    ]);
    const t = Tags.readTags(write('a.wav', Buffer.concat([Buffer.from('RIFF'), u32le(body.length), body])));
    assert.strictEqual(t.title, 'Títol');
    assert.strictEqual(t.isrc, 'GB1234567890');
    assert.strictEqual(t.artist, 'Intèrpret');
});

test('AIFF amb bloc ID3', () => {
    const body = Buffer.concat([Buffer.from('AIFF'), chunk('SSND', Buffer.alloc(33), false),
        chunk('ID3 ', id3(3, [frame(3, 'TALB', latin('DISC'))]), false)]);
    const t = Tags.readTags(write('a.aif', Buffer.concat([Buffer.from('FORM'), u32be(body.length), body])));
    assert.strictEqual(t.album, 'DISC');
});

test('arxius sense metadades o inexistents no fallen', () => {
    assert.deepStrictEqual(Tags.readTags(write('b.mp3', Buffer.alloc(500, 0xff))), { extra: {} });
    assert.deepStrictEqual(Tags.readTags(path.join(dir, 'no-hi-es.wav')), { extra: {} });
});
