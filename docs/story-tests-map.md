# Story Tests Traceability Matrix

This document maps user story acceptance criteria to their corresponding test cases.

| Story ID | AC ID | Test Case | Layer | File |
|----------|-------|-----------|-------|------|
| **US-REF-01** | AC-1 | displays IUPAC name, mechanism, and routes | Integration | `tests/acceptance/REF-reference.test.ts` |
| | AC-2 | ensures all benefit citations are valid DOI/PubMed links | Unit | `tests/acceptance/REF-reference.test.ts` |
| | AC-3 | displays low/typical/high dosing ranges | Unit | `tests/acceptance/REF-reference.test.ts` |
| | AC-4 | displays curated stacking notes | Integration | `tests/acceptance/REF-reference.test.ts` |
| **US-REF-02** | AC-1 | filters catalog by name fragment | Unit | `tests/acceptance/REF-reference.test.ts` |
| | AC-2 | filters catalog by goal category | Unit | `tests/acceptance/REF-reference.test.ts` |
| **US-TRK-01** | AC-1 | generates schedule starting from selected date | Unit | `tests/acceptance/TRK-tracker.test.ts` |
| | AC-2 | assigns protocol to managed user | Integration | `tests/acceptance/TRK-tracker.test.ts` |
| | AC-3 | blocks saving if compound or dose is missing | Integration | `tests/acceptance/TRK-tracker.test.ts` |
| | AC-4 | records audit log on creation/modification | Integration | `tests/acceptance/TRK-tracker.test.ts` |
| **US-TRK-02** | AC-1 | hides paused protocol from Today doses | Integration | `tests/acceptance/TRK-tracker.test.ts` |
| | AC-2 | resumes paused protocol instantly | Integration | `tests/acceptance/TRK-tracker.test.ts` |
| | AC-3 | clones protocol preserving dose and frequency | Unit | `tests/acceptance/TRK-tracker.test.ts` |
| | AC-4 | restarts cycle by cloning all protocols | Integration | `tests/acceptance/TRK-tracker.test.ts` |
| **US-TRK-03** | AC-1 | records dose with timestamp and site | Integration | `tests/acceptance/TRK-tracker.test.ts` |
| | AC-2 | records explicit skip event | Integration | `tests/acceptance/TRK-tracker.test.ts` |
| | AC-3 | queues dose log while offline | E2E | `tests/acceptance/TRK-tracker.test.ts` |
| | AC-4 | shows warning if vial inventory is empty | Integration | `tests/acceptance/TRK-tracker.test.ts` |
| **US-TRK-05** | AC-1 | logs all scheduled doses in one action | Integration | `tests/acceptance/TRK-tracker.test.ts` |
| | AC-2 | allows deselecting doses in review sheet | E2E | `tests/acceptance/TRK-tracker.test.ts` |
| **US-TRK-08** | AC-1 | creates cycle with name and date range | Unit | `tests/acceptance/TRK-tracker.test.ts` |
| | AC-2 | links multiple protocols to one cycle | Unit | `tests/acceptance/TRK-tracker.test.ts` |
| | AC-3 | displays current week number on dashboard | Unit | `tests/acceptance/TRK-tracker.test.ts` |
| **US-REC-01** | AC-1 | calculates correct concentration for 5mg vial | Unit | `tests/acceptance/REC-reconstitution.test.ts` |
| | AC-2 | converts dose to syringe units | Unit | `tests/acceptance/REC-reconstitution.test.ts` |
| | AC-3 | triggers safety warnings for extreme volumes | Unit | `tests/acceptance/REC-reconstitution.test.ts` |
| | AC-4 | displays last logged dose for context | Integration | `tests/acceptance/REC-reconstitution.test.ts` |
| **US-REC-02** | AC-1 | creates vial record with expiry date | Integration | `tests/acceptance/REC-reconstitution.test.ts` |
| | AC-2 | shows low inventory badge on dashboard | Integration | `tests/acceptance/REC-reconstitution.test.ts` |
| **US-ORD-01** | AC-1 | authenticates with phone and verification code | Integration | `tests/acceptance/ORD-ordering.test.ts` |
| | AC-2 | encrypts session string at rest | Unit | `tests/acceptance/ORD-ordering.test.ts` |
| | AC-3 | provides manual message fallback | Integration | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ORD-03** | AC-1 | adds items from vendor catalog to cart | Unit | `tests/acceptance/ORD-ordering.test.ts` |
| | AC-2 | dispatches message via linked Telegram account | Integration | `tests/acceptance/ORD-ordering.test.ts` |
| | AC-3 | archives sent message in history | Integration | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ORD-04** | AC-1 | enforces manual entry of wallet and total | Integration | `tests/acceptance/ORD-ordering.test.ts` |
| | AC-2 | enables payment button only after verification display | E2E | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ORD-07** | AC-1 | transitions through state machine | Unit | `tests/acceptance/ORD-ordering.test.ts` |
| | AC-2 | flags stale orders after 14 days | Integration | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ADM-01** | AC-1 | sends invite link valid for 72 hours | Unit | `tests/acceptance/ADM-admin.test.ts` |
| | AC-2 | restricts managed user view to schedule only | E2E | `tests/acceptance/ADM-admin.test.ts` |
| **US-ADM-02** | AC-1 | calculates 7-day adherence % per managed user | Unit | `tests/acceptance/ADM-admin.test.ts` |
| **US-AUT-01** | AC-1 | guides power user through 3-step setup | E2E | `tests/acceptance/AUT-auth.test.ts` |
| | AC-2 | guides managed user through walkthrough | E2E | `tests/acceptance/AUT-auth.test.ts` |
| **US-AUT-02** | AC-1 | generates JSON and CSV export of all logs | Integration | `tests/acceptance/AUT-auth.test.ts` |
| | AC-2 | wipes all data after 48-hour delay | Integration | `tests/acceptance/AUT-auth.test.ts` |
| **US-AUT-03** | AC-1 | requires 12-character minimum password | Integration | `tests/acceptance/AUT-auth.test.ts` |
| | AC-2 | uses secure httpOnly cookies with rolling expiry | Integration | `tests/acceptance/AUT-auth.test.ts` |
| **US-AUT-05** | AC-1 | provides manifest for home screen installation | E2E | `tests/acceptance/AUT-auth.test.ts` |
| | AC-2 | loads app shell instantly without connection | E2E | `tests/acceptance/AUT-auth.test.ts` |

## Coverage Summary
- **Total Stories**: 20
- **Total ACs**: 48
- **Total Test Cases**: 48
- **Coverage**: 100%
