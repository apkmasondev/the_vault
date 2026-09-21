/** @vitest-environment jsdom */
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useArtifactInteraction } from '../src/hooks/useArtifactInteraction';
import type { VaultRenderer } from '../src/webgl/VaultRenderer';

afterEach(cleanup);

const setup = () => {
  const renderer = {
    setInspection: vi.fn(), setGrab: vi.fn(), addSpin: vi.fn(), nudge: vi.fn(),
    releaseGrab: vi.fn(() => false), release: vi.fn(() => true),
    consumeImpact: vi.fn(() => 0), consumeDestruction: vi.fn(() => false), setInviting: vi.fn(),
  };
  const callbacks = {
    onChargeStart: vi.fn(), onChargeChange: vi.fn(), onChargeRelease: vi.fn(),
    onWallImpact: vi.fn(), onDestroyed: vi.fn(), onFracture: vi.fn(), onInspectionChange: vi.fn(),
  };
  const rendererRef = { current: renderer as unknown as VaultRenderer };
  const hook = renderHook(() => useArtifactInteraction(rendererRef, callbacks));
  hook.result.current.exposedRef.current = true;
  return { ...hook, renderer, callbacks };
};

describe('artifact field control', () => {
  it('opens and closes both the visual shell and its audio signal', () => {
    const { result, renderer, callbacks } = setup();
    act(() => result.current.toggleInspection());
    expect(result.current.inspecting).toBe(true);
    expect(renderer.setInspection).toHaveBeenLastCalledWith(true);
    expect(callbacks.onInspectionChange).toHaveBeenLastCalledWith(true);
    act(() => result.current.toggleInspection());
    expect(result.current.inspecting).toBe(false);
    expect(callbacks.onInspectionChange).toHaveBeenLastCalledWith(false);
  });

  it('opens after three fully charged releases, but not after light taps', () => {
    const { result } = setup();
    const release = (seconds: number) => act(() => {
      result.current.beginHold(0, 0);
      result.current.beginFrame(seconds);
      result.current.endHold();
    });
    release(.1);
    release(1.5);
    release(1.5);
    expect(result.current.inspecting).toBe(false);
    release(1.5);
    expect(result.current.inspecting).toBe(true);
    expect(result.current.phase.resonant).toBe(true);
  });

  it('cancels a lost gesture without throwing or discharging the object', () => {
    const { result, renderer, callbacks } = setup();
    act(() => { result.current.beginHold(200, 200); result.current.beginFrame(1); });
    act(() => result.current.cancelHold());
    expect(result.current.isHolding()).toBe(false);
    expect(result.current.chargeRef.current).toBe(0);
    expect(callbacks.onChargeRelease).toHaveBeenLastCalledWith(0);
    expect(renderer.releaseGrab).not.toHaveBeenCalled();
    expect(renderer.release).not.toHaveBeenCalled();
  });

  it('closes the shell and stops charging when the timeline leaves the object', () => {
    const { result, callbacks } = setup();
    act(() => { result.current.toggleInspection(); result.current.beginHold(0, 0); });
    result.current.exposedRef.current = false;
    act(() => result.current.beginFrame(.016));
    expect(result.current.inspecting).toBe(false);
    expect(result.current.phase.charging).toBe(false);
    expect(callbacks.onInspectionChange).toHaveBeenLastCalledWith(false);
    act(() => result.current.toggleInspection());
    expect(result.current.inspecting).toBe(false);
  });

  it('stops the sustained signal on destruction and restores a sealed replay', () => {
    const { result, renderer, callbacks } = setup();
    act(() => result.current.toggleInspection());
    renderer.consumeDestruction.mockReturnValueOnce(true);
    act(() => { result.current.endFrame(100); });
    expect(result.current.destroyed).toBe(true);
    expect(result.current.inspecting).toBe(false);
    expect(callbacks.onInspectionChange).toHaveBeenLastCalledWith(false);
    act(() => result.current.toggleInspection());
    expect(result.current.inspecting).toBe(false);
    act(() => result.current.reset());
    expect(result.current.destroyed).toBe(false);
    expect(result.current.phase.resonant).toBe(false);
  });
});
