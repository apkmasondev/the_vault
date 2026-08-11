# THE VAULT

A cinematic, single-page containment experience driven by scroll-scrubbed video and a lightweight procedural WebGL reveal.

Scrolling an eleven-screen section produces one damped number between zero and one. That number seeks two all-intra films frame by frame, hands over to a live Three.js scene at frame 239 of the second film, and drives the audio filtering. The object that emerges can be held, carried, thrown against the walls of the chamber, and broken.

## What is in it

- **Scroll-scrubbed film** — two H.264 renders encoded so every frame is a keyframe, seeked rather than played, with a scheduler that caps how far each seek may jump
- **Live WebGL reveal** — hand-written GLSL for the core, its molten interior, the drifting particulate, the motes and the smoke, plus a three-pass bloom, shock-ring and grain chain built on Three's render targets rather than a post-processing library
- **An object with weight** — hold it still to charge it and release for a shockwave, or drag it and let go while your hand is still moving. It carries its momentum into the walls, sheds burning shards, and comes back hot
- **Consequences that last** — heat fades but damage does not. Its structural integrity is on screen from the moment it appears, and at zero the object comes apart into tumbling shards for good, leaving an empty chamber and a different ending
- **Audio-reactive geometry** — the soundtrack is analysed while it plays and its bands displace the surface
- **Reachable without a pointer** — the arrow keys shove the object hard enough to reach the walls, so nothing in the piece is mouse-only
- **An About panel** (`#about`) — tells the story first and the engineering second, diagrams the timeline as a draggable scrubber, and reads live instrumentation out of the running experience
- **Cinematic mode** — plays the whole timeline hands-free for visitors who never discover the scroll interaction; any wheel, drag or navigation key takes control back
- **Chapter rail** — named beats that can be jumped to

## Stack

- Vite 8, React 19 and strict TypeScript
- direct Three.js rendering with adaptive quality and its own post-processing chain
- native scroll and two all-intra H.264 video layers
- local AAC soundtrack routed through Web Audio with reactive filtering and live spectrum analysis
- Vitest for the pure logic, and jsdom with Testing Library for the entry gate and the About dialog
- ESLint, with no warnings tolerated
- GitHub Actions deployment to GitHub Pages

Three runtime dependencies: React, React DOM and Three.js. Nothing is loaded from a third party at runtime — no fonts, analytics, trackers or remote media.

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

The two supplied 1280×720, 24 FPS source renders are pre-rendered footage. They are converted locally to silent all-intra H.264 derivatives — every frame a keyframe — for precise forward and reverse seeking:

```bash
ffmpeg -i source.mp4 -c:v libx264 -preset veryslow -crf 22 -x264-params "keyint=1:min-keyint=1:scenecut=0:bframes=0:ref=1" -pix_fmt yuv420p -an -movflags +faststart out-720-gop1.mp4
```

The 540p variants use the same parameters with `-vf scale=960:540:flags=lanczos` and CRF 24. The sources are themselves lossy at roughly 1.9 Mb/s, so encoding the derivatives far above that only preserves compression artefacts; CRF 22 holds SSIM 0.983 against the source while costing a third less than a higher-bitrate encode.


- `public/media/vault-unlock-720-gop1.mp4`
- `public/media/vault-unlock-540-gop1.mp4`
- `public/media/vault-opening-720-gop1.mp4`
- `public/media/vault-opening-540-gop1.mp4`

The reveal after frame 239 of the opening film is rendered live in WebGL. The supplied soundtrack is delivered as a 96 kb/s AAC-LC file (`public/media/vault-corroded-silence.m4a`), filtered against the sequence intensity, analysed for the reactive geometry, and mixed with synthesised charge and impact tones. Original root-level MP4 source renders are intentionally ignored by Git; only optimized delivery files are published.

## Degradation

Render quality is selected from device memory, core count, pointer type and the Save-Data hint, then dropped a tier if frame times slip — the bloom chain goes first. Missing WebGL falls back to a CSS rendering of the object, a failed film is covered by a still frame, a stalled load releases the entry gate after eight seconds, and `prefers-reduced-motion` swaps the whole sequence for a click-through with no movement.

## Deployment

Pushes to `main` run CI and the Pages workflow. In the repository settings, GitHub Pages must use **GitHub Actions** as its source.

Production URL: <https://apkmason.dev/the_vault/>  
GitHub Pages URL (redirects to the configured domain): <https://apkmasondev.github.io/the_vault/>

## Credits

Built from the supplied cinematic source renders and soundtrack with FFmpeg, React, Three.js and Vite. No third-party runtime textures, fonts, analytics or remote media are used.
