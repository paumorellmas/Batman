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

    var CLAUS = [
        ["02", "Música Carta d'ajust"],
        ["03", "Música caretes i sintonies"],
        ["04", "Música sobre imatges, intermedis"],
        ["05", "Música de fons, interpretada en directe"],
        ["06", "Música de fons, només quan acompanya varietat"],
        ["07", "Música de fons gravada"],
        ["20", "Actuacions musicals: pop, rock, jazz, corals, vari"],
        ["21", "Varietats: gags, mims, sketch..."],
        ["23", "Acudits"],
        ["30", "Actuacions música clàssica"],
        ["55", "Publicitat"],
        ["56", "Ràfegues (menys de 10 segons)"],
        ["22E", "Fragment (fins a 20') obra dramàtica - Estranger"],
        ["22N", "Fragment (fins a 20') obra dramàtica - Espanya."],
        ["40E", "Obra de teatre - Estranger"],
        ["40N", "Obra de teatre - Espanya"],
        ["41E", "Obra de teatre mímica - Estranger"],
        ["41N", "Obra de teatre mímica - Espanya"],
        ["42E", "Poemes - Estranger"],
        ["42N", "Poemes - Espanya"],
        ["43E", "Comèdia Musical - Estranger"],
        ["43N", "Comèdia Musical - Espanya"],
        ["44E", "Sarsuela - Estranger"],
        ["44N", "Sarsuela - Espanya"],
        ["45E", "Opera - Estranger"],
        ["45N", "Opera. - Espanya"],
        ["46E", "Ballet. - Estranger"],
        ["46N", "Ballet. - Espanya"],
        ["47E", "Pel·lícula (llargmetratge) - Estranger"],
        ["47N", "Pel·lícula (llargmetratge) - Espanya"],
        ["47U", "Pel·lícula (llargmetratge) - USA"],
        ["48E", "Curtmetrage. - Estranger"],
        ["48N", "Curtmetrage. - Espanya"],
        ["48U", "Curtmetrage. - USA"],
        ["49E", "Documental - Estranger"],
        ["49N", "Documental - Espanya"],
        ["49U", "Documental - USA"],
        ["50EC", "Series, telefilms etc. - Espanya"],
        ["50UC", "Series, telefilms etc. inferiors a 15 minuts. - USA"],
        ["50N", "Series, telefilms etc. inferiors a 15 minuts. - Estranger"],
        ["50NC", "Series, telefilms etc. inferiors a 15 minuts. - Espanya"],
        ["52E", "Series, telefilms etc. - Estranger"],
        ["52U", "Series, telefilms etc. - Espanya"],
        ["51E", "Dibuixos animats - Estranger"],
        ["51N", "Dibuixos animats - Espanya"],
        ["51U", "Dibuixos animats - USA"],
        ["53E", "Videoclips - Estranger"],
        ["53N", "Videoclips - Espanya"],
        ["53U", "Videoclips - USA"],
        ["54E", "Docudrama - Estranger"],
        ["54N", "Docudrama - Espanya"],
        ["54U", "Docudrama - USA"],
        ["60E", "Obres multimèdia - Estranger"],
        ["60N", "Obres multimèdia - Espanya"],
        ["60U", "Obres multimèdia - USA"]
    ];

    var IDIOMES = ['Català', 'Aranès', 'Castellà', 'Anglès', 'Altres'];
    var TIPUS = ['TVC Ed.', 'Llibreria', 'Comercial'];

    // Columnes del panell. Les marcades amb `template` són, en aquest ordre, les columnes B-K
    // de la plantilla "Music Cue Sheet" de 3Cat (les dades comencen a la cel·la B13).
    var COLUMNS = [
        { id: 'num', label: 'Núm.' },
        { id: 'tcIn', label: 'TC entrada' },
        { id: 'tcOut', label: 'TC sortida' },
        { id: 'min', label: 'Min.', template: true },
        { id: 'sec', label: 'Seg.', template: true },
        { id: 'title', label: 'Títol', template: true },
        { id: 'composer', label: 'Autor/s', template: true },
        { id: 'artist', label: 'Intèrpret/s', template: true },
        { id: 'language', label: 'Idioma', template: true },
        { id: 'key', label: 'Clau', template: true },
        { id: 'publisher', label: 'Editora', template: true },
        { id: 'type', label: 'Tipus', template: true },
        { id: 'support', label: 'Suport', template: true },
        { id: 'file', label: 'Arxiu' }
    ];
    var TEMPLATE_COLUMNS = COLUMNS.filter(function (c) { return c.template; });

    // Una fila del full per cada ús. tagsFor(path) retorna les metadades de l'arxiu (o {}).
    // defaults: { language, key, type } triats al panell, iguals per a totes les files.
    function buildRows(seq, cues, tagsFor, defaults) {
        defaults = defaults || {};
        return cues.map(function (cue, i) {
            var file = baseName(cue.path) || cue.name;
            var fromName = parseFileName(file);
            var tags = (cue.path && tagsFor && tagsFor(cue.path)) || {};
            var seconds = Math.round((cue.end - cue.start) / (seq.fps || 25));
            return {
                num: String(i + 1),
                tcIn: formatTC(cue.start, seq.fps, seq.zero),
                tcOut: formatTC(cue.end, seq.fps, seq.zero),
                min: pad(Math.floor(seconds / 60)),
                sec: pad(seconds % 60),
                title: tags.title || fromName.title,
                composer: tags.composer || '',
                artist: tags.artist || '',
                language: defaults.language || '',
                key: defaults.key || '',
                publisher: (tags.publisher || '').replace(/^ORIGINAL PUB(LISHER)?S?:\s*/i, ''),
                type: defaults.type || '',
                support: fromName.discCode,
                file: file
            };
        });
    }

    function totalDuration(cues, fps) {
        var f = 0;
        cues.forEach(function (c) { f += c.end - c.start; });
        return formatDuration(f, fps);
    }

    function toDelimited(rows, sep, columns, noHeader) {
        columns = columns || COLUMNS;
        function cell(v) {
            v = String(v == null ? '' : v);
            if (sep === '\t') { return v.replace(/[\t\r\n]+/g, ' '); }
            return /[";\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
        }
        var lines = noHeader ? [] : [columns.map(function (c) { return cell(c.label); }).join(sep)];
        rows.forEach(function (r) {
            lines.push(columns.map(function (c) { return cell(r[c.id]); }).join(sep));
        });
        return lines.join('\r\n');
    }

    return {
        COLUMNS: COLUMNS,
        CLAUS: CLAUS,
        IDIOMES: IDIOMES,
        TIPUS: TIPUS,
        baseName: baseName,
        buildCues: buildCues,
        buildRows: buildRows,
        formatTC: formatTC,
        formatDuration: formatDuration,
        parseFileName: parseFileName,
        totalDuration: totalDuration,
        toCSV: function (rows) { return '﻿' + toDelimited(rows, ';') + '\r\n'; },
        // Només les columnes de la plantilla i sense capçalera: per enganxar a la cel·la B13.
        toTemplateTSV: function (rows) { return toDelimited(rows, '\t', TEMPLATE_COLUMNS, true); }
    };
}));
