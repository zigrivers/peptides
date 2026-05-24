# Advanced UI/UX Enhancements Tasks

## Phase 1: Centralized HSL Colors for SVGs & Log Selectors
- [x] Replace hardcoded hex colors (`#6366f1` and `#10b981`) in `CorrelationTimeline.tsx` with HSL theme token variables
- [x] Replace hardcoded `indigo-600` and `indigo-50` colors in `DoseLogActions.tsx` site buttons with standard HSL theme classes

## Phase 2: Interactive SVG Injection Site Map (Full-body)
- [x] Re-engineer `SitePicker` inside `DoseLogActions.tsx` to display an interactive SVG diagram representing the human body
- [x] Implement site hotspots for Deltoids, Abdomen, Ventrogluteals, and Thighs dynamically rendered based on route (SubQ vs IM)
- [x] Style hotspots to show Suggested (glowing), Rested (success green), and Selected (primary fill) states
- [x] Ensure full keyboard accessibility and screen reader labels for the interactive SVG button zones

## Phase 3: Reconstitution Interactive SVG Syringe Preview
- [ ] Create `SyringePreview.tsx` client component inside `app/(dashboard)/reconstitution/_components/SyringePreview.tsx`
- [ ] Connect plunger height and fluid volume dynamically to calculated units (0-100 scale)
- [ ] Style fluid color to change to HSL warning/destructive colors when safety limits are exceeded
- [ ] Integrate the `SyringePreview` alongside the reconstitution calculations layout

## Phase 4: Glassmorphic PWA Offline & Sync Widget
- [ ] Upgrade `SyncIndicator.tsx` to a floating glassmorphic pill badge with smooth entry/exit animations
- [ ] Add distinct state icons (rotating sync arrow, offline cloud-alert, error pulse, success checkmark)
- [ ] Render the sync badge docked at the bottom footer of the desktop navigation sidebar in `DashboardNav.tsx`
- [ ] Render the sync badge floating above the mobile bottom nav in `layout.tsx` (hiding on desktop sm:hidden)

## Phase 5: Tactile Micro-Animations & Page Transitions
- [ ] Add CTA hover/active click scaling utilities inside `globals.css` and apply to primary actions
- [ ] Standardize high-contrast inputs focus rings across settings, calculator, and logging components

## Verification & Testing
- [ ] Verify Vitest unit and integration suite compiles and runs successfully (`pnpm check`)
- [ ] Verify Playwright E2E browser tests pass cleanly (`pnpm e2e`)
