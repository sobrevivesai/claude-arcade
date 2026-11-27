// Tee Race — dibujado del mapa en Canvas 2D.
// Para que ande liviano: las capas de tiles y los quads quietos que comparten paralaje se "hornean" juntos
// en pedazos de 512×512 (una sola imagen por pedazo), y solo se dibujan en vivo los quads animados.
const CH = 16, CPX = CH * 32;   // tiles por pedazo y tamaño del pedazo en unidades del mundo
const MAX_MEM = (matchMedia('(pointer: coarse)').matches ? 90 : 170) * CPX * CPX, BUILD_PER_FRAME = 3; // memoria máxima de pedazos (en píxeles)

export function createMapRenderer(meta, bin, images) {
  // ---------- envolventes ----------
  function env(i, ms) {
    const E = meta.envs[i]; if (!E || !E.pts.length) return null;
    const P = E.pts, last = P[P.length - 1][0];
    const t = last > 0 ? ((ms % last) + last) % last : 0;
    if (t <= P[0][0]) return P[0][2];
    for (let k = 0; k < P.length - 1; k++) {
      const a = P[k], b = P[k + 1];
      if (t >= a[0] && t <= b[0]) {
        let f = (t - a[0]) / Math.max(1, b[0] - a[0]);
        if (a[1] === 0) f = 0; else if (a[1] === 2) f = f * f * f; else if (a[1] === 3) f = 1 - Math.pow(1 - f, 3); else if (a[1] === 4) f = f * f * (3 - 2 * f);
        return a[2].map((v, j) => v + (b[2][j] - v) * f);
      }
    }
    return P[P.length - 1][2];
  }
  const envMoves = i => { const E = meta.envs[i]; if (!E || E.pts.length < 2) return false; const v0 = E.pts[0][2]; return E.pts.some(p => p[2].some((v, j) => Math.abs(v - v0[j]) > 1e-3)); };
  // ---------- imágenes teñidas (se hacen una vez por color) ----------
  const tints = new Map();
  function tinted(img, r, g, b) {
    if (!img || (r > 250 && g > 250 && b > 250)) return img;
    const key = img.src + '|' + (r >> 2) + ',' + (g >> 2) + ',' + (b >> 2);
    let c = tints.get(key); if (c) return c;
    c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const t = c.getContext('2d');
    t.drawImage(img, 0, 0); t.globalCompositeOperation = 'multiply'; t.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; t.fillRect(0, 0, c.width, c.height);
    t.globalCompositeOperation = 'destination-in'; t.drawImage(img, 0, 0);
    tints.set(key, c); return c;
  }
  // ---------- quads: todo lo fijo se calcula una vez ----------
  function prepQuad(q, image) {
    const xs = q.p.slice(0, 4).map(p => p[0]), ys = q.p.slice(0, 4).map(p => p[1]);
    const Q = { q, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), pe: q.pe >= 0 && envMoves(q.pe) ? q.pe : -1, ce: q.ce >= 0 && envMoves(q.ce) ? q.ce : -1 };
    // envolventes que no se mueven: su valor queda fijo
    const ce0 = q.ce >= 0 ? env(q.ce, q.ceo) : null, pe0 = q.pe >= 0 && Q.pe < 0 ? env(q.pe, q.peo) : null;
    Q.ofs = pe0 ? [pe0[0], pe0[1], pe0[2] || 0] : null;
    const avg = k => q.c.reduce((s, c) => s + c[k], 0) / 4;
    Q.col = [avg(0), avg(1), avg(2), avg(3) / 255];
    if (ce0 && Q.ce < 0) Q.col = [Q.col[0] * ce0[0], Q.col[1] * ce0[1], Q.col[2] * ce0[2], Q.col[3] * ce0[3]];
    const img = image >= 0 ? images[image] : null;
    if (img) {
      Q.img = Q.ce < 0 ? tinted(img, Q.col[0], Q.col[1], Q.col[2]) : img;
      const us = q.uv.map(u => u[0]), vs = q.uv.map(u => u[1]);
      const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
      Q.src = [Math.max(0, u0 * img.width), Math.max(0, v0 * img.height), Math.min(img.width, (u1 - u0) * img.width), Math.min(img.height, (v1 - v0) * img.height)];
      Q.fx = q.uv[0][0] > q.uv[1][0]; Q.fy = q.uv[0][1] > q.uv[2][1];
      if (Q.src[2] < 1 || Q.src[3] < 1) Q.skip = true;
    } else {
      const c = q.c, top = [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2, (c[0][2] + c[1][2]) / 2, (c[0][3] + c[1][3]) / 510];
      const bot = [(c[2][0] + c[3][0]) / 2, (c[2][1] + c[3][1]) / 2, (c[2][2] + c[3][2]) / 2, (c[2][3] + c[3][3]) / 510];
      if (ce0 && Q.ce < 0) for (const v of [top, bot]) { v[0] *= ce0[0]; v[1] *= ce0[1]; v[2] *= ce0[2]; v[3] *= ce0[3]; }
      Q.top = top; Q.bot = bot; Q.grad = null;
    }
    if (Q.x1 - Q.x0 < 0.5 || Q.y1 - Q.y0 < 0.5 || (Q.col[3] <= 0.004 && Q.ce < 0)) Q.skip = true;
    return Q;
  }
  function drawQuad(x, Q, ms) {
    if (Q.skip) return;
    const q = Q.q;
    let a = Q.col[3], ce = null;
    if (Q.ce >= 0) { ce = env(Q.ce, ms + q.ceo); if (ce) a *= ce[3]; }
    if (a <= 0.004) return;
    x.save(); x.globalAlpha = Math.min(1, a);
    const pe = Q.pe >= 0 ? env(Q.pe, ms + q.peo) : Q.ofs;
    if (pe) { x.translate(pe[0] + q.p[4][0], pe[1] + q.p[4][1]); if (pe[2]) x.rotate(pe[2] * Math.PI / 180); x.translate(-q.p[4][0], -q.p[4][1]); }
    if (Q.img) {
      const img = ce ? tinted(Q.img, Q.col[0] * ce[0], Q.col[1] * ce[1], Q.col[2] * ce[2]) : Q.img;
      if (Q.fx || Q.fy) { const cx = (Q.x0 + Q.x1) / 2, cy = (Q.y0 + Q.y1) / 2; x.translate(cx, cy); x.scale(Q.fx ? -1 : 1, Q.fy ? -1 : 1); x.translate(-cx, -cy); }
      x.drawImage(img, Q.src[0], Q.src[1], Q.src[2], Q.src[3], Q.x0, Q.y0, Q.x1 - Q.x0, Q.y1 - Q.y0);
    } else {
      let t = Q.top, b = Q.bot;
      if (ce) { t = [t[0] * ce[0], t[1] * ce[1], t[2] * ce[2], t[3] * ce[3]]; b = [b[0] * ce[0], b[1] * ce[1], b[2] * ce[2], b[3] * ce[3]]; Q.grad = null; }
      let g = !ce && Q.grad;
      if (!g) {
        g = x.createLinearGradient(0, Q.y0, 0, Q.y1);
        g.addColorStop(0, `rgba(${t[0] | 0},${t[1] | 0},${t[2] | 0},${t[3]})`); g.addColorStop(1, `rgba(${b[0] | 0},${b[1] | 0},${b[2] | 0},${b[3]})`);
        if (!ce) Q.grad = g;
      }
      x.globalAlpha = 1; x.fillStyle = g; x.fillRect(Q.x0, Q.y0, Q.x1 - Q.x0, Q.y1 - Q.y0);
    }
    x.restore();
  }

  // ---------- se arma la lista de lo que hay que dibujar, en orden ----------
  // item: {k:'run', G, parts:[...], bbox} | {k:'live', G, quads:[...]} | {k:'players'}
  const items = []; let run = null;
  const gkey = G => G.px + ',' + G.py + ',' + G.ox + ',' + G.oy;
  const close = () => { if (run && run.parts.length) items.push(run); run = null; };
  const bbAdd = (r, x0, y0, x1, y1) => { r.bb[0] = Math.min(r.bb[0], x0); r.bb[1] = Math.min(r.bb[1], y0); r.bb[2] = Math.max(r.bb[2], x1); r.bb[3] = Math.max(r.bb[3], y1); };
  for (const G of meta.groups) for (const L of G.layers) {
    if (L.t === 'game') { close(); items.push({ k: 'players' }); continue; }
    if (L.t === 'tiles') {
      let col = (L.color || [255, 255, 255, 255]).slice();
      if (L.ce >= 0) { const e = env(L.ce, L.ceo || 0); if (e) col = [col[0] * e[0], col[1] * e[1], col[2] * e[2], col[3] * e[3]]; }
      if (col[3] <= 1) continue;
      const img = images[L.image] || null;
      const part = { t: 'tiles', L, data: new Uint8Array(bin, L.bin, L.w * L.h * 4), img: img ? tinted(img, col[0], col[1], col[2]) : null, ts: img ? img.width / 16 : 64, alpha: Math.min(1, col[3] / 255) };
      if (!run || run.key !== gkey(G)) { close(); run = { k: 'run', G, key: gkey(G), parts: [], bb: [Infinity, Infinity, -Infinity, -Infinity], id: items.length + ':' + Math.random() }; }
      run.parts.push(part); bbAdd(run, -64 * 32, -64 * 32, (L.w + 64) * 32, (L.h + 64) * 32);
      continue;
    }
    if (L.t === 'quads') {
      const Qs = L.q.map(q => prepQuad(q, L.image)).filter(Q => !Q.skip);
      if (!Qs.length) continue;
      const live = Qs.some(Q => Q.pe >= 0 || Q.ce >= 0);
      // quads enormes (cielos) o animados se dibujan en vivo; el resto se hornea con las capas
      const big = Qs.some(Q => (Q.x1 - Q.x0) * (Q.y1 - Q.y0) > 4096 * 4096);
      // paralaje muy rápido (primer plano que vuela): no conviene hornearlo
      const fast = Math.abs(G.px) > 120 || Math.abs(G.py) > 120;
      if (live || big || fast) { close(); items.push({ k: 'live', G, quads: Qs }); continue; }
      if (!run || run.key !== gkey(G)) { close(); run = { k: 'run', G, key: gkey(G), parts: [], bb: [Infinity, Infinity, -Infinity, -Infinity], id: items.length + ':' + Math.random() }; }
      run.parts.push({ t: 'quads', Qs });
      for (const Q of Qs) bbAdd(run, Q.x0 - 64, Q.y0 - 64, Q.x1 + 64, Q.y1 + 64);
    }
  }
  close();
  items.forEach((it, i) => { it.id = i; });

  // ---------- pedazos horneados ----------
  const chunks = new Map(); let tick = 0, built = 0, totalBuilt = 0, mem = 0, frameT = 0, demand = 0, lastDemand = 0;
  // los fondos con paralaje se guardan a media resolución (y en el celu el resto a 3/4): casi no se nota y ocupan la cuarta parte
  const mobile = matchMedia('(pointer: coarse)').matches;
  for (const it of items) if (it.k === 'run') it.res = !(it.G.px === 100 && it.G.py === 100) ? 0.5 : (mobile ? 0.75 : 1);
  const M = 4; // margen alrededor de cada pedazo: así el suavizado no deja rayitas entre pedazos vecinos
  function buildChunk(r, cx, cy) {
    const res = r.res, cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil((CPX + 2 * M) * res);
    const x = cv.getContext('2d'); let any = false;
    let b0 = CPX, b1 = CPX, b2 = 0, b3 = 0; const grow = (a, b, c, d) => { if (a < b0) b0 = a; if (b < b1) b1 = b; if (c > b2) b2 = c; if (d > b3) b3 = d; };
    x.scale(res, res); x.translate(M, M);
    const wx = cx * CPX, wy = cy * CPX;
    for (const part of r.parts) {
      if (part.t === 'tiles') {
        const L = part.L, img = part.img, ts = part.ts;
        x.globalAlpha = part.alpha;
        for (let ty = -1; ty <= CH; ty++) for (let tx = -1; tx <= CH; tx++) {
          let gx = cx * CH + tx, gy = cy * CH + ty;
          if (gx < -64 || gy < -64 || gx >= L.w + 64 || gy >= L.h + 64) continue;
          gx = Math.min(Math.max(gx, 0), L.w - 1); gy = Math.min(Math.max(gy, 0), L.h - 1); // afuera del mapa se repite el borde, como en DDNet
          const o = (gy * L.w + gx) * 4, idx = part.data[o], fl = part.data[o + 1];
          if (!idx) continue; any = true; grow(tx * 32, ty * 32, tx * 32 + 32, ty * 32 + 32);
          if (!img) { x.fillStyle = '#888'; x.fillRect(tx * 32, ty * 32, 32, 32); continue; }
          const sx = (idx % 16) * ts, sy = (idx >> 4) * ts;
          if (!fl) { x.drawImage(img, sx + 0.5, sy + 0.5, ts - 1, ts - 1, tx * 32, ty * 32, 32, 32); continue; }
          x.save(); x.translate(tx * 32 + 16, ty * 32 + 16);
          if (fl & 8) x.rotate(Math.PI / 2);
          x.scale(fl & 1 ? -1 : 1, fl & 2 ? -1 : 1);
          x.drawImage(img, sx + 0.5, sy + 0.5, ts - 1, ts - 1, -16, -16, 32, 32); x.restore();
        }
        x.globalAlpha = 1;
      } else {
        x.save(); x.translate(-wx, -wy);
        for (const Q of part.Qs) {
          const p = Q.ofs ? [Q.ofs[0], Q.ofs[1]] : [0, 0], rot = Q.ofs && Q.ofs[2] ? 64 : 0;
          if (Q.x1 + p[0] + rot < wx - M || Q.x0 + p[0] - rot > wx + CPX + M || Q.y1 + p[1] + rot < wy - M || Q.y0 + p[1] - rot > wy + CPX + M) continue;
          drawQuad(x, Q, 0); any = true;
          grow(Q.x0 + p[0] - wx - rot, Q.y0 + p[1] - wy - rot, Q.x1 + p[0] - wx + rot, Q.y1 + p[1] - wy + rot);
        }
        x.restore();
      }
    }
    // la parte del pedazo que tiene algo (dentro de sus límites)
    b0 = Math.max(0, Math.floor(b0)); b1 = Math.max(0, Math.floor(b1)); b2 = Math.min(CPX, Math.ceil(b2)); b3 = Math.min(CPX, Math.ceil(b3));
    if (!any || b2 <= b0 || b3 <= b1) return null;
    // se recorta (con su margen) a esa parte: menos memoria y menos píxeles para dibujar en cada cuadro
    const sx = Math.floor(b0 * res), sy = Math.floor(b1 * res), cw = Math.ceil((b2 - b0 + 2 * M) * res), chh = Math.ceil((b3 - b1 + 2 * M) * res);
    const out = document.createElement('canvas'); out.width = cw; out.height = chh;
    out.getContext('2d').drawImage(cv, sx, sy, cw, chh, 0, 0, cw, chh);
    // qué parte de la imagen se dibuja (sin el margen) y dónde
    out.sx = M * res; out.sy = M * res; out.sw = (b2 - b0) * res; out.sh = (b3 - b1) * res;
    out.ox = b0; out.oy = b1; out.ow = b2 - b0; out.oh = b3 - b1;
    return out;
  }
  function chunkFor(r, cx, cy, mayBuild) {
    const key = r.id + ':' + cx + ':' + cy;
    const c = chunks.get(key);
    if (c) { c.t = ++tick; demand += c.sz; return c.cv; }
    if (!mayBuild || built >= BUILD_PER_FRAME) return undefined;
    built++; totalBuilt++;
    const cv = buildChunk(r, cx, cy), sz = cv ? cv.width * cv.height : 0;
    chunks.set(key, { cv, t: ++tick, sz }); mem += sz; demand += sz;
    // si se pasa de memoria, se tiran los que hace más que no se ven (nunca los de este cuadro)
    while (mem > Math.max(MAX_MEM, lastDemand * 1.5)) {
      let ok = null, ot = Infinity; for (const [k, v] of chunks) if (v.sz && v.t < ot && v.t < frameT) { ot = v.t; ok = k; }
      if (!ok) break;
      mem -= chunks.get(ok).sz; chunks.delete(ok);
    }
    return cv;
  }
  function draw(x, cam, zoom, W, H, ms, drawPlayers) {
    built = 0; frameT = tick + 1; lastDemand = Math.max(demand, lastDemand * 0.99); demand = 0;
    for (const it of items) {
      if (it.off) continue;
      if (it.k === 'players') { drawPlayers(); continue; }
      const G = it.G, ccx = cam.x * G.px / 100 + G.ox, ccy = cam.y * G.py / 100 + G.oy, z = groupZoom(G, zoom, W, H);
      x.setTransform(z, 0, 0, z, Math.round(W / 2 - ccx * z), Math.round(H / 2 - ccy * z));
      const vx0 = ccx - W / 2 / z, vy0 = ccy - H / 2 / z, vx1 = ccx + W / 2 / z, vy1 = ccy + H / 2 / z;
      if (it.k === 'live') {
        for (const Q of it.quads) {
          if (Q.pe < 0) { const o = Q.ofs || [0, 0]; if (Q.x1 + o[0] < vx0 || Q.x0 + o[0] > vx1 || Q.y1 + o[1] < vy0 || Q.y0 + o[1] > vy1) continue; }
          drawQuad(x, Q, ms);
        }
        continue;
      }
      const bb = it.bb;
      const c0 = Math.floor(Math.max(vx0, bb[0]) / CPX), c1 = Math.floor(Math.min(vx1, bb[2]) / CPX);
      const r0 = Math.floor(Math.max(vy0, bb[1]) / CPX), r1 = Math.floor(Math.min(vy1, bb[3]) / CPX);
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const cv = chunkFor(it, cx, cy, true);
        if (cv) x.drawImage(cv, cv.sx, cv.sy, cv.sw, cv.sh, cx * CPX + cv.ox, cy * CPX + cv.oy, cv.ow, cv.oh);
      }
      // de paso se van preparando los pedazos de alrededor
      if (built < BUILD_PER_FRAME) for (let cy = r0 - 1; cy <= r1 + 1 && built < BUILD_PER_FRAME; cy++) for (let cx = c0 - 1; cx <= c1 + 1 && built < BUILD_PER_FRAME; cx++) {
        if (cx * CPX > bb[2] || (cx + 1) * CPX < bb[0] || cy * CPX > bb[3] || (cy + 1) * CPX < bb[1]) continue;
        chunkFor(it, cx, cy, true);
      }
    }
  }
  // arma de una todo lo que se ve desde un punto (al cargar el mapa, para no ver huecos)
  function warm(cam, zoom, W, H) {
    frameT = tick + 1;
    for (const it of items) {
      if (it.k !== 'run') continue;
      const G = it.G, ccx = cam.x * G.px / 100 + G.ox, ccy = cam.y * G.py / 100 + G.oy, bb = it.bb, z = groupZoom(G, zoom, W, H);
      const c0 = Math.floor(Math.max(ccx - W / 2 / z, bb[0]) / CPX), c1 = Math.floor(Math.min(ccx + W / 2 / z, bb[2]) / CPX);
      const r0 = Math.floor(Math.max(ccy - H / 2 / z, bb[1]) / CPX), r1 = Math.floor(Math.min(ccy + H / 2 / z, bb[3]) / CPX);
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) { built = 0; chunkFor(it, cx, cy, true); }
    }
  }
  return { items, draw, warm, stats: () => ({ items: items.length, runs: items.filter(i => i.k === 'run').length, live: items.filter(i => i.k === 'live').reduce((s, i) => s + i.quads.length, 0), chunks: chunks.size, built: totalBuilt, need: Math.round(lastDemand * 4 / 1e6), mb: Math.round(mem * 4 / 1e6) }) };
}

// ---------- zoom por grupo, como DDNet ----------
// DDNet ve siempre unas 1150×1000 unidades de mapa (según la forma de la pantalla). Cuando uno se aleja o se acerca,
// los fondos con paralaje lento (cielos, montañas lejanas) casi no cambian de tamaño: así el cielo siempre tapa la pantalla.
export function baseZoom(W, H) {
  const a = W / H; let w = Math.sqrt(1150 * 1000 * a), h = w / a;
  if (w > 1500) { w = 1500; h = w / a; }
  if (h > 1050) { h = 1050; w = h * a; }
  return W / w;
}
function groupZoom(G, zoom, W, H) {
  const pz = Math.max(0, Math.min(100, Math.max(G.px, G.py)));
  if (pz >= 100) return zoom;
  const b = baseZoom(W, H), Z = b / zoom; // Z > 1: se ve más mapa que en DDNet
  return b / (1 + (Z - 1) * pz / 100);
}

// ---------- tees ----------
const skinCache = new Map();
export function loadSkin(name) {
  if (skinCache.has(name)) return skinCache.get(name);
  const img = new Image(); img.src = 'skins/' + name + '.webp';
  const s = { img, ok: false, frozen: null };
  img.onload = () => {
    s.ok = true;
    // versión congelada: celeste y apagada
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const x = cv.getContext('2d');
    x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(150,200,255,.62)'; x.fillRect(0, 0, 256, 128);
    s.frozen = cv;
    const dk = document.createElement('canvas'); dk.width = 256; dk.height = 128; const d = dk.getContext('2d');
    d.drawImage(img, 0, 0); d.globalCompositeOperation = 'source-atop'; d.fillStyle = 'rgba(0,0,0,.45)'; d.fillRect(0, 0, 256, 128);
    s.dark = dk;
  };
  skinCache.set(name, s); return s;
}
// partes del skin de Teeworlds (256x128, celdas de 32)
const P = { body: [0, 0, 96, 96], bodyO: [96, 0, 96, 96], foot: [192, 32, 64, 32], footO: [192, 64, 64, 32], hand: [192, 0, 32, 32], handO: [224, 0, 32, 32],
  eye: { normal: [64, 96, 32, 32], angry: [96, 96, 32, 32], pain: [128, 96, 32, 32], happy: [160, 96, 32, 32], dead: [192, 96, 32, 32], surprise: [224, 96, 32, 32] } };

// t: {x, y, aimX, aimY, vx, grounded, frozen, eyes, walk, skin, alpha}
export function drawTee(x, t) {
  const S = loadSkin(t.skin); if (!S.ok) return;
  const img = t.frozen && S.frozen ? S.frozen : S.img, base = 64;
  const al = Math.hypot(t.aimX, t.aimY) || 1, dx = t.aimX / al, dy = t.aimY / al;
  x.save(); x.globalAlpha = t.alpha ?? 1; x.translate(t.x, t.y);
  // pies: quietos, caminando (balanceo) o en el aire
  let bf = [-7, 10, 0], ff = [7, 10, 0];
  if (!t.grounded) { bf = [-3, 0, -0.1]; ff = [3, 0, -0.1]; }
  else if (Math.abs(t.vx) > 0.5) { const p = t.walk; bf = [-7 + Math.sin(p) * 9, 10 - Math.max(0, Math.cos(p)) * 4, Math.sin(p) * 0.3]; ff = [7 - Math.sin(p) * 9, 10 - Math.max(0, -Math.cos(p)) * 4, -Math.sin(p) * 0.3]; }
  const bodyY = -4;
  const foot = (f, o, dark) => { x.save(); x.translate(f[0], f[1]); x.rotate(f[2] * (t.aimX < 0 ? -1 : 1)); if (t.aimX < 0) x.scale(-1, 1); const r = o ? P.footO : P.foot; x.drawImage(dark && S.dark && !t.frozen ? S.dark : img, r[0], r[1], r[2], r[3], -base / 2, -base / 4, base, base / 2); x.restore(); };
  const body = o => { const r = o ? P.bodyO : P.body; x.drawImage(img, r[0], r[1], r[2], r[3], -base / 2, bodyY - base / 2, base, base); };
  foot(bf, true); body(true); foot(ff, true);
  foot(bf, false, true); body(false);
  // ojos
  const eye = P.eye[t.frozen ? 'pain' : t.eyes || 'normal'], es = base * 0.4, sep = (0.075 - 0.010 * Math.abs(dx)) * base;
  const ox = dx * 0.125 * base, oy = (-0.05 + dy * 0.10) * base + bodyY;
  x.drawImage(img, eye[0], eye[1], eye[2], eye[3], ox - sep - es / 2, oy - es / 2, es, es);
  x.save(); x.translate(ox + sep, oy); x.scale(-1, 1); x.drawImage(img, eye[0], eye[1], eye[2], eye[3], -es / 2, -es / 2, es, es); x.restore();
  foot(ff, false);
  x.restore();
}
// mano y martillo apuntando
export function drawHammer(x, game, t) {
  if (!game.complete) return;
  const a = Math.atan2(t.aimY, t.aimX), sw = t.swing || 0;
  x.save(); x.translate(t.x, t.y); x.globalAlpha = t.alpha ?? 1;
  const flip = t.aimX < 0;
  x.rotate(flip ? -(Math.PI / 2) + 0.7 - sw * 1.6 : (Math.PI / 2) - 0.7 + sw * 1.6);
  x.translate(0, -30); if (flip) x.scale(-1, 1);
  // sprite del martillo en game.png: celdas (2,1) de 4x3 en una grilla de 32
  x.drawImage(game, 64, 32, 128, 96, -24, -28, 64, 48);
  x.restore();
  return a;
}
export function drawHook(x, game, t) {
  if (!game.complete) return;
  const dx = t.hx - t.x, dy = t.hy - t.y, d = Math.hypot(dx, dy); if (d < 2) return;
  const a = Math.atan2(dy, dx);
  x.save(); x.translate(t.x, t.y); x.rotate(a); x.globalAlpha = t.alpha ?? 1;
  for (let s = 24; s < d - 8; s += 24) x.drawImage(game, 64, 0, 32, 32, s - 12, -8, 24, 16);
  x.translate(d, 0); x.drawImage(game, 96, 0, 64, 32, -24, -8, 32, 16);
  x.restore();
}
