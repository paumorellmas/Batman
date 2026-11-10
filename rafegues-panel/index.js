/* Ràfegues — panell UXP per a Premiere Pro 26
 * Desa combinacions "vídeo de ràfega + so d'un altre clip" i les col·loca
 * (sobreescrivint) al cursor de reproducció amb un clic o una tecla.
 */
const ppro = require("premierepro");
const uxp = require("uxp");

const TPS = 254016000000; // ticks per segon a Premiere
const STORE_KEY = "rafegues.presets.v1";
const SETTINGS_KEY = "rafegues.settings.v1";

let presets = [];
let settings = { vDest: "preset", aDest: "preset", moveAfter: false, outCorr: null };
let capturingKeyFor = null;
let renamingId = null;
let openId = null;          // ràfega amb les opcions desplegades
let showOthers = false;     // mostra també les ràfegues d'altres projectes
let currentProject = null;  // { id, path, name } del projecte actiu
let busy = false;
const itemCache = new Map(); // id del projecte + path normalitzat -> ProjectItem

// ---------------------------------------------------------------- utilitats
const $ = (id) => document.getElementById(id);
const tt = (n) => ppro.TickTime.createWithTicks(String(Math.round(n)));
const norm = (p) => (p || "").replace(/\\/g, "/").toLowerCase();
const samePath = (a, b) => !!a && !!b && norm(a) === norm(b);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function status(msg, kind) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status" + (kind ? " " + kind : "");
}

function load() {
  try { presets = JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { presets = []; }
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch (e) { /* res */ }
  // Correcció d'un fotograma en l'out: separada per a vídeo i àudio. Les versions anteriors
  // del panell en desaven una de sola (outCorrection), que es manté com a punt de partida.
  if (!settings.outCorr) {
    const old = Number(settings.outCorrection) || 0;
    settings.outCorr = { video: old, audio: old };
  }
  delete settings.outCorrection;
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(presets));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) { status("No s'han pogut desar els presets: " + e.message, "err"); }
}

// ------------------------------------------------- ràfegues globals / de projecte
// Cada ràfega és de "Tots els projectes" (scope "global") o d'un projecte concret (scope "project").
// El projecte s'identifica pel camí del fitxer .prproj; el guid només es fa servir si encara no
// s'ha desat, perquè els projectes creats copiant una plantilla comparteixen guid.
async function detectProject() {
  let info = null;
  try {
    const project = await ppro.Project.getActiveProject();
    if (project) {
      let id = "";
      try { id = project.guid.toString(); } catch (e) { /* sense guid */ }
      info = { id, path: project.path || "", name: String(project.name || "").replace(/\.prproj$/i, "") };
    }
  } catch (e) { info = null; }
  const changed = JSON.stringify(info) !== JSON.stringify(currentProject);
  currentProject = info;
  return changed;
}
const isGlobal = (p) => p.scope !== "project";
function isMine(p) {
  if (isGlobal(p) || !currentProject || !p.project) return false;
  if (p.project.path && currentProject.path) return samePath(p.project.path, currentProject.path);
  return !!p.project.id && p.project.id === currentProject.id;
}
const isActive = (p) => isGlobal(p) || isMine(p); // les que responen a les tecles

async function getContext() {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("No hi ha cap projecte obert.");
  const seq = await project.getActiveSequence();
  if (!seq) throw new Error("No hi ha cap seqüència activa.");
  const editor = ppro.SequenceEditor.getEditor(seq);
  let frame = TPS / 25;
  try { const tb = Number(await seq.getTimebase()); if (tb > 0) frame = tb; } catch (e) { /* 25 fps per defecte */ }
  return { project, seq, editor, frame };
}

function tx(project, label, build) {
  let ok = false;
  project.lockedAccess(() => {
    ok = project.executeTransaction((ca) => build(ca), label);
  });
  if (ok === false) throw new Error("Premiere ha rebutjat l'acció: " + label);
}

async function trackItems(track) {
  const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
  return items || [];
}

async function pathOf(projectItem) {
  try {
    const clip = ppro.ClipProjectItem.cast(projectItem);
    if (!clip) return null;
    return await clip.getMediaFilePath();
  } catch (e) { return null; }
}

async function itemInfo(item, trackIdx) {
  return {
    item,
    track: trackIdx,
    start: (await item.getStartTime()).ticksNumber,
    end: (await item.getEndTime()).ticksNumber,
    inP: (await item.getInPoint()).ticksNumber,
    outP: (await item.getOutPoint()).ticksNumber,
    name: await item.getName(),
    path: await pathOf(await item.getProjectItem()),
    speed: await (async () => { try { return await item.getSpeed(); } catch (e) { return 1; } })(),
  };
}

async function forEachTrack(seq, kind, fn) {
  const count = kind === "video" ? await seq.getVideoTrackCount() : await seq.getAudioTrackCount();
  for (let i = 0; i < count; i++) {
    const track = kind === "video" ? await seq.getVideoTrack(i) : await seq.getAudioTrack(i);
    if (track) await fn(track, i);
  }
  return count;
}

// Busca a la timeline els clips d'un fitxer que comencen en un instant donat
async function findPlaced(seq, kind, path, at, frame) {
  const found = [];
  await forEachTrack(seq, kind, async (track, i) => {
    for (const it of await trackItems(track)) {
      const start = (await it.getStartTime()).ticksNumber;
      if (Math.abs(start - at) > frame / 2) continue;
      if (samePath(await pathOf(await it.getProjectItem()), path)) found.push({ item: it, track: i });
    }
  });
  return found;
}

// Pista més alta que està buida entre from i to (sense comptar la pista `exclude`)
async function findFreeTrack(seq, kind, from, to, exclude) {
  const free = [];
  await forEachTrack(seq, kind, async (track, i) => {
    if (i === exclude) return;
    for (const it of await trackItems(track)) {
      const s = (await it.getStartTime()).ticksNumber;
      const e = (await it.getEndTime()).ticksNumber;
      if (s < to && e > from) return;
    }
    free.push(i);
  });
  return free.length ? free[free.length - 1] : null;
}

async function removePlaced(ctx, kind, path, at) {
  const found = await findPlaced(ctx.seq, kind, path, at, ctx.frame);
  if (!found.length) return 0;
  const mediaType = kind === "audio" ? ppro.Constants.MediaType.AUDIO : ppro.Constants.MediaType.VIDEO;
  ppro.TrackItemSelection.createEmptySelection((sel) => {
    found.forEach((f) => sel.addItem(f.item, true));
    tx(ctx.project, "Ràfega: treure pista sobrant", (ca) =>
      ca.addAction(ctx.editor.createRemoveItemsAction(sel, false, mediaType, false)));
  });
  return found.length;
}

// ------------------------------------------------- localitzar / importar media
async function walkFind(folder, path) {
  const items = (await folder.getItems()) || [];
  for (const it of items) {
    let sub = null;
    try { sub = ppro.FolderItem.cast(it); } catch (e) { sub = null; }
    if (sub) {
      const r = await walkFind(sub, path);
      if (r) return r;
      continue;
    }
    if (samePath(await pathOf(it), path)) return it;
  }
  return null;
}

async function findOrImport(project, path) {
  let projectId = "";
  try { projectId = project.guid.toString(); } catch (e) { /* sense guid: clau només pel path */ }
  const key = projectId + "|" + norm(path);
  const cached = itemCache.get(key);
  if (cached && samePath(await pathOf(cached), path)) return cached;

  const root = await project.getRootItem();
  let pi = await walkFind(root, path);
  if (!pi) {
    status("Important " + path.split(/[\\/]/).pop() + "…");
    await project.importFiles([path], true, root, false);
    pi = await walkFind(root, path);
  }
  if (!pi) throw new Error("No trobe el fitxer al projecte ni l'he pogut importar:\n" + path);
  itemCache.set(key, pi);
  return pi;
}

// --------------------------------------------- col·locar un tram d'un clip
async function placeRange(ctx, kind, pi, inP, outP, at, vIdx, aIdx) {
  const clip = ppro.ClipProjectItem.cast(pi);
  const corr = settings.outCorr[kind] || 0;
  // Tres transaccions separades: si van juntes Premiere pot fer l'overwrite abans del in/out
  tx(ctx.project, "Ràfega: in/out", (ca) => ca.addAction(clip.createSetInOutPointsAction(tt(inP), tt(outP - corr))));
  try {
    tx(ctx.project, "Ràfega: sobreescriu", (ca) => ca.addAction(ctx.editor.createOverwriteItemAction(pi, tt(at), vIdx, aIdx)));
  } finally {
    // Passe el que passe, el clip original no s'ha de quedar amb l'in/out de la ràfega
    try {
      tx(ctx.project, "Ràfega: neteja in/out", (ca) => ca.addAction(clip.createClearInOutPointsAction()));
    } catch (e) { /* res: l'error important és el de l'overwrite */ }
  }

  // Calibratge: comprova que la durada col·locada és l'esperada (out inclusiu vs exclusiu)
  const path = await pathOf(pi);
  const placed = await findPlaced(ctx.seq, kind, path, at, ctx.frame);
  if (placed.length) {
    // Si ja hi havia un altre clip del mateix fitxer al mateix punt, mira el de la pista de destí
    const target = kind === "video" ? vIdx : aIdx;
    const it = (placed.find((f) => f.track === target) || placed[0]).item;
    const dur = (await it.getEndTime()).ticksNumber - (await it.getStartTime()).ticksNumber;
    const delta = dur - (outP - inP);
    if (Math.abs(delta) >= ctx.frame / 2 && Math.abs(delta) <= ctx.frame * 1.5) {
      // Mai més d'un fotograma i mig: així una mesura estranya no pot anar escurçant les ràfegues
      const max = ctx.frame * 1.5;
      settings.outCorr[kind] = Math.max(-max, Math.min(max, corr + delta));
      save();
    }
    return at + dur;
  }
  return at + (outP - inP);
}

// -------------------------------------------------------- aplicar un preset
async function applyPreset(p) {
  if (busy) return;
  busy = true;
  try {
    const ctx = await getContext();
    if (await detectProject()) render();
    const T0 = (await ctx.seq.getPlayerPosition()).ticksNumber;
    const vCount = await ctx.seq.getVideoTrackCount();
    const aCount = await ctx.seq.getAudioTrackCount();

    // Si la pista triada no existeix en aquesta seqüència, es fa com al preset
    // (és el que passa a mostrar el desplegable).
    fillTrackSelects(vCount, aCount);
    const dest = (value, count, fromPreset) =>
      value !== "preset" && Number(value) < count ? Number(value) : fromPreset;
    const vIdx = dest(settings.vDest, vCount, p.video ? p.video.track : 0);
    const aIdx = dest(settings.aDest, aCount, p.audio ? p.audio.track : 0);
    if (p.video && vIdx >= vCount) throw new Error("La seqüència no té la pista V" + (vIdx + 1) + ".");
    if (p.audio && aIdx >= aCount) throw new Error("La seqüència no té la pista A" + (aIdx + 1) + ".");

    const vStart = T0;
    const aStart = T0 + (p.video ? p.offset : 0);
    if (aStart < 0) throw new Error("El so comença abans del cursor i no hi ha prou espai al principi de la seqüència.");

    // Pistes auxiliars per a la part que després es lleva (àudio de càmera, imatge del fitxer de so).
    // Es decideixen abans de tocar res, per no deixar la ràfega a mitges.
    let tmpA = aIdx;
    if (p.video && p.videoHasAudio) {
      const free = await findFreeTrack(ctx.seq, "audio", vStart, vStart + (p.video.outP - p.video.inP), aIdx);
      if (free !== null) tmpA = free;
    }
    let tmpV = vIdx;
    if (p.audio && p.soundHasVideo) {
      const free = await findFreeTrack(ctx.seq, "video", aStart, aStart + (p.audio.outP - p.audio.inP), p.video ? vIdx : undefined);
      if (free === null) {
        throw new Error("El fitxer de so té imatge i no hi ha cap pista de vídeo lliure en aquest tram. " +
          "Afig una pista de vídeo buida i torna-ho a provar.");
      }
      tmpV = free;
    }

    let endMax = T0;

    // 1) Vídeo de la ràfega (primer, perquè l'àudio de càmera no xafe el so)
    if (p.video) {
      const pi = await findOrImport(ctx.project, p.video.path);
      endMax = Math.max(endMax, await placeRange(ctx, "video", pi, p.video.inP, p.video.outP, vStart, vIdx, tmpA));
      // l'àudio propi del clip de vídeo (càmera) no el volem si el preset porta so
      if (p.audio) await removePlaced(ctx, "audio", p.video.path, vStart);
    }

    // 2) So de la ràfega
    if (p.audio) {
      const pi = await findOrImport(ctx.project, p.audio.path);
      endMax = Math.max(endMax, await placeRange(ctx, "audio", pi, p.audio.inP, p.audio.outP, aStart, tmpV, aIdx));
      if (p.soundHasVideo) await removePlaced(ctx, "video", p.audio.path, aStart);
    }

    if (settings.moveAfter) await ctx.seq.setPlayerPosition(tt(endMax));
    status("✓ " + p.name + "  (V" + (vIdx + 1) + " / A" + (aIdx + 1) + ")");
  } catch (e) {
    status(e.message || String(e), "err");
  } finally {
    busy = false;
  }
}

// ------------------------------------------------ desar la selecció com a preset
async function captureFromSelection(scope) {
  if (busy) return;
  busy = true;
  try {
    const { seq, frame } = await getContext();
    await detectProject();
    if (scope === "project" && !currentProject) throw new Error("No hi ha cap projecte obert.");
    // Només es lligen sencers els clips seleccionats: en una seqüència llarga, llegir-los tots és lent.
    const selV = [], selA = [];
    await forEachTrack(seq, "video", async (track, i) => {
      for (const it of await trackItems(track)) if (await it.getIsSelected()) selV.push(await itemInfo(it, i));
    });
    await forEachTrack(seq, "audio", async (track, i) => {
      for (const it of await trackItems(track)) if (await it.getIsSelected()) selA.push(await itemInfo(it, i));
    });
    if (!selV.length && !selA.length) throw new Error("Selecciona a la timeline el vídeo i el so de la ràfega.");

    const byPos = (a, b) => a.start - b.start || a.track - b.track;
    const video = selV.sort(byPos)[0] || null;
    const soundCandidates = selA.filter((a) => !video || !samePath(a.path, video.path)).sort(byPos);
    const sound = soundCandidates[0] || null;
    if (!video && !sound) throw new Error("No he trobat cap so diferent del vídeo a la selecció.");
    if ((video && !video.path) || (sound && !sound.path)) throw new Error("Algun clip seleccionat no és un fitxer de media (gràfic, seqüència niada…).");

    // El vídeo porta àudio propi (o el so porta imatge) si a la timeline hi ha, al mateix punt,
    // un clip del mateix fitxer a les pistes de l'altre tipus.
    const videoHasAudio = !!video && (await findPlaced(seq, "audio", video.path, video.start, frame)).length > 0;
    const soundHasVideo = !!sound && (await findPlaced(seq, "video", sound.path, sound.start, frame)).length > 0;

    const strip = (x) => x && { path: x.path, name: x.name, inP: x.inP, outP: x.outP, track: x.track };
    const preset = {
      id: uid(),
      name: (video || sound).name.replace(/\.[^.]+$/, ""),
      key: null,
      scope: scope === "project" ? "project" : "global",
      project: scope === "project" ? Object.assign({}, currentProject) : null,
      video: strip(video),
      audio: strip(sound),
      offset: video && sound ? sound.start - video.start : 0,
      videoHasAudio,
      soundHasVideo,
    };
    presets.push(preset);
    save();
    renamingId = preset.id; // obri directament el camp per posar-li nom
    render();
    let msg = (scope === "project" ? "Ràfega desada en aquest projecte." : "Ràfega desada per a tots els projectes.") +
      " Posa-li un nom i assigna-li una tecla.";
    if ((video && video.speed !== 1) || (sound && sound.speed !== 1)) msg += " (Ull: la velocitat dels clips no es conserva.)";
    status(msg, video && sound ? "" : "warn");
  } catch (e) {
    status(e.message || String(e), "err");
  } finally {
    busy = false;
  }
}

// ------------------------------------------------------------------ tecles
function comboFrom(e) {
  const code = e.code || e.key || "";
  if (/^(Control|Shift|Alt|Meta)/.test(code) || /^(Control|Shift|Alt|Meta)$/.test(e.key)) return null;
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(code);
  return parts.join("+");
}
function prettyKey(combo) {
  if (!combo) return "";
  return combo.replace("Numpad", "Num ").replace(/Key([A-Z])/, "$1").replace(/Digit(\d)/, "$1");
}

document.addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName || "").toLowerCase();
  if (capturingKeyFor) {
    e.preventDefault();
    if (e.key === "Escape") { capturingKeyFor = null; render(); status(""); return; }
    const combo = comboFrom(e);
    if (!combo) return;
    const p = presets.find((x) => x.id === capturingKeyFor);
    // Una tecla només pot ser d'una de les ràfegues que estan actives alhora
    presets.forEach((x) => { if (x.key === combo && (isActive(x) || x === p)) x.key = null; });
    if (p) p.key = combo;
    capturingKeyFor = null;
    save(); render();
    status("Tecla " + prettyKey(combo) + " assignada a «" + (p ? p.name : "") + "».");
    return;
  }
  if (tag === "input" || tag === "select" || tag === "textarea") return;
  const combo = comboFrom(e);
  const p = combo && presets.find((x) => x.key === combo && isActive(x));
  if (p) { e.preventDefault(); applyPreset(p); }
});

// --------------------------------------------------------------------- UI
function describe(p) {
  const parts = [];
  if (p.video) parts.push("V: " + p.video.name);
  if (p.audio) parts.push("A: " + p.audio.name);
  if (p.video && p.audio && p.offset) {
    const sec = p.offset / TPS;
    parts.push((sec > 0 ? "+" : "") + sec.toFixed(2) + " s");
  }
  return parts.join(" · ");
}

// Els controls són <div>: a UXP els <button> porten l'estil de Premiere i no es deixen vestir bé.
function el(cls, text, title) {
  const d = document.createElement("div");
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  if (title) d.title = title;
  return d;
}

// Mou una ràfega amunt o avall dins de la seua llista
function moveInList(p, list, dir) {
  const other = list[list.indexOf(p) + dir];
  if (!other) return;
  const i = presets.indexOf(p), j = presets.indexOf(other);
  presets[i] = other; presets[j] = p;
  save(); render();
}

function setScope(p, scope) {
  if (scope === "project" && !currentProject) { status("No hi ha cap projecte obert.", "err"); return; }
  p.scope = scope;
  p.project = scope === "project" ? Object.assign({}, currentProject) : null;
  // si ara coincideix la tecla amb una altra ràfega activa, la perd la que es mou
  if (p.key && presets.some((x) => x !== p && x.key === p.key && isActive(x))) p.key = null;
  openId = null;
  save(); render();
  status(scope === "project" ? "«" + p.name + "» ara és només d'aquest projecte." : "«" + p.name + "» ara és de tots els projectes.");
}

function renderRow(p, list, container) {
  const row = el("preset" + (capturingKeyFor === p.id ? " capturing" : "") + (openId === p.id ? " open" : ""));
  const main = el("main");
  row.appendChild(main);

  if (renamingId === p.id) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = p.name;
    const ok = el("chip accent", "OK");
    const commit = () => { p.name = input.value.trim() || p.name; renamingId = null; save(); render(); };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") { renamingId = null; render(); }
    });
    ok.addEventListener("click", commit);
    main.appendChild(input);
    main.appendChild(ok);
    container.appendChild(row);
    setTimeout(() => { try { input.focus(); input.select(); } catch (e) { /* res */ } }, 50);
    return;
  }

  let meta = describe(p);
  if (!isActive(p)) meta = "Projecte: " + ((p.project && p.project.name) || "?") + " · " + meta;
  const go = el("go", undefined, "Col·loca la ràfega al cursor");
  go.appendChild(el("name", p.name));
  go.appendChild(el("meta", meta));
  go.addEventListener("click", () => applyPreset(p));
  main.appendChild(go);

  const capturing = capturingKeyFor === p.id;
  const key = el("key" + (p.key || capturing ? "" : " none"), capturing ? "Prem…" : (prettyKey(p.key) || "tecla"),
    "Assigna una tecla");
  key.addEventListener("click", () => {
    capturingKeyFor = p.id; render();
    status("Prem la tecla o combinació per a «" + p.name + "» (Esc cancel·la).", "warn");
  });
  main.appendChild(key);

  const more = el("more", "···", "Opcions");
  more.addEventListener("click", () => { openId = openId === p.id ? null : p.id; render(); });
  main.appendChild(more);

  if (openId === p.id) {
    const tools = el("tools");
    const add = (label, title, fn, cls) => {
      const b = el("chip" + (cls ? " " + cls : ""), label, title);
      b.addEventListener("click", fn);
      tools.appendChild(b);
      return b;
    };
    add("Canvia el nom", "", () => { renamingId = p.id; render(); });
    add("▲", "Puja", () => moveInList(p, list, -1));
    add("▼", "Baixa", () => moveInList(p, list, 1));
    if (isGlobal(p)) add("Només aquest projecte", "Passa-la a les ràfegues d'aquest projecte", () => setScope(p, "project"));
    else {
      add("Tots els projectes", "Passa-la a les ràfegues de tots els projectes", () => setScope(p, "global"));
      if (!isMine(p)) add("Aquest projecte", "Porta-la al projecte actual", () => setScope(p, "project"));
    }
    const del = add("Esborra", "", () => {
      if (del.dataset.confirm) {
        presets = presets.filter((x) => x.id !== p.id);
        openId = null; save(); render(); status("Ràfega esborrada.");
      } else { del.dataset.confirm = "1"; del.textContent = "Segur?"; }
    }, "danger");
    row.appendChild(tools);
  }
  container.appendChild(row);
}

function render() {
  const globals = presets.filter(isGlobal);
  const mine = presets.filter(isMine);
  const others = presets.filter((p) => !isActive(p));

  const fill = (id, list) => {
    const box = $(id);
    box.innerHTML = "";
    list.forEach((p) => renderRow(p, list, box));
  };
  fill("listGlobal", globals);
  fill("listProject", mine);
  fill("listOthers", showOthers ? others : []);

  $("emptyGlobal").style.display = globals.length ? "none" : "block";
  $("emptyProject").style.display = mine.length ? "none" : "block";
  $("emptyProject").textContent = currentProject
    ? "Cap ràfega només d'aquest projecte."
    : "Obri un projecte per desar-hi ràfegues.";
  $("projectName").textContent = currentProject ? currentProject.name : "";

  const o = $("others");
  o.style.display = others.length ? "block" : "none";
  o.textContent = (showOthers ? "Amaga" : "Mostra") +
    (others.length === 1 ? " la ràfega d'un altre projecte" : " les " + others.length + " ràfegues d'altres projectes");
}

function fillTrackSelects(vc, ac) {
  const fill = (sel, prefix, count, current) => {
    let html = '<option value="preset">Com al preset</option>';
    for (let i = 0; i < count; i++) html += '<option value="' + i + '">' + prefix + (i + 1) + "</option>";
    sel.innerHTML = html;
    sel.value = current !== "preset" && Number(current) < count ? String(current) : "preset";
  };
  fill($("vDest"), "V", vc, settings.vDest);
  fill($("aDest"), "A", ac, settings.aDest);
}

async function refreshTracks() {
  let vc = 8, ac = 8;
  try {
    const { seq } = await getContext();
    vc = await seq.getVideoTrackCount();
    ac = await seq.getAudioTrackCount();
  } catch (e) { /* sense seqüència: llista genèrica */ }
  fillTrackSelects(vc, ac);
}

// Torna a mirar quin projecte i quina seqüència hi ha actius
async function sync() {
  if (await detectProject()) render();
  await refreshTracks();
}

// ------------------------------------------------------- exportar / importar
async function exportPresets() {
  try {
    const fs = uxp.storage.localFileSystem;
    const file = await fs.getFileForSaving("rafegues.json", { types: ["json"] });
    if (!file) return;
    const list = presets.filter(isActive); // les de tots els projectes i les d'aquest
    await file.write(JSON.stringify(list, null, 2), { format: uxp.storage.formats.utf8 });
    status("Exportades " + list.length + " ràfegues.");
  } catch (e) { status("Error exportant: " + e.message, "err"); }
}
async function importPresets() {
  try {
    const fs = uxp.storage.localFileSystem;
    const file = await fs.getFileForOpening({ types: ["json"] });
    if (!file) return;
    const data = JSON.parse(await file.read({ format: uxp.storage.formats.utf8 }));
    if (!Array.isArray(data)) throw new Error("El fitxer no conté ràfegues.");
    await detectProject();
    let n = 0;
    data.forEach((p) => {
      if (!p || (!p.video && !p.audio)) return;
      p.id = uid();
      // les que eren d'un projecte passen al projecte actual
      if (p.scope === "project" && currentProject) p.project = Object.assign({}, currentProject);
      else { p.scope = "global"; p.project = null; }
      if (p.key && presets.some((x) => x.key === p.key && isActive(x))) p.key = null;
      presets.push(p); n++;
    });
    save(); render();
    status("Importades " + n + " ràfegues.");
  } catch (e) { status("Error important: " + e.message, "err"); }
}

// ------------------------------------------------------------------- inici
function init() {
  load();
  $("moveAfter").checked = !!settings.moveAfter;
  $("moveAfter").addEventListener("change", (e) => { settings.moveAfter = e.target.checked; save(); });
  $("vDest").addEventListener("change", (e) => { settings.vDest = e.target.value; save(); });
  $("aDest").addEventListener("change", (e) => { settings.aDest = e.target.value; save(); });
  $("refresh").addEventListener("click", sync);
  $("captureGlobal").addEventListener("click", () => captureFromSelection("global"));
  $("captureProject").addEventListener("click", () => captureFromSelection("project"));
  $("others").addEventListener("click", () => { showOthers = !showOthers; render(); });
  $("export").addEventListener("click", exportPresets);
  $("import").addEventListener("click", importPresets);
  render();
  sync();

  // Quan es canvia de projecte o de seqüència, el panell s'actualitza sol
  try {
    const E = ppro.Constants.ProjectEvent, S = ppro.Constants.SequenceEvent;
    [E.OPENED, E.CLOSED, E.ACTIVATED, S.ACTIVATED].forEach((name) =>
      ppro.EventManager.addGlobalEventListener(name, () => { sync(); }));
  } catch (e) { /* sense esdeveniments: s'actualitza en mostrar el panell o amb ⟳ */ }
}

uxp.entrypoints.setup({
  panels: {
    rafeguesPanel: {
      show() { sync(); },
    },
  },
});

init();
