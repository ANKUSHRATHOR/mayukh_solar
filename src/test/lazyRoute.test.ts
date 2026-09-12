import { describe, expect, it } from 'vitest';
import { isStaleChunkError } from '@/lib/lazyRoute';

describe('isStaleChunkError', () => {
  it('recognises the wording each browser uses for a missing route chunk', () => {
    // Chrome / Edge
    expect(
      isStaleChunkError(
        new Error(
          'Failed to fetch dynamically imported module: https://astra.mayukhsolar.in/assets/UserManagementPage-CnP4xo5u.js',
        ),
      ),
    ).toBe(true);
    // Safari
    expect(
      isStaleChunkError(new Error('Importing a module script failed.')),
    ).toBe(true);
    // Firefox
    expect(
      isStaleChunkError(new Error('error loading dynamically imported module')),
    ).toBe(true);
  });

  it('leaves ordinary render errors alone, so they still surface as bugs', () => {
    expect(isStaleChunkError(new Error("Cannot read properties of undefined (reading 'map')"))).toBe(
      false,
    );
    expect(isStaleChunkError(new Error('Failed to fetch'))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});
