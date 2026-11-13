const express = require('express'), http = require('http');
const { WebSocketServer } = require('ws');
const SH = require('./public/shared.js');
const app = express();
app.use(express.static(__dirname + '/public'));
app.get('/health', (q, s) => s.send('ok'));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const CFG = { roundTime: 90, maxRounds: 3, wins: 2, rbreak: 3.5, cool: 550 };
const rooms = new Map();
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const f2 = n => Math.round(n * 100) / 100;

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s;
  do { s = ''; for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)]; } while (rooms.has(s));
  return s;
}
function mk(ws, name, i) { return { ws, name, i, x: 0, z: i ? 18 : -18, yaw: i ? Math.PI : 0, pitch: .04, hp: 100, c: false, d: 0, last: Date.now(), lastShot: 0, rm: false }; }
function resetP(p) { p.x = 0; p.z = p.i ? 18 : -18; p.yaw = p.i ? Math.PI : 0; p.pitch = .04; p.hp = 100; p.c = false; p.d = 0; p.last = Date.now(); }
function startRound(r) { r.pl.forEach(resetP); r.arrows = []; r.tl = CFG.roundTime; r.ph = 'count'; r.cd = 3; r.final = false; }
function newMatch(r) { r.r = 1; r.sc = [0, 0]; r.win = -1; r.pl.forEach(p => p.rm = false); startRound(r); }

function endRound(r, w, ko) {
  if (w >= 0) r.sc[w]++;
  r.ev.push({ e: 'rend', w, ko });
  r.ph = 'rend'; r.rb = CFG.rbreak;
  if (r.sc.some(s => s >= CFG.wins) || r.r >= CFG.maxRounds) {
    r.final = true; r.win = r.sc[0] > r.sc[1] ? 0 : (r.sc[1] > r.sc[0] ? 1 : -1);
  }
}

function stepArrows(r, dt) {
  const N = 6, h = dt / N;
  r.arrows = r.arrows.filter(a => {
    a.life -= dt; if (a.life <= 0) return false;
    for (let s = 0; s < N; s++) {
      a.vy -= SH.GRAV * h; a.x += a.vx * h; a.y += a.vy * h; a.z += a.vz * h;
      const sp = Math.hypot(a.vx, a.vy, a.vz) || 1;
      const stick = k => { r.ev.push({ e: 'stick', k, x: f2(a.x), y: f2(a.y), z: f2(a.z), dx: f2(a.vx / sp), dy: f2(a.vy / sp), dz: f2(a.vz / sp) }); return false; };
      if (a.y <= .02) return stick('g');
      for (const b of SH.boxes) if (a.y < b.h && Math.abs(a.x - b.x) < b.hx && Math.abs(a.z - b.z) < b.hz) return stick('w');
      for (const t of SH.trees) if (a.y < 9 && Math.hypot(a.x - t.x, a.z - t.z) < SH.TR * t.s * .8) return stick('t');
      const v = r.pl[1 - a.o];
      if (v.hp > 0 && Math.hypot(a.x - v.x, a.z - v.z) < .38) {
        const H = v.c ? SH.CROUCH : SH.STAND;
        if (a.y > 0 && a.y < H) {
          const head = a.y > H - .3;
          const dmg = (head ? 100 : 34) * (.4 + .6 * a.pw);
          v.hp = Math.max(0, v.hp - dmg);
          r.ev.push({ e: 'hit', i: v.i, head, x: f2(a.x), y: f2(a.y), z: f2(a.z) });
          return false;
        }
      }
    }
    return true;
  });
}

function tick(r, dt) {
  r.ev = [];
  const [a, b] = r.pl; if (!a || !b || r.ph === 'wait') return;
  if (r.ph === 'count') { r.cd -= dt; if (r.cd <= 0) { r.ph = 'fight'; r.ev.push({ e: 'fight' }); } }
  else if (r.ph === 'fight') {
    r.tl -= dt; stepArrows(r, dt);
    const dead = a.hp <= 0 || b.hp <= 0;
    if (dead || r.tl <= 0) {
      let w = -1;
      if (dead) { if (a.hp <= 0 && b.hp > 0) w = 1; else if (b.hp <= 0 && a.hp > 0) w = 0; }
      else w = a.hp > b.hp ? 0 : (b.hp > a.hp ? 1 : -1);
      r.tl = Math.max(0, r.tl); endRound(r, w, dead);
    }
  } else if (r.ph === 'rend') {
    r.rb -= dt; stepArrows(r, dt);
    if (r.rb <= 0) { if (r.final) r.ph = 'over'; else { r.r++; startRound(r); } }
  }
  const msg = {
    t: 's', ph: r.ph, r: r.r, tl: +r.tl.toFixed(1), cd: +r.cd.toFixed(2), sc: r.sc, win: r.win,
    p: r.pl.map(p => ({ x: f2(p.x), z: f2(p.z), yaw: f2(p.yaw), pitch: f2(p.pitch), hp: Math.round(p.hp), c: p.c ? 1 : 0, d: f2(p.d), rm: p.rm ? 1 : 0 })),
    ar: r.arrows.map(a => [a.id, f2(a.x), f2(a.y), f2(a.z), f2(a.vx), f2(a.vy), f2(a.vz)]), ev: r.ev
  };
  r.pl.forEach(p => send(p.ws, msg));
}
setInterval(() => { for (const r of rooms.values()) tick(r, 1 / 30); }, 1000 / 30);

const cleanName = n => String(n || '').replace(/[<>&"']/g, '').trim().slice(0, 12) || 'Okçu';

wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const r = ws.room, p = r && r.pl[ws.idx];
    if (m.t === 'create' && !r) {
      const code = genCode();
      const room = { code, pl: [], ph: 'wait', r: 1, sc: [0, 0], tl: CFG.roundTime, cd: 3, rb: 0, arrows: [], aid: 0, ev: [], win: -1, final: false };
      room.pl.push(mk(ws, cleanName(m.name), 0));
      rooms.set(code, room); ws.room = room; ws.idx = 0;
      send(ws, { t: 'joined', code, you: 0 });
    } else if (m.t === 'join' && !r) {
      const room = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!room) return send(ws, { t: 'err', msg: 'Oda bulunamadı' });
      if (room.pl.length >= 2) return send(ws, { t: 'err', msg: 'Oda dolu' });
      room.pl.push(mk(ws, cleanName(m.name), 1)); ws.room = room; ws.idx = 1;
      send(ws, { t: 'joined', code: room.code, you: 1 });
      const names = room.pl.map(q => q.name);
      room.pl.forEach(q => send(q.ws, { t: 'ready', names }));
      newMatch(room);
    } else if (m.t === 'in' && p) {
      const now = Date.now(), dtm = Math.min(.2, (now - p.last) / 1000); p.last = now;
      if (r.ph === 'fight' && p.hp > 0) {
        let nx = +m.x, nz = +m.z;
        if (isFinite(nx) && isFinite(nz)) {
          const dx = nx - p.x, dz = nz - p.z, dd = Math.hypot(dx, dz), mx = 7 * dtm + .25;
          if (dd > mx) { nx = p.x + dx / dd * mx; nz = p.z + dz / dd * mx; }
          const q = SH.resolve(nx, nz); p.x = q[0]; p.z = q[1];
        }
      }
      p.yaw = +m.yaw || 0; p.pitch = cl(+m.pitch || 0, -.6, 1); p.c = !!m.c; p.d = cl(+m.d || 0, 0, 1);
    } else if (m.t === 'shoot' && p && r.ph === 'fight' && p.hp > 0 && !p.c) {
      const now = Date.now(); if (now - p.lastShot < CFG.cool) return;
      const pw = cl(+m.pw || 0, 0, 1); if (pw < .2) return;
      p.lastShot = now; p.yaw = +m.yaw || p.yaw; p.pitch = cl(+m.pitch || p.pitch, -.6, 1);
      const s = SH.shot(p.x, p.z, p.yaw, p.pitch), sp = 14 + 32 * pw;
      r.arrows.push({ id: ++r.aid, o: p.i, x: s.o[0], y: s.o[1], z: s.o[2], vx: s.d[0] * sp, vy: s.d[1] * sp, vz: s.d[2] * sp, pw, life: 5 });
      r.ev.push({ e: 'shoot', i: p.i });
    } else if (m.t === 'rematch' && p && r.ph === 'over') { p.rm = true; if (r.pl.every(q => q.rm)) newMatch(r); }
  });
  ws.on('close', () => {
    const r = ws.room; if (!r) return;
    r.pl.forEach(q => { if (q.ws !== ws) send(q.ws, { t: 'left' }); });
    rooms.delete(r.code);
  });
});
setInterval(() => wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 25000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Ok Meydanı port ' + PORT));
