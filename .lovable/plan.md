## Phase 7: Remaining Features

### 1. Admin Projects Overview
- New page `/admin/projects` showing all projects across all stages
- Filters by status, search by project code/customer name
- Ability to reassign welder/electrician, override status
- Stats summary at top

### 2. Notification Triggers (Database)
- Create database triggers that auto-insert notifications when:
  - Lead is assigned to staff
  - Project status changes
  - Document is rejected
  - Welder/Electrician is assigned to project
- Triggers fire on INSERT/UPDATE of relevant tables

### 3. Settings Page
- Profile section: view name, mobile, email, role
- Change password form
- Route: `/settings`

### 4. Quotation PDF Generator
- Edge function that generates a quotation PDF
- V R Enterprises branding, GST (18%), payment installments (30/60/10)
- Panel/inverter specs, customer details, project code
- Downloadable from project detail pages

### Order of execution:
1. DB migration for notification triggers
2. Admin Projects Overview page
3. Settings page  
4. Quotation PDF edge function + UI button
