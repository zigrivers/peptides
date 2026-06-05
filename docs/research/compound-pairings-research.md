# Compound Pairings Research

Research snapshot: 2026-06-05

This is a Stage 1 research artifact only. It does not implement schema, seed, or UI
changes.

## Method

- Inventory source: current seeded compound list in `prisma/seed.ts`.
- Scope: compound-to-compound pairings only. Supplements, minerals, lifestyle
  protocols, and monitoring supports are deferred.
- Evidence bar: prefer human trials, systematic reviews, prescribing information,
  major guidelines, and reputable primary literature. Mechanistic or preclinical
  support is labeled as such.
- Pairing count: target 1-5 pairings per compound; allow 0 when evidence is weak
  or safety concerns outweigh benefit.
- Ranking method: pairings are grouped by benefit goal, with `bestOverall` used
  only when the evidence is strong enough.
- Safety posture: this is not medical advice. Pairings are catalog research
  metadata and must render with caveats and contraindications.

## Current Catalog Inventory

1. BPC-157
2. TB-500
3. Semaglutide
4. Tirzepatide
5. GHK-Cu
6. Tesamorelin
7. Epitalon
8. MOTS-c
9. KPV
10. ARA-290
11. Cagrilintide/Semaglutide
12. Retatrutide
13. Thymosin Alpha-1
14. GLOW50
15. FOXO4-DRI
16. DSIP
17. Hexarelin
18. Adipotide
19. Testosterone
20. Tadalafil
21. Vardenafil
22. Thymalin
23. Turinabol
24. Dianabol
25. NA-Selank-Amidate
26. HCG
27. HMG
28. LL-37
29. Selank
30. Sermorelin
31. Snap-8
32. HGH
33. Semax
34. NA-Semax-Amidate
35. NAD+
36. Oxytocin
37. GHRP-2
38. GHRP-6
39. Ipamorelin
40. Cagrilintide
41. GLOW70

## Per-Compound Pairing Recommendations

See `compound-pairings-data-proposal.json` for the structured proposal. Summary:

### BPC-157

- TB-500: tissue repair, tendon/connective tissue recovery. Evidence is
  preclinical/mechanistic; no direct high-quality human combination trial found.
- KPV: gut barrier and inflammatory mucosal support. Evidence is preclinical and
  mechanism-based.
- GHK-Cu: wound/skin/connective tissue remodeling. Evidence is preclinical and
  mechanism-based.

### TB-500

- BPC-157: tissue repair. Evidence is preclinical/mechanistic.
- GHK-Cu: dermal healing and collagen matrix support. Evidence is preclinical and
  mechanism-based.

### Semaglutide

- Cagrilintide: metabolic/weight management. This is the strongest pairing in the
  set because CagriSema has direct human randomized trial evidence.

### Tirzepatide

- No recommended pairing in this phase. It should not be paired with other GLP-1
  receptor agonists, and the evidence for adding cagrilintide to tirzepatide is
  not strong enough for this catalog.

### GHK-Cu

- Snap-8: skin health, pairing matrix/collagen support with expression-line
  modulation. Evidence is human-limited/cosmetic plus mechanism-based.
- BPC-157: tissue repair and wound remodeling. Evidence is preclinical.
- TB-500: dermal healing and repair-cell migration. Evidence is preclinical.

### Tesamorelin

- Ipamorelin: GH-axis recovery/body composition. Evidence is mechanistic based on
  GHRH + GHS pathway complementarity; monitor IGF-1/glucose and avoid redundant GH
  overexposure.

### Epitalon

- Thymalin: longevity/immune aging. Evidence is limited human cohort data using
  related pineal/thymic peptide bioregulators.
- DSIP: sleep/circadian support. Evidence is human-limited for DSIP and
  mechanistic for epitalon/circadian biology; no direct combination trial found.

### MOTS-c

- NAD+: mitochondrial/metabolic support. Evidence is mechanistic and review-level;
  no direct combination trial found.

### KPV

- BPC-157: gut barrier and inflammation. Evidence is preclinical/mechanistic.
- LL-37: mucosal immune defense/inflammation balance. Evidence is mechanistic and
  preclinical; safety caveats are important because LL-37 can be pro-inflammatory
  in some disease contexts.

### ARA-290

- No recommended pairing in this phase. The catalog can later revisit neuropathy,
  inflammatory pain, or tissue-repair pairings after a deeper indication-specific
  review.

### Cagrilintide/Semaglutide

- No additional pairing recommended. This catalog item is already a fixed
  combination; adding other incretin/amylin agents would increase overlapping GI,
  glucose, and dehydration risk.

### Retatrutide

- No recommended pairing. Retatrutide already targets GLP-1/GIP/glucagon pathways;
  pairing with other incretin therapies is not supported and raises additive risk.

### Thymosin Alpha-1

- LL-37: immune modulation/host defense. Evidence is mechanism-based with human
  clinical support for thymosin alpha-1 and immunomodulatory literature for LL-37.
- KPV: inflammatory tone. Evidence is mechanistic/preclinical.

### GLOW50

- No recommended pairing. GLOW50 is already a cosmetic blend, and the best
  adjuncts noted in current seed text are non-compound supports such as hyaluronic
  acid, which are deferred to the adjunct phase.

### FOXO4-DRI

- No recommended pairing. Current evidence is mainly preclinical senolytic
  research, and common senolytic adjuncts like quercetin/dasatinib are deferred.

### DSIP

- Epitalon: sleep/circadian support. Evidence is human-limited for DSIP and
  mechanistic for epitalon/circadian support.

### Hexarelin

- Sermorelin: GH-axis pulse amplification. Evidence is mechanistic based on GHRH +
  GHS pathway complementarity. Hexarelin has more prolactin/cortisol concern than
  ipamorelin, so it is not `bestOverall`.
- CJC-1295: strong missing-compound candidate. See missing compounds.

### Adipotide

- No recommended pairing. The renal-toxicity signal and experimental status make
  benefit-maximizing combinations inappropriate for the catalog at this stage.

### Testosterone

- HCG: fertility/testicular function preservation in men using testosterone.
  Evidence is human-limited/clinical.
- Tadalafil: erectile function in hypogonadal men with ED. Evidence is
  human-limited/systematic review.

### Tadalafil

- Testosterone: erectile function in hypogonadal men with ED. Evidence is
  human-limited/systematic review.
- Do not pair with Vardenafil or nitrates.

### Vardenafil

- Testosterone: class-level PDE5 inhibitor + testosterone evidence for
  hypogonadal ED. Evidence is human-limited; vardenafil-specific support is weaker
  than tadalafil.
- Do not pair with Tadalafil or nitrates.

### Thymalin

- Epitalon: longevity/immune aging. Evidence is limited human cohort data using
  thymic/pineal peptide bioregulators.

### Turinabol

- No recommended pairing. The safety profile and non-medical anabolic use pattern
  argue against benefit-maximizing pairings in this catalog.

### Dianabol

- No recommended pairing. The safety profile and hepatotoxic/estrogenic risk argue
  against benefit-maximizing pairings in this catalog.

### NA-Selank-Amidate

- Semax: cognitive/anxiolytic balance. Evidence is extrapolated from parent
  Selank/Semax mechanisms and limited human/non-US literature.
- NA-Semax-Amidate: cognitive/anxiolytic balance with amidated analogs. Evidence
  is mechanistic/expert-consensus.

### HCG

- HMG: fertility/spermatogenesis. Evidence is human clinical and guideline-level.
- Testosterone: testicular function/fertility preservation. Evidence is
  human-limited.

### HMG

- HCG: fertility/spermatogenesis. Evidence is human clinical and guideline-level.

### LL-37

- Thymosin Alpha-1: immune modulation/host defense. Evidence is mechanistic with
  human support for thymosin alpha-1.
- KPV: mucosal immune defense/inflammation balance. Evidence is
  mechanistic/preclinical.

### Selank

- Semax: cognition with anxiolytic balance. Evidence is limited/non-US and
  mechanism-based.
- NA-Semax-Amidate: same pairing logic using the amidated Semax analog; evidence
  is weaker and extrapolated.

### Sermorelin

- Ipamorelin: GH-axis recovery/body composition. Evidence is mechanistic and
  supported by GHRH + GHRP synergy literature.
- GHRP-2: stronger GH pulse, more appetite/cortisol/prolactin caveats.
- GHRP-6: GH pulse plus appetite support, but higher hunger/water-retention caveat.

### Snap-8

- GHK-Cu: skin health. Evidence is human-limited/cosmetic and mechanism-based.

### HGH

- No recommended pairing. HGH already directly raises GH/IGF-1 exposure; combining
  with GH secretagogues increases redundant endocrine and glucose risk.

### Semax

- Selank: cognition with anxiolytic balance. Evidence is limited/non-US and
  mechanism-based.
- NA-Selank-Amidate: same pairing logic using the amidated Selank analog; evidence
  is weaker and extrapolated.

### NA-Semax-Amidate

- Selank: cognition with anxiolytic balance. Evidence is extrapolated.
- NA-Selank-Amidate: cognitive/anxiolytic balance with amidated analogs. Evidence
  is mechanistic/expert-consensus.

### NAD+

- MOTS-c: mitochondrial/metabolic support. Evidence is mechanistic and
  review-level.

### Oxytocin

- No recommended pairing. Potential pairings around anxiolytic/social-bonding
  support are too speculative and would need indication-specific psychiatric and
  endocrine review.

### GHRP-2

- Sermorelin: GH-axis pulse amplification. Evidence is mechanistic and supported
  by GHRH + GHRP synergy literature.
- CJC-1295: missing-compound candidate; see below.

### GHRP-6

- Sermorelin: GH-axis pulse amplification with appetite support. Evidence is
  mechanistic and supported by GHRH + GHRP synergy literature.
- CJC-1295: missing-compound candidate; see below.

### Ipamorelin

- Sermorelin: best current in-catalog GH secretagogue pairing because it combines
  GHRH receptor stimulation with a selective GHS-R agonist.
- CJC-1295: missing-compound candidate; see below.

### Cagrilintide

- Semaglutide: metabolic/weight management. Direct human randomized evidence.

### GLOW70

- No recommended pairing. GLOW70 is already a cosmetic blend containing GHK-Cu and
  SNAP-8-like expression-line support; additional cosmetic peptide pairing is
  likely redundant.

## Missing Compounds Proposed for Addition

### CJC-1295 / Modified GRF(1-29)

Action: `add_complete_compound`, pending human review.

Rationale: multiple existing GH secretagogues in the catalog already reference a
GHRH analog pairing pattern. CJC-1295 is the most common missing partner for
Ipamorelin, GHRP-2, GHRP-6, and Hexarelin. There is human evidence that CJC-1295
raises GH and IGF-1, but direct combination evidence with catalog GHS agents is
mostly mechanistic/community-practice rather than high-quality clinical outcomes.

Needed before implementation:

- Decide whether the catalog should represent CJC-1295 with DAC, Modified GRF
  1-29 without DAC, or separate entries for each because half-life and scheduling
  are materially different.
- Build complete `Compound` and `CompoundProfile` fields, including dosing,
  routes, timing, cycle/rest notes, FDA status, side effects, shelf-life defaults,
  and citations.
- Add safety caveats around IGF-1, glucose, edema, sleep apnea, malignancy risk
  uncertainty, and redundant use with HGH or other GH secretagogues.

## Deferred Candidates

These are intentionally not dataset rows in this phase:

- TMG: relevant to NAD+ methylation support, but it is a supplement adjunct.
- Hyaluronic acid: relevant to GLOW/GHK-Cu topical skin support, but it is an
  adjunct/cosmetic support.
- Quercetin and dasatinib: relevant to senolytic stacks, but this belongs in the
  adjunct/medication expansion phase and needs a much stronger safety framework.
- Melatonin/sleep hygiene/light timing: relevant to Epitalon/DSIP, but these are
  adjunct/lifestyle supports.
- Hydration/electrolyte plans and constipation management for GLP-1/amylin
  compounds: important, but not compound-to-compound pairings.
- Lab monitoring such as IGF-1, fasting glucose, A1c, testosterone, estradiol,
  semen analysis, renal markers, and liver enzymes: important but belongs to a
  monitoring-support model.

## Safety Exclusions

- Do not combine semaglutide, tirzepatide, retatrutide, or other GLP-1/GIP/glucagon
  agonists with each other. This produces overlapping receptor activity and
  additive GI, dehydration, gallbladder, pancreatitis, and glucose risk.
- Do not add incretin/amylin agents to the fixed `Cagrilintide/Semaglutide`
  catalog item.
- Do not combine tadalafil and vardenafil, and do not combine either with nitrates
  or nitric oxide donors because of hypotension risk.
- Do not combine HGH with GH secretagogues unless explicitly reviewed by a
  clinician/specialist context; it is redundant GH/IGF-1 exposure.
- Do not create benefit-maximizing stacks for Turinabol or Dianabol in this phase.
  Hepatic, endocrine, lipid, and androgenic risks dominate the pairing discussion.
- Do not pair Adipotide with metabolic agents in this phase. Renal toxicity and
  experimental status dominate.
- Do not pair FOXO4-DRI with senolytic adjuncts until the adjunct/medication
  phase defines separate safety handling.

## Source Notes

Key source anchors used in the structured JSON:

- Cagrilintide + semaglutide phase 3 evidence: PubMed 40544432 and 40544433.
- Cagrilintide + semaglutide phase 2/1b evidence: PubMed 37364590 and 33894838.
- Semaglutide/tirzepatide safety: current DailyMed/FDA labels for Wegovy and
  Zepbound.
- GHRH + GHRP synergy: PubMed 9509075.
- CJC-1295 human GH/IGF-1 evidence: PubMed 16352683 and 17018654.
- Ipamorelin selectivity: PubMed 9849822 and 10496658.
- hCG/testosterone/hMG fertility evidence: PubMed 15713727, 28051040, 32777865,
  18930225, and AUA testosterone/male infertility guidance.
- BPC-157/TB-500/GHK-Cu repair evidence: PubMed 20388964, 29998800, 27450738,
  8227353, and PMC 6073405.
- KPV and LL-37 immune/gut evidence: PubMed 18092346, 18612139, 32927756, and
  related PMC reviews.
- Epitalon/Thymalin/DSIP: PubMed 14523363, 6895513, 1299794, and 40908429.
- Cosmetic peptide evidence: PubMed 40565185, 23417317, and related PMC review.
