I’ll refine the current mobile drawer to look and behave more like the reference screenshot while keeping the desktop sidebar unchanged.

Plan:

1. Update the mobile drawer visual style
- Make the mobile drawer about 82% screen width.
- Keep it sliding from the left over the page.
- Use a stronger dark backdrop so the main page stays visible but dimmed behind it.
- Ensure the page content does not resize or shift when the drawer opens.

2. Match the reference layout style
- Add a taller drawer header area with the Mayukh Solar logo, app name, and current role/user detail.
- Keep the menu list with large touch-friendly rows, icons on the left, and labels on the right.
- Use the app’s existing orange/brand theme instead of copying the train app’s blue color directly.
- Keep existing menu items and role-based navigation.

3. Improve mobile interactions
- Close the drawer when the user taps outside it.
- Close the drawer when the user clicks any menu item.
- Keep a close button inside the drawer header for convenience.
- Use smooth 300ms ease-in-out open/close animation.

4. Preserve responsive behavior
- Mobile/tablet: overlay drawer behavior.
- Laptop/desktop: existing static sidebar with collapse/expand behavior.
- Avoid horizontal overflow and keep scrolling inside the drawer when menu content is long.

Technical details:
- Update `src/components/layout/AppSidebar.tsx` to add a reference-style mobile header and larger mobile navigation rows.
- Update `src/components/layout/AppLayout.tsx` only if needed to keep the drawer state and hamburger trigger stable.
- Use existing semantic Tailwind tokens such as `sidebar`, `sidebar-foreground`, `primary`, `border`, and `background`; no hardcoded custom colors.