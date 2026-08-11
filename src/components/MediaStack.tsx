import type { RefObject } from 'react';
import { asset, MEDIA } from '../app/constants';
import type { VideoSourceSet } from '../media/videoSources';

interface MediaStackProps {
  readonly sources: VideoSourceSet;
  readonly posterRef: RefObject<HTMLImageElement | null>;
  readonly transitionRef: RefObject<HTMLImageElement | null>;
  readonly video1Ref: RefObject<HTMLVideoElement | null>;
  readonly video2Ref: RefObject<HTMLVideoElement | null>;
  readonly onPosterReady: () => void;
  readonly onUnlockReady: () => void;
  readonly onOpeningReady: () => void;
  readonly onOpeningFailed: () => void;
  readonly onMediaError: () => void;
}

/**
 * The photographic layers, stacked and crossfaded by the animation loop.
 * Nothing here decides anything: opacity, seeking and load bookkeeping all
 * belong to the caller, which holds the refs.
 */
export const MediaStack = ({
  sources,
  posterRef,
  transitionRef,
  video1Ref,
  video2Ref,
  onPosterReady,
  onUnlockReady,
  onOpeningReady,
  onOpeningFailed,
  onMediaError,
}: MediaStackProps) => (
  <div className="media-stack" aria-hidden="true">
    <img
      ref={posterRef}
      className="media-layer media-poster"
      src={asset(MEDIA.poster)}
      alt=""
      draggable={false}
      fetchPriority="high"
      decoding="sync"
      onLoad={onPosterReady}
      onError={() => {
        onPosterReady();
        onMediaError();
      }}
    />
    <img
      ref={transitionRef}
      className="media-layer transition-fallback"
      src={asset(MEDIA.transition)}
      alt=""
      draggable={false}
    />
    <video
      ref={video1Ref}
      className="media-layer video-layer video-layer--first"
      src={sources.unlock}
      muted
      playsInline
      preload="metadata"
      disablePictureInPicture
      draggable={false}
      tabIndex={-1}
      onLoadedMetadata={(event) => {
        event.currentTarget.pause();
        onUnlockReady();
      }}
      onError={() => {
        onUnlockReady();
        onMediaError();
      }}
    />
    <video
      ref={video2Ref}
      className="media-layer video-layer video-layer--second"
      src={sources.opening}
      muted
      playsInline
      preload="none"
      disablePictureInPicture
      draggable={false}
      tabIndex={-1}
      onLoadedData={(event) => {
        event.currentTarget.pause();
        onOpeningReady();
      }}
      onError={() => {
        onOpeningFailed();
        onMediaError();
      }}
    />
  </div>
);
