# THE VAULT

A cinematic, single-page containment experience driven by scroll-scrubbed video and a lightweight procedural WebGL reveal.

## Stack

- Vite 8, React 19 and strict TypeScript
- direct Three.js rendering with adaptive quality
- native scroll and two all-intra H.264 video layers
- local AAC soundtrack routed through Web Audio with reactive filtering
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

The reveal after frame 239 of the opening film is rendered live in WebGL. The supplied soundtrack is delivered as a 96 kb/s AAC-LC file (`public/media/vault-of-iron-sleep.m4a`) and enhanced with a lightweight reactive filter plus synthesized interaction impacts. Original root-level MP4 source renders are intentionally ignored by Git; only optimized delivery files are published.

## Deployment

Pushes to `main` run CI and the Pages workflow. In the repository settings, GitHub Pages must use **GitHub Actions** as its source.

Production URL: <https://apkmason.dev/the_vault/>  
GitHub Pages URL (redirects to the configured domain): <https://apkmasondev.github.io/the_vault/>

## Credits

Built from the supplied cinematic source renders and soundtrack with FFmpeg, React, Three.js and Vite. No third-party runtime textures, fonts, analytics or remote media are used.
