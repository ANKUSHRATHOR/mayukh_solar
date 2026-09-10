import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A button whose only text is `<span className="hidden sm:inline">` becomes a
 * bare icon below sm — an unlabelled control on exactly the devices the field
 * staff use. Half of these already carried an aria-label and half did not, which
 * is why this is a test rather than a one-time cleanup.
 */
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });

const BUTTON = /<Button\b(?:(?!<\/Button>).)*?<\/Button>/gs;

describe('mobile accessibility', () => {
  it('every button that collapses to an icon below sm has an accessible name', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(BUTTON)) {
        const button = match[0];
        if (!button.includes('hidden sm:inline')) continue;
        if (button.includes('aria-label') || button.includes('title=')) continue;
        offenders.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
