import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { PerformanceRow } from '@/lib/performanceData';

/**
 * A render smoke test for the Performance page.
 *
 * It exists to hold the one property the module is built around: the tiles are
 * the sum of the rows, and nothing on screen invents a figure. The data layer
 * is mocked at the module boundary — the SQL is what it is — but everything
 * above it is the real page, so a broken formula or a crashing section fails
 * here rather than in front of a manager.
 */

// jsdom has no ResizeObserver, which recharts' ResponsiveContainer needs on
// mount. Stubbed rather than mocking the charts away, so a chart that throws
// still fails this test.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;

const row = (over: Partial<PerformanceRow>): PerformanceRow =>
  ({
    user_id: 'u1',
    full_name: 'Ramesh Kumar',
    role: 'telecaller',
    work_assigned: 0, work_completed: 0, work_pending: 0, work_overdue: 0, work_cancelled: 0,
    work_on_time: 0, work_on_time_eligible: 0, work_completed_in_period: 0,
    tasks_assigned: 0, tasks_completed: 0, tasks_pending: 0, tasks_overdue: 0,
    tasks_on_time: 0, tasks_on_time_eligible: 0,
    calls_assigned: 0, calls_dialed: 0, calls_connected: 0, calls_not_connected: 0,
    calls_unlogged: 0, calls_not_attempted: 0, follow_ups_scheduled: 0, follow_ups_due: 0,
    follow_ups_completed: 0, follow_ups_overdue: 0, leads_interested: 0,
    leads_not_interested: 0, visits_booked: 0,
    leads_assigned: 0, leads_contacted: 0, leads_qualified: 0, visits_completed: 0,
    quotations_sent: 0, deals_won: 0, deals_lost: 0, revenue: 0, pipeline_value: 0,
    projects_assigned: 0, surveys_assigned: 0, surveys_completed: 0, documents_pending: 0,
    applications_submitted: 0, approvals_completed: 0, installations_scheduled: 0,
    installations_completed: 0, projects_completed: 0, projects_delayed: 0,
    target_metric: 'connected_calls', target_value: null, achievement: 0,
    ...over,
  }) as PerformanceRow;

const overviewRows = [
  row({
    user_id: 'u1',
    full_name: 'Ramesh Kumar',
    role: 'telecaller',
    work_assigned: 10, work_completed: 4, work_pending: 3, work_overdue: 2, work_cancelled: 1,
    work_on_time: 3, work_on_time_eligible: 4,
    tasks_assigned: 6, tasks_completed: 3, tasks_overdue: 1,
    calls_assigned: 20, calls_dialed: 16, calls_connected: 8, calls_not_connected: 8,
    target_value: 10, achievement: 8,
  }),
  row({
    user_id: 'u2',
    full_name: 'Sunita Devi',
    role: 'sales_person',
    target_metric: 'revenue',
    work_assigned: 6, work_completed: 6, work_pending: 0, work_overdue: 0, work_cancelled: 0,
    work_on_time: 6, work_on_time_eligible: 6,
    leads_assigned: 6, leads_contacted: 4, leads_qualified: 2, deals_won: 1,
    revenue: 150000, target_value: 100000, achievement: 150000,
  }),
];

vi.mock('@/lib/performanceData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/performanceData')>();
  return {
    ...actual,
    fetchPerformanceOverview: vi.fn(async () => overviewRows),
    fetchPerformanceTrend: vi.fn(async () => []),
    fetchWorkItems: vi.fn(async () => ({ rows: [], total: 3 })),
    workItemsPageFetcher: () => async () => ({ rows: [], total: 0 }),
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ role: 'admin', realRole: 'admin', user: { id: 'admin-1' }, staff: null }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: [], error: null })) },
}));

const renderPage = async () => {
  const { default: StaffPerformance } = await import('@/pages/StaffPerformance');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StaffPerformance />
      </MemoryRouter>
    </QueryClientProvider>
  );
  // The page opens on This Month and fetches four queries.
  await screen.findByText('Work assigned');
};

/** The tile's figure, read off the card that carries the given label. */
const tileValue = (label: string) => {
  // The word can appear in a tile, a metric grid and a dropdown; only the tile
  // is a `.bento` card, which is what makes this unambiguous.
  const card = screen
    .getAllByText(label)
    .map((el) => el.closest('div.bento'))
    .find(Boolean) as HTMLElement;
  return within(card).getAllByText(/^[₹\d]/)[0]?.textContent?.trim();
};

describe('the Performance page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sums the people on screen into the summary tiles', async () => {
    await renderPage();
    expect(tileValue('Work assigned')).toBe('16');
    expect(tileValue('Completed')).toBe('10');
    expect(tileValue('Pending')).toBe('3');
    expect(tileValue('Overdue')).toBe('2');
  });

  it('states rates with the documented formula, not a rounded guess', async () => {
    await renderPage();
    // 10 of 16 completed, and 9 of 10 completed-with-a-due-date on time.
    expect(tileValue('Completion rate')).toBe('62.5%');
    expect(tileValue('On-time rate')).toBe('90%');
  });

  it('shows both roles their own figures', async () => {
    await renderPage();
    expect(screen.getByText('Telecalling')).toBeTruthy();
    expect(screen.getByText('Pipeline, conversion and money in.')).toBeTruthy();
    // Telecaller connection rate: 8 connected of 16 dialled.
    expect(screen.getByText('Connection rate')).toBeTruthy();
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
  });

  it('lists everyone with a clickable count and their target', async () => {
    await renderPage();
    expect(screen.getByText('By employee')).toBeTruthy();
    expect(screen.getAllByText('Ramesh Kumar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sunita Devi').length).toBeGreaterThan(0);
    // 150,000 against a 100,000 target.
    expect(screen.getAllByText('150%').length).toBeGreaterThan(0);
  });

  it('surfaces what needs attention rather than only reporting', async () => {
    await renderPage();
    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.getByText('Overdue work')).toBeTruthy();
    // One of the two has a target and is under it.
    expect(screen.getByText('Below target')).toBeTruthy();
  });
});
