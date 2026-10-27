'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPerlin2D, fbm, mulberry32, ridged } from '../lib/noise';

// Palettes are taken from Mountain Lab (cp_mountainlab), the TF2 map this site is named
// after: an alpine valley at evening under overcast skies. Colors were sampled from
// in-game screenshots.
//
// Each palette: sky gradient (top -> horizon), the farthest and nearest ridge colors, the
// color of the light source and its glow, the top-corner text color (read against the top of
// the sky), how thick the valley fog is, and how often it is picked. `sun: false` means
// overcast: no disc, just light diffusing through cloud low over the ridges.
const PALETTES = [
  // The map as it plays: mauve-grey cloud warming to dusty pink, blue-violet haze, near-black pines.
  { name: 'Overcast',   sky: ['#6c6475', '#b8a0a8'], far: '#9991b1', near: '#141316', glow: '#f2cfc8', top: '#f4ede8', sun: false, fog: 0.4,  weight: 4 },
  // The saturated lilac band where the last light catches the tree line.
  { name: 'Lilac',      sky: ['#6e6280', '#c39bc4'], far: '#8f86ab', near: '#121116', glow: '#f6dcf0', top: '#f6eef6', sun: false, fog: 0.32, weight: 2 },
  // A break in the cloud: low amber sun over warm brown ground.
  { name: 'Last Light', sky: ['#6f6383', '#e0a690'], far: '#a08aa8', near: '#17120f', glow: '#ffd3a6', top: '#f7ece4', sun: true,  fog: 0.22, weight: 2 },
  // Team colors, muted into moods rather than logos.
  { name: 'RED',        sky: ['#3a2226', '#b8574a'], far: '#7d4440', near: '#120a0a', glow: '#ffb08a', top: '#f6e6df', sun: true,  fog: 0.18, weight: 1 },
  { name: 'BLU',        sky: ['#1c2433', '#5b7a95'], far: '#4d6a83', near: '#0b0f15', glow: '#d8e6f2', top: '#e6eef6', sun: true,  fog: 0.2,  weight: 1 },
];

// Mann Manor is the map's Halloween version; it only turns up in October.
const MANN_MANOR = { name: 'Mann Manor', sky: ['#120e1f', '#3d2a52'], far: '#4a3a5e', near: '#07050b', glow: '#b8f09c', top: '#ece4f6', sun: true, fog: 0.25, weight: 4 };

function pickPalette(rand) {
  const pool = new Date().getMonth() === 9 ? [...PALETTES, MANN_MANOR] : PALETTES;
  let r = rand() * pool.reduce((sum, p) => sum + p.weight, 0);
  return pool.find((p) => (r -= p.weight) < 0) || pool[0];
}

const LAYERS = 9;
const MARGIN = 80; // px drawn past each edge so parallax never reveals a gap
const FOG_LAYERS = [1, 3, 5]; // valley fog is drawn in front of these layers

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
};
const mixHex = (a, b, t) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

function buildScene(w, h, seed) {
  const rand = mulberry32(seed);
  const noise = createPerlin2D(rand);
  const palette = pickPalette(rand);
  const step = Math.max(3, w / 400);
  // Noise is sampled against the larger side so peaks keep their shape on portrait screens.
  const span = Math.max(w, h * 1.4);

  const layers = [];
  for (let i = 0; i < LAYERS; i++) {
    const t = i / (LAYERS - 1); // 0 = farthest, 1 = nearest
    const base = h * (0.47 + 0.45 * Math.pow(t, 1.3));
    const amp = h * (0.1 + 0.11 * t);
    const freq = 4.2 - 2.6 * t; // distant ranges show more peaks across the screen
    const row = i * 7.31 + rand() * 100;
    const peakiness = 0.65 - 0.4 * t;

    let d = `M ${-MARGIN} ${h + MARGIN}`;
    for (let x = -MARGIN; x <= w + MARGIN; x += step) {
      const u = (x / span) * freq;
      const n = fbm(noise, u, row, 6) * (1 - peakiness) + (ridged(noise, u * 0.8, row + 50) - 0.5) * peakiness;
      const y = base - n * amp * 2;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    d += ` L ${w + MARGIN} ${h + MARGIN} Z`;

    const color = mixHex(palette.far, palette.near, Math.pow(t, 1.35));
    layers.push({
      d,
      t,
      top: color,
      // valleys fill with mist: lighten the bottom of each layer toward the horizon color
      bottom: mix(color, palette.sky[1], 0.12 + 0.38 * (1 - t)),
      gradTop: (base - amp) / h,
      gradBottom: Math.min(1, (base + amp * 1.2) / h),
      // a band of fog drawn in front of this layer, settled along its valley line
      fog: { y: base - amp * 0.5, height: amp * 1.6 },
    });
  }

  // Under cloud the light sits low and spreads wide, just above the far ridges.
  const sun = {
    x: w * (0.2 + rand() * 0.6),
    y: palette.sun ? h * (0.16 + rand() * 0.14) : h * (0.36 + rand() * 0.08),
    r: Math.min(w, h) * (0.02 + rand() * 0.015),
    reach: Math.max(w, h) * (palette.sun ? 0.55 : 0.75),
  };

  return { palette, layers, sun };
}

export default function Mountains({ children }) {
  const [size, setSize] = useState(null);
  const [seed, setSeed] = useState(null);
  const [fading, setFading] = useState(true);
  const groupRefs = useRef([]);
  const pointer = useRef({ x: 0, y: 0, cx: 0, cy: 0 });

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

  // Gentle parallax that follows the pointer (or device tilt), eased each frame.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const onMove = (e) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onTilt = (e) => {
      if (e.gamma == null) return;
      pointer.current.x = Math.max(-1, Math.min(1, e.gamma / 30));
      pointer.current.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('deviceorientation', onTilt);

    let raf;
    const tick = () => {
      const p = pointer.current;
      p.cx += (p.x - p.cx) * 0.04;
      p.cy += (p.y - p.cy) * 0.04;
      groupRefs.current.forEach((g, i) => {
        if (!g) return;
        const depth = Math.pow(i / (LAYERS - 1), 2);
        g.setAttribute('transform', `translate(${(-p.cx * 60 * depth).toFixed(2)} ${(-p.cy * 14 * depth).toFixed(2)})`);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
    };
  }, []);

  const scene = useMemo(
    () => (size && size.w > 0 && size.h > 0 && seed != null ? buildScene(size.w, size.h, seed) : null),
    [size, seed]
  );

  if (!scene) return <div className="scene" />;

  const { w, h } = size;
  const { palette, layers, sun } = scene;

  return (
    <div className={`scene${fading ? ' fading' : ''}`} style={{ '--top': palette.top }}>
      <svg aria-hidden="true" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={palette.sky[0]} />
            <stop offset="0.6" stopColor={palette.sky[1]} />
          </linearGradient>
          <radialGradient id="glow" cx={sun.x} cy={sun.y} r={sun.reach} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={palette.glow} stopOpacity={palette.sun ? 0.6 : 0.45} />
            <stop offset="0.06" stopColor={palette.glow} stopOpacity={palette.sun ? 0.3 : 0.32} />
            <stop offset="0.25" stopColor={palette.glow} stopOpacity="0.1" />
            <stop offset="0.6" stopColor={palette.glow} stopOpacity="0.03" />
            <stop offset="1" stopColor={palette.glow} stopOpacity="0" />
          </radialGradient>
          {layers.map((l, i) => (
            <linearGradient
              key={i}
              id={`layer-${i}`}
              x1="0"
              y1={l.gradTop * h}
              x2="0"
              y2={l.gradBottom * h}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor={l.top} />
              <stop offset="1" stopColor={l.bottom} />
            </linearGradient>
          ))}
          <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={palette.sky[1]} stopOpacity="0" />
            <stop offset="0.55" stopColor={palette.sky[1]} stopOpacity={palette.fog} />
            <stop offset="1" stopColor={palette.sky[1]} stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect width={w} height={h} fill="url(#sky)" />
        <rect width={w} height={h} fill="url(#glow)" />
        {palette.sun && <circle cx={sun.x} cy={sun.y} r={sun.r} fill={palette.glow} opacity="0.85" />}

        {layers.map((l, i) => (
          <g key={i} ref={(el) => (groupRefs.current[i] = el)}>
            <path d={l.d} fill={`url(#layer-${i})`} />
            {FOG_LAYERS.includes(i) && (
              <rect x={-MARGIN} y={l.fog.y} width={w + MARGIN * 2} height={l.fog.height} fill="url(#fog)" />
            )}
          </g>
        ))}
      </svg>

      {children}
      <footer className="chrome chrome-bottom">
        <span>
          {palette.name} <span className="dim">· cp_mountainlab · {String(seed % 100000).padStart(5, '0')}</span>
        </span>
        <span className="dim hint">Refresh for a new range</span>
      </footer>
    </div>
  );
}
