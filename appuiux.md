# Mayukh Solar CRM — UI/UX Design System & Enhancement Log

> **Purpose.** This is the single source of truth ("first proof") for the look, feel,
> and interaction rules of the Mayukh Solar CRM. It documents the design tokens,
> component standards, and the production-grade enhancement pass applied to lift the
> interface from "functional" to "polished software product." Read this before
> changing anything visual so the app stays consistent across every module.

- **Stack:** React + TypeScript + Vite, TailwindCSS, shadcn/ui (Radix primitives), Lucide icons.
- **Theming:** CSS custom properties in [`src/index.css`](src/index.css), mapped to Tailwind in [`tailwind.config.ts`](tailwind.config.ts). Light + dark, toggled via `next-themes` (`.dark` class).
- **Golden rule:** Change design **at the token or primitive level**, not per-page. One edit to `Input`, `Button`, or a CSS variable should propagate everywhere. Avoid one-off inline colors and hardcoded hex.

---

## 1. Design Principles

1. **Clarity over decoration.** Every pixel earns its place. Muted neon and gradients were removed in favor of clean surfaces, one confident accent, and real hierarchy.
2. **One accent, used sparingly.** Solar **orange** (`hsl(24 95% 50%)`) marks the primary action and active state — nothing else competes with it.
3. **Legibility first.** Strong text/background contrast, generous label sizes, tabular numerals for all data, and never relying on color alone to convey status.
4. **Consistent rhythm.** Shared shells (`PageHeader`, `SectionCard`, `DetailShell`, `FormShell`, `DataTable`) give every screen the same spacing, radius, and elevation language.
5. **Feedback on every interaction.** Hover, focus-visible, active/press, loading, empty, and error states are all designed — not left to browser defaults.
6. **Mobile is a first-class citizen.** Field staff work on phones: tables collapse to cards, tap targets meet 44px, and sticky action bars keep primary actions reachable.

---

## 2. Color System (Design Tokens)

All colors are HSL custom properties so light/dark and future rebrands are one-file changes. Defined in [`src/index.css`](src/index.css).

### Core palette

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `210 20% 98%` | `222 47% 10%` | App canvas |
| `--foreground` | `222 47% 11%` | `210 40% 98%` | Primary text |
| `--card` | `0 0% 100%` | `222 40% 14%` | Cards, tables, popovers surface |
| `--popover` | `0 0% 100%` | `222 40% 15%` | Menus, dropdowns |
| `--primary` | `24 95% 50%` | `24 95% 50%` | Brand accent / primary action |
| `--muted` / `--muted-foreground` | `210 40% 96%` / `215 16% 47%` | `216 28% ...` / `215 20% 65%` | Secondary surfaces & text |
| `--border` | `214 32% 89%` | `216 28% 21%` | Hairlines, dividers |
| `--input` | `214 26% 84%` | `216 28% 24%` | Field borders |
| `--ring` | `24 95% 50%` | `24 95% 50%` | Focus ring (on-brand orange) |

### Semantic status tones

Status is expressed through a **shared tone map** ([`src/lib/statusMeta.ts`](src/lib/statusMeta.ts)) so a given business status looks identical everywhere. Unknown values fall back to a neutral tone rather than borrowing another status's color.

| Tone | Meaning | Example status |
|---|---|---|
| `neutral` | Inactive / unknown | — |
| `info` | New / informational | New, Quotation Sent |
| `progress` | In-flight (orange family) | Registration, Material stages |
| `success` | Positive / done | Interested, Final |
| `warning` | Needs attention | Follow Up, Pending Documents |
| `danger` | Negative / blocked | Cancelled, Rejected |

### What changed (this pass)
- **Dark-mode surfaces fixed.** Cards were `222 47% 12%` on a `222 47% 11%` background — a **1% lightness gap**, so panels were nearly invisible. Cards are now `14%` / popovers `15%` on a `10%` background, giving clear separation and depth.
- **Field borders strengthened.** `--input` was the same faint value as `--border`; inputs now use a slightly darker, more defined border so fields read as fillable.
- **Focus ring is on-brand.** `--ring` stays orange and drives a soft 3px halo instead of a hard offset outline.

---

## 3. Typography

- **Family:** `Plus Jakarta Sans` (loaded via Google Fonts), fallback `system-ui`.
- **Rendering:** `-webkit-font-smoothing: antialiased`, `text-rendering: optimizeLegibility` for crisp glyphs.
- **Headings:** slight negative tracking (`-0.011em`) for a tighter, editorial feel; `font-extrabold` on page titles.
- **Numbers:** `font-variant-numeric: tabular-nums` applied globally to table cells, stat values, and counters so figures align in columns and don't jitter on update.
- **Form labels:** raised to `13px` semibold at `foreground/90` (was `12px`) for readability without shouting.

### Scale (reference)

| Role | Class | Notes |
|---|---|---|
| Page title | `text-xl sm:text-2xl font-extrabold` | `PageHeader` |
| Section title | `text-sm font-bold` | `SectionCard` |
| Stat value | `text-3xl font-extrabold tabular-nums` | `StatCard` |
| Body | `text-sm` | default |
| Field label | `text-[13px] font-semibold` | form fields |
| Meta / overline | `text-[10px] uppercase tracking-[0.14em–0.18em]` | labels, table headers |

---

## 4. Elevation, Radius & Motion

- **Radius:** base `--radius: 0.625rem`; cards use `rounded-2xl`, dialogs `rounded-xl`, controls `rounded-md`. Softer than the old `0.5rem` for a more modern silhouette.
- **Shadows:** token set `--shadow-card`, `--shadow-elevated`, `--shadow-glow` (subtle, layered, no neon). Inputs/buttons carry a faint `shadow-sm`; dialogs use `shadow-2xl`.
- **Motion:** `transition-all duration-150` on interactive controls. Buttons **press** (`active:scale-[0.98]`). Cards lift on hover (`hover:-translate-y-0.5`). Entrances use `animate-in-up` (opacity + 6px rise). No infinite/pulsing animations.

---

## 5. Component Standards

### Buttons — [`src/components/ui/button.tsx`](src/components/ui/button.tsx)
- Variants: `default` (orange), `destructive`, `outline`, `secondary`, `ghost`, `link`.
- Sizes: `sm` (36px), `default` (40px), `lg` (44px), `icon`.
- **Enhancements:** `font-semibold`, `shadow-sm → hover:shadow-md` elevation on solid/outline variants, `active:scale-[0.98]` press feedback, softened focus ring (`ring-ring/50`).

### Inputs / Textarea — [`input.tsx`](src/components/ui/input.tsx), [`textarea.tsx`](src/components/ui/textarea.tsx)
- 40px height, `shadow-sm`, defined border.
- **States:** `hover:border-muted-foreground/35`, focus = `border-ring` + soft 3px `ring-ring/35`, disabled dimmed.
- **Errors are automatic.** Base styles react to `aria-[invalid=true]` (`border-destructive` + red ring). Because `FormControl` already sets `aria-invalid` from the validation state, every form field turns red on error with **zero per-field code**.
- Placeholders lightened to `muted-foreground/70` so real input reads darker than the hint.

### Dropdowns / Select — [`select.tsx`](src/components/ui/select.tsx)
- Trigger matches inputs exactly (same border/hover/focus language).
- Menu: `rounded-lg`, `shadow-lg`, soft border; items are `cursor-pointer`, `rounded-md`, with a clear focus background and bold checked state.

### Checkbox / Switch — [`checkbox.tsx`](src/components/ui/checkbox.tsx), [`fields/SwitchField.tsx`](src/components/common/fields/SwitchField.tsx)
- Checkbox: neutral `border-input` at rest, `hover:border-primary/60`, orange when checked, `rounded-[5px]`.
- Switch rows: full-width tappable card with hover border, comfortably above the 44px minimum.

### Badges & Status — [`badge.tsx`](src/components/ui/badge.tsx), [`StatusBadge.tsx`](src/components/common/StatusBadge.tsx)
- **Fixed the wrapping bug:** multi-word statuses like "Follow Up" / "Documents Approved" wrapped inside the pill and rendered as a lopsided circle. Badges now `whitespace-nowrap w-fit` and always sit on one line.
- Tones come from the shared `toneClasses` map (light + dark variants).

### Dialogs / Modals — [`dialog.tsx`](src/components/ui/dialog.tsx)
- Overlay softened to `bg-black/50` **+ `backdrop-blur-sm`** (was a heavy `bg-black/80`) to keep context visible.
- Content: `rounded-xl`, `shadow-2xl`, subtle border.
- Close button: larger 32px hit area with hover background.

### Tables — [`table.tsx`](src/components/ui/table.tsx), [`DataTable.tsx`](src/components/common/DataTable.tsx)
- `DataTable` is the standard list view: server-paginated, sortable, with a **desktop table** and an automatic **mobile card** fallback.
- **Enhancements:** header row gets a subtle `bg-muted/50` band + `text-muted-foreground` for scannability; rows get `hover:bg-accent/40` when clickable; tabular numerals keep numeric columns aligned.
- Uppercase `11px` bold headers; sortable headers show direction arrows; background refetches dim (not tear down) the current page.

### Forms — [`FormShell.tsx`](src/components/common/FormShell.tsx) + [`fields/`](src/components/common/fields)
- `FormShell` wraps every react-hook-form: content stack, **sticky action bar** (Cancel / Save with spinner), form-level error banner, and **unsaved-changes protection**.
- Validation errors render **inline against the field** (icon + red text via `FormMessage`) *and* surface the first error at form level — never a fire-and-forget toast that leaves the bad field unmarked.
- Field wrappers (`TextField`, `SelectField`, `TextareaField`, `SwitchField`) standardize label, required marker, helper text, error, and spacing so no two forms drift apart.

### Detail views — [`DetailShell.tsx`](src/components/common/DetailShell.tsx), [`DetailField.tsx`](src/components/common/DetailField.tsx), [`SectionCard.tsx`](src/components/common/SectionCard.tsx)
- `DetailShell` distinguishes **loading / error / not-found** instead of collapsing all three into one message; supports an optional right rail.
- `DetailField` renders label/value pairs with a consistent em-dash for empty values (never "null" or a blank gap). `SectionCard` gives every block the same header + optional collapse.

### App shell — [`AppLayout.tsx`](src/components/layout/AppLayout.tsx), [`AppSidebar.tsx`](src/components/layout/AppSidebar.tsx)
- Executive **dark slate sidebar** with role-aware nav sections, active item highlighted with an orange gradient chip.
- Sticky glass top bar with theme toggle, notifications, and identity. Sidebar collapses on desktop and slides over on mobile with a scrim.

---

## 6. States & Feedback (must-haves)

Every data surface implements the full set:

| State | Pattern |
|---|---|
| **Loading** | Skeletons matching final layout (`DataTable` rows, `DetailShell` blocks) |
| **Empty** | `EmptyState` with icon, title, guidance, optional CTA |
| **Error** | `ErrorState` with retry; forms show an inline error banner |
| **Not found** | Distinct message, not conflated with error |
| **Searching-empty** | "No matches" copy distinct from "nothing here yet" |
| **Focus** | Visible `ring-ring` halo on every interactive element (keyboard-friendly) |

---

## 7. Accessibility

- Focus-visible rings on all controls; keyboard handlers on clickable cards/rows (`Enter`/`Space`).
- `aria-invalid` wired through the form layer; errors are announced (`role="alert"` on form banner).
- Status conveyed by **label + color**, never color alone.
- Tap targets ≥ 44px on mobile surfaces; icon-only buttons carry `aria-label`.

---

## 8. Enhancement Log — Production-Grade Pass

Changes applied in this UI/UX pass, all at token/primitive level so they lift the whole app:

1. **Dark-mode depth** — raised card/popover lightness above the background (fixed the ~1% invisible-panel gap); strengthened borders and inputs.
2. **Typography** — legibility rendering, tighter heading tracking, global tabular numerals, larger form labels.
3. **Buttons** — semibold, elevation on hover, tactile press (`active:scale`), calmer focus.
4. **Inputs / textarea / select** — defined borders, hover feedback, unified soft focus ring, and **automatic `aria-invalid` error styling** across all forms.
5. **Dropdown menus** — softer elevation, pointer cursor, clearer checked/hover items.
6. **Tables** — banded, muted headers; clickable-row hover; aligned numerals.
7. **Badges / status** — fixed multi-word wrapping (single-line pills everywhere).
8. **Dialogs** — blurred, lighter overlay; rounded, elevated content; bigger close target.
9. **Checkbox / switch** — neutral rest state, hover affordance, larger tap rows.
10. **Radius** — softened base radius for a more modern silhouette.

### Files touched
`src/index.css`, `tailwind.config.ts` (tokens); `ui/button.tsx`, `ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx`, `ui/checkbox.tsx`, `ui/badge.tsx`, `ui/dialog.tsx`, `ui/form.tsx`; `common/DataTable.tsx`, `common/StatusBadge.tsx`, `common/fields/*`.

---

## 9. Contribution Rules (keep it production-grade)

- **Use the shells.** New list → `DataTable`; new form → `FormShell` + field wrappers; new record page → `DetailShell` + `SectionCard`. Don't invent a card treatment.
- **Use tokens, not hex.** `bg-primary`, `text-muted-foreground`, `border-border` — never raw colors.
- **Status via `statusMeta` + `StatusBadge`.** Never hand-color a status pill.
- **Design the empty/loading/error state** before shipping a new data view.
- **Verify light *and* dark**, desktop *and* mobile, before merging.
