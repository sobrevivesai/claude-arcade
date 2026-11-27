// Tee Race — juego de carreras cooperativas al estilo DDraceNetwork, con sus mapas, skins y física.
import { TICK, PHYS, HOOK, EV, buildCollision, newCore, coreTick, coreDeferred, coreMove, quantize, ddraceTiles, jumpRules, hammerHits, isOnGround } from './physics.js';
import { createMapRenderer, drawTee, drawHook, drawHammer, loadSkin } from './render.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem('tr:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('tr:' + k, JSON.stringify(v)); } catch { /* sin storage */ } } };
const MAPS = [
  { id: 'tutorial', name: 'Tutorial', by: 'unique2 & Alisa', lvl: 'Para aprender' },
  { id: 'learntoplay', name: 'LearnToPlay', by: 'Tridemy & Cøke', lvl: 'Fácil' },
  { id: 'sunny', name: 'Sunny Side Up', by: 'Ravie', lvl: 'Fácil' },
  { id: 'goldmine', name: 'Gold Mine', by: 'BµmM', lvl: 'Media' },
  { id: 'tsunami', name: 'Tsunami', by: 'louis', lvl: 'Difícil' },
];
const cv = $('cv'), x = cv.getContext('2d');
const game = new Image(); game.src = 'img/game.webp';
let W = 0, H = 0, DPR = 1;
// resolución de dibujo: 1 píxel por píxel CSS en compu, un poco menos en el celu (se nota poco y va mucho más fluido)
function resize() { DPR = matchMedia('(pointer: coarse)').matches ? 0.8 : 1; W = cv.width = Math.round(innerWidth * DPR); H = cv.height = Math.round(innerHeight * DPR); x.imageSmoothingQuality = 'low'; }
addEventListener('resize', resize); resize();

// ---------- sonidos (originales de Teeworlds/DDNet) ----------
let AC = null; const SND = {}; let muted = store.get('mute', false);
const SNDS = { jump: 'foley_dbljump-01', land: 'foley_land-01', hook: 'hook_attach-01', hooknope: 'hook_noattach-01', hammer: 'wp_hammer_swing-01', hit: 'wp_hammer_hit-01', spawn: 'vo_teefault_spawn-01', pain: 'vo_teefault_pain_short-01', finish: 'sfx_ctf_cap_pl', msg: 'sfx_msg-client', cry: 'vo_teefault_cry-01', step: 'foley_foot_left-01' };
async function loadSounds() {
  try { AC = new AudioContext(); } catch { return; }
  for (const [k, f] of Object.entries(SNDS)) fetch('snd/' + f + '.mp3').then(r => r.arrayBuffer()).then(b => AC.decodeAudioData(b)).then(d => { SND[k] = d; }).catch(() => {});
}
function play(k, vol = 0.5) { if (muted || !AC || !SND[k]) return; if (AC.state === 'suspended') AC.resume(); const s = AC.createBufferSource(), g = AC.createGain(); s.buffer = SND[k]; g.gain.value = vol; s.connect(g).connect(AC.destination); s.start(); }

// ---------- estado ----------
let MAP = null, C = null, R = null, mapId = null, loading = false;
let me = null;          // {core, st, skin, name}
const remote = new Map(); // id -> {buf:[{t,s}], name, skin, last}
let myId = 'solo', myName = 'Vos', mySkin = store.get('skin', 'default');
let skins = ['default'];
const best = new Map(); // id -> {name, time}
let userZoom = store.get('zoom', 1);
let ended = false, tickN = 0;

async function loadMap(id) {
  if (loading) return; loading = true; $('loading').hidden = false; $('loading').textContent = 'Cargando ' + (MAPS.find(m => m.id === id) || {}).name + '…';
  try {
    const meta = await (await fetch('maps/' + id + '.json')).json();
    const raw = await (await fetch('maps/' + id + '.dat')).arrayBuffer();
    const bin = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const imgs = await Promise.all(meta.images.map(im => im ? new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = 'maps/' + im.file; }) : null));
    MAP = meta; C = buildCollision(meta, bin); R = createMapRenderer(meta, bin, imgs); mapId = id;
    best.clear(); spawn(); renderBoard();
    camX = me.core.x; camY = me.core.y; R.warm({ x: camX, y: camY }, viewZoom(), W, H);
    $('mapName').textContent = (MAPS.find(m => m.id === id) || {}).name || id;
  } catch (e) { console.error(e); toast('No se pudo cargar el mapa'); }
  loading = false; $('loading').hidden = true;
}
function spawn() {
  const s = C.spawns[Math.floor(Math.random() * C.spawns.length)];
  me = { core: newCore(s[0], s[1]), st: { tick: 0, start: null, time: 0, check: 0, finished: false }, swing: 0, reload: 0, walk: 0, eyes: 'normal', eyeT: 0, prevJump: false };
  // si el spawn queda lejos, la cámara salta directo (no recorre el mapa)
  if (Math.hypot(me.core.x - camX, me.core.y - camY) > 900) { camX = me.core.x; camY = me.core.y; }
  play('spawn', 0.4);
}

// ---------- entrada ----------
const K = {}; let mouse = { x: 0, y: 0, l: false, r: false }, aim = { x: 100, y: 0 };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  K[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyK' && me) { spawn(); toast('💀 Reiniciaste'); }
  if (e.code === 'Escape') toggleMenu();
  if (e.code === 'Tab') { e.preventDefault(); $('board').classList.add('show'); }
});
addEventListener('keyup', e => { K[e.code] = false; if (e.code === 'Tab') $('board').classList.remove('show'); });
cv.addEventListener('mousemove', e => { mouse.x = e.clientX * DPR; mouse.y = e.clientY * DPR; });
cv.addEventListener('mousedown', e => { if (!AC) loadSounds(); if (e.button === 0) mouse.l = true; if (e.button === 2) mouse.r = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { userZoom = Math.min(1.8, Math.max(0.5, userZoom * (e.deltaY > 0 ? 0.92 : 1.08))); store.set('zoom', userZoom); e.preventDefault(); }, { passive: false });
addEventListener('keydown', () => { if (!AC) loadSounds(); }, { once: true });

// táctil: palanca a la izquierda, apuntar + hook a la derecha, botones de salto y martillo
const touch = { move: null, aim: null, jump: false, hammer: false, dir: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');
cv.addEventListener('touchstart', e => {
  if (!AC) loadSounds();
  for (const t of e.changedTouches) {
    const px = t.clientX * DPR, py = t.clientY * DPR;
    if (px < W * 0.4 && !touch.move) touch.move = { id: t.identifier, x0: px, y0: py, x: px, y: py };
    else if (!touch.aim) { touch.aim = { id: t.identifier, x: px, y: py }; aimFromScreen(px, py); }
  }
  e.preventDefault();
}, { passive: false });
cv.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    const px = t.clientX * DPR, py = t.clientY * DPR;
    if (touch.move && t.identifier === touch.move.id) { touch.move.x = px; touch.move.y = py; }
    if (touch.aim && t.identifier === touch.aim.id) { touch.aim.x = px; touch.aim.y = py; aimFromScreen(px, py); }
  }
  e.preventDefault();
}, { passive: false });
const tend = e => { for (const t of e.changedTouches) { if (touch.move && t.identifier === touch.move.id) touch.move = null; if (touch.aim && t.identifier === touch.aim.id) touch.aim = null; } };
cv.addEventListener('touchend', tend); cv.addEventListener('touchcancel', tend);
for (const [id, k] of [['btnJump', 'jump'], ['btnHammer', 'hammer']]) {
  const b = $(id);
  b.addEventListener('touchstart', e => { touch[k] = true; e.preventDefault(); }, { passive: false });
  b.addEventListener('touchend', e => { touch[k] = false; e.preventDefault(); }, { passive: false });
}
let camX = 0, camY = 0, zoom = 1;
const viewZoom = () => Math.min(W / 1300, H / 760) * userZoom * (isTouch && W < H ? 1.25 : 1);
function aimFromScreen(px, py) { if (!me) return; const sx = (me.core.x - camX) * zoom + W / 2, sy = (me.core.y - camY) * zoom + H / 2; aim.x = (px - sx) / zoom; aim.y = (py - sy) / zoom; }

function readInput() {
  let dir = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
  let jump = !!(K.Space || K.KeyW || K.ArrowUp), hook = mouse.r || !!K.ShiftLeft, fire = mouse.l;
  if (isTouch) {
    if (touch.move) { const d = (touch.move.x - touch.move.x0) / DPR; dir = d > 18 ? 1 : d < -18 ? -1 : 0; if ((touch.move.y0 - touch.move.y) / DPR > 45) jump = true; }
    if (touch.jump) jump = true; if (touch.hammer) fire = true;
    hook = !!touch.aim;
  } else if (me) aimFromScreen(mouse.x, mouse.y);
  if (Math.hypot(aim.x, aim.y) < 1) aim.x = 1;
  return { dir, jump, hook, fire, tx: aim.x, ty: aim.y };
}

// ---------- simulación (50 ticks por segundo, como DDNet) ----------
function othersNow() {
  const list = []; const now = performance.now();
  for (const [id, r] of remote) { const s = r.cur; if (!s || now - r.last > 4000) continue; list.push({ id, x: s.x, y: s.y, vx: s.vx, vy: s.vy, hooked: s.hk, solo: false }); }
  return list;
}
function step() {
  if (!me || !C) return;
  const c = me.core, st = me.st; st.tick++; tickN++;
  me.px = c.x; me.py = c.y; me.phx = c.hx; me.phy = c.hy;
  const inp = readInput();
  // freeze: sin control
  if (c.freeze > 0) { c.freeze--; inp.dir = 0; inp.jump = false; inp.hook = false; inp.fire = false; if (c.freeze === 1) c.freeze = 0; }
  if (c.deep) { c.freeze = Math.max(c.freeze, 2); inp.dir = 0; inp.jump = false; inp.hook = false; }
  if (c.live) { inp.dir = 0; inp.jump = false; }
  const others = othersNow(), px = c.x, py = c.y, wasHook = c.hookState;
  coreTick(C, c, inp, others);
  if (c.events & (EV.GROUND_JUMP | EV.AIR_JUMP)) play('jump', 0.35);
  if (c.events & (EV.HOOK_ATTACH_GROUND | EV.HOOK_ATTACH_PLAYER)) play('hook', 0.4);
  if (c.events & EV.HOOK_HIT_NOHOOK) play('hooknope', 0.35);
  // martillo
  if (me.reload > 0) me.reload--;
  if (inp.fire && me.reload <= 0) {
    const l = Math.hypot(inp.tx, inp.ty), hits = hammerHits(c, inp.tx / l, inp.ty / l, others);
    me.swing = 1; me.reload = hits.length ? 16 : 6; play(hits.length ? 'hit' : 'hammer', 0.4);
    for (const h of hits) Arcade.send('hit', { fx: h.fx, fy: h.fy }, { to: h.id });
  }
  me.swing = Math.max(0, me.swing - 0.12);
  // reglas DDRace
  coreDeferred(c, myId, others);
  coreMove(C, c, others);
  quantize(c);
  const evs = ddraceTiles(C, c, st, px, py);
  jumpRules(c);
  for (const e of evs) {
    if (e === 'die') { play('pain', 0.5); spawn(); return; }
    if (e === 'start' && !st.started) { st.start = st.tick; st.started = true; st.finished = false; }
    else if (e === 'start' && st.finished) { st.start = st.tick; st.finished = false; }
    if (e === 'finish' && st.start != null && !st.finished) finish((st.tick - st.start) / TICK);
    if (e === 'freeze') { play('pain', 0.3); me.eyes = 'pain'; me.eyeT = 30; }
  }
  if (st.start != null && !st.finished) st.time = (st.tick - st.start) / TICK;
  const gr = isOnGround(C, c.x, c.y, PHYS);
  if (gr && !me.gr && c.vy >= 0) play('land', 0.2);
  me.gr = gr;
  if (gr && Math.abs(c.vx) > 0.5) me.walk += Math.abs(c.vx) * 0.045;
  if (me.eyeT > 0 && --me.eyeT === 0) me.eyes = 'normal';
  if (tickN % 2 === 0 && Arcade.isOnline()) {
    Arcade.send('p', { x: c.x, y: c.y, vx: Math.round(c.vx * 10) / 10, vy: Math.round(c.vy * 10) / 10, hs: c.hookState, hx: c.hx, hy: c.hy, hk: c.hooked, ax: Math.round(inp.tx), ay: Math.round(inp.ty), fz: c.freeze > 0 || c.deep ? 1 : 0, sw: Math.round(me.swing * 10) / 10, gr: gr ? 1 : 0, t: st.start != null && !st.finished ? Math.round(st.time * 100) / 100 : null, m: mapId }, { volatile: true });
  }
}
function finish(t) {
  me.st.finished = true; me.st.time = t; play('finish', 0.6);
  const prev = best.get(myId);
  const pb = !prev || t < prev.time;
  if (pb) best.set(myId, { name: myName, time: t });
  toast(`🏁 ¡Llegaste! ${fmt(t)}${pb ? ' · ¡récord!' : ''}`, 3500);
  if (Arcade.isOnline()) Arcade.send('fin', { t, m: mapId });
  saveRecord(t); renderBoard();
}
function saveRecord(t) { const r = store.get('rec', {}); if (!r[mapId] || t < r[mapId]) { r[mapId] = t; store.set('rec', r); } }
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ':' + String(Math.floor(s)).padStart(2, '0') : Math.floor(s)) + '.' + String(Math.floor((s % 1) * 100)).padStart(2, '0'); };

// ---------- dibujo ----------
function lerp(a, b, k) { return a + (b - a) * k; }
function remoteState(r) {
  // se dibuja un poco atrás en el tiempo (según cuán parejos llegan los paquetes) para que se vea suave
  const delay = Math.max(70, Math.min(260, (r.gap || 40) + 3 * (r.jit || 10) + 25));
  const t = performance.now() - delay, B = r.buf;
  if (!B.length) return null;
  const L = B[B.length - 1];
  if (t > L.t) {
    // se atrasó el paquete: se sigue un ratito con la velocidad que traía
    const k = Math.min(5, (t - L.t) / (1000 / TICK));
    return { ...L.s, x: L.s.x + L.s.vx * k, y: L.s.y + L.s.vy * k, hx: L.s.hx + L.s.vx * k, hy: L.s.hy + L.s.vy * k };
  }
  for (let i = B.length - 1; i > 0; i--) if (B[i - 1].t <= t) {
    const a = B[i - 1], b = B[i], k = Math.min(1, Math.max(0, (t - a.t) / Math.max(1, b.t - a.t)));
    return { ...b.s, x: lerp(a.s.x, b.s.x, k), y: lerp(a.s.y, b.s.y, k), hx: lerp(a.s.hx, b.s.hx, k), hy: lerp(a.s.hy, b.s.hy, k) };
  }
  return B[0].s;
}
// mi tee entre el tick anterior y el actual (la física va a 50 por segundo y la pantalla a 60 o más)
function myRenderPos() {
  const c = me.core, a = Math.min(1, acc / (1000 / TICK));
  if (me.px == null || Math.hypot(c.x - me.px, c.y - me.py) > 200) return [c.x, c.y, c.hx, c.hy];
  return [lerp(me.px, c.x, a), lerp(me.py, c.y, a), lerp(me.phx, c.hx, a), lerp(me.phy, c.hy, a)];
}
function drawPlayers() {
  x.setTransform(zoom, 0, 0, zoom, W / 2 - camX * zoom, H / 2 - camY * zoom);
  const list = [];
  for (const [id, r] of remote) {
    if (r.cur && r.cur.m !== mapId) continue;
    const s = remoteState(r); if (!s || performance.now() - r.last > 4000) continue;
    r.walk = (r.walk || 0) + Math.abs(s.vx) * 0.045;
    list.push({ id, x: s.x, y: s.y, hx: s.hx, hy: s.hy, hs: s.hs, aimX: s.ax, aimY: s.ay, vx: s.vx, grounded: s.gr, frozen: s.fz, walk: r.walk, skin: r.skin || 'default', name: r.name, swing: s.sw, alpha: 0.92 });
  }
  if (me) { const c = me.core, [rx, ry, rhx, rhy] = myRenderPos(); list.push({ id: myId, me: true, x: rx, y: ry, hx: rhx, hy: rhy, hs: c.hookState, aimX: aim.x, aimY: aim.y, vx: c.vx, grounded: me.gr, frozen: c.freeze > 0 || c.deep, walk: me.walk, skin: mySkin, name: myName, swing: me.swing, eyes: me.eyes }); }
  for (const t of list) if (t.hs === HOOK.FLYING || t.hs === HOOK.GRABBED) drawHook(x, game, t);
  for (const t of list) { drawHammer(x, game, t); drawTee(x, t); }
  // nombres y freeze
  x.textAlign = 'center'; x.font = 'bold 15px Fredoka, Arial, sans-serif';
  for (const t of list) {
    if (!t.me) { x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,.6)'; x.strokeText(t.name, t.x, t.y - 46); x.fillStyle = '#fff'; x.fillText(t.name, t.x, t.y - 46); }
    if (t.frozen) { x.font = '20px sans-serif'; x.fillText('❄️', t.x, t.y - (t.me ? 44 : 64)); x.font = 'bold 15px Fredoka, Arial, sans-serif'; }
  }
}
let lastFrame = performance.now(), acc = 0;
const perf = { work: 0, fps: 0, n: 0 };
function frame(now) {
  const t0 = performance.now();
  const dt = Math.min(250, now - lastFrame); lastFrame = now; acc += dt;
  while (acc >= 1000 / TICK) { step(); acc -= 1000 / TICK; }
  for (const r of remote.values()) r.cur = r.buf.length ? r.buf[r.buf.length - 1].s : null;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.fillStyle = '#7fb0d8'; x.fillRect(0, 0, W, H);
  if (me && R) {
    zoom = viewZoom();
    const [tx, ty] = myRenderPos();
    camX = tx; camY = ty; // cámara pegada al tee, como en DDNet
    R.draw(x, { x: camX, y: camY }, zoom, W, H, now, drawPlayers, true);
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  hud();
  perf.work = perf.work * 0.95 + (performance.now() - t0) * 0.05; perf.fps = perf.fps * 0.95 + (dt > 0 ? 1000 / dt : 60) * 0.05; perf.n++;
  requestAnimationFrame(frame);
}
function hud() {
  if (!me) return;
  $('timer').textContent = me.st.start != null ? fmt(me.st.time) : '0.00';
  $('timer').classList.toggle('done', me.st.finished);
  $('frz').hidden = !(me.core.freeze > 0 || me.core.deep);
  if (me.core.freeze > 0) $('frz').textContent = '❄️ Congelado ' + Math.ceil(me.core.freeze / TICK);
  if (me.core.deep) $('frz').textContent = '🧊 Deep freeze';
  // palanca táctil
  const s = $('stick'); if (touch.move) { s.hidden = false; s.style.left = touch.move.x0 / DPR + 'px'; s.style.top = touch.move.y0 / DPR + 'px'; s.firstElementChild.style.transform = `translate(${Math.max(-40, Math.min(40, (touch.move.x - touch.move.x0) / DPR))}px, ${Math.max(-40, Math.min(40, (touch.move.y - touch.move.y0) / DPR))}px)`; } else s.hidden = true;
}

// ---------- tabla, menú y skins ----------
function renderBoard() {
  const rows = [];
  rows.push({ id: myId, name: myName, time: (best.get(myId) || {}).time, skin: mySkin, me: true });
  for (const [id, r] of remote) rows.push({ id, name: r.name, time: (best.get(id) || {}).time, skin: r.skin, run: r.cur && r.cur.t });
  rows.sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));
  const rec = store.get('rec', {})[mapId];
  $('board').innerHTML = `<h3>${esc((MAPS.find(m => m.id === mapId) || {}).name || '')}</h3>` + rows.map((r, i) => `<div class="${r.me ? 'me' : ''}"><span>${r.time != null ? ['🥇', '🥈', '🥉'][i] || (i + 1) : '·'}</span><b>${esc(r.name)}</b><i>${r.time != null ? fmt(r.time) : r.run != null ? '⏱ ' + fmt(r.run) : '—'}</i></div>`).join('') + (rec ? `<small>Tu récord en este mapa: ${fmt(rec)}</small>` : '');
}
function toggleMenu(force) {
  const m = $('menu'), open = force ?? m.hidden;
  m.hidden = !open; if (open) renderMenu();
}
function renderMenu() {
  const host = !Arcade.isOnline() || Arcade.isHost();
  $('menuMaps').innerHTML = MAPS.map(m => `<button data-map="${m.id}" class="${m.id === mapId ? 'on' : ''}" ${host ? '' : 'disabled'}><b>${esc(m.name)}</b><small>${esc(m.lvl)} · ${esc(m.by)}</small></button>`).join('');
  $('menuHint').textContent = host ? '' : 'El mapa lo elige el host';
  $('skinList').innerHTML = skins.map(s => `<button data-skin="${esc(s)}" class="${s === mySkin ? 'on' : ''}" title="${esc(s)}"><canvas width="64" height="64" data-sk="${esc(s)}"></canvas></button>`).join('');
  $('skinList').querySelectorAll('canvas').forEach(c => { const sk = loadSkin(c.dataset.sk); const d = () => { const g = c.getContext('2d'); g.clearRect(0, 0, 64, 64); drawTee(g, { x: 32, y: 36, aimX: 1, aimY: 0.2, vx: 0, grounded: true, skin: c.dataset.sk, walk: 0 }); }; if (sk.ok) d(); else sk.img.addEventListener('load', () => setTimeout(d, 0), { once: true }); });
  $('btnEnd').hidden = !(Arcade.isOnline() && Arcade.isHost());
  $('mute').textContent = muted ? '🔇 Sonido apagado' : '🔊 Sonido';
}
$('menu').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.map && !b.disabled) { if (Arcade.isOnline()) Arcade.send('map', { m: b.dataset.map }); loadMap(b.dataset.map); toggleMenu(false); }
  if (b.dataset.skin) { mySkin = b.dataset.skin; store.set('skin', mySkin); if (Arcade.isOnline()) Arcade.send('skin', { s: mySkin }); renderMenu(); }
  if (b.id === 'closeMenu') toggleMenu(false);
  if (b.id === 'mute') { muted = !muted; store.set('mute', muted); renderMenu(); }
  if (b.id === 'btnKill') { spawn(); toggleMenu(false); }
  if (b.id === 'btnEnd') endGame();
});
$('btnMenu').addEventListener('click', () => toggleMenu());
$('btnBoard').addEventListener('click', () => $('board').classList.toggle('show'));
function toast(t, ms = 2200) { const e = $('toast'); e.innerHTML = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), ms); }
function endGame() {
  if (ended) return; ended = true;
  let bt = Infinity, w = [];
  for (const [id, b] of best) { if (b.time < bt - 1e-6) { bt = b.time; w = [id]; } else if (Math.abs(b.time - bt) < 1e-6) w.push(id); }
  Arcade.end({ winners: w.filter(id => id !== 'solo'), text: w.length ? '' : 'Nadie llegó a la meta' });
}

// ---------- red ----------
function setupNet() {
  Arcade.on('p', (s, from) => {
    if (!s || typeof s.x !== 'number') return;
    let r = remote.get(from); if (!r) { r = { buf: [], name: nameOf(from), skin: 'default', last: 0 }; remote.set(from, r); renderBoard(); }
    const now = performance.now();
    if (r.last) { const g = now - r.last; r.jit = (r.jit || 10) * 0.9 + Math.abs(g - (r.gap || 40)) * 0.1; r.gap = (r.gap || 40) * 0.9 + g * 0.1; }
    // si cambió de lugar de golpe (respawn, tele), no se interpola
    const pv = r.buf.length && r.buf[r.buf.length - 1].s; if (pv && Math.hypot(pv.x - s.x, pv.y - s.y) > 300) r.buf.length = 0;
    r.buf.push({ t: now, s }); if (r.buf.length > 16) r.buf.shift(); r.last = now;
  });
  Arcade.on('hit', d => {
    if (!me || !d) return;
    const fx = Math.max(-20, Math.min(20, +d.fx || 0)), fy = Math.max(-20, Math.min(20, +d.fy || 0));
    me.core.vx += fx; me.core.vy += fy; if (me.core.freeze > 0 && !me.core.deep) me.core.freeze = 0; play('hit', 0.4);
  });
  Arcade.on('fin', (d, from) => {
    if (!d || d.m !== mapId || typeof d.t !== 'number') return;
    const p = best.get(from); if (!p || d.t < p.time) best.set(from, { name: nameOf(from), time: d.t });
    toast(`🏁 ${esc(nameOf(from))} llegó: ${fmt(d.t)}`); play('msg', 0.4); renderBoard();
  });
  Arcade.on('skin', (d, from) => { const r = remote.get(from); if (r && d && typeof d.s === 'string' && skins.includes(d.s)) r.skin = d.s; else if (d && skins.includes(d.s)) remote.set(from, { buf: [], name: nameOf(from), skin: d.s, last: 0 }); });
  Arcade.on('map', (d, from) => { if (from !== Arcade.ctx.hostId || !d || !MAPS.some(m => m.id === d.m)) return; if (d.m !== mapId) { loadMap(d.m); toast('🗺️ Mapa: ' + MAPS.find(m => m.id === d.m).name); } });
  Arcade.on('hi', (d, from) => {
    Arcade.send('skin', { s: mySkin }, { to: from });
    if (Arcade.isHost()) Arcade.send('map', { m: mapId }, { to: from });
    if (best.has(myId)) Arcade.send('fin', { t: best.get(myId).time, m: mapId }, { to: from });
  });
  Arcade.onPlayerLeft(id => { remote.delete(id); best.delete(id); renderBoard(); });
}
function nameOf(id) { const p = Arcade.players.find(q => q.id === id); return p ? p.name : 'Tee'; }

// ---------- inicio ----------
(async () => {
  try { skins = await (await fetch('skins/list.json')).json(); } catch { /* lista por defecto */ }
  if (!skins.includes(mySkin)) mySkin = 'default';
  const ctx = await Arcade.ready();
  myId = ctx.me.id; myName = ctx.me.name;
  if (Arcade.admin) {
    Arcade.admin.define([{ id: 'tr.finish', label: 'Terminar la partida ya', type: 'button' }]);
    Arcade.admin.on('tr.finish', () => { if (Arcade.isHost()) endGame(); });
  }
  if (Arcade.isOnline()) setupNet();
  await loadMap(MAPS[0].id);
  if (Arcade.isOnline()) { Arcade.send('hi', {}); Arcade.send('skin', { s: mySkin }); }
  requestAnimationFrame(frame);
  if (!store.get('help', false)) { $('help').hidden = false; store.set('help', true); }
})();
$('help').addEventListener('click', () => { $('help').hidden = true; });
window.__tr = { perf, get R() { return R; }, get me() { return me; }, get C() { return C; }, remote, loadMap };
