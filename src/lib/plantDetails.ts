/**
 * One definition of a solar plant's specification, and the translation between
 * the two places the app stores it.
 *
 * A lead keeps its specs in the `leads.plant_details` JSONB blob, with the
 * dropdown's own strings — `panel_wt: "540W"`, `inverter_wt: "3 kW"`. A project
 * keeps the same concepts in typed columns with different names and numeric
 * types — `panel_watt: 540`, `inverter_capacity: 3`. Nothing owned that
 * translation, so each page improvised: ProjectFinalizationForm stripped units
 * with a local regex, and QuotationFormDialog did `Number("540W")`, which is
 * NaN, and quietly wrote null.
 *
 * Everything here is pure so it can be unit tested — no supabase import, same
 * discipline as subsidy.ts and payments.ts.
 */

/** The `structure_type` Postgres enum. A project column only accepts these. */
export const STRUCTURE_TYPES = ['rcc_roof', 'tin_shed_roof', 'ground_mount'] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];

/** Keys in `system_configs.plant_details_dropdown_options`. */
export type PlantOptionKey =
  | 'phase'
  | 'panel_make'
  | 'panel_wt'
  | 'inverter'
  | 'inverter_wt'
  | 'wiremake'
  | 'wire_size'
  | 'wire_material';

/**
 * The canonical in-memory shape. Every screen edits this; the mappers below
 * turn it into whichever store the caller is writing.
 *
 * Units are kept as the user picked them (`"540W"`) because that is what the
 * lead blob has always held and what the dropdowns offer. Conversion to a
 * number happens only on the way into a project column.
 */
export interface PlantValues {
  capacityKw: string;
  phase: string;
  panelBrand: string;
  panelWatt: string;
  panelQty: string;
  inverterBrand: string;
  inverterCapacity: string;
  structureType: string;
  wireMake: string;
  wireSize: string;
  wireMaterial: string;
  totalCost: string;
  subsidyApplied: boolean;
  subsidyAmount: string;
}

export const emptyPlantValues = (): PlantValues => ({
  capacityKw: '',
  phase: '',
  panelBrand: '',
  panelWatt: '',
  panelQty: '',
  inverterBrand: '',
  inverterCapacity: '',
  structureType: '',
  wireMake: '',
  wireSize: '',
  wireMaterial: '',
  totalCost: '',
  subsidyApplied: false,
  subsidyAmount: '',
});

/** A field's presentation, so both the lead and project forms render alike. */
export interface PlantFieldDef {
  key: keyof PlantValues;
  label: string;
  /** Dropdown source, or a free input. */
  options?: PlantOptionKey;
  kind?: 'number';
}

export const PLANT_FIELDS: PlantFieldDef[] = [
  { key: 'capacityKw', label: 'Capacity (kW)', kind: 'number' },
  { key: 'phase', label: 'Grid Phase', options: 'phase' },
  { key: 'panelBrand', label: 'Panel Brand', options: 'panel_make' },
  { key: 'panelWatt', label: 'Panel Wattage', options: 'panel_wt' },
  { key: 'panelQty', label: 'Panel Qty', kind: 'number' },
  { key: 'inverterBrand', label: 'Inverter Brand', options: 'inverter' },
  { key: 'inverterCapacity', label: 'Inverter Capacity', options: 'inverter_wt' },
  { key: 'wireMake', label: 'Wire Make', options: 'wiremake' },
  { key: 'wireSize', label: 'Wire Size', options: 'wire_size' },
  { key: 'wireMaterial', label: 'Wire Material', options: 'wire_material' },
];

/**
 * The number inside a dropdown label: `"540W" → 540`, `"3 kW" → 3`.
 *
 * The dropdown values carry their unit, so `Number()` on them is NaN. Callers
 * writing a numeric column must go through this.
 */
export const parseUnit = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
};

/**
 * Best-effort free text → the `structure_type` enum.
 *
 * The lead side collects a free-text "Structure Specs / Gauge" (e.g.
 * "HDG 80mm"), which is not an enum member. Writing that into the column fails
 * the insert, so anything unrecognised becomes null rather than a bad write.
 */
export const coerceStructureType = (value: unknown): StructureType | null => {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((STRUCTURE_TYPES as readonly string[]).includes(raw)) return raw as StructureType;
  if (raw.includes('rcc')) return 'rcc_roof';
  if (raw.includes('tin') || raw.includes('shed')) return 'tin_shed_roof';
  if (raw.includes('ground')) return 'ground_mount';
  return null;
};

export const structureTypeLabel = (value: string | null | undefined): string =>
  value ? String(value).replace(/_/g, ' ') : '—';

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

/* ─────────────────────────── lead (JSONB) ─────────────────────────── */

/** Reads `leads.plant_details`, tolerating the older partial shapes. */
export const fromLeadPlantDetails = (
  json: unknown,
  fallbackCapacityKw?: number | string | null
): PlantValues => {
  const pd = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  return {
    ...emptyPlantValues(),
    capacityKw: str(pd.required_capacity ?? fallbackCapacityKw ?? ''),
    phase: str(pd.phase),
    panelBrand: str(pd.panel_make),
    panelWatt: str(pd.panel_wt),
    panelQty: str(pd.panel_qty),
    inverterBrand: str(pd.inverter),
    inverterCapacity: str(pd.inverter_wt),
    structureType: str(pd.structure_type_gauge_make),
    wireMake: str(pd.wiremake),
    wireSize: str(pd.wire_size),
    wireMaterial: str(pd.wire_material),
    totalCost: str(pd.total_cost),
    subsidyApplied: Boolean(pd.subsidy),
    subsidyAmount: str(pd.subsidy_amount),
  };
};

/**
 * Builds the JSONB payload.
 *
 * Merges into whatever the row already holds rather than replacing it. The blob
 * is untyped and has a long tail of keys written by older code — `discount_amount`
 * is read by ProjectFinalizationForm's prefill and written by nothing here — so a
 * wholesale replace would quietly delete data every time someone edited the
 * specs. Key names and unit-carrying strings are preserved exactly as they have
 * always been written, so existing readers keep working.
 */
export const toLeadPlantDetails = (
  values: PlantValues,
  existing?: unknown
): Record<string, unknown> => {
  const prior = (existing && typeof existing === 'object' ? existing : {}) as Record<
    string,
    unknown
  >;
  const totalCost = parseUnit(values.totalCost) ?? 0;
  const subsidy = values.subsidyApplied ? parseUnit(values.subsidyAmount) ?? 0 : 0;
  return {
    ...prior,
    required_capacity: values.capacityKw || null,
    phase: values.phase,
    panel_make: values.panelBrand,
    panel_wt: values.panelWatt,
    panel_qty: values.panelQty || null,
    inverter: values.inverterBrand,
    inverter_wt: values.inverterCapacity,
    structure_type_gauge_make: values.structureType,
    wiremake: values.wireMake,
    wire_size: values.wireSize,
    wire_material: values.wireMaterial,
    total_cost: totalCost,
    subsidy: values.subsidyApplied,
    subsidy_amount: subsidy,
    net_cost: Math.max(0, totalCost - subsidy),
  };
};

/* ────────────────────────── project (columns) ────────────────────────── */

/** The subset of a project row this module reads. */
export interface ProjectPlantColumns {
  capacity_kw?: number | null;
  phase?: string | null;
  panel_brand?: string | null;
  panel_watt?: number | null;
  panel_qty?: number | null;
  inverter_brand?: string | null;
  inverter_capacity?: number | null;
  structure_type?: string | null;
  wiremake?: string | null;
  wire_size?: string | null;
  wire_material?: string | null;
  final_amount?: number | null;
  subsidy_amount?: number | null;
}

export const fromProject = (project: ProjectPlantColumns): PlantValues => ({
  ...emptyPlantValues(),
  capacityKw: str(project.capacity_kw),
  phase: str(project.phase),
  panelBrand: str(project.panel_brand),
  panelWatt: str(project.panel_watt),
  panelQty: str(project.panel_qty),
  inverterBrand: str(project.inverter_brand),
  inverterCapacity: str(project.inverter_capacity),
  structureType: str(project.structure_type),
  wireMake: str(project.wiremake),
  wireSize: str(project.wire_size),
  wireMaterial: str(project.wire_material),
  totalCost: str(project.final_amount),
  subsidyApplied: Boolean(project.subsidy_amount),
  subsidyAmount: str(project.subsidy_amount),
});

/**
 * Builds the column payload. `capacity_kw`, `panel_brand`, `panel_watt`,
 * `panel_qty`, `inverter_brand`, `inverter_capacity` and `structure_type` are
 * NOT NULL on the table, so this is for UPDATE of an existing project; the
 * caller is responsible for not blanking a required column.
 */
export const toProjectColumns = (values: PlantValues): ProjectPlantColumns => ({
  capacity_kw: parseUnit(values.capacityKw),
  phase: values.phase || null,
  panel_brand: values.panelBrand || null,
  panel_watt: parseUnit(values.panelWatt),
  panel_qty: parseUnit(values.panelQty),
  inverter_brand: values.inverterBrand || null,
  inverter_capacity: parseUnit(values.inverterCapacity),
  structure_type: coerceStructureType(values.structureType),
  wiremake: values.wireMake || null,
  wire_size: values.wireSize || null,
  wire_material: values.wireMaterial || null,
  subsidy_amount: values.subsidyApplied ? parseUnit(values.subsidyAmount) : null,
});
