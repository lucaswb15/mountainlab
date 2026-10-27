# MountainLab: agent guide

The public landing page for **mountainlab.net**, the owner's home-lab domain. Subdomains of
mountainlab.net host a self-hosted media ("arr") stack. This repo is only the root
domain's homepage. It is a separate project from those services and does not configure or
proxy them.

**Goal:** a good-looking, public-facing homepage. Anyone on the internet can see it, so
treat everything in it as public.

## What it is today

A full-screen, randomly generated mountain landscape, built as an SVG, with a minimal
editorial layout on top. The aim is a clean look in the style of Awwwards-featured sites:
large type, small corner text, lots of space. Keep it that way.

- **Name:** "MountainLab" comes from the owners' favourite Team Fortress 2 map, Mountain
  Lab. Any nod to it should stay subtle.
- **No big headline.** A full-width wordmark was tried and rejected. The landscape is the
  hero; the text stays small.
- **Fonts:** the "MountainLab" mark (top-left) uses **Anton** from Google Fonts, a free
  stand-in for TF2 Build, the game's logo font. Everything else uses Inter Tight. Both load
  through `next/font` in `app/layout.js`. Don't host Valve's real TF2 fonts: the owner
  decided against it.
- **Corner text:** small Inter Tight (13px) text one gutter (`clamp(16px, 2.5vw, 40px)`)
  from each edge. Top-left is the `<h1>` "MountainLab". Top-right has the public links:
  Plex (`plex.mountainlab.net`) and Requests (`request.mountainlab.net`). Bottom-left shows
  the palette name and the seed as a TF2-style map name (`cp_mountainlab · 62670`), and bottom-right says "Refresh for a new range".
- **Palettes come from the map.** The colours were sampled from in-game Mountain Lab
  screenshots: mauve-grey overcast sky warming to dusty pink, a lilac band on the tree
  line, blue-violet haze, near-black pines. Palettes are picked at random by `weight`:
  - Overcast (4): the map as it plays
  - Lilac (2)
  - Last Light (2): the only sunlit map-colour scene
  - RED (1) and BLU (1): muted team-colour moods
  - **Mann Manor**, the map's Halloween version (purple night, green moon), joins the pool
    only in October.
- **Lighting:** `sun: false` means overcast: there is no disc, just a wide, soft glow low
  over the ridges. Bands of valley fog (`FOG_LAYERS`, strength `fog`) give the hazy
  alpine depth.
- **Colours:** each palette sets `top`, the top-corner text colour, picked by hand for
  contrast against that palette's sky. Bottom text is always light, because the nearest
  ridge is dark in every palette. If you add or change a palette, check both.
- The favicon (`app/icon.svg`) uses the Overcast colours.

- A new random seed is picked **only on page load**. Clicking does nothing; that was
  intentional (see commit `927048a`).
- The seed picks the palette (weighted, see above) and
  sets the sun position and ridge shapes.
- 9 ridge layers go from far (pale, misty, many peaks) to near (dark, larger, smoother).
  Each layer mixes fBm noise with ridged noise.
- Parallax: layers shift with the pointer, or with device tilt on mobile, eased each frame.
  Nearer layers move more. It is off under `prefers-reduced-motion`.
- On resize, the scene is rebuilt with the **same seed** at the new size (debounced
  150 ms). The page fades in on load.

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
| `app/globals.css` | Full-viewport, no-scroll body; the fixed full-screen `.scene`; fade-in; wordmark, corner-text and nav-hover styles. |
| `app/icon.svg` | Favicon: a small mountain tile in the Overcast palette. |
| `components/Mountains.js` | Client component. Contains `PALETTES`, `buildScene()` (ridge geometry and wordmark placement), the resize and parallax effects, and the bottom corner text. Takes `children` for the top bar. |
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
  in an overlay above `.scene`, and make it readable on every palette, from the mid-tone
  skies (Overcast, Lilac, Last Light) to the dark ones (BLU, RED, Mann Manor).
- Keep the site static and light. Prefer plain CSS in `globals.css` (or CSS modules) over
  adding UI frameworks.
- `buildScene()` must stay deterministic for a given `(w, h, seed)`. Resize relies on this
  to keep the same scene.
- Match the existing style: small, focused files, two-space indent, single quotes, short
  comments only where something isn't obvious.
