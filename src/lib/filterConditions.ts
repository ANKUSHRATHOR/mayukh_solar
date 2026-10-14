/**
 * Condition filters: "field · condition · value" rows, ANDed together.
 *
 * One engine for every list. A page declares its fields; the engine resolves
 * each condition into atoms and either applies them to a PostgREST query (lists
 * that filter in Postgres) or tests a row in memory (lists that load in full).
 * Both paths read the same resolved form, so a condition cannot mean one thing
 * on the server and another in the browser.
 *
 * Kept pure — no React, no Supabase client — so it is unit-tested directly.
 */

export type FieldType = 'text' | 'number' | 'date' | 'option';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterField<Row = unknown> {
  /** Stable id, persisted with saved filters. */
  key: string;
  label: string;
  type: FieldType;
  /**
   * Database column(s). Defaults to `[key]`. More than one means "either": a
   * positive condition matches when any column does, a negative one only when
   * none does — a lead's "assigned to" is its telecaller *or* its sales rep.
   * A column may name an embedded table (`leads.district`).
   */
  columns?: string[];
  /** Date fields: a timestamptz compared by instant, or a `date` compared by day. */
  dateKind?: 'timestamp' | 'day';
  /** Option fields: the choices. */
  options?: FilterOption[];
  /**
   * Restricts the conditions offered, for a list whose query can only express
   * some of them (an RPC with fixed parameters). Defaults to every condition
   * of the field's type.
   */
  operators?: Operator[];
  /** In-memory lists: reads a column's value off a row. Defaults to `row[column]`. */
  get?: (row: Row, column: string) => unknown;
}

export type Operator =
  // text
  | 'contains' | 'not_contains' | 'starts_with' | 'ends_with'
  // shared by text and option
  | 'is' | 'is_not'
  // option
  | 'any_of' | 'none_of'
  // number
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  // number and date
  | 'between'
  // date
  | 'on' | 'not_on' | 'before' | 'after' | 'in_month'
  | 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month'
  | 'last_n_days' | 'next_n_days'
  // every type
  | 'empty' | 'not_empty';

/** What the value slot of a row should render for an operator. */
export type ValueInput =
  | 'none' | 'text' | 'number' | 'number_range' | 'date' | 'date_range' | 'month' | 'days'
  | 'option' | 'options';

export interface FilterCondition {
  id: string;
  field: string;
  op: Operator;
  value?: string;
  value2?: string;
  values?: string[];
}

interface OperatorSpec {
  op: Operator;
  label: string;
  input: ValueInput;
}

const OPERATORS: Record<FieldType, OperatorSpec[]> = {
  text: [
    { op: 'contains', label: 'contains', input: 'text' },
    { op: 'not_contains', label: 'does not contain', input: 'text' },
    { op: 'is', label: 'is', input: 'text' },
    { op: 'is_not', label: 'is not', input: 'text' },
    { op: 'starts_with', label: 'starts with', input: 'text' },
    { op: 'ends_with', label: 'ends with', input: 'text' },
    { op: 'empty', label: 'is empty', input: 'none' },
    { op: 'not_empty', label: 'is not empty', input: 'none' },
  ],
  number: [
    { op: 'eq', label: '=', input: 'number' },
    { op: 'neq', label: '≠', input: 'number' },
    { op: 'gt', label: '>', input: 'number' },
    { op: 'gte', label: '≥', input: 'number' },
    { op: 'lt', label: '<', input: 'number' },
    { op: 'lte', label: '≤', input: 'number' },
    { op: 'between', label: 'is between', input: 'number_range' },
    { op: 'empty', label: 'is empty', input: 'none' },
    { op: 'not_empty', label: 'is not empty', input: 'none' },
  ],
  date: [
    { op: 'on', label: 'is on', input: 'date' },
    { op: 'not_on', label: 'is not on', input: 'date' },
    { op: 'before', label: 'is before', input: 'date' },
    { op: 'after', label: 'is after', input: 'date' },
    { op: 'between', label: 'is between', input: 'date_range' },
    { op: 'in_month', label: 'is in month', input: 'month' },
    { op: 'today', label: 'is today', input: 'none' },
    { op: 'yesterday', label: 'is yesterday', input: 'none' },
    { op: 'this_week', label: 'is this week', input: 'none' },
    { op: 'last_week', label: 'is last week', input: 'none' },
    { op: 'this_month', label: 'is this month', input: 'none' },
    { op: 'last_month', label: 'is last month', input: 'none' },
    { op: 'last_n_days', label: 'in the last … days', input: 'days' },
    { op: 'next_n_days', label: 'in the next … days', input: 'days' },
    { op: 'empty', label: 'is empty', input: 'none' },
    { op: 'not_empty', label: 'is not empty', input: 'none' },
  ],
  option: [
    { op: 'is', label: 'is', input: 'option' },
    { op: 'is_not', label: 'is not', input: 'option' },
    { op: 'any_of', label: 'is any of', input: 'options' },
    { op: 'none_of', label: 'is none of', input: 'options' },
    { op: 'empty', label: 'is empty', input: 'none' },
    { op: 'not_empty', label: 'is not empty', input: 'none' },
  ],
};

/** The conditions a field offers: its type's, narrowed by `field.operators`. */
export const operatorsFor = (field: Pick<FilterField<never>, 'type' | 'operators'>): OperatorSpec[] =>
  field.operators ? OPERATORS[field.type].filter((o) => field.operators!.includes(o.op)) : OPERATORS[field.type];

export const defaultOperator = (field: Pick<FilterField<never>, 'type' | 'operators'>): Operator =>
  operatorsFor(field)[0].op;

export const valueInputFor = (type: FieldType, op: Operator): ValueInput =>
  OPERATORS[type].find((o) => o.op === op)?.input ?? 'none';

const filled = (v: string | undefined): v is string => v !== undefined && v.trim() !== '';

/** Whether a condition has everything its operator needs. Incomplete ones are never applied. */
export const isComplete = (cond: FilterCondition, fields: FilterField<never>[]): boolean => {
  const field = fields.find((f) => f.key === cond.field);
  if (!field) return false;
  if (!operatorsFor(field).some((o) => o.op === cond.op)) return false;
  switch (valueInputFor(field.type, cond.op)) {
    case 'none':
      return true;
    case 'options':
      return (cond.values?.length ?? 0) > 0;
    case 'number_range':
    case 'date_range':
      return filled(cond.value) && filled(cond.value2);
    case 'number':
      return filled(cond.value) && Number.isFinite(Number(cond.value));
    case 'days':
      return filled(cond.value) && Number.isInteger(Number(cond.value)) && Number(cond.value) > 0;
    default:
      return filled(cond.value);
  }
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type AtomOp =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'ilike' | 'not_ilike' | 'in' | 'not_in' | 'null' | 'not_null';

export interface Atom {
  column: string;
  op: AtomOp;
  value?: string | number;
  values?: string[];
}

/**
 * A resolved condition: an AND of OR-groups. Every negative condition counts an
 * empty value as "not X" — "status is not Final" includes leads with no status —
 * which SQL's `<>` alone would silently drop.
 */
export type Clause = Atom[][];

/** `%` and `_` are LIKE wildcards; a typed one is meant literally. */
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

const pad = (n: number) => String(n).padStart(2, '0');
const dayString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseDay = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)); // Monday

/**
 * The half-open local-time window `[from, before)` a date operator covers.
 * Weeks start on Monday; "last N days" includes today.
 */
export const dateWindow = (
  op: Operator,
  cond: Pick<FilterCondition, 'value' | 'value2'>,
  now: Date = new Date()
): { from?: Date; before?: Date } | null => {
  const today = startOfDay(now);
  const n = Number(cond.value);
  switch (op) {
    case 'on':
    case 'not_on':
      return { from: parseDay(cond.value!), before: addDays(parseDay(cond.value!), 1) };
    case 'before':
      return { before: parseDay(cond.value!) };
    case 'after':
      return { from: addDays(parseDay(cond.value!), 1) };
    case 'between': {
      const [a, b] = [cond.value!, cond.value2!].sort();
      return { from: parseDay(a), before: addDays(parseDay(b), 1) };
    }
    case 'in_month': {
      const [y, m] = cond.value!.split('-').map(Number);
      return { from: new Date(y, m - 1, 1), before: new Date(y, m, 1) };
    }
    case 'today':
      return { from: today, before: addDays(today, 1) };
    case 'yesterday':
      return { from: addDays(today, -1), before: today };
    case 'this_week':
      return { from: startOfWeek(now), before: addDays(startOfWeek(now), 7) };
    case 'last_week':
      return { from: addDays(startOfWeek(now), -7), before: startOfWeek(now) };
    case 'this_month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), before: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    case 'last_month':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), before: new Date(now.getFullYear(), now.getMonth(), 1) };
    case 'last_n_days':
      return { from: addDays(today, -(n - 1)), before: addDays(today, 1) };
    case 'next_n_days':
      return { from: today, before: addDays(today, n + 1) };
    default:
      return null;
  }
};

/** Resolves one complete condition into a clause. */
export const resolveCondition = (
  cond: FilterCondition,
  field: FilterField<never>,
  now: Date = new Date()
): Clause => {
  const columns = field.columns ?? [field.key];
  const { op } = cond;

  // Positive atoms for one column; a range on one column is two atoms, ANDed.
  const positive = (column: string): Atom[] => {
    if (field.type === 'date') {
      const w = dateWindow(op === 'not_on' ? 'on' : op, cond, now)!;
      const fmt = (d: Date) => (field.dateKind === 'day' ? dayString(d) : d.toISOString());
      return [
        ...(w.from ? [{ column, op: 'gte' as const, value: fmt(w.from) }] : []),
        ...(w.before ? [{ column, op: 'lt' as const, value: fmt(w.before) }] : []),
      ];
    }
    const v = cond.value ?? '';
    switch (op) {
      case 'contains':
      case 'not_contains':
        return [{ column, op: 'ilike', value: `%${escapeLike(v)}%` }];
      case 'starts_with':
        return [{ column, op: 'ilike', value: `${escapeLike(v)}%` }];
      case 'ends_with':
        return [{ column, op: 'ilike', value: `%${escapeLike(v)}` }];
      case 'is':
      case 'is_not':
        // Text equality ignores case: "kota" finds "Kota".
        return field.type === 'text'
          ? [{ column, op: 'ilike', value: escapeLike(v) }]
          : [{ column, op: 'eq', value: v }];
      case 'any_of':
      case 'none_of':
        return [{ column, op: 'in', values: cond.values ?? [] }];
      case 'eq': case 'neq':
        return [{ column, op: 'eq', value: Number(v) }];
      case 'gt': case 'gte': case 'lt': case 'lte':
        return [{ column, op, value: Number(v) }];
      case 'between': {
        const [a, b] = [Number(cond.value), Number(cond.value2)].sort((x, y) => x - y);
        return [{ column, op: 'gte', value: a }, { column, op: 'lte', value: b }];
      }
      default:
        return [];
    }
  };

  // The negation of a positive atom group, null-safe: NOT(a AND b) = (¬a OR ¬b OR null).
  const negate = (column: string): Atom[] => [
    ...positive(column).map((a): Atom => ({ ...a, op: NEGATE[a.op] })),
    { column, op: 'null' },
  ];

  const emptyOf = (column: string): Atom[] =>
    field.type === 'text' ? [{ column, op: 'null' }, { column, op: 'eq', value: '' }] : [{ column, op: 'null' }];
  const notEmptyOf = (column: string): Atom =>
    field.type === 'text' ? { column, op: 'neq', value: '' } : { column, op: 'not_null' };

  switch (op) {
    case 'empty':
      // Every column empty.
      return columns.map(emptyOf);
    case 'not_empty':
      // Any column filled.
      return [columns.map(notEmptyOf)];
    case 'not_contains':
    case 'is_not':
    case 'none_of':
    case 'neq':
    case 'not_on':
      // No column matches.
      return columns.map(negate);
    default: {
      if (columns.length === 1) return positive(columns[0]).map((a) => [a]);
      // Any column matches. Multi-column fields are option fields, whose
      // positive form is one atom per column, so this stays an OR of atoms.
      return [columns.flatMap(positive)];
    }
  }
};

const NEGATE: Record<AtomOp, AtomOp> = {
  eq: 'neq', neq: 'eq', gt: 'lte', gte: 'lt', lt: 'gte', lte: 'gt',
  ilike: 'not_ilike', not_ilike: 'ilike', in: 'not_in', not_in: 'in', null: 'not_null', not_null: 'null',
};

/** Resolves every complete condition; incomplete ones and unknown fields are skipped. */
export const resolveConditions = (
  conditions: FilterCondition[],
  fields: FilterField<never>[],
  now: Date = new Date()
): Clause => {
  const out: Clause = [];
  for (const cond of conditions) {
    const field = fields.find((f) => f.key === cond.field);
    if (!field || !isComplete(cond, fields)) continue;
    out.push(...resolveCondition(cond, field, now));
  }
  return out;
};

// ---------------------------------------------------------------------------
// PostgREST
// ---------------------------------------------------------------------------

const POSTGREST_OP: Record<AtomOp, string> = {
  eq: 'eq', neq: 'neq', gt: 'gt', gte: 'gte', lt: 'lt', lte: 'lte',
  ilike: 'ilike', not_ilike: 'not.ilike', in: 'in', not_in: 'not.in', null: 'is', not_null: 'not.is',
};

/** Quotes a value for PostgREST's filter grammar, where `,` `(` `)` are syntax. */
const quote = (v: string | number) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * PostgREST parses quotes only inside `or()` groups and `in` lists; a top-level
 * filter takes its value verbatim, so quoting there would search for the quotes.
 */
const atomValue = (a: Atom, inLogic: boolean): string => {
  if (a.op === 'null' || a.op === 'not_null') return 'null';
  if (a.op === 'in' || a.op === 'not_in') return `(${(a.values ?? []).map(quote).join(',')})`;
  return inLogic ? quote(a.value ?? '') : String(a.value ?? '');
};

/** Splits `leads.district` into the embedded table and its column. */
const splitColumn = (column: string): { table?: string; name: string } => {
  const i = column.lastIndexOf('.');
  return i < 0 ? { name: column } : { table: column.slice(0, i), name: column.slice(i + 1) };
};

/** The `or()` string for one group, e.g. `status.neq."final",status.is.null`. */
export const toPostgrestOr = (group: Atom[]): string =>
  group.map((a) => `${splitColumn(a.column).name}.${POSTGREST_OP[a.op]}.${atomValue(a, true)}`).join(',');

interface FilterableQuery<Q> {
  filter: (column: string, operator: string, value: unknown) => Q;
  or: (filters: string, options?: { referencedTable?: string; foreignTable?: string }) => Q;
}

/**
 * Applies a clause to a Supabase query. A one-atom group is a plain filter; a
 * wider one is an `or()`, scoped to its embedded table when the columns name one.
 */
export const applyClause = <Q extends FilterableQuery<Q>>(query: Q, clause: Clause): Q =>
  clause.reduce<Q>((q, group) => {
    if (group.length === 1) {
      const [a] = group;
      return q.filter(a.column, POSTGREST_OP[a.op], atomValue(a, false));
    }
    const { table } = splitColumn(group[0].column);
    return table ? q.or(toPostgrestOr(group), { referencedTable: table }) : q.or(toPostgrestOr(group));
  }, query);

// ---------------------------------------------------------------------------
// In memory
// ---------------------------------------------------------------------------

const likeToRegExp = (pattern: string) => {
  let src = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) src += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (c === '%') src += '.*';
    else if (c === '_') src += '.';
    else src += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${src}$`, 'is');
};

const isNullish = (v: unknown) => v === null || v === undefined;

const testAtom = (raw: unknown, a: Atom, field: FilterField<never>): boolean => {
  if (a.op === 'null') return isNullish(raw);
  if (a.op === 'not_null') return !isNullish(raw);
  // As in SQL, a comparison with NULL is never true; the null-safe clauses
  // above already carry their own `null` atom where empty should match.
  if (isNullish(raw)) return false;

  if (a.op === 'in' || a.op === 'not_in') {
    const hit = (a.values ?? []).includes(String(raw));
    return a.op === 'in' ? hit : !hit;
  }
  if (a.op === 'ilike' || a.op === 'not_ilike') {
    const hit = likeToRegExp(String(a.value)).test(String(raw));
    return a.op === 'ilike' ? hit : !hit;
  }

  const cmp = (): number => {
    if (field.type === 'number') return Number(raw) - Number(a.value);
    if (field.type === 'date') {
      if (field.dateKind === 'day') {
        const l = String(raw).slice(0, 10);
        const r = String(a.value);
        return l < r ? -1 : l > r ? 1 : 0;
      }
      return new Date(raw as string).getTime() - new Date(String(a.value)).getTime();
    }
    const l = String(raw);
    const r = String(a.value);
    return l < r ? -1 : l > r ? 1 : 0;
  };
  const c = cmp();
  switch (a.op) {
    case 'eq': return c === 0;
    case 'neq': return c !== 0;
    case 'gt': return c > 0;
    case 'gte': return c >= 0;
    case 'lt': return c < 0;
    case 'lte': return c <= 0;
    default: return false;
  }
};

/** Builds an in-memory predicate for lists that load every row. */
export const rowMatcher = <Row,>(
  conditions: FilterCondition[],
  fields: FilterField<Row>[],
  now: Date = new Date()
): ((row: Row) => boolean) => {
  const resolved = conditions
    .map((cond) => {
      const field = fields.find((f) => f.key === cond.field);
      if (!field || !isComplete(cond, fields as FilterField<never>[])) return null;
      return { field, clause: resolveCondition(cond, field as FilterField<never>, now) };
    })
    .filter((x): x is { field: FilterField<Row>; clause: Clause } => x !== null);

  return (row: Row) =>
    resolved.every(({ field, clause }) =>
      clause.every((group) =>
        group.some((a) => {
          const raw = field.get
            ? field.get(row, a.column)
            : (row as Record<string, unknown>)[a.column];
          return testAtom(raw, a, field as FilterField<never>);
        })
      )
    );
};

/** Conditions that will actually be applied — what the Filters badge counts. */
export const countApplied = (conditions: FilterCondition[], fields: FilterField<never>[]): number =>
  conditions.filter((c) => isComplete(c, fields)).length;

let seq = 0;
export const newConditionId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;
