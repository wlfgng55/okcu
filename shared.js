// Hem sunucu hem istemci tarafından kullanılan ortak harita / çarpışma kodu
(function (root) {
  const SH = { HX: 14, HZ: 20.5, PR: .35, STAND: 1.8, CROUCH: 1.1, EYE: 1.6, GRAV: 6 };
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  SH.mulberry = mulberry;

  // Siper / prop listesi: t=tür, x,z merkez, hx,hz yarı boyut, h yükseklik
  const boxes = [];
  const add = (t, x, z, hx, hz, h) => boxes.push({ t, x, z, hx, hz, h });
  for (const s of [-1, 1]) {
    add('crate', 0, s * 14.8, .7, .7, 1.3);
    add('crate', 1.9, s * 15.1, .55, .55, 1.15);
    add('barrel', -1.5, s * 14.6, .5, .5, 1.2);
    add('barrel', -2.3, s * 15.3, .5, .5, 1.2);
    add('wall', -5.5, s * 12.2, 1.7, .4, 1.4);
    add('wall', 5.5, s * 11.6, 1.7, .4, 1.4);
    add('hay', -9.5, s * 8.5, .9, .6, 1.2);
    add('hay', 9.5, s * 9.2, .9, .6, 1.2);
    add('crate', -11.5, s * 17, .6, .6, 1.2);
  }
  add('wall', -5, 0, 1.5, .4, 1.4);
  add('wall', 5, 0, 1.5, .4, 1.4);
  add('crate', 0, 0, .7, .7, 1.3);
  SH.boxes = boxes;

  // Ağaçlar: önce arena içi birkaçı, sonra dışarıda halka
  const trees = [[-11, -4], [11.5, 4.5], [-11.5, 11], [11, -11.5], [-12.5, -14], [12.5, 15]].map(p => ({ x: p[0], z: p[1], k: 0, s: 1 + (Math.abs(p[0] * 7 + p[1]) % 3) * .15, inn: true }));
  const rnd = mulberry(7);
  let guard = 0;
  while (trees.length < 90 && guard++ < 2000) {
    const x = (rnd() - .5) * 110, z = (rnd() - .5) * 140;
    if (Math.abs(x) < 17.5 && Math.abs(z) < 24) continue;
    trees.push({ x, z, k: rnd() < .6 ? 0 : 1, s: .8 + rnd() * .8, inn: false });
  }
  trees.forEach((t, i) => { if (t.inn) t.k = i % 2; });
  SH.trees = trees;
  SH.TR = .5;

  SH.resolve = function (x, z, r) {
    r = r || SH.PR;
    x = cl(x, -SH.HX, SH.HX); z = cl(z, -SH.HZ, SH.HZ);
    for (let it = 0; it < 2; it++) {
      for (const b of boxes) {
        const cx = cl(x, b.x - b.hx, b.x + b.hx), cz = cl(z, b.z - b.hz, b.z + b.hz);
        const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; x += dx * k; z += dz * k; }
          else {
            const l = x - (b.x - b.hx), rr = (b.x + b.hx) - x, t = z - (b.z - b.hz), bt = (b.z + b.hz) - z, m = Math.min(l, rr, t, bt);
            if (m === l) x = b.x - b.hx - r; else if (m === rr) x = b.x + b.hx + r; else if (m === t) z = b.z - b.hz - r; else z = b.z + b.hz + r;
          }
        }
      }
      for (const t of trees) {
        if (!t.inn) continue;
        const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz), m = SH.TR + r;
        if (d < m) { const k = d > 1e-6 ? (m - d) / d : 0; x += dx * k; z += dz * k; }
      }
    }
    x = cl(x, -SH.HX, SH.HX); z = cl(z, -SH.HZ, SH.HZ);
    return [x, z];
  };

  // Nişan matematiği (yaw=0 → +z'ye bakar, yaw artınca sola döner)
  SH.dir = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  SH.right = yaw => [-Math.cos(yaw), 0, Math.sin(yaw)];
  SH.camPos = (x, z, yaw, pitch, D) => {
    const d = SH.dir(yaw, pitch), r = SH.right(yaw);
    return [x - d[0] * D + r[0] * .55, Math.max(.3, SH.EYE - d[1] * D + .25), z - d[2] * D + r[2] * .55];
  };
  // Okun çıkış noktası ve yönü: kamera ışınının 50 m ilerisindeki noktaya doğru
  SH.shot = (x, z, yaw, pitch) => {
    const d = SH.dir(yaw, pitch), c = SH.camPos(x, z, yaw, pitch, 2.2);
    const o = [x + d[0] * .5, SH.EYE + d[1] * .5, z + d[2] * .5];
    const P = [c[0] + d[0] * 50, c[1] + d[1] * 50, c[2] + d[2] * 50];
    let v = [P[0] - o[0], P[1] - o[1], P[2] - o[2]]; const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return { o, d: [v[0] / l, v[1] / l, v[2] / l] };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SH; else root.SH = SH;
})(this);
