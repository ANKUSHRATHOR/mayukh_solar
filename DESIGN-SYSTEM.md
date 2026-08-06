# DESIGN-SYSTEM.md

**The normative UI spec for Mayukh Solar CRM. Read this before touching any UI file.**

Rules here are binding. `appuiux.md` is historical background — it records the pass that produced these values and explains *why* several of them are what they are, but it is not the spec.

**Golden rule:** change design at the **token or primitive level** — `src/index.css`, `tailwind.config.ts`, or a `components/ui/` primitive — never per page. One edit to `Button`, `Input`, or a CSS variable must propagate everywhere.

Stack: React + TypeScript + Vite, TailwindCSS, shadcn/ui (Radix), Lucide icons, `next-themes` for light/dark via the `.dark` class.

---

## 1. Audience and tone

An **internal B2B operations tool**. Six staff roles — admin, telecaller, sales rep, operator, welder, electrician — use it all day for repetitive work. No customer logs in today.

Tone is **utilitarian and information-dense**: compact spacing, terse labels, speed and scannability over delight. Optimize for the trained daily user, not the first-time visitor. Never sacrifice a visible row of data for whitespace.

A **customer portal** is anticipated. See §12 for how the rules differ there. Tokens, states and accessibility are shared; density and language are not.

---

## 2. Color tokens

All color is HSL custom properties defined in [`src/index.css`](src/index.css) and mapped to Tailwind in [`tailwind.config.ts`](tailwind.config.ts). Light and dark are both first-class.

### Surfaces and text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `210 20% 98%` | `222 47% 10%` | App canvas |
| `--foreground` | `222 47% 11%` | `210 40% 98%` | Primary text |
| `--card` | `0 0% 100%` | `222 40% 14%` | Cards, tables, panels |
| `--popover` | `0 0% 100%` | `222 40% 15%` | Menus, dropdowns |
| `--muted` | `210 40% 96.1%` | `217.2 32.6% 17.5%` | Secondary surfaces |
| `--muted-foreground` | `215.4 16.3% 46.9%` | `215 20.2% 65.1%` | Secondary text |
| `--accent` | `210 40% 96.1%` | `217.2 32.6% 17.5%` | Hover fills |
| `--border` | `214.3 31.8% 89%` | `216 28% 21%` | Hairlines, dividers |
| `--input` | `214.3 26% 84%` | `216 28% 24%` | Field borders — deliberately darker than `--border` so fields read as fillable |

Dark surfaces must keep a real lightness gap from the background. Cards sit at `14%` and popovers at `15%` against a `10%` canvas; an earlier 1% gap made panels invisible. Do not flatten these.

### Brand vs interactive — two different jobs

| Token | Value | Use |
|---|---|---|
| `--brand` | `24 95% 50%` | Solar orange. **Fills, chart series, large text and the sidebar chip only.** |
| `--primary` | `21 90% 40%` | The interactive fill: buttons, active controls |
| `--primary-foreground` | `0 0% 100%` | Label on primary |
| `--ring` | `21 90% 40%` | Focus ring |

These are split because one colour cannot do both jobs. The bright brand orange carries a white label at only **3.01:1** and its own edge sits at **2.88:1** against the light canvas — under the 3:1 WCAG 1.4.11 requires for a UI component boundary. Making the label near-black fixes the text but not the edge. `--primary` is deep enough for both (4.90:1 label, 4.69:1 edge).

**Never use `--brand` for body text.** `text-brand` on a light card is 3.01:1 — legible as a shape, not as a sentence. It is valid for ≥24px / ≥18.66px-bold text, for fills, and on the dark sidebar.

**The sidebar is the one place `--brand` is the *correct* choice for text.** It is dark in both themes: `text-brand` reads 5.94:1 on that slate, while `text-primary` — tuned for light canvases — drops to 3.65:1. `AppSidebar`'s active item uses `brand` utilities for exactly this reason. The rule generalises: `primary` for light surfaces, `brand` on the dark chrome.

**One accent, used sparingly.** Orange marks the primary action and the active nav state. Nothing else competes with it. If two things on a screen are orange, one of them is wrong.

### Semantic status

| Token | Light | Dark |
|---|---|---|
| `--success` | `142.1 76.2% 30%` | `142.1 70.6% 45.3%` |
| `--warning` | `38 92% 33.5%` | `47.9 95.8% 53.1%` |
| `--info` | `199 89% 37%` | `199 89% 48%` |
| `--destructive` | `0 84.2% 50.5%` | `0 75% 61.5%` |

Every one of these clears 4.5:1 as text on its own theme's card. The light values are deliberately darker than a typical palette because they are used as `text-*` at 9–11px in badges and inline hints.

**`--destructive` inverts between themes.** A colour cannot simultaneously contrast with a dark card *and* carry a white label, so in dark mode the token is light and `--destructive-foreground` flips to near-black. Do not "fix" the dark value back to a deep red: `text-destructive` has 106 call sites, including the destructive `Alert`, and the old value rendered them at 1.66:1.

### Sidebar

The sidebar runs its own dark-slate scale (`--sidebar-background`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-ring`) so it stays dark in both themes for executive contrast. Use the `sidebar-*` Tailwind classes inside the shell; don't reach for the app tokens there.

### Rules

1. **Reference semantic classes, never raw color.** `bg-primary`, `text-muted-foreground`, `border-border`. Never `#f97316`, never `bg-emerald-600`, never `text-slate-500`.
2. **Never hand-color a status.** Status color comes from [`src/lib/statusMeta.ts`](src/lib/statusMeta.ts) through [`StatusBadge`](src/components/common/StatusBadge.tsx). Unknown values fall back to neutral rather than borrowing another status's color.
3. **`statusMeta.ts`'s `toneClasses` is the one sanctioned place** literal palette colors may appear. It is centralized, light/dark paired, and reviewed as a unit. Adding a tone there is correct; inlining `bg-blue-100` at a call site is not.
4. **Print/PDF is the only other exception.** [`QuotationPreviewDialog.tsx`](src/components/leads/QuotationPreviewDialog.tsx) and [`lib/quotationPdf.ts`](src/lib/quotationPdf.ts) render output through `html2pdf.js`, where CSS custom properties don't reliably resolve. Literal colors are allowed there, and only there.
5. **Status is never color alone.** Always label + color, for accessibility and for grayscale printing.
6. **`.gradient-primary` tracks `--primary`, not `--brand`.** 70 call sites across 25 files use it as a button fill instead of `bg-primary`, so both gradient stops must keep a white label above 4.5:1. Prefer `bg-primary`; the gradient exists for legacy call sites.

---

## 3. Typography

**Family:** `Plus Jakarta Sans` (Google Fonts), fallback `system-ui, sans-serif`.

Global rules already enforced in `src/index.css` — don't re-declare them per component:
- `-webkit-font-smoothing: antialiased` and `text-rendering: optimizeLegibility`.
- Headings (`h1`–`h4`) carry `-0.011em` tracking for a tighter, editorial feel.
- `font-variant-numeric: tabular-nums` on `th`, `td`, `.tabular-nums`, and `[data-slot="value"]` — figures align in columns and don't jitter on update.

### Scale

| Role | Class | Where |
|---|---|---|
| Page title | `text-xl sm:text-2xl font-extrabold` | `PageHeader` |
| Section title | `text-sm font-bold` | `SectionCard` |
| Stat value | `text-3xl font-extrabold tabular-nums` | `StatCard` |
| Body | `text-sm` | default |
| Field label | `text-[13px] font-semibold` | form fields |
| Meta / overline | `text-[10px] uppercase tracking-[0.14em]` | table headers, labels |
| Table header | `text-[11px] font-bold uppercase` | `DataTable` |

Body text is `text-sm`, not `text-base`. This is a dense internal tool; `text-base` is for the future customer portal.

---

## 4. Spacing

**4px base.** Tailwind's default scale, restricted to a sanctioned subset so screens stay rhythmically consistent.

| Step | px | Job |
|---|---|---|
| `1` | 4 | Icon-to-label, badge padding |
| `2` | 8 | Intra-component gaps |
| `3` | 12 | Control padding, tight stacks |
| `4` | 16 | Between form fields; card padding on mobile |
| `6` | 24 | Between sections; card padding on desktop |
| `8` | 32 | Page gutters |
| `12` | 48 | Major page divisions |

Rules:
- **Prefer these steps.** `5`, `7`, `9`, `10`, `11` are available in Tailwind but signal you're eyeballing rather than composing — reach for them only with a reason.
- **No arbitrary values** for spacing. `p-[13px]` is a bug. If the scale genuinely can't express it, extend the scale in `tailwind.config.ts`.
- **Vertical rhythm comes from the parent.** Use `space-y-*` / `gap-*` on the container, not `mb-*` on each child — margins on children fight each other and leave orphan space when one is conditionally hidden.
- Half-steps (`1.5`, `2.5`) are acceptable for optical alignment inside a primitive, not for layout.

---

## 5. Border radius

Base `--radius: 0.625rem` (10px). `tailwind.config.ts` derives `lg` = base, `md` = base − 2px, `sm` = base − 4px.

| Element | Radius |
|---|---|
| Cards, panels | `rounded-2xl` |
| Dialogs | `rounded-xl` |
| Controls — buttons, inputs, select | `rounded-md` |
| Menu items | `rounded-md` |
| Checkbox | `rounded-[5px]` |
| Pills, badges, avatars | `rounded-full` |

Radius signals element size: bigger surface, softer corner. Never mix two radii on nested surfaces more than one step apart.

---

## 6. Elevation

Four tokens in `src/index.css`, each darker in dark mode. Use them as a ladder — elevation communicates **layer**, not importance.

| Level | Token / class | Use |
|---|---|---|
| 0 | none | Page background, flush sections |
| 1 | `--shadow-card` / `shadow-card` | Cards, panels, table containers |
| 1 | `shadow-sm` | Resting inputs and buttons |
| 2 | `--shadow-elevated` / `shadow-elevated`, `hover:shadow-md` | Raised card, hovered button |
| 3 | `shadow-lg` | Dropdowns, popovers, select menus |
| 4 | `shadow-2xl` | Dialogs and modals |
| — | `--shadow-glow` | Sparingly, brand emphasis only |

Never use shadow to make something look important — that's the accent color's job. A flat card that isn't a layer above its parent should stay flat.

---

## 7. Breakpoints

Tailwind defaults. The `container` is centered with `2rem` padding and caps at `1400px` (`2xl`).

| Prefix | Min width | Role |
|---|---|---|
| `sm` | 640px | **Primary mobile → desktop switch.** Where layouts change. |
| `md` | 768px | Secondary; tablet refinements |
| `lg` | 1024px | Sidebar and multi-column behavior |
| `xl` | 1280px | Wide-desktop refinement, rare |
| `2xl` | 1400px | Container cap only |

**Device mix:** field staff (sales, welder, electrician) work on phones; admin and operator work on desktop. Both are first-class.

Rules:
- **Design mobile-first.** Unprefixed classes are the phone layout; add `sm:`/`lg:` to build up. Never write desktop styles and undo them with `max-*`.
- **`sm` is the default switch point** — this is the established practice (213 `sm:` usages vs 55 `md:`). Don't introduce a competing convention.
- **Every data view ships both layouts.** Desktop table plus mobile card fallback; `DataTable` does this for you.
- **Tap targets ≥ 44px** on anything a field user touches. Button `lg` is exactly 44px.

⚠️ [`useIsMobile`](src/hooks/use-mobile.tsx) switches at **768px (`md`)**, which disagrees with the `sm` CSS convention. It is not authoritative — see §14.

---

## 8. Component states

Every interactive element implements the full set. A state you didn't design is a state the browser designed for you.

### The matrix

| State | Rule |
|---|---|
| **Default** | Resting. Readable without interaction; never rely on hover to reveal meaning. |
| **Hover** | Visible affordance on pointer devices. Never the *only* signal — touch has no hover. |
| **Focus** | `focus-visible` ring, always. Keyboard users must never lose their place. |
| **Active** | Press feedback within 100ms. |
| **Disabled** | `opacity-50` + `pointer-events-none` (or `cursor-not-allowed` on inputs). Explain *why* nearby — a dead control with no reason is a support ticket. |
| **Loading** | Skeleton matching the final layout, or an in-button spinner with the button disabled. Never a bare spinner replacing a whole page that had content. |
| **Error** | Inline, next to the thing that failed, with a way to recover. |
| **Empty** | Distinct from error, and "no matches" distinct from "nothing here yet". |

### Per control

**Buttons** — [`ui/button.tsx`](src/components/ui/button.tsx)
- Variants: `default` (orange), `destructive`, `outline`, `secondary`, `ghost`, `link`. Sizes: `sm` 36px, `default` 40px, `lg` 44px, `icon` 40px.
- Base: `font-semibold`, `transition-all duration-150`.
- Hover: `hover:bg-primary/90 hover:shadow-md` (solid variants).
- Focus: `focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2`.
- Active: `active:scale-[0.98]`.
- Disabled: `disabled:pointer-events-none disabled:opacity-50`.
- Loading: spinner in the button, button disabled, label stays (don't collapse the width).
- **One primary action per view.** Everything else is `outline`, `secondary` or `ghost`.

**Inputs, textarea, select** — [`ui/input.tsx`](src/components/ui/input.tsx), [`ui/textarea.tsx`](src/components/ui/textarea.tsx), [`ui/select.tsx`](src/components/ui/select.tsx)
- 40px height, `shadow-sm`, `border-input`.
- Hover: `hover:border-muted-foreground/35`.
- Focus: `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35` — a soft halo, not a hard outline.
- Disabled: `disabled:cursor-not-allowed disabled:opacity-50`.
- **Error is automatic.** Base styles react to `aria-[invalid=true]` with `border-destructive` and a red ring. `FormControl` already sets `aria-invalid` from validation state, so **every field turns red with zero per-field code**. Never hand-color an errored input.
- Placeholders are full-opacity `muted-foreground`. They were `/70`, which is **2.72:1** — placeholder text is still text and needs 4.5:1. At full opacity it is 4.75:1 and still reads lighter than entered text (~16:1), so the hierarchy survives.
- Select triggers match inputs exactly — same border, hover and focus language.

**Checkbox / switch** — [`ui/checkbox.tsx`](src/components/ui/checkbox.tsx), [`fields/SwitchField.tsx`](src/components/common/fields/SwitchField.tsx)
- Checkbox: `border-input` at rest, `hover:border-primary/60`, orange when checked.
- Switch rows are full-width tappable cards with a hover border, comfortably above 44px.

**Rows and cards**
- Clickable rows: `hover:bg-accent/40`, `cursor-pointer`, and a keyboard handler (`Enter`/`Space`) — a clickable div that keyboard users can't reach is broken.
- Cards lift on hover only when they're clickable (`hover:-translate-y-0.5`).

**Motion**
- `transition-all duration-150` on interactive controls.
- Entrances use `animate-in-up` (opacity + 6px rise).
- **No infinite or pulsing animation.** It's a tool people stare at all day.

---

## 9. Forms

[`FormShell`](src/components/common/FormShell.tsx) plus the [`fields/`](src/components/common/fields) wrappers are **mandatory** for every form. They exist so no two forms drift apart.

- `FormShell` provides: content stack, sticky action bar (Cancel / Save with spinner), form-level error banner (`role="alert"`), and unsaved-changes protection via [`useUnsavedChangesWarning`](src/hooks/useUnsavedChangesWarning.ts).
- Field wrappers — `TextField`, `SelectField`, `TextareaField`, `SwitchField` — standardize label, required marker, helper text, error and spacing. Don't hand-roll a labeled input.
- **Errors render inline against the field** (icon + red text via `FormMessage`) **and** surface the first error at form level. Never a fire-and-forget toast that leaves the bad field unmarked.
- Validation is Zod via `@hookform/resolvers`; schemas live in [`lib/schemas.ts`](src/lib/schemas.ts).
- Labels are always visible. Placeholder-as-label is not acceptable — it vanishes on input and fails screen readers.
- Mark **required** fields, not optional ones. Most fields here are required.
- Disable the submit button while submitting; never rely on the user not double-clicking.
- Field spacing is `4` (16px); section spacing is `6` (24px).

---

## 10. Tables

[`DataTable`](src/components/common/DataTable.tsx) is the **only** sanctioned list view.

- Server-paginated, searched and sorted through [`useServerTable`](src/hooks/useServerTable.ts) + [`lib/tableQuery.ts`](src/lib/tableQuery.ts). Everything runs in Postgres; the client holds one page. Never fetch-all-then-filter-in-JS.
- **Desktop table + automatic mobile card fallback.** Both required.
- Header: `bg-muted/50` band, `text-muted-foreground`, `text-[11px]` bold uppercase. Sortable headers show a direction arrow.
- Numeric columns get `tabular-nums` (global CSS covers `th`/`td`).
- Clickable rows: `hover:bg-accent/40` + keyboard handler.
- Background refetches **dim** the current page rather than tearing it down — `keepPreviousData` is already wired in `useServerTable`, so paging never flashes empty.
- **Four states, all required:** loading (skeleton rows matching column layout), empty ([`EmptyState`](src/components/common/EmptyState.tsx) with icon, title, guidance, optional CTA), searching-empty ("No matches" — distinct copy), error ([`ErrorState`](src/components/common/ErrorState.tsx) with retry). `toTablePage` throws on error deliberately so react-query surfaces failures instead of rendering an empty table as success.
- Sort and page size persist per list via `useStickyState`; page index and search deliberately do not.
- Destructive row actions confirm first. Bulk destructive actions state the count.

---

## 11. Toasts

**Sonner is the standard.** Use [`ui/sonner.tsx`](src/components/ui/sonner.tsx) — `import { toast } from 'sonner'`. It is theme-aware and token-styled.

⚠️ The legacy shadcn toaster (`hooks/use-toast.ts` + `ui/toaster.tsx`) is still mounted and still used by 36 files. It is **deprecated** — see §14. Don't add new callers.

What a toast is for:
- **Confirming a completed action** whose result isn't visible on screen — "Lead assigned", "Quotation sent", "Salary computed".

What a toast is **not** for:
- **Validation errors.** They belong inline on the field. A toast leaves the user hunting for what's wrong.
- **Anything requiring action.** Toasts auto-dismiss. If the user must decide, use a dialog; if they must fix something, use inline error.
- **Errors on the thing they're looking at.** If a table failed to load, that's `ErrorState` in the table, not a toast over it.
- **Narrating success that's already visible.** If the row updated in front of them, stay quiet.

Rules:
- ~4s default. Longer for destructive-with-undo. Errors may persist until dismissed.
- **One toast per user action.** A loop that toasts per item is a bug — summarize: "6 leads assigned".
- Lead with the outcome: "Lead assigned to Priya", not "Success".
- Destructive actions that are cheap to reverse should offer undo in the toast rather than a pre-confirmation dialog.

---

## 12. Internal vs customer-facing

Everything above describes **internal** screens. When the customer portal lands:

**Shared:** color tokens, radius, elevation, focus and state behavior, accessibility rules, form error handling.

**Different:**
- **Density** — step up: `text-base` body, `6`/`8` spacing where internal uses `3`/`4`, more generous card padding.
- **Language** — no internal jargon. A customer doesn't know what "K-Number", "DISCOM sync", "stage gate" or "telecaller" means. No role names, no internal IDs, no `project_code`.
- **Data exposure** — customers see their own project only. Never leak staff names, internal notes, margins, or other customers' data into a shared component.
- **Trust** — first-time users need more explanation: clearer empty states, visible progress, plain-language errors with a contact route.

Build shared primitives to serve both; branch on density at the layout level, not by forking components.

---

## 13. Accessibility

- `focus-visible` rings on every interactive element. Never `outline: none` without a replacement.
- Clickable non-buttons need `role`, `tabIndex` and `Enter`/`Space` handlers.
- `aria-invalid` is wired through the form layer; the form-level error banner is `role="alert"`.
- Status conveyed by **label + color**, never color alone.
- Icon-only buttons carry `aria-label`.
- Tap targets ≥ 44px on mobile surfaces.
- Verify **light and dark**, **desktop and mobile**, before merging. All four.

---

## 14. Known debt

Real violations in the codebase today. Don't copy these patterns; fix opportunistically when you're already in the file.

**388 literal palette classes across 13 files** — violates §2.1. Should be semantic tokens or a `statusMeta` tone:

| File | Count |
|---|---|
| `src/pages/LeadDetail.tsx` | 183 |
| `src/pages/OperatorDashboard.tsx` | 48 |
| `src/components/leads/QuotationPreviewDialog.tsx` | 47 — *partly legitimate, PDF output (§2.4)* |
| `src/pages/OperatorProjectDetail.tsx` | 37 |
| `src/pages/DealsDashboard.tsx` | 22 |
| `src/pages/StaffContacts.tsx` | 17 |
| `src/pages/AdminProjects.tsx` | 11 — *legacy page* |
| `src/components/projects/ManagePaymentsDialog.tsx` | 7 |
| `src/pages/InstallApp.tsx`, `src/components/leads/LeadImportWizard.tsx` | 4 each |
| `src/pages/SalesPersonDashboard.tsx`, `src/components/ui/toast.tsx` | 3 each |
| `src/pages/Tasks.tsx` | 2 |

Recount with:
```bash
grep -rhoE "\b(bg|text|border|ring|from|to)-(red|blue|green|orange|yellow|amber|emerald|teal|cyan|indigo|purple|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]{2,3}" src --include="*.tsx" | wc -l
```

**Dual toast systems.** [`src/App.tsx`](src/App.tsx) mounts both `<Toaster>` (shadcn) and `<Sonner>`. 36 files call `use-toast`; 3 use Sonner. Migrating to Sonner and removing the duplicate mount is real work — do it as its own change, not as a drive-by.

**Breakpoint mismatch.** `useIsMobile` switches at 768px (`md`) while layouts switch at `sm` (640px). Components using both can disagree about whether they're mobile. Align on `sm` when touched.

**Raw hex** in [`src/pages/Login.tsx`](src/pages/Login.tsx) and [`src/components/three/SolarScene.tsx`](src/components/three/SolarScene.tsx). The Three.js scene is arguably legitimate — WebGL materials don't read CSS variables. `Login.tsx` is not.

---

## 15. Checklist before merging UI

- [ ] No raw hex, no literal palette classes (§2)
- [ ] Spacing from the sanctioned scale (§4)
- [ ] All eight states designed, not just default (§8)
- [ ] Used the shells — `DataTable` / `FormShell` / `DetailShell` / `SectionCard` — rather than a bespoke card (§9, §10)
- [ ] Status via `statusMeta` + `StatusBadge` (§2.2)
- [ ] Keyboard reachable, focus visible, icon buttons labeled (§13)
- [ ] Verified light **and** dark, desktop **and** mobile (§13)
