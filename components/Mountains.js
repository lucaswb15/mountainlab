'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPerlin2D, fbm, mulberry32, ridged } from '../lib/noise';

// Each palette: sky gradient (top -> horizon), the farthest and nearest ridge colors,
// and the color of the sun/moon glow.
const PALETTES = [
  { name: 'haze',   sky: ['#cfcdb0', '#f3f1e2'], far: '#8f95ad', near: '#030304', glow: '#fffbe6' },
  { name: 'dusk',   sky: ['#1f2a52', '#f2a27c'], far: '#a27b98', near: '#0b0812', glow: '#ffd4a8' },
  { name: 'night',  sky: ['#04060d', '#1d2846'], far: '#38425f', near: '#010103', glow: '#dfe8ff' },
  { name: 'dawn',   sky: ['#9db6cc', '#f7e6d3'], far: '#9aa8bb', near: '#121b25', glow: '#fff1dd' },
  { name: 'pine',   sky: ['#aebfa6', '#eef0dd'], far: '#7e988a', near: '#06100b', glow: '#fbffe8' },
  { name: 'ember',  sky: ['#2a1622', '#e86f4e'], far: '#8a4a55', near: '#0a0507', glow: '#ffb27a' },
];

const LAYERS = 9;
const MARGIN = 80; // px drawn past each edge so parallax never reveals a gap

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
  const palette = PALETTES[Math.floor(rand() * PALETTES.length)];
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
    });
  }

  const sun = {
    x: w * (0.2 + rand() * 0.6),
    y: h * (0.16 + rand() * 0.14),
    r: Math.min(w, h) * (0.02 + rand() * 0.015),
  };

  return { palette, layers, sun };
}

export default function Mountains() {
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

  const regenerate = useCallback(() => {
    if (fading) return;
    setFading(true);
    setTimeout(() => {
      setSeed(Math.floor(Math.random() * 2 ** 31));
      requestAnimationFrame(() => setFading(false));
    }, 900);
  }, [fading]);

  if (!scene) return <div className="scene" />;

  const { w, h } = size;
  const { palette, layers, sun } = scene;

  return (
    <div className="scene" onClick={regenerate} aria-hidden="true">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={fading ? 'fading' : ''}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={palette.sky[0]} />
            <stop offset="0.6" stopColor={palette.sky[1]} />
          </linearGradient>
          <radialGradient id="glow" cx={sun.x} cy={sun.y} r={Math.max(w, h) * 0.55} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={palette.glow} stopOpacity="0.6" />
            <stop offset="0.06" stopColor={palette.glow} stopOpacity="0.3" />
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
        </defs>

        <rect width={w} height={h} fill="url(#sky)" />
        <rect width={w} height={h} fill="url(#glow)" />
        <circle cx={sun.x} cy={sun.y} r={sun.r} fill={palette.glow} opacity="0.85" />

        {layers.map((l, i) => (
          <g key={i} ref={(el) => (groupRefs.current[i] = el)}>
            <path d={l.d} fill={`url(#layer-${i})`} />
          </g>
        ))}
      </svg>
    </div>
  );
}
