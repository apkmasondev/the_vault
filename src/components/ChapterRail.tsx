import { CHAPTERS } from '../app/constants';

interface ChapterRailProps {
  readonly activeId: string;
  readonly onSeek: (progress: number) => void;
}

/** Named beats, so the sequence can be revisited instead of only endured once. */
export const ChapterRail = ({ activeId, onSeek }: ChapterRailProps) => (
  <nav className="chapters" aria-label="Sequence chapters">
    <ul>
      {CHAPTERS.map((chapter) => (
        <li key={chapter.id}>
          <button
            type="button"
            className={`chapters__item${chapter.id === activeId ? ' is-active' : ''}`}
            aria-current={chapter.id === activeId ? 'step' : undefined}
            onClick={() => onSeek(chapter.progress)}
          >
            <span className="chapters__label">{chapter.label}</span>
            <span className="chapters__dot" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  </nav>
);
