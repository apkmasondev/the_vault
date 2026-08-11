import { useEffect, useRef, useState } from 'react';
import type { VaultRenderer } from '../webgl/VaultRenderer';

export interface VaultRendererHandle {
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Null until the chunk has arrived, and again once it has been disposed. */
  readonly rendererRef: React.RefObject<VaultRenderer | null>;
  /** True once the renderer has either started or definitively failed. */
  readonly webglReady: boolean;
  readonly webglFailed: boolean;
}

/**
 * Owns the live renderer. Three.js is a large chunk and is imported lazily, so
 * the renderer arrives after the first paint and may never arrive at all —
 * every caller has to cope with the ref being null, and with `webglFailed`
 * standing for both "the import failed" and "the context was lost".
 */
export const useVaultRenderer = (): VaultRendererHandle => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<VaultRenderer | null>(null);
  const [webglReady, setWebglReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let renderer: VaultRenderer | null = null;

    const initialize = async (): Promise<void> => {
      try {
        const module = await import('../webgl/VaultRenderer');
        if (disposed) return;
        renderer = new module.VaultRenderer(canvas, setWebglFailed);
        rendererRef.current = renderer;
        setWebglReady(true);
      } catch {
        if (!disposed) {
          // Ready and failed together: the entry gate must not wait on a
          // renderer that is never coming.
          setWebglFailed(true);
          setWebglReady(true);
        }
      }
    };

    void initialize();
    return () => {
      disposed = true;
      renderer?.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, []);

  return { canvasRef, rendererRef, webglReady, webglFailed };
};
