import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

const MEDIA_DIRECTORY = 'public/media';

/**
 * Files under `public/` are copied verbatim, so a re-encoded film keeps its old
 * URL and returning visitors keep the cached bytes. This stamps the delivered
 * media with a hash of its own contents, which changes only when the media does.
 */
const mediaVersion = (): string => {
  try {
    const digest = createHash('sha256');
    for (const name of readdirSync(MEDIA_DIRECTORY).sort()) {
      digest.update(name);
      digest.update(readFileSync(join(MEDIA_DIRECTORY, name)));
    }
    return digest.digest('hex').slice(0, 8);
  } catch {
    return 'dev';
  }
};

const mediaVersionPlugin = (version: string): Plugin => ({
  name: 'vault-media-version',
  // The preload in index.html has to carry the same stamp as the runtime
  // request, or the poster is fetched twice.
  transformIndexHtml: (html) => html.replaceAll('media/vault-poster.webp', `media/vault-poster.webp?v=${version}`),
});

export default defineConfig(() => {
  const version = mediaVersion();

  return {
    base: '/the_vault/',
    plugins: [react(), mediaVersionPlugin(version)],
    define: {
      __MEDIA_VERSION__: JSON.stringify(version),
    },
    build: {
      target: 'es2022',
      cssCodeSplit: true,
      sourcemap: false,
      reportCompressedSize: true,
      // Three.js is isolated in one lazy chunk; 134 kB gzip is intentional and never blocks LCP.
      chunkSizeWarningLimit: 600,
    },
    test: {
      // Node by default so the pure logic stays fast; the component tests opt
      // into jsdom individually with a `@vitest-environment` docblock.
      environment: 'node',
      include: ['tests/**/*.test.{ts,tsx}'],
    },
  };
});
