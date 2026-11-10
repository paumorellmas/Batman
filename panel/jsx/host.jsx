// Costat Premiere (ExtendScript). Retorna la seqüència activa com a text JSON.
// ExtendScript no té JSON natiu, per això es munta a mà.

function MS_q(s) {
    s = String(s);
    var out = '"';
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c === 34) { out += '\\"'; }
        else if (c === 92) { out += '\\\\'; }
        else if (c < 32 || c > 126) {
            var h = c.toString(16);
            while (h.length < 4) { h = '0' + h; }
            out += '\\u' + h;
        } else { out += s.charAt(i); }
    }
    return out + '"';
}

function MS_num(n) {
    n = Number(n);
    return isNaN(n) ? '0' : String(n);
}

function MS_getSequence() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) { return '{"error":"NO_SEQUENCE"}'; }

        var TICKS = 254016000000;
        var fps = TICKS / Number(seq.timebase);
        var zero = Number(seq.zeroPoint) / TICKS;

        var tracks = [];
        var n = seq.audioTracks.numTracks;
        for (var t = 0; t < n; t++) {
            var tr = seq.audioTracks[t];
            var muted = false;
            try { muted = !!tr.isMuted(); } catch (e1) {}

            var clips = [];
            var nc = tr.clips.numItems;
            for (var c = 0; c < nc; c++) {
                var cl = tr.clips[c];
                var path = '';
                try {
                    if (cl.projectItem) { path = cl.projectItem.getMediaPath() || ''; }
                } catch (e2) {}
                var disabled = false;
                try { disabled = !!cl.disabled; } catch (e3) {}
                clips.push('{"name":' + MS_q(cl.name || '') +
                    ',"path":' + MS_q(path) +
                    ',"start":' + MS_num(cl.start.seconds) +
                    ',"end":' + MS_num(cl.end.seconds) +
                    ',"disabled":' + (disabled ? 'true' : 'false') + '}');
            }
            tracks.push('{"index":' + t +
                ',"name":' + MS_q(tr.name || ('A' + (t + 1))) +
                ',"muted":' + (muted ? 'true' : 'false') +
                ',"clips":[' + clips.join(',') + ']}');
        }

        return '{"name":' + MS_q(seq.name) +
            ',"fps":' + MS_num(fps) +
            ',"zero":' + MS_num(zero) +
            ',"tracks":[' + tracks.join(',') + ']}';
    } catch (e) {
        return '{"error":' + MS_q(String(e)) + '}';
    }
}
