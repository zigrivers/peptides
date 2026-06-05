# Compound Pairings Implementation Design

This is a proposed implementation design only. It should be reviewed before any
schema, seed, or UI changes are made.

## Recommendation

Use a structured relational model, not expanded free text on
`CompoundProfile.stackingNotes`.

Reason: pairings need partner links, evidence labels, safety caveats, citations,
ranking, missing-compound handling, and future queryability. A JSON blob on
`CompoundProfile` would be faster initially but harder to validate, test, and
migrate when adjunct pairings are added later.

## Proposed Schema Shape

Add a `CompoundPairing` model:

```prisma
model CompoundPairing {
  id                     String   @id @default(uuid())
  sourceCompoundId       String
  pairedCompoundId       String?
  pairedCompoundName     String
  benefitGoal            String
  rationale              String
  expectedSynergy        String
  evidenceQuality        String
  safetyCaveats          String
  avoidIf                String
  timingOrSequencingNotes String?
  bestOverall            Boolean  @default(false)
  partnerExistsInCatalog Boolean  @default(true)
  missingCompoundAction  String   @default("none")
  sortOrder              Int      @default(0)

  sourceCompound         Compound @relation("PairingSource", fields: [sourceCompoundId], references: [id], onDelete: Cascade)
  pairedCompound         Compound? @relation("PairingPartner", fields: [pairedCompoundId], references: [id], onDelete: SetNull)
  citations              CompoundPairingCitation[]

  @@index([sourceCompoundId, benefitGoal])
  @@index([pairedCompoundId])
}

model CompoundPairingCitation {
  id        String @id @default(uuid())
  pairingId String
  citationId String
  pairing   CompoundPairing @relation(fields: [pairingId], references: [id], onDelete: Cascade)
  citation  Citation @relation(fields: [citationId], references: [id], onDelete: Cascade)

  @@unique([pairingId, citationId])
}
```

Notes:

- `pairedCompoundName` allows a missing proposed compound like CJC-1295 to appear
  in research/proposal states without requiring a partner row.
- `pairedCompoundId` should be non-null for implemented, in-catalog pairings.
- `missingCompoundAction` should probably become an enum after review.
- A future adjunct phase may generalize this to `CatalogPairing`.

## Domain and Repository Changes

- Extend reference domain types with `CompoundPairing`, `CompoundPairingCitation`,
  and `EvidenceQuality`.
- Update `CompoundRepo` profile include to fetch pairings for detail pages.
- Preserve the existing auth-scoping exception for reference data: pairings are
  admin-curated global catalog data with no `userId`.
- Keep `stackingNotes` for legacy prose but render structured pairings above it.

## Seed Strategy

- Add seed-side structured pairing fixtures, preferably under
  `prisma/seed-data/compound_pairings.json`.
- Seed pairings after compounds/profiles/citations are upserted so both source and
  partner compounds can be resolved by name.
- Use a differential sync pattern similar to citations:
  - Upsert/update known pairings by source name + paired name + benefit goal.
  - Delete only pairings absent from the fixture for that source compound.
  - Do not blanket-delete all pairings globally.
- For citation linking, either:
  - Reuse existing `Citation` rows when the citation already exists on either
    compound profile.
  - Or create pairing-specific citations after deciding whether `Citation` should
    remain tied only to `CompoundProfile`.

Open issue: the current `Citation` model belongs to `CompoundProfile`, so pairing
citations are awkward if a citation applies to the pairing rather than one profile.
The broader catalog-platform upgrade already proposes repointing `Citation` to a
catalog item. For this feature, either accept profile-owned citation reuse or add a
small `PairingCitation` value table with title/url/doi/pmid copied into it.

## UI Design

On `app/(dashboard)/reference/[slug]/page.tsx`, add a new section after the
clinical progression/protocol blocks and before free-text `Stacking Notes`:

Title: `Compound Pairings for Maximum Benefit`

Each pairing card should show:

- Paired compound name, linked when `partnerExistsInCatalog` is true.
- Benefit goal badge.
- Evidence quality badge.
- Optional `Best overall` badge.
- Rationale and expected synergy.
- Safety caveats and avoid-if text, visually higher priority than benefits.
- Timing/sequencing note.
- Citation links.

If no pairing is recommended:

- Render a compact "No evidence-backed pairing recommended" state.
- Include the reason from research data if available.
- Do not hide the section silently for risky compounds.

## Tests

TDD targets before implementation:

- `tests/acceptance/REF-reference.test.ts`
  - Compound detail service returns structured pairings.
  - Pairings include evidence quality, safety caveats, and citations.
  - Missing partner candidates do not require `pairedCompoundId`.
  - No-pairing rationale is returned for compounds like Retatrutide or Adipotide.

- Seed/idempotency test, likely acceptance or integration:
  - Running seed sync twice does not duplicate pairings or pairing citations.
  - Removing a fixture pairing deletes only that source's absent pairing.

- Component test:
  - Pairing section renders safety caveats before synergy.
  - In-catalog paired compounds link to `/reference/[slug]`.
  - Missing compound candidates render as unlinked proposed partners.
  - Evidence badges render expected labels.

## Migration Strategy

1. Add pairing tables.
2. Generate Prisma client.
3. Add domain types and validators.
4. Add repository mapping.
5. Add seed fixture and sync.
6. Add UI section.
7. Add tests.
8. Run `pnpm check`.

## Risk Notes

- Avoid changing dose math or using `Float`; this feature should not perform dose
  calculations.
- Keep reference-domain global-read exception documented if new repo methods are
  added.
- Do not promote experimental pairings as therapeutic advice.
- Prioritize safety exclusions in rendering and tests.
