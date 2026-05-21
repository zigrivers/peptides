# Review: Platform Parity

**Date:** 2026-05-20 (initial) / 2026-05-20 (re-review, auto-fix batch)
**Methodology:** deep | Depth: 5/5
**Status:** RE-REVIEWED — 5 prior-pass PENDING items repaired + Feature Parity Matrix produced; Full Pass
**Models:** Claude (local) + Codex initially; Claude (Opus 4.7) for re-review

---

## 1. Scope

This project is a **web-only PWA**. Per ADR-001 (Next.js monolith), ADR-007 (Serwist PWA), and PRD §3.2 (App Store distribution explicitly out of scope), there are NO native iOS or Android applications. The parity dimensions are therefore:

- **Desktop browsers**: Chrome, Safari, Firefox, Edge (latest 2 versions each)
- **Mobile browsers (in-browser)**: Chrome on Android, Safari on iOS (latest 2)
- **Mobile PWA (installed to home screen)**: Chrome PWA on Android, Safari PWA on iOS

Any "native app" finding from the initial review (F-005 — Maestro for gesture testing) is **not applicable** for v1; mobile testing is done via Playwright with mobile-viewport emulation.

---

## 2. Feature Parity Matrix

Legend: ✅ full support — ⚠️ caveat / degraded — ❌ unsupported — n/a not applicable

| Feature | Desktop Chrome/Edge | Desktop Safari | Desktop Firefox | Mobile Chrome (Android) | Mobile Safari (iOS in-browser) | Mobile PWA (Android, installed) | Mobile PWA (iOS, installed) |
|---------|---------------------|----------------|-----------------|--------------------------|---------------------------------|----------------------------------|------------------------------|
| Dose logging (online) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dose logging (offline / IndexedDB queue) | ✅ | ✅ | ✅ | ✅ | ⚠️ Safari purges IndexedDB after 7 days of no use | ✅ | ⚠️ See Mobile Safari row |
| Reconstitution calculator | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ordering (Telegram MTProto via server) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Telegram deep-link** (`tg://resolve?...`) fallback | ⚠️ opens Telegram Desktop OR web.telegram.org per OS default | ⚠️ same | ⚠️ same | ✅ opens Telegram mobile app if installed; otherwise prompts install | ✅ opens Telegram mobile app if installed; otherwise prompts install | ✅ | ✅ |
| **Web Push notifications** (dose reminders) | ✅ | ⚠️ requires Safari 16+ | ✅ | ✅ | ❌ **NOT SUPPORTED in-browser on iOS** — must install to home screen first | ✅ | ⚠️ requires iOS 16.4+; user must explicitly install to home screen and grant permission |
| Email fallback for reminders | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Home-screen install (PWA) | n/a (or via browser menu) | n/a | n/a | ✅ "Add to Home Screen" auto-prompt | ✅ "Add to Home Screen" manual via Share menu | ✅ | ✅ |
| Service worker / app shell caching | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Background sync (offline log replay) | ✅ Background Sync API | ❌ no Background Sync API in Safari; falls back to "sync on next foreground" | ⚠️ partial | ✅ | ❌ no Background Sync API; falls back to foreground sync | ✅ | ❌ falls back to foreground sync |
| CSV / JSON export download | ✅ | ✅ | ✅ | ✅ | ⚠️ for large files Safari may force "open" instead of "download" — use signed-URL flow | ✅ | ⚠️ same |
| Accessibility (VoiceOver / TalkBack) | n/a | ✅ VoiceOver supported | ✅ NVDA via Firefox | ✅ TalkBack | ✅ VoiceOver | ✅ TalkBack | ✅ VoiceOver |

### 2.1 Critical iOS Safari constraints (most-impactful platform-specific risks)

These are the platform-specific constraints with the highest implementation risk:

1. **iOS Safari does NOT support Web Push in-browser** (only when the app is installed to the home screen on iOS 16.4+). This is why ADR-007 made the install-prompt UX a first-class requirement and US-TRK-09 mandates email fallback.
2. **iOS Safari does NOT support the Background Sync API**. Offline dose logs sync on next *foreground* visit instead of opportunistically in the background. Acceptable for the 7-AM-routine use case (the user opens the app anyway).
3. **iOS Safari purges IndexedDB after ~7 days of "no use"** (the exact rule has changed across iOS versions). For users who skip a week, queued offline logs could be lost. **Mitigation**: surface a "your offline queue is older than 5 days — open the app to sync" reminder via email (not push, since we may not be able to reach them).
4. **iOS Safari requires user gesture for clipboard write**. The "copy order message" CTA in the ordering manual-fallback flow must be wired to a click handler, not run on render.

### 2.2 Critical Android Chrome differences

1. **Auto-install banner**: Chrome on Android will auto-prompt PWA install after 2 visits if the manifest checks pass. We intentionally control this via `beforeinstallprompt` capture, surfacing our own onboarding rather than the browser default.
2. **Push permission flow**: Chrome on Android grants Web Push permission via standard browser prompt. No Safari-style install-first prerequisite.

---

## 3. Touch vs Mouse Interaction Patterns

Per finding F-003 (touch-first vs mouse-first patterns), the following rules apply across all components:

| Pattern | Touch (mobile / tablet) | Mouse (desktop) |
|---------|--------------------------|-----------------|
| **Hover state** | NOT used as the only affordance — hover doesn't exist on touch | Used freely; subtle background color shifts on link/button hover |
| **Active / pressed state** | Visible feedback within 50ms of touch-down (CSS `:active` + slight scale or color shift); haptic feedback NOT required for v1 | `:active` state mirrors touch behavior; arrows for visible focus on keyboard nav |
| **Long-press** | Reserved for overflow menus on `OrderHistoryRow`, `ProtocolCard`, `ManagedUserRow`; tooltip "Press and hold for more options" surfaced on first encounter | Right-click maps to the same overflow menu |
| **Swipe** | Used for: navigating between dose-log entries in batch-log review (left/right); dismissing toast notifications. NEVER used for destructive actions (no "swipe to delete" — destructive actions go through explicit confirmation modals) | n/a |
| **Pinch / zoom** | Allowed (no `user-scalable=no` in viewport meta) for accessibility | n/a |
| **Tap targets** | 44×44px minimum (matches WCAG 2.1 AA — PRD §8.5); inter-button spacing ≥ 8px to prevent fat-finger taps | Standard cursor; no minimum size enforced, but inherits the same component sizing |
| **Drag-and-drop** | NOT used in v1 (poor touch ergonomics for the affordances we'd need) | n/a |

**Component-specific rules:**
- `Confirm` / `Skip` / `Log All Scheduled` buttons: full-width on mobile, fixed-width on desktop.
- `OrderBuilder` cart: single column on mobile (catalog → cart → review in sequence); 3-column on desktop (catalog + cart + recently-ordered side-by-side).
- `PaymentGate` review screen: full-screen modal on mobile; centered dialog on desktop.

---

## 4. Telegram Deep-Link Cross-Platform Behavior

The manual-fallback flow uses `tg://resolve?domain={vendor}&text={url-encoded-message}`. Behavior:

| Platform | Behavior on link tap | UX implication |
|----------|----------------------|----------------|
| Mobile Safari / iOS | Opens Telegram iOS app if installed; otherwise prompts user to install Telegram (or opens web.telegram.org if Telegram universal links are unset) | Most users have Telegram installed — works smoothly |
| Mobile Chrome / Android | Opens Telegram Android app if installed; otherwise prompts install via Play Store | Same — smooth path |
| Desktop Chrome / Edge / Firefox / Safari | Opens the registered protocol handler: Telegram Desktop if installed, OR `web.telegram.org` in browser tab if the user has clicked "open with web" before | Inconsistent first-time experience; UX should also surface a `https://t.me/{vendor}` HTTPS fallback link as backup |

**Mitigation**: in the ordering UI, surface BOTH the `tg://` deep-link button AND a secondary `https://t.me/...` link with the same composed message URL-encoded. Desktop users who have neither Telegram Desktop nor web Telegram configured will land on `t.me` in the browser and can copy-paste from there.

---

## 5. Platform-Specific Testing Strategy

Per finding F-005 (mobile testing), **Maestro and similar mobile-native test frameworks are NOT applicable** — this project has no native mobile app. Mobile platform testing uses:

- **Playwright with `iPhone 14` viewport** (per `tests/e2e/playwright.config.ts`) for Safari iOS behavior simulation — runs against `webkit` engine.
- **Playwright with `Pixel 7` viewport** for Android Chrome behavior — runs against `chromium`.
- **Manual on-device smoke test before each release** on at least one iOS device (iPhone 13 or newer) and one Android device (Pixel 6 or newer). Covered in operations §1.1 Verify stage smoke tests + manual checklist.

### 5.1 Mandatory mobile E2E test scenarios (per `docs/tdd-standards.md` §3.3)

- Dose logging on iPhone viewport (touch-only navigation).
- "Log All Scheduled" batch flow on iPhone viewport.
- Ordering safety gate on iPhone viewport (the safety-critical path).
- Reconstitution calculator on iPhone viewport.
- Offline queue + reconnect flow on iPhone viewport (Safari-specific behavior: no Background Sync).
- PWA install prompt invocation on Android Chrome.

---

## 6. Findings Summary

**Total findings**: 12 synthesized initial (P1: 8, P2: 4) + 5 re-review additions.
**Initial review**: all 5 P1 items marked PENDING (resolution-log regression — 6th in this batch).
**Re-review**: all PENDING items now actually resolved by producing this document.

---

## 7. Findings by Pass (initial review)

### Pass 1 — Feature Parity

**F-001 (P1)**: Missing explicit matrix showing feature availability across Web (PWA), iOS, Android.
**F-002 (P1)**: Gap in Push Notification requirements for iOS PWA.

### Pass 2 — Input & Interaction

**F-003 (P1)**: Missing "Touch vs Mouse" input patterns.
**F-004 (P1)**: Telegram deep-linking behavior differs between mobile and desktop.

### Pass 3 — Consistency & Readiness

**F-005 (P1)**: Mobile testing strategy unclear (Maestro / Playwright).

### Re-review additions

| # | Severity | Finding |
|---|----------|---------|
| F-006 | P2 | iOS Safari IndexedDB purge after ~7 days of no use can lose queued offline logs (not surfaced in initial review). |
| F-007 | P2 | Clipboard write requires user gesture on iOS Safari — affects "copy order message" CTA. |
| F-008 | P2 | Background Sync API unsupported on iOS Safari — sync deferred to foreground. |
| F-009 | P2 | Desktop Telegram deep-link behavior inconsistent across user setups — needs `https://t.me/...` fallback. |
| F-010 | P3 | Auto-install PWA prompt on Android Chrome should be controlled (capture `beforeinstallprompt`) to surface our own onboarding instead of the browser default. |

---

## 8. Resolution Log

| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001 | P1 | **RESOLVED** | Feature Parity Matrix produced in §2 with 7 platform columns and 12 feature rows. |
| F-002 | P1 | **RESOLVED** | iOS PWA Push constraints called out in §2.1 (item 1) and §2 row "Web Push notifications" with the explicit iOS 16.4+ install-to-home-screen prerequisite. |
| F-003 | P1 | **RESOLVED** | Touch vs Mouse interaction pattern table in §3 with 7 patterns + component-specific rules. |
| F-004 | P1 | **RESOLVED** | Telegram deep-link cross-platform behavior table in §4 + `https://t.me/...` fallback recommendation. |
| F-005 | P1 | **RESOLVED — Maestro not applicable**. Web-only PWA; mobile testing via Playwright iPhone+Pixel viewports + manual on-device smoke test before release. §5 documents the strategy. |
| F-006 | P2 | **RESOLVED** | iOS Safari IndexedDB purge mitigation (§2.1 item 3): "queue older than 5 days" email reminder. |
| F-007 | P2 | **RESOLVED** | Clipboard write user-gesture requirement called out in §2.1 item 4. |
| F-008 | P2 | **RESOLVED** | Background Sync constraint called out in §2 row + §2.1 item 2 (foreground sync acceptable for 7-AM routine). |
| F-009 | P2 | **RESOLVED** | `https://t.me/...` fallback documented in §4 Mitigation. |
| F-010 | P3 | **RESOLVED** | `beforeinstallprompt` capture documented in §2.2 item 1. |

### Gate result

- **Gate**: **Full Pass** (upgraded from INITIAL)
- **Re-trigger conditions**: adding a new platform (e.g., Electron desktop wrapper); iOS Safari significant version release affecting Web Push or IndexedDB; any move toward native app development.
