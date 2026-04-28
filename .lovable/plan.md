I will clean up the All Projects page so it looks like a professional CRM screen instead of a broken horizontal row.

Plan:

1. Redesign each project card layout
   - Use a clean card grid/section layout like your reference screenshot.
   - Keep project code, status, customer, location, kW, amount, and K number aligned in readable rows.
   - Prevent the project code and customer details from wrapping into ugly one-word vertical columns.

2. Move action buttons into a professional action area
   - Keep Welder, Electrician, Status, Docs, Edit, Delete, and Quotation available.
   - Align them neatly on desktop.
   - Stack/wrap them properly on smaller screens.
   - Make dangerous Delete visually clear but not oversized.

3. Improve spacing, sizing, and visual hierarchy
   - Use better padding, rounded cards, subtle shadows, consistent gaps, and muted labels.
   - Make the status badge compact and polished.
   - Make project details easy to scan at a glance.

4. Fix responsive behavior
   - At the current preview width, the page will no longer squeeze the left project information into a narrow column.
   - On mobile/tablet, cards will stack cleanly with buttons below details.

Technical details:

- Main file to update: `src/pages/AdminProjects.tsx`.
- I will replace the current `flex lg:flex-row` project-card structure with a more stable CSS grid layout.
- I will use Tailwind classes already used in the project and keep the orange/Plus Jakarta Sans visual identity.
- No database changes are needed.
- Existing functions for edit, delete, documents, status override, staff assignment, and quotation generation will remain connected.