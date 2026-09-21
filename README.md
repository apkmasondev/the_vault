# THE VAULT

A cinematic, single-page containment experience driven by scroll-scrubbed video and a live WebGL artifact built in Blender.

Scrolling an eleven-screen section produces one damped number between zero and one. That number seeks two short-GOP films frame by frame, hands over to a live Three.js scene at frame 239 of the second film, and drives the audio filtering. The object that emerges can be held, carried, opened, thrown against the walls of the chamber, and broken.

## What is in it

- **Scroll-scrubbed film** — two H.264 renders with a six-frame GOP and no B-frames, seeked rather than played, with a scheduler that caps how far each seek may jump
- **Live WebGL reveal** — hand-written GLSL for the core, its molten interior, the drifting particulate, the motes and the smoke, plus a three-pass bloom, shock-ring and grain chain built on Three's render targets rather than a post-processing library
- **Blender-built V-07** — twenty beveled titanium plates with emissive inscriptions, three independently orbiting gimbals and a molten core. The 138 KB local GLB is merged into two shell draw calls; shader animation separates and tumbles its plates without twenty independent meshes
- **Expose the core** — a keyboard- and touch-accessible field control opens the shell into an exploded view with animated energy filaments. Three fully charged releases also unlock it. Leaving the contact window, destroying the object or replaying closes the field and releases its sustained sound
- **A chamber you can hear** — six stereo magnetic latches, a filtered pressure vent and a three-tone core signal. Synthesized effects share a deterministic stereo convolution room; a compressor controls combined peaks
- **An object with weight** — hold it still to charge it and release for a shockwave, or drag it and let go while your hand is still moving. It carries its momentum into the walls, sheds burning shards, and comes back hot
- **Consequences that last** — heat fades but damage does not. Wall strikes now cause half the original damage, allowing roughly ten solid impacts before destruction, depending on force. At zero integrity the object comes apart into tumbling shards, leaving an empty chamber and a different ending; replay restores it
- **Audio-reactive geometry** — the soundtrack is analysed while it plays and its bands displace the surface
- **Reachable without a pointer** — the arrow keys shove the object hard enough to reach the walls, so nothing in the piece is mouse-only
- **An About panel** (`#about`) — tells the story first and the engineering second, diagrams the timeline as a draggable scrubber, and reads live instrumentation out of the running experience
- **Cinematic mode** — plays the whole timeline hands-free for visitors who never discover the scroll interaction; any wheel, drag or navigation key takes control back
- **Chapter rail** — named beats that can be jumped to

## Stack

- Vite 8, React 19 and strict TypeScript
- direct Three.js rendering with adaptive quality and its own post-processing chain
- native scroll and two short-GOP H.264 video layers
- Blender-authored GLB armor, loaded locally through a separate lazy GLTF parser
- local AAC soundtrack routed through Web Audio with reactive filtering and live spectrum analysis
- Vitest for pure logic and GLB validation, and jsdom with Testing Library for interaction lifecycle, the entry gate and the About dialog
- ESLint, with no warnings tolerated
- GitHub Actions deployment to GitHub Pages

Three runtime dependencies: React, React DOM and Three.js. Nothing is loaded from a third party at runtime — no fonts, analytics, trackers or remote media.

## Controls and integrity

| Action | Control | Result |
| --- | --- | --- |
| Open the vault | Scroll, chapter rail or automatic playback | Moves through the films into the live scene |
| Charge | Hold the object still; keyboard: hold Space or Enter while it is focused | Reaches full charge in 1.5 seconds; release sends a shockwave |
| Carry and throw | Drag the object, then release while moving | Momentum carries it into the chamber walls |
| Push | Arrow keys while the object is focused | Keyboard access to wall impacts and destruction |
| Inspect | **EXPOSE THE CORE** / **SEAL THE CORE** | Separates or closes the armor with energy filaments and spatial sound |
| Resonate | Release three charges of at least 80% | Opens the shell and changes the session record |
| Restart | **REPLAY SEQUENCE** in the finale | Restores the artifact, its integrity and contact counters |

Each qualifying wall strike removes 5–15 percentage points of integrity according to its force, half the previous 10–30 points. Heat, sound, debris and camera response retain their original strength. Damage does not regenerate; opening the shell and charging alone do not damage it. Cancelled gestures, loss of focus and leaving the contact window stop charging without throwing or discharging the object. The pointer target follows the moving artifact.

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

The two supplied 1280×720, 24 FPS source renders are pre-rendered footage. They are converted locally to silent H.264 delivery files with a six-frame GOP and no B-frames, which is what makes scrubbing cheap in both directions:

```bash
ffmpeg -i source.mp4 -an -vf "fps=24,scale=1280:720:flags=lanczos,format=yuv420p" -c:v libx264 -preset veryslow -crf 22 -x264-params "keyint=6:min-keyint=6:scenecut=0:bframes=0:ref=1" -movflags +faststart vault-unlock-720.mp4
```

These films were all-intra until the encode was measured. Against the source, all-intra at CRF 22 scored VMAF 92.4 at 6.7 MB; the same CRF at a six-frame GOP scores 94.8 at 2.7 MB, because inter prediction spends on the picture what a keyframe spends on re-describing it. The seek cost that bought is 1.2 ms — 160 scrubbed seeks averaged 4.8 ms against a keyframe-per-frame 3.6 ms when running backwards, both far inside the 33 ms budget the scrubber throttles to. B-frames stay off: they would have to decode out of order on every seek.

GOP 12 was measured too and rejected. It is a further 28% smaller for no quality cost, but backward seeks reach a p95 of 11.9 ms on a desktop with hardware decode, which leaves no headroom on a phone.

A 540p tier existed to spare constrained devices the download. At 2.9 MB the 720p master is lighter than that tier ever was, so it was dropped and one master now serves everything:

- `public/media/vault-unlock-720.mp4`
- `public/media/vault-opening-720.mp4`

The reveal after frame 239 of the opening film is rendered live in WebGL. The supplied soundtrack is delivered as a 96 kb/s AAC-LC file (`public/media/vault-corroded-silence.m4a`), filtered against the sequence intensity, analysed for the reactive geometry, and mixed with synthesised charge, latch and impact sounds. Original root-level MP4 source renders are intentionally ignored by Git; only optimized delivery files are published.

The editable artifact is `tools/vault-relic.blend`. Rebuild it and its browser asset without any external models or textures:

```bash
blender --background --python tools/build_relic.py
```

The script exports `public/media/vault-relic.glb` and saves the Blender source. The website needs only the GLB; Blender is not required to run or build it. If the model cannot load, the original procedural core remains available.

The builder was run with Blender 5.2. It regenerates both files from the scripted design. Armor and inscription objects keep paired `Armor_XX` / `Circuit_XX` names and local origins at their segment centers; `RelicAssembly.ts` uses those origins to animate the merged shell. Gimbals and electrical filaments are generated in Three.js, while the editable Blender file contains the armor and inlays.

## Implementation guide

- `tools/build_relic.py` and `tools/vault-relic.blend` — reproducible model source and editable scene
- `src/webgl/RelicAssembly.ts` — GLB loading, batched armor, gimbals and energy filaments
- `src/webgl/VaultRenderer.ts` — physics, integrity, core shaders and render lifecycle
- `src/hooks/useArtifactInteraction.ts` — charging, resonance, inspection and gesture cancellation
- `src/audio/AudioEngine.ts` — soundtrack, synthesized effects, stereo room impulse and signal cleanup
- `src/components/ArtifactSurface.tsx` — accessible artifact controls
- `src/components/AboutPanel.tsx` — visitor guide, engineering notes and live readouts

The tests cover opening and closing the shell, resonance, cancelled gestures, leaving the contact window, destruction and replay. Asset validation loads the actual GLB and checks its size, finite geometry and twenty paired armor/inlay segments.

## Degradation

Render quality is selected from device memory, core count, pointer type and the Save-Data hint, then dropped a tier if frame times slip — the bloom chain goes first. Missing WebGL falls back to a CSS rendering of the object, a failed film is covered by a still frame, a stalled load releases the entry gate after eight seconds, and `prefers-reduced-motion` swaps the whole sequence for a click-through with no movement.

## Deployment

Pushes to `main` run CI and the Pages workflow. In the repository settings, GitHub Pages must use **GitHub Actions** as its source.

Production URL: <https://apkmason.dev/the_vault/>  
GitHub Pages URL (redirects to the configured domain): <https://apkmasondev.github.io/the_vault/>

## Credits

Built from the supplied cinematic source renders and soundtrack with Blender, FFmpeg, React, Three.js and Vite. V-07 geometry and its reconstruction script are included. No third-party runtime textures, fonts, analytics or remote media are used.
