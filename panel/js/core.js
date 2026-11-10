// Lògica pura (sense Premiere): agrupar clips en usos de música, formats de temps i exportació.
(function (root, factory) {
    // Dins del panell (CEP amb Node) existeixen alhora `module` i `window`: cal exposar-ho a tots dos.
    var api = factory();
    if (typeof module === 'object' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.MSCore = api; }
}(this, function () {
    'use strict';

    function baseName(p) {
        return String(p || '').replace(/^.*[\\\/]/, '');
    }

    function stripExt(n) {
        return String(n || '').replace(/\.[A-Za-z0-9]{2,5}$/, '');
    }

    // Clau que identifica "la mateixa música": el mateix arxiu al disc.
    function clipKey(clip) {
        if (clip.path) { return 'p:' + clip.path.replace(/\\/g, '/').toLowerCase(); }
        return 'n:' + String(clip.name || '').toLowerCase();
    }

    // Converteix els clips de les pistes triades en usos de música.
    // Trossos del mateix arxiu enganxats (o solapats, o duplicats en dues pistes) = un sol ús.
    // El mateix arxiu amb un forat pel mig = dos usos, cadascun amb el seu TC.
    function buildCues(seq, selected, gapFrames) {
        var fps = seq.fps || 25;
        var gap = gapFrames || 0;
        var byKey = {};
        seq.tracks.forEach(function (tr) {
            if (!selected[tr.index]) { return; }
            tr.clips.forEach(function (cl) {
                if (cl.disabled) { return; }
                var s = Math.round(cl.start * fps), e = Math.round(cl.end * fps);
                if (e <= s) { return; }
                var k = clipKey(cl);
                (byKey[k] = byKey[k] || []).push({ s: s, e: e, clip: cl, track: tr.name });
            });
        });

        var cues = [];
        Object.keys(byKey).forEach(function (k) {
            var list = byKey[k].sort(function (a, b) { return a.s - b.s || a.e - b.e; });
            var cur = null;
            list.forEach(function (it) {
                if (cur && it.s <= cur.end + gap) {
                    if (it.e > cur.end) { cur.end = it.e; }
                    if (cur.tracks.indexOf(it.track) < 0) { cur.tracks.push(it.track); }
                } else {
                    cur = {
                        key: k, start: it.s, end: it.e, tracks: [it.track],
                        path: it.clip.path || '', name: it.clip.name || ''
                    };
                    cues.push(cur);
                }
            });
        });
        cues.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
        return cues;
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    // Frames de seqüència -> hh:mm:ss (inclou el TC d'inici de la seqüència).
    function formatTC(frames, fps, zeroSeconds) {
        var nominal = Math.round(fps) || 25;
        var total = Math.floor((frames + Math.round((zeroSeconds || 0) * fps)) / nominal);
        return pad(Math.floor(total / 3600)) + ':' + pad(Math.floor(total / 60) % 60) + ':' + pad(total % 60);
    }

    // Durada en frames -> mm:ss arrodonit al segon.
    function formatDuration(frames, fps) {
        var total = Math.round(frames / (fps || 25));
        return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
    }

    // Dades que es poden treure del nom de l'arxiu quan no hi ha metadades.
    // Ex. "HPE458_01_1_MY_BABY_GIRL_INSTRUMENTAL.MP3" -> disc HPE458, pista 01, títol MY BABY GIRL INSTRUMENTAL
    function parseFileName(name) {
        var base = stripExt(baseName(name));
        var m = /^(?:UPM_)?([A-Za-z]{1,8}[-_]?\d{1,6})_(\d{1,3})(?:_(\d{1,3}))?_(.+)$/.exec(base);
        if (m) {
            return { discCode: m[1].toUpperCase(), track: m[2], title: m[4].replace(/_+/g, ' ').trim() };
        }
        return { discCode: '', track: '', title: base.replace(/_+/g, ' ').trim() };
    }

    var COLUMNS = [
        { id: 'num', label: 'Núm.' },
        { id: 'tcIn', label: 'TC entrada' },
        { id: 'tcOut', label: 'TC sortida' },
        { id: 'duration', label: 'Durada' },
        { id: 'title', label: 'Títol' },
        { id: 'composer', label: 'Autors' },
        { id: 'artist', label: 'Intèrpret' },
        { id: 'album', label: 'Disc' },
        { id: 'discCode', label: 'Codi disc' },
        { id: 'track', label: 'Pista' },
        { id: 'publisher', label: 'Editorial' },
        { id: 'isrc', label: 'ISRC' },
        { id: 'file', label: 'Arxiu' }
    ];

    // Una fila del full per cada ús. tagsFor(path) retorna les metadades de l'arxiu (o {}).
    function buildRows(seq, cues, tagsFor) {
        return cues.map(function (cue, i) {
            var file = baseName(cue.path) || cue.name;
            var fromName = parseFileName(file);
            var tags = (cue.path && tagsFor && tagsFor(cue.path)) || {};
            return {
                num: String(i + 1),
                tcIn: formatTC(cue.start, seq.fps, seq.zero),
                tcOut: formatTC(cue.end, seq.fps, seq.zero),
                duration: formatDuration(cue.end - cue.start, seq.fps),
                title: tags.title || fromName.title,
                composer: tags.composer || '',
                artist: tags.artist || '',
                album: tags.album || '',
                discCode: fromName.discCode,
                track: fromName.track || tags.track || '',
                publisher: tags.publisher || '',
                isrc: tags.isrc || '',
                file: file
            };
        });
    }

    function totalDuration(cues, fps) {
        var f = 0;
        cues.forEach(function (c) { f += c.end - c.start; });
        return formatDuration(f, fps);
    }

    function toDelimited(rows, sep) {
        function cell(v) {
            v = String(v == null ? '' : v);
            if (sep === '\t') { return v.replace(/[\t\r\n]+/g, ' '); }
            return /[";\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
        }
        var lines = [COLUMNS.map(function (c) { return cell(c.label); }).join(sep)];
        rows.forEach(function (r) {
            lines.push(COLUMNS.map(function (c) { return cell(r[c.id]); }).join(sep));
        });
        return lines.join('\r\n');
    }

    return {
        COLUMNS: COLUMNS,
        baseName: baseName,
        buildCues: buildCues,
        buildRows: buildRows,
        formatTC: formatTC,
        formatDuration: formatDuration,
        parseFileName: parseFileName,
        totalDuration: totalDuration,
        toCSV: function (rows) { return '﻿' + toDelimited(rows, ';') + '\r\n'; },
        toTSV: function (rows) { return toDelimited(rows, '\t'); }
    };
}));
