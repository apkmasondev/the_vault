export const VIDEO_FPS = 24;
export const VIDEO_2_REVEAL_CUTOFF = 239 / VIDEO_FPS;
export const VIDEO_DURATION_FALLBACK = 10;
export const SCROLL_DAMPING_SECONDS = 0.105;

export const TIMELINE = {
  introEnd: 0.06,
  video1Start: 0.06,
  video1End: 0.48,
  warningStart: 0.48,
  warningEnd: 0.56,
  video2Start: 0.56,
  video2End: 0.84,
  revealStart: 0.84,
  revealEnd: 0.94,
  unstableEnd: 0.965,
  failureStart: 0.965,
  finalStart: 0.997,
} as const;

export const MEDIA = {
  unlock720: 'media/vault-unlock-720-gop1.mp4',
  unlock540: 'media/vault-unlock-540-gop1.mp4',
  opening720: 'media/vault-opening-720-gop1.mp4',
  opening540: 'media/vault-opening-540-gop1.mp4',
  poster: 'media/vault-poster.webp',
  transition: 'media/vault-opening-transition.webp',
  soundtrack: 'media/vault-of-iron-sleep.m4a',
} as const;

export const asset = (path: string): string =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
