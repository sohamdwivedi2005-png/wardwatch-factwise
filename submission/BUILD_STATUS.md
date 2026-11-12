# WardWatch — Build Status

## Completed
- [x] Next.js 16 (App Router) + TS + Tailwind v4 scaffold
- [x] lib/types, clock (minute offset), rules (single source of truth), permissions, seed
- [x] Zustand store with persist + version/migrate re-seed
- [x] Vitest unit tests — 17 passing (streak, metrics, permissions, escalations)
- [x] Login + route guards + role landing
- [x] Nurse rounds + record/correct temperature (validation, confirm, critical, eligibility)
- [x] Doctor queue (ready/awaiting/visited/sign-offs) + visit logging + sign-off + notify nurse
- [x] Patient detail + 14-day temperature chart + histories + role actions
- [x] Admin bed board (74 tiles, ward groups, tile states)
- [x] Admin discharge queue + complete discharge + admit prompt
- [x] Admin admit (free-bed selector, duplicate warn, capacity lock)
- [x] Patients directory (search + status filters)
- [x] Quality dashboard (tiered: head/doctor/admin) + KPIs + charts + mortality banner
- [x] Alerts bell (role-filtered, resolve, navigate) + demo controls (4h / next day / reset)
- [x] Production build passes (11 routes), styling verified in browser

## Pending
- [ ] Vercel production deploy (BLOCKED: needs `vercel login`)
- [ ] Production E2E screenshots (15)
- [ ] report.html -> PDF

## Notes
- No backend: permissions enforced client-side in the store for the prototype.
- shadcn-style UI primitives hand-authored for Next 16 / React 19 compatibility.
