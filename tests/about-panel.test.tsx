// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AboutPanel } from '../src/components/AboutPanel';
import { createTelemetry } from '../src/app/telemetry';

afterEach(cleanup);

const panel = (overrides: Partial<Parameters<typeof AboutPanel>[0]> = {}) => {
  const onClose = vi.fn();
  const telemetry = createTelemetry('720p');
  render(
    <AboutPanel
      readTelemetry={() => telemetry}
      live={false}
      cinematicRunning={false}
      onSeek={vi.fn()}
      onToggleCinematic={vi.fn()}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onClose };
};

describe('AboutPanel', () => {
  it('is a modal dialog', () => {
    panel();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // Labelled by its own heading rather than by a bare string.
    expect(document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')).toBeTruthy();
  });

  it('opens with focus inside itself', () => {
    panel();
    expect(document.activeElement?.textContent).toContain('CLOSE');
  });

  it('closes on Escape', () => {
    const { onClose } = panel();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps Tab inside the dialog at both ends', () => {
    panel();
    const dialog = screen.getByRole('dialog');
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    expect(focusable.length).toBeGreaterThan(1);

    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('returns focus where it came from when it closes', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    panel();
    expect(document.activeElement).not.toBe(opener);

    cleanup();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('leaves out the live instrumentation when there is no sequence running', () => {
    panel({ live: false });
    expect(screen.queryByText('Live instrumentation')).toBeNull();
    expect(screen.queryByLabelText('Sequence position')).toBeNull();
  });

  it('shows the instrumentation and the scrubber when one is', () => {
    panel({ live: true });
    expect(screen.getByText('Live instrumentation')).toBeTruthy();
    expect(screen.getByLabelText('Sequence position')).toBeTruthy();
  });
});
