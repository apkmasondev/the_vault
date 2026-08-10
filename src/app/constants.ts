export const VIDEO_FPS = 24;
export const VIDEO_2_REVEAL_CUTOFF = 239 / VIDEO_FPS;
export const VIDEO_DURATION_FALLBACK = 10;
export const SCROLL_DAMPING_SECONDS = 0.105;

/**
 * Every threshold on the 0…1 scroll timeline lives here. Nothing downstream —
 * cue selection, video seeking, shader ramps, audio — is allowed to invent its
 * own number, so the sequence can be retimed from a single place.
 */
export const TIMELINE = {
  introEnd: 0.06,
  video1Start: 0.06,
  disengagedStart: 0.38,
  video1End: 0.48,
  warningStart: 0.48,
  doNotOpenStart: 0.535,
  video2Start: 0.56,
  video2End: 0.84,
  revealStart: 0.84,
  originStart: 0.89,
  stabilityStart: 0.93,
  revealEnd: 0.94,
  unstableEnd: 0.965,
  failureStart: 0.965,
  finalStart: 0.997,
} as const;

/** Continuous ramps consumed by the crossfade, the renderer and the audio graph. */
export const RAMPS = {
  crossfadeStart: 0.552,
  crossfadeEnd: 0.572,
  openFadeStart: 0.58,
  openFadeEnd: 0.86,
  revealFadeStart: 0.835,
  revealFadeEnd: 0.925,
  failureFadeStart: 0.975,
  failureFadeEnd: 0.995,
  artifactHiddenAfter: 0.999,
  audioIntensityStart: 0.35,
  audioIntensitySpan: 0.6,
} as const;

export interface Chapter {
  readonly id: string;
  readonly label: string;
  readonly progress: number;
}

/** Named beats used by the chapter rail and by the About panel diagram. */
export const CHAPTERS: readonly Chapter[] = [
  { id: 'seal', label: 'SEALED', progress: 0 },
  { id: 'lock', label: 'LOCK SEQUENCE', progress: 0.2 },
  { id: 'release', label: 'RELEASED', progress: TIMELINE.warningStart + 0.01 },
  { id: 'aperture', label: 'APERTURE', progress: TIMELINE.video2Start + 0.06 },
  { id: 'object', label: 'THE OBJECT', progress: TIMELINE.revealStart + 0.02 },
  { id: 'breach', label: 'BREACH', progress: TIMELINE.failureStart + 0.005 },
] as const;

export const MEDIA = {
  unlock720: 'media/vault-unlock-720-gop1.mp4',
  unlock540: 'media/vault-unlock-540-gop1.mp4',
  opening720: 'media/vault-opening-720-gop1.mp4',
  opening540: 'media/vault-opening-540-gop1.mp4',
  poster: 'media/vault-poster.webp',
  transition: 'media/vault-opening-transition.webp',
  soundtrack: 'media/vault-corroded-silence.m4a',
} as const;

/** Hard ceiling on the entry loader so a stalled asset can never trap a visitor. */
export const LOAD_WATCHDOG_MS = 8_000;

/**
 * Resolves a delivered asset. Media carries a content stamp because everything
 * under `public/` keeps its filename across re-encodes, and without the stamp a
 * returning visitor would be served the previous cut from cache.
 */
export const asset = (path: string): string => {
  const clean = path.replace(/^\/+/, '');
  const stamped = clean.startsWith('media/') ? `${clean}?v=${__MEDIA_VERSION__}` : clean;
  return `${import.meta.env.BASE_URL}${stamped}`;
};
