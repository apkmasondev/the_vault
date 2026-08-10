export type QualityTier = 'high' | 'medium' | 'low';

interface NavigatorWithHints extends Navigator {
  readonly deviceMemory?: number;
  readonly connection?: { readonly saveData?: boolean };
}

export interface QualityProfile {
  readonly tier: QualityTier;
  readonly dpr: number;
  readonly particles: number;
  readonly stars: number;
  /** Large, soft, defocused motes drifting in the opened chamber. */
  readonly motes: number;
  /** Warped-noise smoke is the most expensive thing per pixel in the scene. */
  readonly smoke: boolean;
  readonly geometryDetail: number;
  /** The bloom chain is the first thing dropped on a struggling device. */
  readonly postProcessing: boolean;
}

const profileFor = (tier: QualityTier): QualityProfile => {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const deviceDpr = window.devicePixelRatio || 1;

  if (tier === 'high') {
    return {
      tier,
      dpr: Math.min(deviceDpr, coarse ? 1.25 : 1.5),
      particles: 1050,
      stars: 440,
      motes: 68,
      smoke: true,
      geometryDetail: 4,
      postProcessing: true,
    };
  }

  if (tier === 'medium') {
    return {
      tier,
      dpr: Math.min(deviceDpr, 1.25),
      particles: 620,
      stars: 270,
      motes: 44,
      smoke: true,
      geometryDetail: 3,
      postProcessing: true,
    };
  }

  return {
    tier,
    dpr: 1,
    particles: 300,
    stars: 140,
    motes: 22,
    smoke: false,
    geometryDetail: 2,
    postProcessing: false,
  };
};

export const selectInitialQuality = (): QualityProfile => {
  const navigatorWithHints = navigator as NavigatorWithHints;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) < 500;
  const lowMemory = (navigatorWithHints.deviceMemory ?? 8) <= 4;
  const lowCores = (navigator.hardwareConcurrency || 8) <= 4;

  if (navigatorWithHints.connection?.saveData || lowMemory || (lowCores && coarse)) {
    return profileFor('low');
  }
  if (coarse || smallViewport || (navigator.hardwareConcurrency || 8) <= 6) {
    return profileFor('medium');
  }
  return profileFor('high');
};

export const degradeQuality = (tier: QualityTier): QualityProfile =>
  profileFor(tier === 'high' ? 'medium' : 'low');
