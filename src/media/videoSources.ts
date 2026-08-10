import { asset, MEDIA } from '../app/constants';

interface NetworkInformationLike {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

type NavigatorWithConnection = Navigator & {
  readonly connection?: NetworkInformationLike;
};

export interface VideoSourceSet {
  readonly unlock: string;
  readonly opening: string;
  readonly resolution: '720p' | '540p';
}

export const selectVideoSources = (): VideoSourceSet => {
  const connection = (navigator as NavigatorWithConnection).connection;
  const portrait = window.innerHeight > window.innerWidth;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const constrainedNetwork =
    connection?.saveData === true ||
    connection?.effectiveType === '2g' ||
    connection?.effectiveType === 'slow-2g';
  const preferMobile =
    constrainedNetwork ||
    (portrait && window.innerWidth < 900) ||
    (coarsePointer && window.innerWidth < 720);

  return preferMobile
    ? {
        unlock: asset(MEDIA.unlock540),
        opening: asset(MEDIA.opening540),
        resolution: '540p',
      }
    : {
        unlock: asset(MEDIA.unlock720),
        opening: asset(MEDIA.opening720),
        resolution: '720p',
      };
};
