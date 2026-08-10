# THE VAULT

A cinematic, single-page containment experience driven by scroll-scrubbed video and a lightweight procedural WebGL reveal.

Scrolling a nine-screen section produces one damped number between zero and one. That number seeks two all-intra films frame by frame, hands over to a live Three.js scene at frame 239 of the second film, and drives the audio filtering. The object that emerges responds to being held, dragged and heard.

## What is in it

- **Scroll-scrubbed film** — two H.264 renders encoded so every frame is a keyframe, seeked rather than played, with a scheduler that caps how far each seek may jump
- **Live WebGL reveal** — hand-written GLSL for the core, shell, particulate and haze, plus a three-pass bloom, shock-ring and grain chain built on Three's render targets rather than a post-processing library
- **A held object** — press to charge it, release for a shockwave, drag sideways to spin it; three full-charge releases log a hidden resonance that changes the closing record
- **Audio-reactive geometry** — the soundtrack is analysed while it plays and its bands displace the surface
- **An About panel** (`#about`) — explains the mechanism, diagrams the timeline as a draggable scrubber, and reads live instrumentation out of the running experience
- **Cinematic mode** — plays the whole timeline hands-free for visitors who never discover the scroll interaction; any wheel, drag or navigation key takes control back
- **Chapter rail** — named beats that can be jumped to

## Stack

- Vite 8, React 19 and strict TypeScript
- direct Three.js rendering with adaptive quality and its own post-processing chain
- native scroll and two all-intra H.264 video layers
- local AAC soundtrack routed through Web Audio with reactive filtering and live spectrum analysis
- Vitest and ESLint
- GitHub Actions deployment to GitHub Pages

## Local development

Requires Node.js 24 (Node 22.12+ is also compatible with the current Vite release).

```bash
npm ci
npm run dev
```

The project is configured for the GitHub Pages base path `/the_vault/`.

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run preview
```

## Media pipeline

The two supplied 1280×720, 24 FPS source renders are pre-rendered footage. They are converted locally to silent GOP1 H.264 derivatives for precise forward and reverse seeking:

- `public/media/vault-unlock-720-gop1.mp4`
- `public/media/vault-unlock-540-gop1.mp4`
- `public/media/vault-opening-720-gop1.mp4`
- `public/media/vault-opening-540-gop1.mp4`

The reveal after frame 239 of the opening film is rendered live in WebGL. The supplied soundtrack is delivered as a 96 kb/s AAC-LC file (`public/media/vault-of-iron-sleep.m4a`), filtered against the sequence intensity, analysed for the reactive geometry, and mixed with synthesised charge and impact tones. Original root-level MP4 source renders are intentionally ignored by Git; only optimized delivery files are published.

## Degradation

Render quality is selected from device memory, core count, pointer type and the Save-Data hint, then dropped a tier if frame times slip — the bloom chain goes first. Missing WebGL falls back to a CSS rendering of the object, a failed film is covered by a still frame, a stalled load releases the entry gate after eight seconds, and `prefers-reduced-motion` swaps the whole sequence for a click-through with no movement.

## Deployment

Pushes to `main` run CI and the Pages workflow. In the repository settings, GitHub Pages must use **GitHub Actions** as its source.

Production URL: <https://apkmason.dev/the_vault/>  
GitHub Pages URL (redirects to the configured domain): <https://apkmasondev.github.io/the_vault/>

## Credits

Built from the supplied cinematic source renders and soundtrack with FFmpeg, React, Three.js and Vite. No third-party runtime textures, fonts, analytics or remote media are used.
