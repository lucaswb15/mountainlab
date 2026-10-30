'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPerlin2D, fbm, mulberry32, ridged } from '../lib/noise';

// A stippled range on black: the terrain is thousands of off-white dots under a sky of faint
// stars, with low foreground hills that blur and fade into the dark. Inspired by cem hasimi's "fall".
//
// Monochrome on purpose: lit slopes are off-white, a slightly greyer band breaks up broad
// faces, and shaded slopes fall to a dim grey.
const PALETTE = { hi: '#efebe4', mid: '#cfcac2', dim: '#5c5852' };

const ROWS = 200;
const FOREGROUND = 2; // depth where the foreground hills have faded to nothing
const MARGIN = 40; // px drawn past each side so parallax never reveals an edge
const DOT = 1.7;

// Dots are drawn in buckets by tone (0 hi, 1 mid, 2 dim) and by how much light they catch.
const LEVELS = [0.3, 0.52, 0.76, 1];
// Foreground dots grow and soften as they come closer, like a shallow depth of field.
// SIZES[0] is the in-focus range; the rest are drawn as soft sprites.
const SIZES = [1, 1.6, 2.4, 3.4];
const SIZE_ALPHA = [1, 0.55, 0.32, 0.2]; // bigger dots are dimmer, so the light they spread stays even
const bucketOf = (size, tone, level) => (size * 3 + tone) * LEVELS.length + level;

function buildScene(w, h, seed) {
  const rand = mulberry32(seed);
  const noise = createPerlin2D(rand);
  const span = Math.max(w, h * 1.4);
  const W = w + MARGIN * 2;
  const offset = rand() * 100;
  const dz = 1 / (ROWS - 1);

  // Depth z runs 0 (farthest ridge) to 1 (foot of the range), then on to FOREGROUND: low
  // hills nearer the viewer that sink toward the bottom of the screen.
  const baseAt = (z) => (z <= 1 ? h * (0.36 + 0.26 * z) : h * (0.62 + 0.45 * (z - 1)));
  // The range's nearest rows settle into low foothills, so its front edge sits fairly even
  // along the bottom of the range instead of rising into peaks of its own.
  const foothills = (z) => {
    const t = Math.max(0, Math.min(1, (z - 0.6) / 0.4));
    return 1 - 0.8 * t * t * (3 - 2 * t);
  };
  const ampAt = (z) => (z <= 1 ? h * (0.22 + 0.08 * z) * foothills(z) : h * 0.3 * (1 - 0.75 * (z - 1)));
  // A taller summit rises from the middle of the range, so the scene has a clear centre. Its
  // exact position, width and depth vary by seed.
  const peak = { x: 0.4 + rand() * 0.2, width: 0.1 + rand() * 0.05, z: 0.3 + rand() * 0.15 };
  const peakAt = (x, z) => {
    // Width is measured against the longer side so the summit keeps its shape on phones.
    const dx = (x - peak.x * w) / (peak.width * Math.max(w, h));
    const dz = (z - peak.z) / 0.22;
    // A rougher falloff than a plain bell curve, so the outline reads as rock, not a blob.
    const rough = 1 + 0.3 * fbm(noise, (x / span) * 9 + 90, z * 4 + 90, 4);
    return Math.exp(-Math.pow(Math.abs(dx), 1.5) - dz * dz) * rough * h * 0.17;
  };
  const heightAt = (x, z) => {
    const u = (x / span) * 3 * Math.max(0.35, 1.3 - 0.5 * z) + offset;
    const v = z * 2.6 + offset;
    return fbm(noise, u, v, 5) * 0.7 + (ridged(noise, u * 0.55, v * 0.55) - 0.45) * 1.1;
  };

  // Height of the range's front edge (z = 1), sampled once per pixel column.
  const frontLift = new Float32Array(Math.ceil(W) + 16);
  for (let i = 0; i < frontLift.length; i++) frontLift[i] = (heightAt(i - MARGIN - 8, 1) + 0.3) * ampAt(1) + peakAt(i - MARGIN - 8, 1);
  const frontAt = (x) => {
    const f = Math.max(0, Math.min(frontLift.length - 1.001, x + MARGIN + 8));
    const i = Math.floor(f);
    return frontLift[i] + (frontLift[i + 1] - frontLift[i]) * (f - i);
  };

  const yAt = (x, z) => {
    if (z <= 1) return baseAt(z) - (heightAt(x, z) + 0.3) * ampAt(z) - peakAt(x, z);
    // The foreground has no relief of its own: it slopes down from the range's front edge
    // (so there is no seam) onto low, gently rolling ground.
    const near = (z - 1) / (FOREGROUND - 1);
    const t = Math.min(1, near / 0.3);
    const settle = t * t * (3 - 2 * t);
    const ground = (fbm(noise, (x / span) * 4 + 130, near * 3 + 130, 3) + 0.4) * h * 0.035;
    return baseAt(z) - frontAt(x) * (1 - settle) - ground * settle;
  };

  // Slopes that face the viewer and the upper-left light are lit; grazing slopes fall into
  // shade. Lit ground takes one of two tones from a broad band of noise, and its
  // brightness follows the light so each face reads as a surface.
  const shadeAt = (x, z) => {
    const y = yAt(x, z);
    const facing = (yAt(x, z + dz) - y) / (baseAt(z + dz) - baseAt(z));
    const slope = (yAt(x + 3, z) - yAt(x - 3, z)) / 6;
    const lit = Math.max(0, Math.min(1, 0.05 + 0.45 * facing + slope * 1.1));
    const band = fbm(noise, (x / span) * 1.8 + 40, z * 1.6 + heightAt(x, z) + 40, 3);
    const hue = lit < 0.28 ? 2 : band > -0.02 ? 0 : 1;
    const level = hue === 2 ? Math.min(2, Math.floor(lit * 8)) : Math.min(3, Math.floor((lit - 0.28) * 6));
    return [y, hue, level, lit];
  };

  const depths = [];
  for (let r = 0; r < ROWS; r++) depths.push(r * dz);
  const fgStep = 3 / (h * 0.45); // keeps foreground rows about 3px apart
  for (let z = 1 + fgStep; z <= FOREGROUND; z += fgStep) depths.push(z);

  // Floating horizon: rows are walked near to far, and a dot only shows if it sits above
  // every nearer row at that column.
  const occ = new Float32Array(Math.ceil(W) + 2).fill(Infinity);
  const zTop = new Float32Array(occ.length); // depth of the nearest-row crest at each column
  let fgTop = null; // the foreground's outline, captured before the range rows are walked
  const buckets = Array.from({ length: SIZES.length * 3 * LEVELS.length }, () => []);

  for (let r = depths.length - 1; r >= 0; r--) {
    const z = depths[r];
    if (z <= 1 && !fgTop) fgTop = occ.slice();
    // Foreground fades out with distance from the range: fewer, dimmer dots.
    const near = z <= 1 ? 0 : (z - 1) / (FOREGROUND - 1);
    const fade = Math.pow(1 - near, 1.2);
    const size = near < 0.1 ? 0 : near < 0.3 ? 1 : near < 0.55 ? 2 : 3;
    const gap = baseAt(Math.min(FOREGROUND, z + (z < 1 ? dz : fgStep))) - baseAt(z);
    const step = z <= 1 ? 1.3 + (1 - z) * 0.6 : 1.3 + (z - 1) * 0.8;
    for (let x = 0; x <= W; x += step) {
      let [y, hue, level, lit] = shadeAt(x - MARGIN, z);
      const col = Math.round(x);
      const dy = y - rand() * (gap * 2 + 1);
      const visible = dy < occ[col];
      if (y < occ[col]) {
        occ[col] = y;
        zTop[col] = z;
      }
      const density = ((hue === 2 ? 0.4 : 0.6 + lit * 0.4) * fade * Math.sqrt(fade)) / (SIZES[size] * SIZES[size]);
      if (!visible || rand() > density) continue;
      if (z > 1) {
        if (rand() > fade) hue = 2;
        level = Math.min(level, Math.floor(fade * LEVELS.length));
      }
      buckets[bucketOf(size, hue, level)].push(x + (rand() - 0.5) * step, dy);
    }
  }

  // The foreground's crest catches a little light, outlining it against the range.
  for (let x = 0; x <= W; x += 1.1) {
    const col = Math.round(x);
    const near = (zTop[col] - 1) / (FOREGROUND - 1);
    if (!fgTop || !isFinite(fgTop[col]) || near < 0.04) continue;
    const fade = Math.pow(1 - near, 1.2);
    const size = near < 0.1 ? 0 : near < 0.3 ? 1 : near < 0.55 ? 2 : 3;
    if (rand() > 0.9 * fade) continue;
    const level = Math.min(3, Math.floor(fade * 4));
    // The rim stays crisp even where the ground behind it is out of focus.
    buckets[bucketOf(Math.min(size, 1), rand() < 0.75 ? 0 : 1, level)].push(x + (rand() - 0.5), fgTop[col] + rand() * 2.5);
  }

  // Faint stars in the sky above the range, thinning toward the ridgeline. A few twinkle.
  const stars = [];
  for (let i = 0; i < Math.round(W / 9); i++) {
    const x = rand() * W;
    const y = Math.pow(rand(), 1.4) * occ[Math.round(x)];
    const clearance = occ[Math.round(x)] - y;
    if (clearance < h * 0.04) continue;
    stars.push({
      x,
      y,
      color: rand() < 0.7 ? 0 : 1,
      alpha: (0.15 + rand() * 0.55) * Math.min(1, clearance / (h * 0.15)),
      twinkle: rand() < 0.3 ? 0.5 + rand() * 1.2 : 0,
      phase: rand() * Math.PI * 2,
      size: rand() < 0.1 ? DOT * 1.3 : DOT * 0.9,
    });
  }

  // A thin mist of faint dots drifts sideways where the range meets the foreground.
  const mist = [];
  for (let i = 0; i < Math.round(W / 5); i++) {
    mist.push({
      x: rand() * W,
      y: h * (0.5 + ((rand() + rand() + rand()) / 3 - 0.5) * 0.16),
      speed: (rand() < 0.5 ? -1 : 1) * (3 + rand() * 7),
      alpha: 0.05 + rand() * 0.18,
      size: DOT * (1.5 + rand() * 2.5),
    });
  }

  // Dots are shuffled so the range can materialise in random order on load.
  const dots = buckets.map((list) => {
    const arr = new Float32Array(list);
    for (let i = arr.length / 2 - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i * 2], arr[j * 2]] = [arr[j * 2], arr[i * 2]];
      [arr[i * 2 + 1], arr[j * 2 + 1]] = [arr[j * 2 + 1], arr[i * 2 + 1]];
    }
    return arr;
  });

  return { dots, stars, mist, width: W };
}

export default function Mountains({ children }) {
  const [size, setSize] = useState(null);
  const [seed, setSeed] = useState(null);
  const [fading, setFading] = useState(true);
  const canvasRef = useRef(null);
  const introDone = useRef(false);
  // x is the pointer or tilt (-1..1); cx eases toward it and drives the parallax.
  const pointer = useRef({ x: 0, cx: 0 });

  useEffect(() => {
    setSeed(Math.floor(Math.random() * 2 ** 31));
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    requestAnimationFrame(() => setFading(false));

    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const scene = useMemo(
    () => (size && size.w > 0 && size.h > 0 && seed != null ? buildScene(size.w, size.h, seed) : null),
    [size, seed]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;
    const { w, h } = size;
    const { dots, stars, mist, width } = scene;
    const colors = [PALETTE.hi, PALETTE.mid, PALETTE.dim];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // The terrain never changes, so it is drawn once and copied each frame. On first load it
    // is drawn a slice at a time instead, so the range materialises dot by dot.
    const terrain = document.createElement('canvas');
    terrain.width = Math.round(width * dpr);
    terrain.height = canvas.height;
    const tctx = terrain.getContext('2d');
    tctx.scale(dpr, dpr);
    // Soft round sprites, one per tone, for the out-of-focus foreground and the mist.
    const sprites = colors.map((color) => {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, color);
      grad.addColorStop(0.45, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
      return c;
    });
    const drawn = dots.map(() => 0);
    const paint = (frac) => {
      dots.forEach((list, b) => {
        const end = Math.floor((list.length / 2) * frac) * 2;
        const level = b % LEVELS.length;
        const tone = Math.floor(b / LEVELS.length) % 3;
        const size = Math.floor(b / (3 * LEVELS.length));
        tctx.globalAlpha = LEVELS[level] * SIZE_ALPHA[size];
        if (size === 0) {
          tctx.fillStyle = colors[tone];
          for (let i = drawn[b]; i < end; i += 2) tctx.fillRect(list[i], list[i + 1], DOT, DOT);
        } else {
          const d = DOT * SIZES[size] * 2;
          for (let i = drawn[b]; i < end; i += 2) tctx.drawImage(sprites[tone], list[i] - d / 2, list[i + 1] - d / 2, d, d);
        }
        drawn[b] = end;
      });
    };
    const intro = !still && !introDone.current;
    introDone.current = true;
    if (!intro) paint(1);

    const ctx = canvas.getContext('2d');
    let start = null;

    const draw = (t) => {
      if (start == null) start = t;
      const p = pointer.current;
      p.cx += (p.x - p.cx) * 0.04;
      const shift = -MARGIN - p.cx * 16;
      const elapsed = t - start;
      if (intro) paint(1 - Math.pow(1 - Math.min(1, elapsed / 2200), 3));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(terrain, shift * dpr, 0);

      ctx.setTransform(dpr, 0, 0, dpr, shift * dpr, 0);
      const sec = t / 1000;
      const after = intro ? Math.max(0, Math.min(1, (elapsed - 1600) / 1500)) : 1;
      for (const s of stars) {
        const flicker = s.twinkle ? 0.55 + 0.45 * Math.sin(sec * s.twinkle + s.phase) : 1;
        ctx.fillStyle = colors[s.color];
        ctx.globalAlpha = s.alpha * flicker * after;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      for (const m of mist) {
        const x = (((m.x + sec * m.speed) % width) + width) % width;
        ctx.globalAlpha = m.alpha * after;
        ctx.drawImage(sprites[0], x - m.size, m.y - m.size, m.size * 2, m.size * 2);
      }
      ctx.globalAlpha = 1;
    };

    if (still) {
      draw(0);
      return;
    }

    const onMove = (e) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
    };
    const onTilt = (e) => {
      if (e.gamma != null) pointer.current.x = Math.max(-1, Math.min(1, e.gamma / 30));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('deviceorientation', onTilt);
    let raf;
    const tick = (t) => {
      draw(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
    };
  }, [scene, size]);

  if (!scene) return <div className="scene" />;

  return (
    <div className={`scene${fading ? ' fading' : ''}`}>
      <canvas ref={canvasRef} aria-hidden="true" />

      {children}
      <footer className="chrome chrome-bottom">
        <span>
          cp_mountainlab <span className="dim">· {String(seed % 100000).padStart(5, '0')}</span>
        </span>
        <span className="dim hint">Refresh for a new range</span>
      </footer>
    </div>
  );
}
