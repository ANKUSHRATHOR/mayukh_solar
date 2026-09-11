import { describe, expect, it, vi } from 'vitest';

// The store reaches for the Supabase client at import time; nothing here
// exercises a network path, so a stub keeps the module importable.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({}) }, auth: { getSession: async () => ({ data: {} }) } },
}));

import {
  DRIVE_PREFIX,
  FILE_COLUMN,
  driveIdOf,
  extensionForMime,
  isDriveRef,
  isPreviewable,
} from '@/lib/fileStore';

/**
 * Dual-read is the whole reason this module exists: documents uploaded before
 * the move to Google Drive are still in Supabase Storage and there is no bulk
 * migration, so the provider has to be readable off the stored value. Get this
 * wrong and either every legacy document 404s or every new one does.
 */
describe('storage reference routing', () => {
  it('reads Drive refs and leaves legacy paths alone', () => {
    expect(isDriveRef('gdrive:1AbCdEf')).toBe(true);
    expect(driveIdOf('gdrive:1AbCdEf')).toBe('1AbCdEf');

    // The shapes actually in the DB today.
    for (const legacy of [
      'a1b2c3/aadhaar_front.jpg',
      'leads/a1b2c3/electricity_bill.pdf',
      'quotations/a1b2c3/Quotation_MS-Q-123456-01.pdf',
    ]) {
      expect(isDriveRef(legacy)).toBe(false);
      expect(driveIdOf(legacy)).toBeNull();
    }
  });

  it('treats a missing reference as legacy rather than as Drive', () => {
    // A text-value document (customer email, mobile) has no file at all.
    expect(isDriveRef(null)).toBe(false);
    expect(isDriveRef(undefined)).toBe(false);
    expect(driveIdOf(null)).toBeNull();
  });

  it('never mistakes a path that merely mentions drive for a Drive ref', () => {
    expect(isDriveRef('a1b2c3/gdrive:notaref.jpg')).toBe(false);
    expect(isDriveRef('mygdrive:1AbCdEf')).toBe(false);
  });

  it('round-trips the prefix it writes', () => {
    expect(driveIdOf(`${DRIVE_PREFIX}xyz`)).toBe('xyz');
  });
});

/**
 * A Drive id carries no file extension, so a download named from the ref would
 * save every document as `.bin` — the name has to come from the content type.
 */
describe('naming a downloaded file', () => {
  it('maps the content types this app actually stores', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('application/pdf')).toBe('pdf');
    expect(extensionForMime('image/png')).toBe('png');
  });

  it('falls back to the subtype rather than to nothing', () => {
    expect(extensionForMime('image/tiff')).toBe('tiff');
    expect(extensionForMime('image/svg+xml')).toBe('svg');
    expect(extensionForMime('')).toBe('bin');
  });
});

describe('what the preview dialog can render', () => {
  it('accepts images and PDFs', () => {
    expect(isPreviewable('image/jpeg')).toBe(true);
    expect(isPreviewable('application/pdf')).toBe(true);
  });

  it('refuses anything it would render as a broken image', () => {
    expect(isPreviewable('application/zip')).toBe(false);
    expect(isPreviewable('application/octet-stream')).toBe(false);
    expect(isPreviewable(null)).toBe(false);
  });

  it('still recognises a legacy path, which has no content type', () => {
    expect(isPreviewable('a1b2c3/aadhaar_front.jpg')).toBe(true);
    expect(isPreviewable('a1b2c3/report.pdf')).toBe(true);
    expect(isPreviewable('a1b2c3/archive.zip')).toBe(false);
  });
});

/**
 * The edge function whitelists the same four columns. If these drift, a delete
 * silently clears the wrong field or the function rejects a valid table.
 */
describe('file columns', () => {
  it('names the column each table stores its reference in', () => {
    expect(FILE_COLUMN).toEqual({
      documents: 'file_url',
      material_dispatches: 'image_url',
      tasks: 'proof_image_path',
      attendance_events: 'bike_meter_image_path',
    });
  });
});
