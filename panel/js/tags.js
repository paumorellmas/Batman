// Lectura de metadades dels arxius de música (Node, dins del panell).
// Suporta ID3v2 (MP3), i WAV/AIFF amb bloc ID3 o LIST INFO. No llança mai: si falla retorna {}.
(function (root, factory) {
    // Dins del panell (CEP amb Node) existeixen alhora `module` i `window`: cal exposar-ho a tots dos.
    var api = factory();
    if (typeof module === 'object' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.MSTags = api; }
}(this, function () {
    'use strict';

    var MAX_FRAME = 256 * 1024; // les caràtules i altres blocs grans se salten

    var ID3_MAP = {
        TIT2: 'title', TT2: 'title',
        TALB: 'album', TAL: 'album',
        TPE1: 'artist', TP1: 'artist',
        TCOM: 'composer', TCM: 'composer',
        TPUB: 'publisher', TPB: 'publisher',
        TSRC: 'isrc', TRC: 'isrc',
        TRCK: 'track', TRK: 'track',
        TIT3: 'subtitle', TT3: 'subtitle',
        TCOP: 'copyright', TCR: 'copyright'
    };

    var INFO_MAP = { INAM: 'title', IART: 'artist', IPRD: 'album', ICOP: 'copyright', IMUS: 'composer' };

    function readAt(fs, fd, pos, len) {
        var buf = Buffer.alloc(len);
        var n = fs.readSync(fd, buf, 0, len, pos);
        return n < len ? buf.slice(0, n) : buf;
    }

    function synchsafe(b, o) {
        return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
    }

    function swap16(buf) {
        var out = Buffer.alloc(buf.length - (buf.length % 2));
        for (var i = 0; i + 1 < buf.length; i += 2) { out[i] = buf[i + 1]; out[i + 1] = buf[i]; }
        return out;
    }

    function decodeText(data) {
        if (!data.length) { return ''; }
        var enc = data[0], body = data.slice(1), s;
        if (enc === 1) {
            if (body.length >= 2 && body[0] === 0xfe && body[1] === 0xff) { s = swap16(body.slice(2)).toString('utf16le'); }
            else if (body.length >= 2 && body[0] === 0xff && body[1] === 0xfe) { s = body.slice(2).toString('utf16le'); }
            else { s = body.toString('utf16le'); }
        } else if (enc === 2) { s = swap16(body).toString('utf16le'); }
        else if (enc === 3) { s = body.toString('utf8'); }
        else { s = body.toString('latin1'); }
        return s;
    }

    function clean(s) {
        return s.split('\u0000').map(function (x) { return x.trim(); })
            .filter(function (x) { return x; }).join(' / ');
    }

    function parseID3(fs, fd, base, out) {
        var h = readAt(fs, fd, base, 10);
        if (h.length < 10 || h.toString('latin1', 0, 3) !== 'ID3') { return; }
        var ver = h[3], flags = h[5];
        var pos = base + 10, end = pos + synchsafe(h, 6);
        if (ver < 2 || ver > 4) { return; }
        if (ver >= 3 && (flags & 0x40)) {
            var x = readAt(fs, fd, pos, 4);
            if (x.length < 4) { return; }
            pos += ver === 4 ? synchsafe(x, 0) : x.readUInt32BE(0) + 4;
        }
        var hl = ver === 2 ? 6 : 10;
        while (pos + hl <= end) {
            var fh = readAt(fs, fd, pos, hl);
            if (fh.length < hl || fh[0] === 0) { break; }
            var id, size;
            if (ver === 2) {
                id = fh.toString('latin1', 0, 3);
                size = (fh[3] << 16) | (fh[4] << 8) | fh[5];
            } else {
                id = fh.toString('latin1', 0, 4);
                size = ver === 4 ? synchsafe(fh, 4) : fh.readUInt32BE(4);
            }
            if (!/^[A-Z0-9]+$/.test(id) || size <= 0) { break; }
            var isUser = id === 'TXXX' || id === 'TXX';
            if ((ID3_MAP[id] || isUser) && size <= MAX_FRAME) {
                var text = decodeText(readAt(fs, fd, pos + hl, size));
                if (isUser) {
                    var parts = text.split('\u0000');
                    var key = (parts.shift() || '').trim().toUpperCase();
                    var val = clean(parts.join('\u0000'));
                    if (key && val) { out.extra[key] = val; }
                } else {
                    var v = clean(text);
                    if (v && !out[ID3_MAP[id]]) { out[ID3_MAP[id]] = v; }
                }
            }
            pos += hl + size;
        }
    }

    function parseInfoList(fs, fd, pos, end, out) {
        while (pos + 8 <= end) {
            var h = readAt(fs, fd, pos, 8);
            if (h.length < 8) { break; }
            var id = h.toString('latin1', 0, 4), size = h.readUInt32LE(4);
            if (INFO_MAP[id] && size > 0 && size <= MAX_FRAME) {
                var v = clean(readAt(fs, fd, pos + 8, size).toString('latin1'));
                if (v && !out[INFO_MAP[id]]) { out[INFO_MAP[id]] = v; }
            }
            pos += 8 + size + (size & 1);
        }
    }

    // Recorre els blocs d'un contenidor RIFF (WAV, little endian) o IFF (AIFF, big endian).
    function parseChunks(fs, fd, fileSize, bigEndian, out) {
        var pos = 12;
        while (pos + 8 <= fileSize) {
            var h = readAt(fs, fd, pos, 8);
            if (h.length < 8) { break; }
            var id = h.toString('latin1', 0, 4);
            var size = bigEndian ? h.readUInt32BE(4) : h.readUInt32LE(4);
            if (id.toLowerCase() === 'id3 ') {
                parseID3(fs, fd, pos + 8, out);
            } else if (id === 'LIST' && !bigEndian) {
                if (readAt(fs, fd, pos + 8, 4).toString('latin1') === 'INFO') {
                    parseInfoList(fs, fd, pos + 12, pos + 8 + size, out);
                }
            }
            pos += 8 + size + (size & 1);
        }
    }

    function readTags(path) {
        var out = { extra: {} };
        var fs, fd;
        try {
            fs = require('fs');
            fd = fs.openSync(path, 'r');
        } catch (e) { return out; }
        try {
            var size = fs.fstatSync(fd).size;
            var head = readAt(fs, fd, 0, 12);
            var magic = head.toString('latin1', 0, 4);
            var form = head.toString('latin1', 8, 12);
            if (magic === 'RIFF' && form === 'WAVE') { parseChunks(fs, fd, size, false, out); }
            else if (magic === 'FORM' && (form === 'AIFF' || form === 'AIFC')) { parseChunks(fs, fd, size, true, out); }
            else { parseID3(fs, fd, 0, out); }
        } catch (e2) { /* arxiu il·legible: es farà servir el nom */ }
        try { fs.closeSync(fd); } catch (e3) {}
        return out;
    }

    return { readTags: readTags };
}));
