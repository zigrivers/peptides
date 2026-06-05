# Follow-Up Plan: Adjunct Pairings Beyond Compounds

This plan was implemented as the Phase 2 adjunct-support layer after the
compound-to-compound pairing phase was opened for review.

## Objective

Expand the pairing model beyond trackable catalog compounds to support:

- Supplements
- Minerals
- Medications
- Lifestyle protocols
- Lab-monitoring supports
- Safety and mitigation supports

## Why This Needs Its Own Phase

Adjuncts are not equivalent to compounds in the current catalog. They do not always
need inventory tracking, vial math, reconstitution, or peptide-style dosing fields.
Mixing them into `Compound` directly would likely blur UI meaning and weaken safety
review.

## Proposed Work Plan

1. Define adjunct taxonomy.
   - `SUPPLEMENT`
   - `MINERAL`
   - `MEDICATION`
   - `LIFESTYLE_PROTOCOL`
   - `LAB_MONITORING`
   - `SAFETY_MITIGATION`

2. Decide data modeling.
   - Implemented: introduce `CatalogAdjunct` plus compound-specific
     `CompoundAdjunctRecommendation` rows.
   - Deferred: a broader `CatalogItem` platform can still absorb adjuncts later,
     but Phase 2 keeps supplements, labs, and lifestyle protocols separate from
     trackable peptide compounds.

3. Define adjunct-specific evidence rules.
   - Supplements/minerals: require human evidence or strong deficiency/biochemical
     rationale.
   - Medications: require approved-label/guideline safety review.
   - Lifestyle protocols: require guideline, trial, or consensus-source support.
   - Monitoring supports: require clear clinical rationale and non-diagnostic UI
     language.

4. Add safety categories.
   - Contraindicated
   - Requires clinician supervision
   - Lab monitoring recommended
   - Timing-sensitive
   - Interaction-sensitive
   - Optional supportive measure

5. Revisit deferred candidates from Stage 1.
   - TMG for NAD+ methylation support.
   - Hyaluronic acid for GHK-Cu/GLOW topical skin support.
   - Quercetin/dasatinib for senolytic contexts.
   - Melatonin/light timing for Epitalon/DSIP.
   - Hydration/electrolyte/constipation support for GLP-1/amylin agents.
   - IGF-1/glucose/A1c monitoring for GH-axis agents.
   - Semen analysis and reproductive hormones for HCG/HMG/testosterone contexts.
   - Renal/liver markers for Adipotide, FOXO4-DRI, and oral anabolic contexts.

6. Design UI treatment.
   - Compound pairings should remain card-like pairings.
   - Adjunct supports should render as a separate "Supportive Adjuncts" or
     "Monitoring and Safety Supports" section.
   - Medications should visually differ from supplements and lifestyle supports.
   - Monitoring supports should never look like a dose recommendation.

7. Add tests.
   - Acceptance tests for adjunct rendering and safety warnings.
   - Domain tests for allowed adjunct types and evidence-quality validation.
   - Seed idempotency tests.
   - UI tests ensuring contraindication warnings render before benefits.

## Phase 2 Implementation Boundary

- Adjuncts render in a separate "Supportive Adjuncts and Monitoring" section.
- The first seeded set includes safety mitigation, lifestyle protocols,
  supplements, and lab-monitoring supports.
- Medication adjuncts are represented in the taxonomy but are not seeded in this
  pass; they should require a higher safety bar and clinician-managed wording.
- Monitoring supports are explicitly rendered as context, not dose
  recommendations or diagnostic instructions.

## Open Questions For That Phase

- Should medication adjuncts be allowed at all, or only shown as "clinician-managed
  contexts"?
- Should adjuncts be searchable from the main catalog?
- Should adjunct supports attach to pairings, compounds, or benefit goals?
- Should labs be represented as structured codes/names or plain text?
- Should users be able to hide adjunct content if they only want compound catalog
  data?

## Future Expansion Boundary

Before expanding this layer, decide whether adjuncts should become searchable,
whether users can hide adjunct content, and whether the broader catalog-platform
upgrade should replace the dedicated adjunct tables.
