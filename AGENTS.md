# MountainLab: agent guide

The public landing page for **mountainlab.net**, the owner's home-lab domain. Subdomains of
mountainlab.net host a self-hosted media ("arr") stack. This repo is only the root
domain's homepage. It is a separate project from those services and does not configure or
proxy them.

**Goal:** a good-looking, public-facing homepage. Anyone on the internet can see it, so
treat everything in it as public.

## What it is today

A full-screen, randomly generated mountain landscape drawn in fine off-white dots on black
(a `<canvas>`), with a minimal editorial layout on top. The aim is a clean look in the style
of Awwwards-featured sites: small corner text, lots of space. Keep it that way. The look was
inspired by cem hasimi's "fall" (stippled terrain on black), without its figure and colours.

- **Name:** "MountainLab" comes from the owners' favourite Team Fortress 2 map, Mountain
  Lab. Any nod to it should stay subtle (the bottom-left `cp_mountainlab` label is one).
- **No big headline.** A full-width wordmark was tried and rejected. The landscape is the
  hero; the text stays small.
- **Fonts:** the "MountainLab" mark (top-left) uses **Anton** from Google Fonts, a free
  stand-in for TF2 Build, the game's logo font. Everything else uses Inter Tight. Both load
  through `next/font` in `app/layout.js`. Don't host Valve's real TF2 fonts: the owner
  decided against it.
- **Corner text:** small Inter Tight (13px) text one gutter (`clamp(16px, 2.5vw, 40px)`)
  from each edge, always light (the background is always near-black). Top-left is the
  `<h1>` "MountainLab". Top-right has the public links: Plex (`plex.mountainlab.net`) and
  Requests (`request.mountainlab.net`). Bottom-left shows the seed as a TF2-style map name
  (`cp_mountainlab · 62670`); bottom-right says "Refresh for a new range".
- **Monochrome, always.** One `PALETTE`: off-white for lit slopes, a slightly greyer tone
  for broad bands, dim grey for shade. Per-scene colour palettes were tried and rejected
  ("not liking all the colors").

### The scene (`components/Mountains.js`)

- **Range:** `ROWS` rows of terrain from far (z = 0) to the foot of the range (z = 1), with
  one taller, lit summit (`peak`) rising near the middle. A floating-horizon pass walks
  rows near to far, so a dot only shows if it sits above every nearer row in its column.
  Brightness follows a simple light model (slopes facing the viewer and the upper-left are
  lit) in four alpha `LEVELS`.
- **Foreground:** rows continue past z = 1 to `FOREGROUND`, as ground that gets dimmer,
  sparser and out of focus (bigger, softer dots: `SIZES` / `SIZE_ALPHA`, drawn as radial
  sprites) until it fades to black at the bottom of the screen. It stays flat: it slopes
  down from the range's front edge onto low ground. A dark hill in the foreground was
  tried and rejected (it read as a black peak blocking the range).
- **Sky:** faint stars only above the ridgeline, a few twinkling.
- **Motion:** on first load the range materialises dot by dot (dots are pre-shuffled and
  painted a slice per frame), then stars and mist fade in. A faint mist of soft dots drifts
  sideways at the foot of the range. Parallax is a small sideways shift with the pointer
  or device tilt. All motion is off under `prefers-reduced-motion`.
- **Performance:** the terrain is painted once to an offscreen canvas and copied each
  frame; only stars and mist are redrawn. Building the scene takes ~0.2 s on a laptop
  screen and ~0.5 s at 1440p. Keep an eye on this if you add rows or dots.
- A new random seed is picked **only on page load**. Clicking does nothing; that was
  intentional (see commit `927048a`). On resize the scene is rebuilt with the **same
  seed** (debounced 150 ms).

### Rejected directions

Kept on their own branches for reference. Don't bring these elements back unasked.

- `design/layered`: the previous live design (layered SVG ridges in TF2 map palettes).
- `design/topo`: contour map ("too busy").
- `design/cel`: cel-shaded TF2 illustration ("childish and busy").
- `design/distant`: distant range over still water.
- Also tried on this design and removed: dots falling from the range ("too busy"), a
  summit elevation marker, and a cursor spotlight.

- The favicon (`app/icon.svg`) is a small dotted peak, off-white on black.
- **Link previews:** `app/opengraph-image.png` (1200×630 screenshot) plus
  `opengraph-image.alt.txt`. `metadataBase` in `app/layout.js` makes the URL absolute. If
  the design changes, retake the screenshot.

## Stack

- Next.js **13.5.6** (App Router), React 18.2. Plain JavaScript: no TypeScript, no
  Tailwind, no other dependencies.
- `output: 'export'`: `npm run build` produces a fully static site in `./out`. There is no
  server runtime, so don't add API routes, server actions, middleware, `next/image`
  optimisation, or anything else that needs a Node server. If a feature needs dynamic data,
  it has to be fetched client-side.

## Files

| Path | Purpose |
| --- | --- |
| `app/layout.js` | Root layout, metadata, and the Inter Tight font (via `next/font`, exposed as `--font-display`). |
| `app/page.js` | Home route. Holds the public `LINKS` and renders the top bar inside `<Mountains>`. |
| `app/globals.css` | Full-viewport, no-scroll body; the fixed full-screen `.scene` and its canvas; corner-text fade-in; mark, corner-text and nav-hover styles. |
| `app/icon.svg` | Favicon: a small dotted peak, off-white on black. |
| `app/opengraph-image.png` | Link-preview image for Discord, iMessage and similar. |
| `components/Mountains.js` | Client component. `buildScene()` (dots, stars, mist; deterministic per seed and size), the canvas painting, intro, parallax and resize effects, and the bottom corner text. Takes `children` for the top bar. |
| `lib/noise.js` | Seeded PRNG (`mulberry32`), 2D Perlin noise, `fbm`, `ridged`. |

Note: `globals.css` sets `overflow: hidden` on `html, body`. If you add content below the
fold, change this, because nothing will scroll otherwise.

## Run / build

```sh
npm install
npm run dev      # http://localhost:3000
npm run build    # static output in ./out
```

## Deploy

- **CI** (`.github/workflows/docker.yml`): every push to `main` builds the Docker image and
  pushes `ghcr.io/lucaswb15/mountainlab:latest` and `:sha-<commit>` to GitHub Container
  Registry.
- **Image** (`Dockerfile`): has two stages. The first is `node:20-alpine`, which runs
  `npm ci` and `npm run build`. The second is `nginx:1.27-alpine`, which serves `/out` on
  port 80.
- **Server** (`docker-compose.yml`): the container is named `mountainlab`, it maps host
  port **8090** to container port 80, and it uses `restart: unless-stopped`.
- **Traffic path:** visitor → **Cloudflare** (DNS and proxy) → **Nginx Proxy Manager** on
  the home server → this container on port 8090. The arr-stack subdomains go through the
  same Cloudflare → Nginx Proxy Manager path to their own containers. Proxy hosts, TLS
  certificates and any access rules are set up in Nginx Proxy Manager and the Cloudflare
  dashboard, not in this repo.
- Caveat: the compose file uses `build: .`, which builds locally from source. It does not
  pull the GHCR image, even though the workflow comment says "the server pulls that tag".
  To deploy from CI, change it to `image: ghcr.io/lucaswb15/mountainlab:latest`.

Pushing to `main` publishes. Commit or push only when the owner asks.

## Guidance for changes

- **Public-facing.** Don't add internal IPs, ports, admin URLs, or service names and
  subdomains of the arr stack unless the owner explicitly asks. Listing them tells the
  whole internet what is running there. If links to services are wanted, confirm which
  ones should be public.
- **Private pages need a real gate.** Every page of this static site is public unless
  something in front of it blocks access, such as a Cloudflare Access policy on that path.
  Even when a path like `/home` is gated, Next puts page code in shared
  `/_next/static/` JS files that are served outside that path. So never hardcode private
  links in components. Load them at runtime from a file under the gated path (for example
  `/home/links.json`).
- Keep the mountain scene as the visual identity. Put any new UI (a title, links, a footer)
  in an overlay above `.scene`.
- Keep the site static and light. Prefer plain CSS in `globals.css` (or CSS modules) over
  adding UI frameworks.
- `buildScene()` must stay deterministic for a given `(w, h, seed)`. Resize relies on this
  to keep the same scene.
- Match the existing style: small, focused files, two-space indent, single quotes, short
  comments only where something isn't obvious.
