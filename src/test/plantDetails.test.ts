import { describe, expect, it } from 'vitest';
import {
  coerceStructureType,
  fromLeadPlantDetails,
  fromProject,
  parseUnit,
  toLeadPlantDetails,
  toProjectColumns,
} from '@/lib/plantDetails';

/**
 * The dropdown values carry their units, so `Number()` on them is NaN. Every
 * numeric project column has to go through parseUnit — QuotationFormDialog did
 * not, and wrote null for panel_watt on every hand-picked quotation.
 */
describe('parseUnit', () => {
  it('pulls the number out of a dropdown label', () => {
    expect(parseUnit('540W')).toBe(540);
    expect(parseUnit('3 kW')).toBe(3);
    expect(parseUnit('4 sqmm')).toBe(4);
    expect(parseUnit('1,80,000')).toBe(180000);
    expect(parseUnit('2.5 kW')).toBe(2.5);
  });

  it('passes numbers through and rejects what has no number in it', () => {
    expect(parseUnit(540)).toBe(540);
    expect(parseUnit('Copper')).toBeNull();
    expect(parseUnit('')).toBeNull();
    expect(parseUnit(null)).toBeNull();
    expect(parseUnit(undefined)).toBeNull();
    expect(parseUnit(NaN)).toBeNull();
  });

  it('is not Number(), which is the whole point', () => {
    expect(Number('540W')).toBeNaN();
    expect(parseUnit('540W')).toBe(540);
  });
});

/**
 * structure_type is a Postgres enum. The lead side collects free text, so an
 * unrecognised value must become null rather than fail the write.
 */
describe('coerceStructureType', () => {
  it('accepts the enum values as they are', () => {
    expect(coerceStructureType('rcc_roof')).toBe('rcc_roof');
    expect(coerceStructureType('ground_mount')).toBe('ground_mount');
  });

  it('maps the wording people actually type', () => {
    expect(coerceStructureType('RCC Roof')).toBe('rcc_roof');
    expect(coerceStructureType('tin shed')).toBe('tin_shed_roof');
    expect(coerceStructureType('Ground Mount')).toBe('ground_mount');
  });

  it('returns null rather than an invalid enum value', () => {
    expect(coerceStructureType('HDG 80mm')).toBeNull();
    expect(coerceStructureType('')).toBeNull();
    expect(coerceStructureType(null)).toBeNull();
  });
});

describe('lead ↔ project mapping', () => {
  const leadBlob = {
    phase: 'Single Phase',
    panel_make: 'Waaree',
    panel_wt: '540W',
    panel_qty: '6',
    inverter: 'Growatt',
    inverter_wt: '3 kW',
    wiremake: 'Polycab',
    wire_size: '4 sqmm',
    wire_material: 'Copper',
    total_cost: 180000,
    subsidy: true,
    subsidy_amount: 78000,
  };

  it('reads a lead blob, falling back to the lead capacity', () => {
    const values = fromLeadPlantDetails(leadBlob, 3);
    expect(values.capacityKw).toBe('3');
    expect(values.panelBrand).toBe('Waaree');
    expect(values.panelWatt).toBe('540W');
    expect(values.subsidyApplied).toBe(true);
  });

  it('round-trips a lead blob without losing a field', () => {
    const back = toLeadPlantDetails(fromLeadPlantDetails(leadBlob, 3));
    expect(back.panel_make).toBe('Waaree');
    expect(back.panel_wt).toBe('540W');
    expect(back.wiremake).toBe('Polycab');
    expect(back.wire_material).toBe('Copper');
    expect(back.subsidy).toBe(true);
    expect(back.subsidy_amount).toBe(78000);
  });

  it('merges into the existing blob instead of replacing it', () => {
    // plant_details is untyped and older code wrote keys this form never shows.
    // Replacing the object would delete them on every edit.
    const withExtras = { ...leadBlob, discount_amount: 5000, legacy_note: 'keep me' };
    const back = toLeadPlantDetails(fromLeadPlantDetails(withExtras, 3), withExtras);
    expect(back.discount_amount).toBe(5000);
    expect(back.legacy_note).toBe('keep me');
    expect(back.panel_make).toBe('Waaree');
  });

  it('derives net_cost from cost minus subsidy, never below zero', () => {
    const values = fromLeadPlantDetails({ total_cost: 100000, subsidy: true, subsidy_amount: 130000 });
    expect(toLeadPlantDetails(values).net_cost).toBe(0);
  });

  it('strips units when crossing to project columns', () => {
    const cols = toProjectColumns(fromLeadPlantDetails(leadBlob, 3));
    expect(cols.panel_watt).toBe(540);
    expect(cols.inverter_capacity).toBe(3);
    expect(cols.capacity_kw).toBe(3);
    expect(cols.panel_qty).toBe(6);
    // Strings that are not numbers stay strings.
    expect(cols.wire_size).toBe('4 sqmm');
    expect(cols.phase).toBe('Single Phase');
  });

  it('keeps the phase and wiring a project used to drop on conversion', () => {
    const cols = toProjectColumns(fromLeadPlantDetails(leadBlob, 3));
    expect(cols.phase).toBe('Single Phase');
    expect(cols.wiremake).toBe('Polycab');
    expect(cols.wire_material).toBe('Copper');
    expect(cols.subsidy_amount).toBe(78000);
  });

  it('writes the total cost back, so the field is not a silent no-op', () => {
    const values = fromProject({ final_amount: 180000 });
    expect(values.totalCost).toBe('180000');
    expect(toProjectColumns({ ...values, totalCost: '195000' }).final_amount).toBe(195000);
  });

  it('reads a project row back into the same shape', () => {
    const values = fromProject({
      capacity_kw: 3,
      phase: 'Three Phase',
      panel_brand: 'Adani Solar',
      panel_watt: 550,
      panel_qty: 6,
      inverter_brand: 'Sofar',
      inverter_capacity: 5,
      structure_type: 'rcc_roof',
      final_amount: 200000,
      subsidy_amount: 78000,
    });
    expect(values.panelWatt).toBe('550');
    expect(values.structureType).toBe('rcc_roof');
    expect(values.subsidyApplied).toBe(true);
    expect(toProjectColumns(values).panel_watt).toBe(550);
  });

  it('treats a project with no subsidy as not subsidised', () => {
    expect(fromProject({ subsidy_amount: null }).subsidyApplied).toBe(false);
    expect(toProjectColumns(fromProject({ subsidy_amount: null })).subsidy_amount).toBeNull();
  });
});
