import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAudioPlayer } from './audioSynth';

describe('audioSynth', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes correctly in node environment (window is undefined)', () => {
    // Force window to be undefined
    vi.stubGlobal('window', undefined);

    const player = getAudioPlayer();
    expect(player).toBeDefined();
    expect(player.playSwirlChime).toBeTypeOf('function');
    expect(player.playSwoosh).toBeTypeOf('function');
    expect(player.playNeedleSnap).toBeTypeOf('function');
    expect(player.resume).toBeTypeOf('function');

    // Calling methods in null environment should not throw
    expect(() => player.playSwirlChime()).not.toThrow();
    expect(() => player.playSwoosh()).not.toThrow();
    expect(() => player.playNeedleSnap()).not.toThrow();
    expect(player.resume()).resolves.toBeUndefined();
  });

  it('safely handles window existing but AudioContext class throwing/missing', () => {
    // Mock window without AudioContext
    vi.stubGlobal('window', {
      AudioContext: undefined,
    });

    const player = getAudioPlayer();
    expect(player).toBeDefined();
    expect(() => player.playSwirlChime()).not.toThrow();
    expect(() => player.playSwoosh()).not.toThrow();
    expect(() => player.playNeedleSnap()).not.toThrow();
  });

  it('handles AudioContext constructor throwing error', () => {
    // Mock window where AudioContext constructor throws an error
    vi.stubGlobal('window', {
      AudioContext: vi.fn().mockImplementation(() => {
        throw new Error('AudioContext blocked or not supported');
      }),
    });

    const player = getAudioPlayer();
    expect(player).toBeDefined();
    expect(() => player.playSwirlChime()).not.toThrow();
  });
});
