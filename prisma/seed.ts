import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const compounds = [
    {
      name: 'BPC-157',
      iupacName:
        'L-Valyl-L-prolyl-L-prolyl-L-alanyl-glycyl-L-glutaminyl-L-arginyl-L-leucyl-L-phenylalanyl-L-alpha-glutamyl-L-leucyl-L-leucyl-L-tyrosyl-L-leucyl-L-valyl-L-leucyl-L-seryl-L-glutamine',
      synonyms: ['Pentadecapeptide BPC-157'],
      mechanismOfAction:
        'Activates growth hormone receptor signalling, promotes angiogenesis via VEGF upregulation, and modulates nitric oxide synthesis. Accelerates tendon-to-bone healing via FAK-paxillin pathway.',
      administrationRoutes: ['SubQ', 'IM', 'Oral'],
      tags: ['healing', 'recovery'],
      profile: {
        dosingLow: { amount: '200', unit: 'mcg' },
        dosingTypical: { amount: '500', unit: 'mcg' },
        dosingHigh: { amount: '1000', unit: 'mcg' },
        sideEffects: 'Generally well-tolerated. Mild injection-site redness reported.',
        stackingNotes: 'Commonly stacked with TB-500 for enhanced musculoskeletal healing.',
        citations: [
          {
            title: 'BPC-157 and wound healing — rodent model',
            doi: '10.1097/00006123-199709000-00023',
            pmid: '9310004',
          },
          {
            title: 'BPC-157 promotes tendon healing — in vitro study',
            doi: '10.1007/s00421-012-2398-7',
            pmid: '22526625',
          },
        ],
      },
    },
    {
      name: 'TB-500',
      iupacName: null,
      synonyms: ['Thymosin Beta-4', 'Tβ4'],
      mechanismOfAction:
        'Promotes actin polymerisation and cell migration; upregulates anti-inflammatory cytokines. Enhances angiogenesis and tissue repair.',
      administrationRoutes: ['SubQ', 'IM'],
      tags: ['healing', 'recovery'],
      profile: {
        dosingLow: { amount: '2.0', unit: 'mg' },
        dosingTypical: { amount: '5.0', unit: 'mg' },
        dosingHigh: { amount: '10.0', unit: 'mg' },
        sideEffects: 'Occasional fatigue and mild nausea in higher doses.',
        stackingNotes: 'Often combined with BPC-157; synergistic healing across tissue types.',
        citations: [
          {
            title: 'Thymosin beta-4 accelerates wound healing',
            doi: '10.1096/fj.09-140046',
            pmid: '20103959',
          },
        ],
      },
    },
    {
      name: 'Semaglutide',
      iupacName: null,
      synonyms: ['Ozempic', 'Wegovy', 'GLP-1 agonist'],
      mechanismOfAction:
        'GLP-1 receptor agonist; increases insulin secretion, suppresses glucagon, slows gastric emptying, and reduces appetite via hypothalamic signalling.',
      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '0.25', unit: 'mg' },
        dosingTypical: { amount: '1.0', unit: 'mg' },
        dosingHigh: { amount: '2.4', unit: 'mg' },
        sideEffects: 'Nausea, vomiting, diarrhoea, constipation, injection-site reactions.',
        stackingNotes: null,
        citations: [
          {
            title: 'Semaglutide and cardiovascular outcomes in obesity (SELECT)',
            doi: '10.1056/NEJMoa2307563',
            pmid: '37952131',
          },
        ],
      },
    },
    {
      name: 'Tirzepatide',
      iupacName: null,
      synonyms: ['Mounjaro', 'GIP/GLP-1 dual agonist'],
      mechanismOfAction:
        'Dual GIP and GLP-1 receptor agonist; superior weight reduction vs. GLP-1 monotherapy via additive insulin-sensitising and appetite-suppressing pathways.',
      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '2.5', unit: 'mg' },
        dosingTypical: { amount: '10', unit: 'mg' },
        dosingHigh: { amount: '15', unit: 'mg' },
        sideEffects: 'Similar to semaglutide; GI side effects common at initiation.',
        stackingNotes: null,
        citations: [
          {
            title: 'Tirzepatide vs semaglutide for weight loss (SURMOUNT-5)',
            doi: '10.1056/NEJMoa2410819',
            pmid: '39820891',
          },
        ],
      },
    },
    {
      name: 'GHK-Cu',
      iupacName: null,
      synonyms: ['Copper Peptide', 'GHK-Copper'],
      mechanismOfAction:
        'Tripeptide-copper complex; stimulates collagen and elastin synthesis, promotes wound healing, and exhibits anti-inflammatory and anti-oxidant activity.',
      administrationRoutes: ['SubQ', 'Topical'],
      tags: ['skin', 'healing', 'longevity'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'mg' },
        dosingTypical: { amount: '2.0', unit: 'mg' },
        dosingHigh: { amount: '3.0', unit: 'mg' },
        sideEffects: 'Skin flushing at injection site; generally well-tolerated topically.',
        stackingNotes: null,
        citations: [
          {
            title: 'GHK-Cu and skin remodelling — review',
            doi: '10.1155/2015/648108',
            pmid: '25977840',
          },
        ],
      },
    },
    {
      name: 'Tesamorelin',
      iupacName: null,
      synonyms: ['Egrifta', 'GHRH analogue'],
      mechanismOfAction:
        'Synthetic GHRH analogue; stimulates pituitary GH release, reducing visceral adipose tissue and improving body composition.',
      administrationRoutes: ['SubQ'],
      tags: ['longevity', 'metabolic', 'cognitive'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'mg' },
        dosingTypical: { amount: '2.0', unit: 'mg' },
        dosingHigh: { amount: '2.0', unit: 'mg' },
        sideEffects: 'Fluid retention, joint pain, injection-site reactions.',
        stackingNotes: null,
        citations: [
          {
            title: 'Tesamorelin for visceral adiposity in HIV-infected adults',
            doi: '10.1056/NEJMoa1007501',
            pmid: '20818872',
          },
        ],
      },
    },
    {
      name: 'Epitalon',
      iupacName: null,
      synonyms: ['Epithalamin', 'Epithalone'],
      mechanismOfAction:
        'Tetrapeptide derived from the pineal gland; stimulates telomerase activity, elongates telomeres, and modulates melatonin production.',
      administrationRoutes: ['SubQ', 'IM', 'Nasal'],
      tags: ['longevity'],
      profile: {
        dosingLow: { amount: '5', unit: 'mg' },
        dosingTypical: { amount: '10', unit: 'mg' },
        dosingHigh: { amount: '20', unit: 'mg' },
        sideEffects: 'Generally well-tolerated; minimal adverse effects reported.',
        stackingNotes: null,
        citations: [
          {
            title: 'Epithalamin and telomere length in ageing — clinical trial',
            doi: '10.1007/s10522-003-3931-z',
            pmid: '14628433',
          },
        ],
      },
    },
    {
      name: 'MOTS-c',
      iupacName: null,
      synonyms: ['Mitochondrial ORF of the 12S rRNA type-c'],
      mechanismOfAction:
        'Mitochondria-derived peptide; activates AMPK, improves insulin sensitivity, and upregulates folate-methionine cycle for metabolic homeostasis.',
      administrationRoutes: ['SubQ', 'IV'],
      tags: ['longevity', 'metabolic', 'cognitive'],
      profile: {
        dosingLow: { amount: '5', unit: 'mg' },
        dosingTypical: { amount: '10', unit: 'mg' },
        dosingHigh: { amount: '15', unit: 'mg' },
        sideEffects: 'Limited human data; rodent studies show excellent tolerability.',
        stackingNotes: null,
        citations: [
          {
            title: 'MOTS-c regulates insulin resistance and metabolic homeostasis',
            doi: '10.1016/j.cmet.2015.03.009',
            pmid: '25738459',
          },
        ],
      },
    },
  ];

  for (const { profile, ...compoundData } of compounds) {
    const compound = await prisma.compound.upsert({
      where: { name: compoundData.name },
      update: compoundData,
      create: compoundData,
    });

    if (profile) {
      const existingProfile = await prisma.compoundProfile.findUnique({
        where: { compoundId: compound.id },
      });

      if (!existingProfile) {
        const { citations, ...profileData } = profile;
        const createdProfile = await prisma.compoundProfile.create({
          data: {
            compoundId: compound.id,
            ...profileData,
          },
        });

        for (const citation of citations) {
          await prisma.citation.create({
            data: {
              profileId: createdProfile.id,
              title: citation.title,
              doi: citation.doi ?? null,
              pmid: citation.pmid ?? null,
              url: null,
            },
          });
        }
      }
    }
  }

  console.log('Seed complete — 8 QSC compounds upserted.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
