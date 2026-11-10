// Interfície del panell.
(function () {
    'use strict';

    var Core = window.MSCore, Tags = window.MSTags;
    var cep = window.__adobe_cep__;
    var nodeRequire = (window.cep_node && window.cep_node.require) ||
        (typeof require === 'function' ? require : null);

    var state = { seq: null, selected: {}, rows: [], tags: {} };

    function $(id) { return document.getElementById(id); }

    function showMessage(text, ok) {
        var el = $('message');
        el.hidden = !text;
        el.textContent = text || '';
        el.className = 'message' + (ok ? ' ok' : '');
    }

    // Seqüència d'exemple per veure el panell fora de Premiere (en un navegador).
    function demoSequence() {
        var m = 'D:\\MUSICA\\';
        return {
            name: 'Exemple (fora de Premiere)', fps: 25, zero: 0,
            tracks: [
                { index: 0, name: 'A1', muted: false, clips: [{ name: 'ENTREVISTA.mxf', path: 'D:\\MEDIA\\ENTREVISTA.mxf', start: 0, end: 240, disabled: false }] },
                { index: 1, name: 'A2', muted: false, clips: [
                    { name: 'a', path: m + 'HPE458_01_1_MY_BABY_GIRL_INSTRUMENTAL.MP3', start: 5, end: 32.4, disabled: false },
                    { name: 'a', path: m + 'HPE458_01_1_MY_BABY_GIRL_INSTRUMENTAL.MP3', start: 32.4, end: 61, disabled: false },
                    { name: 'b', path: m + 'XCD212_07_SLOW_MORNING.wav', start: 75, end: 118, disabled: false },
                    { name: 'a', path: m + 'HPE458_01_1_MY_BABY_GIRL_INSTRUMENTAL.MP3', start: 150, end: 171.5, disabled: false }
                ] },
                { index: 2, name: 'A3', muted: true, clips: [{ name: 'c', path: m + 'KPM1234_03_OLD_IDEA.wav', start: 10, end: 20, disabled: false }] },
                { index: 3, name: 'A4', muted: false, clips: [] }
            ]
        };
    }

    function loadSequence() {
        showMessage('');
        if (!cep) { onSequence(demoSequence()); return; }
        cep.evalScript('MS_getSequence()', function (res) {
            var data;
            try { data = JSON.parse(res); } catch (e) { data = { error: res || 'Sense resposta de Premiere' }; }
            if (data.error === 'NO_SEQUENCE') { showMessage('No hi ha cap seqüència activa. Obre\'n una a la línia de temps i torna-ho a provar.'); return; }
            if (data.error) { showMessage('Error llegint la seqüència: ' + data.error); return; }
            onSequence(data);
        });
    }

    // Idioma, clau i tipus: valors de la plantilla, iguals per a totes les files. Es recorden entre sessions.
    var DEFAULTS = [
        { id: 'defLanguage', field: 'language', options: Core.IDIOMES.map(function (v) { return [v, v]; }), initial: '' },
        { id: 'defKey', field: 'key', options: Core.CLAUS.map(function (c) { return [c[0], c[0] + ' · ' + c[1]]; }), initial: '' },
        { id: 'defType', field: 'type', options: Core.TIPUS.map(function (v) { return [v, v]; }), initial: 'Llibreria' }
    ];

    function store(key, value) {
        try {
            if (value === undefined) { return window.localStorage.getItem('ms.' + key); }
            window.localStorage.setItem('ms.' + key, value);
        } catch (e) {}
        return null;
    }

    function setupDefaults() {
        DEFAULTS.forEach(function (d) {
            var sel = $(d.id);
            [['', '—']].concat(d.options).forEach(function (o) {
                var opt = document.createElement('option');
                opt.value = o[0];
                opt.textContent = o[1];
                sel.appendChild(opt);
            });
            var saved = store(d.field);
            sel.value = saved === null ? d.initial : saved;
            sel.addEventListener('change', function () {
                store(d.field, sel.value);
                refresh();
            });
        });
    }

    function currentDefaults() {
        var out = {};
        DEFAULTS.forEach(function (d) { out[d.field] = $(d.id).value; });
        return out;
    }

    function tagsFor(path) {
        if (!(path in state.tags)) {
            state.tags[path] = nodeRequire && Tags ? Tags.readTags(path) : {};
        }
        return state.tags[path];
    }

    function onSequence(seq) {
        state.seq = seq;
        state.selected = {};
        state.tags = {};
        $('seqName').textContent = seq.name;
        $('seqName').className = '';

        var box = $('tracks');
        box.innerHTML = '';
        seq.tracks.forEach(function (tr) {
            var active = tr.clips.filter(function (c) { return !c.disabled; }).length;
            var label = document.createElement('label');
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.disabled = !active;
            cb.addEventListener('change', function () {
                state.selected[tr.index] = cb.checked;
                refresh();
            });
            label.appendChild(cb);
            var name = document.createElement('span');
            name.textContent = tr.name;
            label.appendChild(name);
            if (tr.muted) {
                var tag = document.createElement('span');
                tag.className = 'tag';
                tag.textContent = 'silenciada';
                label.appendChild(tag);
            }
            var count = document.createElement('span');
            count.className = 'count' + (active ? '' : ' empty');
            count.textContent = active ? active + (active === 1 ? ' clip' : ' clips') : 'buida';
            label.appendChild(count);
            box.appendChild(label);
        });

        $('tracksBox').hidden = false;
        $('resultBox').hidden = false;
        refresh();
    }

    function refresh() {
        var seq = state.seq;
        if (!seq) { return; }
        var gap = Math.max(0, parseInt($('gap').value, 10) || 0);
        var cues = Core.buildCues(seq, state.selected, gap);
        state.rows = Core.buildRows(seq, cues, tagsFor, currentDefaults());

        var anySelected = Object.keys(state.selected).some(function (k) { return state.selected[k]; });
        $('summary').textContent = cues.length
            ? cues.length + (cues.length === 1 ? ' música' : ' músiques') + ' · total ' + Core.totalDuration(cues, seq.fps)
            : 'Full de música';
        $('btnCopy').disabled = $('btnCsv').disabled = !cues.length;

        var table = $('table');
        table.innerHTML = '';
        var thead = table.createTHead().insertRow();
        Core.COLUMNS.forEach(function (c) {
            var th = document.createElement('th');
            th.textContent = c.label;
            thead.appendChild(th);
        });
        var body = table.createTBody();
        if (!state.rows.length) {
            var td = body.insertRow().insertCell();
            td.colSpan = Core.COLUMNS.length;
            td.className = 'none';
            td.textContent = anySelected
                ? 'Les pistes marcades no tenen cap clip actiu.'
                : 'Marca les pistes que contenen la música.';
            return;
        }
        state.rows.forEach(function (r) {
            var tr = body.insertRow();
            Core.COLUMNS.forEach(function (c) {
                var cell = tr.insertCell();
                cell.textContent = r[c.id];
                if (c.id === 'num') { cell.className = 'num'; }
                if (c.id === 'tcIn' || c.id === 'tcOut' || c.id === 'min' || c.id === 'sec') { cell.className = 'time'; }
            });
        });
    }

    function copyTable() {
        var ta = document.createElement('textarea');
        ta.value = Core.toTemplateTSV(state.rows);
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        showMessage(ok ? 'Copiat. Enganxa-ho a la cel·la B13 de la plantilla.' : 'No s\'ha pogut copiar la taula.', ok);
    }

    function exportCsv() {
        var csv = Core.toCSV(state.rows);
        var fileName = (state.seq.name || 'sequencia').replace(/[\\\/:*?"<>|]+/g, '_') + '_musica.csv';

        if (!nodeRequire) { // fora de Premiere: descàrrega del navegador
            var a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
            a.download = fileName;
            a.click();
            return;
        }

        var fs = nodeRequire('fs'), path = nodeRequire('path'), os = nodeRequire('os');
        var target = '';
        try {
            var res = window.cep.fs.showSaveDialogEx('Desar el full de música', '', ['csv'], fileName);
            if (res && res.err === 0) {
                if (!res.data) { return; } // cancel·lat
                target = res.data;
            }
        } catch (e) {}
        if (!target) { target = path.join(os.homedir(), 'Desktop', fileName); }
        if (!/\.csv$/i.test(target)) { target += '.csv'; }
        try {
            fs.writeFileSync(target, csv, 'utf8');
            showMessage('Desat a ' + target, true);
        } catch (e2) {
            showMessage('No s\'ha pogut desar l\'arxiu: ' + e2.message);
        }
    }

    setupDefaults();
    $('btnLoad').addEventListener('click', loadSequence);
    $('btnCopy').addEventListener('click', copyTable);
    $('btnCsv').addEventListener('click', exportCsv);
    $('gap').addEventListener('input', refresh);

    if (!cep) { loadSequence(); }
}());
