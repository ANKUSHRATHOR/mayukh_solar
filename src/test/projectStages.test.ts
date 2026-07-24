import { describe, it, expect } from 'vitest';
import {
  PROJECT_STAGES,
  pipelineFor,
  stageIndex,
  stageProgress,
  nextStage,
  projectStageMeta,
  allProjectStageMeta,
  LEGACY_STAGE_LABELS,
} from '@/lib/projectStages';

// The 12 stages the business owner specified, in pipeline order.
const EXPECTED_ORDER = [
  'new_project',
  'documents_pending',
  'documents_approved',
  'loan_application_pending',
  'loan_approved',
  'installation_scheduled',
  'installation_completed',
  'net_meter_applied',
  'net_meter_installed',
  'payment_pending',
  'project_completed',
  'closed',
];

describe('pipeline definition', () => {
  it('declares exactly the 12 requested stages, in order', () => {
    expect(PROJECT_STAGES.map((s) => s.stage)).toEqual(EXPECTED_ORDER);
  });

  it('places Payment Pending before Project Completed, then Closed last', () => {
    const order = PROJECT_STAGES.map((s) => s.stage);
    expect(order.indexOf('payment_pending')).toBeLessThan(order.indexOf('project_completed'));
    expect(order.indexOf('project_completed')).toBeLessThan(order.indexOf('closed'));
  });

  it('marks only the two loan stages as loan-specific', () => {
    const loanOnly = PROJECT_STAGES.filter((s) => s.appliesTo === 'loan').map((s) => s.stage);
    expect(loanOnly).toEqual(['loan_application_pending', 'loan_approved']);
  });
});

describe('pipelineFor', () => {
  it('omits loan stages for cash projects', () => {
    const stages = pipelineFor('cash').map((s) => s.stage);
    expect(stages).not.toContain('loan_application_pending');
    expect(stages).not.toContain('loan_approved');
    expect(stages).toHaveLength(10);
  });

  it('includes loan stages for loan projects', () => {
    const stages = pipelineFor('loan').map((s) => s.stage);
    expect(stages).toContain('loan_application_pending');
    expect(stages).toContain('loan_approved');
    expect(stages).toHaveLength(12);
  });

  // An unset payment_type must not show loan steps a cash job can never reach.
  it('treats an unknown payment type as cash', () => {
    expect(pipelineFor(null).map((s) => s.stage)).toEqual(pipelineFor('cash').map((s) => s.stage));
    expect(pipelineFor(undefined)).toHaveLength(10);
  });
});

describe('stageIndex and progress', () => {
  it('positions a stage within its own pipeline', () => {
    expect(stageIndex('new_project', 'cash')).toBe(0);
    // Installation is 4th for cash but 6th for loan, because of the two loan steps.
    expect(stageIndex('installation_scheduled', 'cash')).toBe(3);
    expect(stageIndex('installation_scheduled', 'loan')).toBe(5);
  });

  it('returns -1 for a stage outside the project’s pipeline', () => {
    expect(stageIndex('loan_approved', 'cash')).toBe(-1);
    expect(stageIndex('material_ordered', 'cash')).toBe(-1);
    expect(stageIndex(null, 'cash')).toBe(-1);
  });

  it('runs progress from 0 at the start to 100 at Closed', () => {
    expect(stageProgress('new_project', 'cash')).toBe(0);
    expect(stageProgress('closed', 'cash')).toBe(100);
    expect(stageProgress('closed', 'loan')).toBe(100);
  });

  // A legacy stage must not render as 0% "not started" without being flagged
  // off-pipeline — the old operator timeline highlighted nothing at all.
  it('reports 0 for an off-pipeline stage, and stageIndex says why', () => {
    expect(stageProgress('inspection_failed', 'cash')).toBe(0);
    expect(stageIndex('inspection_failed', 'cash')).toBe(-1);
  });
});

describe('nextStage', () => {
  it('skips the loan stages for a cash project', () => {
    expect(nextStage('documents_approved', 'cash')?.stage).toBe('installation_scheduled');
  });

  it('routes a loan project through the loan stages', () => {
    expect(nextStage('documents_approved', 'loan')?.stage).toBe('loan_application_pending');
    expect(nextStage('loan_application_pending', 'loan')?.stage).toBe('loan_approved');
    expect(nextStage('loan_approved', 'loan')?.stage).toBe('installation_scheduled');
  });

  it('has no next stage at the end of the pipeline', () => {
    expect(nextStage('closed', 'cash')).toBeNull();
    expect(nextStage('closed', 'loan')).toBeNull();
  });

  it('returns null for an off-pipeline stage', () => {
    expect(nextStage('wiring_done', 'cash')).toBeNull();
  });
});

describe('stage labels', () => {
  it('maps every new stage', () => {
    for (const stage of EXPECTED_ORDER) {
      expect(projectStageMeta[stage]).toBeDefined();
    }
  });

  // Postgres cannot drop enum values, so old rows must still render a label.
  it('still renders every legacy stage', () => {
    for (const legacy of Object.keys(LEGACY_STAGE_LABELS)) {
      expect(allProjectStageMeta[legacy]).toBeDefined();
      expect(allProjectStageMeta[legacy].label).toContain('legacy');
    }
  });

  it('does not let a legacy label overwrite a current stage', () => {
    expect(allProjectStageMeta['project_completed'].label).toBe('Project Completed');
    expect(allProjectStageMeta['net_meter_installed'].label).toBe('Net Meter Installed');
  });
});
