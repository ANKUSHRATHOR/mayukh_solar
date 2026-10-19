// Pure helpers for the bulk "update existing leads" import. The wizard owns the
// file parsing and the writes; everything that decides *what* gets written lives
// here so it can be unit-tested.

export type LeadMatchKey = 'mobile' | 'k_number';

export const LEAD_MATCH_KEYS: { key: LeadMatchKey; label: string }[] = [
  { key: 'mobile', label: 'Mobile Number' },
  { key: 'k_number', label: 'K Number' },
];

/** The lead columns a spreadsheet can be mapped to. `*` marks fields an Add import requires. */
export const LEAD_IMPORT_FIELDS = [
  { key: 'customer_name', label: 'Customer Name *', required: true },
  { key: 'mobile', label: 'Mobile Number *', required: true },
  { key: 'alt_mobile', label: 'Alternate Mobile', required: false },
  { key: 'email', label: 'Email Address', required: false },
  { key: 'k_number', label: 'K Number', required: false },
  { key: 'address', label: 'Full Address', required: false },
  { key: 'village_city', label: 'Village / City', required: false },
  { key: 'district', label: 'District', required: false },
  { key: 'state', label: 'State', required: false },
  { key: 'feeder_name', label: 'Feeder Name', required: false },
  { key: 'kw_interest', label: 'kW Interest', required: false },
  { key: 'campaign', label: 'Campaign', required: false },
  { key: 'notes', label: 'Notes', required: false },
];

/** Digits only, with a leading +91 / 91 / 0 dropped so "+91 98765 43210" matches. */
export function normalizeMobile(raw: string | null | undefined): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export function isValidMobile(mobile: string): boolean {
  return /^[6-9]\d{9}$/.test(mobile);
}

/** K-Numbers are 12 digits; spreadsheets add spaces or keep them as text with a quote. */
export function normalizeKNumber(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export function normalizeMatchValue(key: LeadMatchKey, raw: string | null | undefined): string {
  return key === 'mobile' ? normalizeMobile(raw) : normalizeKNumber(raw);
}

export type UpdatePatchResult =
  | { ok: true; matchValue: string; patch: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Builds the column patch for one spreadsheet row.
 *
 * `mappings` is lead field → file header. Only mapped columns are written, and an
 * empty cell leaves the lead's current value alone — a sparse sheet must never
 * wipe data. The match column itself is never part of the patch.
 */
export function buildUpdatePatch(
  row: Record<string, string>,
  mappings: Record<string, string>,
  matchBy: LeadMatchKey,
  matchHeader: string,
  defaultCampaign = '',
): UpdatePatchResult {
  const rawMatch = row[matchHeader] ?? '';
  const matchValue = normalizeMatchValue(matchBy, rawMatch);
  if (!matchValue) return { ok: false, error: `Empty ${matchBy === 'mobile' ? 'mobile number' : 'K Number'}` };
  if (matchBy === 'mobile' && !isValidMobile(matchValue)) {
    return { ok: false, error: `Invalid mobile number: "${rawMatch}"` };
  }
  if (matchBy === 'k_number' && matchValue.length !== 12) {
    return { ok: false, error: `Invalid K Number: "${rawMatch}" (must be 12 digits)` };
  }

  const cell = (field: string): string => {
    const header = mappings[field];
    return header ? (row[header] ?? '').trim() : '';
  };

  const patch: Record<string, unknown> = {};

  for (const field of ['customer_name', 'email', 'address', 'village_city', 'district', 'state', 'feeder_name', 'notes']) {
    const v = cell(field);
    if (v) patch[field] = v;
  }

  if (matchBy !== 'mobile') {
    const raw = cell('mobile');
    if (raw) {
      const m = normalizeMobile(raw);
      if (!isValidMobile(m)) return { ok: false, error: `Invalid mobile number: "${raw}"` };
      patch.mobile = m;
    }
  }

  const altRaw = cell('alt_mobile');
  if (altRaw) {
    const alt = normalizeMobile(altRaw);
    if (!isValidMobile(alt)) return { ok: false, error: `Invalid alternate mobile: "${altRaw}"` };
    patch.alt_mobile = alt;
  }

  if (matchBy !== 'k_number') {
    const raw = cell('k_number');
    if (raw) {
      const k = normalizeKNumber(raw);
      if (k.length !== 12) return { ok: false, error: `Invalid K Number: "${raw}" (must be 12 digits)` };
      patch.k_number = k;
      // Discom details synced against the old number no longer describe this
      // lead; same rule as editing the K Number by hand on the leads list.
      patch.kno_details = null;
    }
  }

  const kwRaw = cell('kw_interest');
  if (kwRaw) {
    const kw = parseFloat(kwRaw);
    if (isNaN(kw) || kw <= 0) return { ok: false, error: `Invalid kW Interest: "${kwRaw}"` };
    patch.kw_interest = kw;
  }

  const campaign = cell('campaign') || defaultCampaign.trim();
  if (campaign) patch.campaign = campaign;

  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update — all mapped cells are empty' };
  return { ok: true, matchValue, patch };
}

export interface MatchCandidate {
  id: string;
  mobile: string | null;
  k_number: string | null;
  is_in_bin: boolean | null;
}

export type MatchResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Resolves a match value against the leads fetched for it. Mobile is unique in
 * the table; a K-Number is not, so more than one hit is refused rather than
 * guessed at.
 */
export function resolveMatch(
  matchBy: LeadMatchKey,
  matchValue: string,
  candidates: MatchCandidate[],
): MatchResult {
  const hits = candidates.filter((c) => normalizeMatchValue(matchBy, c[matchBy]) === matchValue);
  const live = hits.filter((c) => !c.is_in_bin);
  if (live.length === 1) return { ok: true, id: live[0].id };
  if (live.length > 1) return { ok: false, error: `${live.length} leads share this K Number — update them individually` };
  if (hits.length > 0) return { ok: false, error: 'Lead is in the bin' };
  return { ok: false, error: 'No matching lead found' };
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * How well a file header names a lead field: 3 = it is the field's key or label,
 * 2 = it contains one ("Customer Name (as per bill)"), 1 = it is a fragment of
 * the label ("Mobile" in "Mobile Number"), 0 = no match. Fragments shorter than
 * four characters are ignored, or "Na" would claim Customer Name.
 */
function matchScore(header: string, field: { key: string; label: string }): number {
  const h = squash(header);
  const key = squash(field.key);
  const label = squash(field.label);
  if (!h) return 0;
  if (h === key || h === label) return 3;
  if (h.includes(key) || h.includes(label)) return 2;
  if (h.length >= 4 && label.includes(h)) return 1;
  return 0;
}

/**
 * Proposes field → header mappings for an uploaded file. Each header goes to the
 * field it matches best rather than the first field it matches at all — "Address"
 * is a fragment of "Email Address" but exactly the `address` key. Ties go to the
 * earlier field, so "Name" means Customer Name before Feeder Name. A field
 * claimed by several headers keeps the best match, then the first.
 */
export function guessMappings(
  headers: string[],
  fields: { key: string; label: string }[],
): Record<string, string> {
  const best: Record<string, { header: string; score: number }> = {};
  for (const header of headers) {
    let pick: { key: string; score: number } | null = null;
    for (const field of fields) {
      const score = matchScore(header, field);
      if (score && (!pick || score > pick.score)) pick = { key: field.key, score };
    }
    if (pick && (!best[pick.key] || pick.score > best[pick.key].score)) {
      best[pick.key] = { header, score: pick.score };
    }
  }
  return Object.fromEntries(Object.entries(best).map(([key, v]) => [key, v.header]));
}
