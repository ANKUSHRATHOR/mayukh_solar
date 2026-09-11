import { describe, expect, it, vi } from 'vitest';
import { isRetryable, retryQuery } from '@/lib/retry';

const pgError = (code: string) => ({ code, message: `failed with ${code}` });

describe('isRetryable', () => {
  it('retries a connection poisoned by an aborted transaction', () => {
    // The case this module exists for: one pooled connection stuck in
    // `idle in transaction (aborted)` answers 25P02 to whatever it is handed.
    expect(isRetryable(pgError('25P02'))).toBe(true);
  });

  it('retries connection and shutdown failures', () => {
    for (const code of ['08000', '08003', '08006', '53300', '57P01', '57P02', '57P03']) {
      expect(isRetryable(pgError(code))).toBe(true);
    }
  });

  it('retries a serialization failure or deadlock', () => {
    expect(isRetryable(pgError('40001'))).toBe(true);
    expect(isRetryable(pgError('40P01'))).toBe(true);
  });

  it('does not retry an answer that will not change', () => {
    // Permission denied, undefined column, unique violation, check violation.
    for (const code of ['42501', '42703', '23505', '23514']) {
      expect(isRetryable(pgError(code))).toBe(false);
    }
  });

  it('retries any 5xx but no 4xx', () => {
    expect(isRetryable({ status: 500 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
    expect(isRetryable({ status: 403 })).toBe(false);
    expect(isRetryable({ status: 404 })).toBe(false);
  });

  it('retries a request that never reached the server', () => {
    expect(isRetryable(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryable(new Error('NetworkError when attempting to fetch'))).toBe(true);
  });

  it('treats no error as nothing to retry', () => {
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe('retryQuery', () => {
  it('returns the first success without retrying', async () => {
    const run = vi.fn().mockResolvedValue({ data: [1], error: null });
    const result = await retryQuery<{ data: number[] | null; error: unknown }>(run, { baseDelayMs: 0 });

    expect(result).toEqual({ data: [1], error: null });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and returns the eventual success', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: pgError('25P02') })
      .mockResolvedValueOnce({ data: ['ok'], error: null });

    const result = await retryQuery<{ data: string[] | null; error: unknown }>(run, { baseDelayMs: 0 });

    expect(result.error).toBeNull();
    expect(result.data).toEqual(['ok']);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt limit and returns the last error', async () => {
    const run = vi.fn().mockResolvedValue({ data: null, error: pgError('25P02') });

    const result = await retryQuery<{ data: null; error: unknown }>(run, { attempts: 3, baseDelayMs: 0 });

    expect((result.error as any).code).toBe('25P02');
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('surfaces a permanent error immediately', async () => {
    // Retrying a permission error only delays the message the user needs.
    const run = vi.fn().mockResolvedValue({ data: null, error: pgError('42501') });

    const result = await retryQuery<{ data: null; error: unknown }>(run, { baseDelayMs: 0 });

    expect((result.error as any).code).toBe('42501');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the query on each attempt rather than reusing a builder', async () => {
    // A PostgrestBuilder executes once, so a retry must start from a fresh one.
    const built: object[] = [];
    const run = vi.fn(() => {
      const builder = {};
      built.push(builder);
      return Promise.resolve(
        built.length < 2 ? { data: null, error: pgError('25P02') } : { data: [], error: null },
      );
    });

    await retryQuery(run, { baseDelayMs: 0 });

    expect(built).toHaveLength(2);
    expect(built[0]).not.toBe(built[1]);
  });

  it('retries a thrown network error, then rethrows if it never settles', async () => {
    const run = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(retryQuery(run, { attempts: 2, baseDelayMs: 0 })).rejects.toThrow('Failed to fetch');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('rethrows a non-transient throw without retrying', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(retryQuery(run, { baseDelayMs: 0 })).rejects.toThrow('boom');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
