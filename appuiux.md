# Mayukh Solar CRM — UI/UX Enhancement Log (historical)

> **This is not the spec.** The normative design rules live in [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) — read that before touching any UI file.
>
> This file is the record of the production-grade UI/UX pass that produced those values. It's kept because it explains **why** several decisions are what they are; changing them back without reading this tends to reintroduce the bug that motivated them.

---

## Design principles behind the pass

1. **Clarity over decoration.** Muted neon and gradients were removed in favor of clean surfaces, one confident accent, and real hierarchy.
2. **One accent, used sparingly.** Solar orange marks the primary action and active state — nothing else competes with it.
3. **Legibility first.** Strong contrast, generous label sizes, tabular numerals, never color alone for status.
4. **Consistent rhythm.** Shared shells give every screen the same spacing, radius and elevation language.
5. **Feedback on every interaction.** Hover, focus-visible, press, loading, empty and error are designed, not left to browser defaults.
6. **Mobile is first-class.** Field staff work on phones: tables collapse to cards, 44px tap targets, sticky action bars.

These are now stated normatively in `DESIGN-SYSTEM.md` §1, §7 and §8.

---

## Why the tokens have the values they do

- **Dark-mode surfaces.** Cards were `222 47% 12%` on a `222 47% 11%` background — a **1% lightness gap**, so panels were effectively invisible. Cards moved to `14%` and popovers to `15%` on a `10%` background. Don't flatten these again.
- **Field borders.** `--input` was the same faint value as `--border`, so inputs didn't read as fillable. `--input` is now deliberately darker.
- **Focus ring.** `--ring` stays brand orange and drives a soft 3px halo rather than a hard offset outline.
- **Radius.** Base softened from `0.5rem` to `0.625rem` for a more modern silhouette.
- **Badges.** Multi-word statuses like "Follow Up" and "Documents Approved" wrapped inside the pill and rendered as a lopsided circle. Badges are now `whitespace-nowrap w-fit`.
- **Dialog overlay.** Softened from a heavy `bg-black/80` to `bg-black/50` + `backdrop-blur-sm` so context stays visible.
- **Automatic form errors.** Input base styles react to `aria-[invalid=true]`, and `FormControl` already sets that from validation state — which is why no form needs per-field error styling.
- **Distinct data states.** `DetailShell` separates loading / error / not-found, and `EmptyState` is deliberately distinct from `ErrorState`, because several pages previously rendered "No records yet" for both — making a failed fetch indistinguishable from genuinely empty data.

---

## Enhancement log — what the pass changed

All applied at token or primitive level, so they lifted the whole app:

1. **Dark-mode depth** — raised card/popover lightness above the background; strengthened borders and inputs.
2. **Typography** — legibility rendering, tighter heading tracking, global tabular numerals, larger form labels (12px → 13px semibold).
3. **Buttons** — semibold, elevation on hover, tactile `active:scale-[0.98]` press, calmer focus ring.
4. **Inputs / textarea / select** — defined borders, hover feedback, unified soft focus ring, automatic `aria-invalid` error styling across all forms.
5. **Dropdown menus** — softer elevation, pointer cursor, clearer checked/hover items.
6. **Tables** — banded muted headers, clickable-row hover, aligned numerals.
7. **Badges / status** — fixed multi-word wrapping; single-line pills everywhere.
8. **Dialogs** — blurred lighter overlay, rounded elevated content, bigger close target.
9. **Checkbox / switch** — neutral rest state, hover affordance, larger tap rows.
10. **Radius** — softened base radius.

### Files touched

`src/index.css`, `tailwind.config.ts` (tokens); `ui/button.tsx`, `ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx`, `ui/checkbox.tsx`, `ui/badge.tsx`, `ui/dialog.tsx`, `ui/form.tsx`; `common/DataTable.tsx`, `common/StatusBadge.tsx`, `common/fields/*`.
