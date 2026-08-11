// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EntryGate } from '../src/components/EntryGate';

afterEach(cleanup);

const gate = (overrides: Partial<Parameters<typeof EntryGate>[0]> = {}) => {
  const onAuthorize = vi.fn();
  const onGesture = vi.fn();
  render(
    <EntryGate
      ready
      loadProgress={100}
      defaultSound
      onGesture={onGesture}
      onAuthorize={onAuthorize}
      {...overrides}
    />,
  );
  return { onAuthorize, onGesture };
};

describe('EntryGate', () => {
  it('shows the loader and no way in until the sequence is ready', () => {
    gate({ ready: false, loadProgress: 40 });
    expect(screen.getByRole('status').textContent).toContain('40%');
    expect(screen.queryByLabelText(/hold to authorize/i)).toBeNull();
  });

  it('offers a way in once ready', () => {
    gate();
    expect(screen.getByLabelText(/hold to authorize/i)).toBeTruthy();
    expect(screen.getByText('HOLD TO AUTHORIZE')).toBeTruthy();
  });

  it('enters muted immediately when asked, and never with sound', () => {
    const { onAuthorize } = gate();
    fireEvent.click(screen.getByText('ENTER MUTED'));
    expect(onAuthorize).toHaveBeenCalledWith(false);
  });

  it('authorizes only after the hold is seen through', () => {
    vi.useFakeTimers();
    try {
      const { onAuthorize, onGesture } = gate();
      const control = screen.getByLabelText(/hold to authorize/i);
      control.setPointerCapture = vi.fn();

      fireEvent.pointerDown(control, { pointerId: 1 });
      // The gesture is reported at once so the audio context can be created
      // while the user is still holding.
      expect(onGesture).toHaveBeenCalled();
      expect(onAuthorize).not.toHaveBeenCalled();

      vi.advanceTimersByTime(600);
      expect(onAuthorize).not.toHaveBeenCalled();

      vi.advanceTimersByTime(400);
      expect(onAuthorize).toHaveBeenCalledWith(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('abandons the hold if the pointer is lifted early', () => {
    vi.useFakeTimers();
    try {
      const { onAuthorize } = gate();
      const control = screen.getByLabelText(/hold to authorize/i);
      control.setPointerCapture = vi.fn();

      fireEvent.pointerDown(control, { pointerId: 1 });
      vi.advanceTimersByTime(500);
      fireEvent.pointerUp(control, { pointerId: 1 });
      vi.advanceTimersByTime(2_000);

      expect(onAuthorize).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('can be held with the keyboard', () => {
    vi.useFakeTimers();
    try {
      const { onAuthorize } = gate();
      const control = screen.getByLabelText(/hold to authorize/i);

      fireEvent.keyDown(control, { key: 'Enter' });
      vi.advanceTimersByTime(1_000);
      expect(onAuthorize).toHaveBeenCalledWith(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
