export const VIDEO_FPS = 24;
export const VIDEO_2_REVEAL_CUTOFF = 239 / VIDEO_FPS;
export const VIDEO_DURATION_FALLBACK = 10;
export const SCROLL_DAMPING_SECONDS = 0.105;

/**
 * Every threshold on the 0…1 scroll timeline lives here. Nothing downstream —
 * cue selection, video seeking, shader ramps, audio — is allowed to invent its
 * own number, so the sequence can be retimed from a single place.
 */
/**
 * Derived from a fixed budget of scroll, in viewport heights, so the two films
 * keep the scrubbing feel they were tuned with while the beats around them can
 * be given more or less room. The section is `--timeline-height` tall; changing
 * a figure here means changing that to match the new total.
 *
 *   sealed 55 · unlock film 386 · warning 74 · opening film 258
 *   · the object 145 · containment failure 135 · archive 7   = 1060
 */
export const TIMELINE = {
  introEnd: 0.052,
  video1Start: 0.052,
  disengagedStart: 0.329,
  video1End: 0.416,
  warningStart: 0.416,
  doNotOpenStart: 0.464,
  video2Start: 0.486,
  video2End: 0.729,
  revealStart: 0.729,
  originStart: 0.784,
  stabilityStart: 0.828,
  revealEnd: 0.839,
  unstableEnd: 0.866,
  failureStart: 0.866,
  collapseStart: 0.93,
  finalStart: 0.993,
} as const;

/** Continuous ramps consumed by the crossfade, the renderer and the audio graph. */
export const RAMPS = {
  crossfadeStart: 0.478,
  crossfadeEnd: 0.498,
  openFadeStart: 0.506,
  openFadeEnd: 0.749,
  revealFadeStart: 0.724,
  revealFadeEnd: 0.822,
  // Stretched across the widened failure beat so the collapse builds instead of
  // arriving all at once.
  failureFadeStart: 0.888,
  failureFadeEnd: 0.985,
  artifactHiddenAfter: 0.999,
  audioIntensityStart: 0.3,
  audioIntensitySpan: 0.52,
} as const;

export interface Chapter {
  readonly id: string;
  readonly label: string;
  readonly progress: number;
}

/** Named beats used by the chapter rail and by the About panel diagram. */
export const CHAPTERS: readonly Chapter[] = [
  { id: 'seal', label: 'SEALED', progress: 0 },
  { id: 'lock', label: 'LOCK SEQUENCE', progress: 0.18 },
  { id: 'release', label: 'RELEASED', progress: TIMELINE.warningStart + 0.01 },
  { id: 'aperture', label: 'APERTURE', progress: TIMELINE.video2Start + 0.05 },
  { id: 'object', label: 'THE OBJECT', progress: TIMELINE.revealStart + 0.02 },
  { id: 'breach', label: 'BREACH', progress: TIMELINE.failureStart + 0.005 },
  { id: 'collapse', label: 'COLLAPSE', progress: TIMELINE.collapseStart + 0.005 },
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
