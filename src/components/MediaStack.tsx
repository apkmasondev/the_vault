import type { RefObject } from 'react';
import { asset, MEDIA } from '../app/constants';

interface MediaStackProps {
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
      src={asset(MEDIA.unlock)}
      muted
      playsInline
      // The unlock film is scrubbed from the first pixel of scroll, so it is
      // fetched whole rather than by range request. At 2.9 MB it lands well
      // inside the entry hold; while it was all-intra and 7 MB it could not,
      // and the opening seconds seeked against a half-filled buffer.
      preload="auto"
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
      src={asset(MEDIA.opening)}
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
