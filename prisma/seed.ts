import { PrismaClient } from '@prisma/client';
import { nameToSlug } from '../lib/reference/domain/slug';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const compounds = [
    {
      name: 'BPC-157',
      iupacName:
        'L-Valyl-L-prolyl-L-prolyl-L-alanyl-glycyl-L-glutaminyl-L-arginyl-L-leucyl-L-phenylalanyl-L-alpha-glutamyl-L-leucyl-L-leucyl-L-tyrosyl-L-leucyl-L-valyl-L-leucyl-L-seryl-L-glutamine',
      synonyms: ['Pentadecapeptide BPC-157'],
      mechanismOfAction:
        'Activates growth hormone receptor signalling, promotes angiogenesis via VEGF upregulation, and modulates nitric oxide synthesis. Accelerates tendon-to-bone healing via FAK-paxillin pathway. Expected Timeline: GI barrier improvements in 3-7 days; soft tissue, tendon, and ligament repair signals in 14-21 days.',
      administrationRoutes: ['SubQ', 'IM', 'Oral'],
      tags: ['healing', 'recovery'],
      profile: {
        dosingLow: { amount: '200', unit: 'mcg', researchBenefits: 'Mild recovery, digestive lining support', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '500', unit: 'mcg', researchBenefits: 'Standard tendon, muscle, and gut barrier healing', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '1000', unit: 'mcg', researchBenefits: 'Accelerated healing of severe ligament tears or systemic inflammation', recommendedFrequency: 'Twice daily' },
        sideEffects: 'Generally well-tolerated. Mild injection-site redness reported. Safety Assessment: Highly safe profile with no toxicity observed in animal or human trials.',
        stackingNotes: 'Commonly stacked with TB-500 for enhanced musculoskeletal healing. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
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
        'Promotes actin polymerisation and cell migration; upregulates anti-inflammatory cytokines. Enhances angiogenesis and tissue repair. Expected Timeline: Reduced acute joint/muscle discomfort in 5-10 days; major soft tissue structural healing in 4-6 weeks.',
      administrationRoutes: ['SubQ', 'IM'],
      tags: ['healing', 'recovery'],
      profile: {
        dosingLow: { amount: '2.0', unit: 'mg', researchBenefits: 'Musculoskeletal maintenance, mild systemic repair', recommendedFrequency: 'Twice weekly' },
        dosingTypical: { amount: '5.0', unit: 'mg', researchBenefits: 'Standard connective tissue, tendon, and ligament repair', recommendedFrequency: 'Twice weekly' },
        dosingHigh: { amount: '10.0', unit: 'mg', researchBenefits: 'Acute loading dose for severe sports injuries or tears', recommendedFrequency: 'Twice weekly' },
        sideEffects: 'Occasional fatigue and mild nausea in higher doses. Safety Assessment: High safety profile. Occasional transient fatigue, headache, or mild lethargy reported in higher doses.',
        stackingNotes: 'Often combined with BPC-157; synergistic healing across tissue types. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
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
        'GLP-1 receptor agonist; increases insulin secretion, suppresses glucagon, slows gastric emptying, and reduces appetite via hypothalamic signalling. Expected Timeline: Satiety and appetite reduction in 24-48 hours; significant weight loss visible in 4-8 weeks, peaking around 40-60 weeks.',
      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '0.25', unit: 'mg', researchBenefits: 'Initial weight management, glycemic adaptation', recommendedFrequency: 'Weekly' },
        dosingTypical: { amount: '1.0', unit: 'mg', researchBenefits: 'Accelerated weight loss, metabolic health enhancement', recommendedFrequency: 'Weekly' },
        dosingHigh: { amount: '2.4', unit: 'mg', researchBenefits: 'Maximum weight management dose', recommendedFrequency: 'Weekly' },
        sideEffects: 'Nausea, vomiting, diarrhoea, constipation, injection-site reactions. Safety Assessment: Gastrointestinal side effects common. Dehydration risk. Must monitor for pancreatitis or gallbladder disease.',
        stackingNotes: 'Storage: Reconstituted solution is stable refrigerated for 56 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 56,
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
        'Dual GIP and GLP-1 receptor agonist; superior weight reduction vs. GLP-1 monotherapy via additive insulin-sensitising and appetite-suppressing pathways. Expected Timeline: Satiety and blood glucose improvements in 24 hours; significant body weight reduction in 4-8 weeks, peaking up to 72 weeks.',
      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '2.5', unit: 'mg', researchBenefits: 'Initiation dose, glycemic adaptation', recommendedFrequency: 'Weekly' },
        dosingTypical: { amount: '10.0', unit: 'mg', researchBenefits: 'Substantial appetite suppression and weight loss', recommendedFrequency: 'Weekly' },
        dosingHigh: { amount: '15.0', unit: 'mg', researchBenefits: 'Maximum maintenance dose for profound weight loss and glycemic control', recommendedFrequency: 'Weekly' },
        sideEffects: 'Similar to semaglutide; GI side effects common at initiation. Safety Assessment: Gastrointestinal distress is common during dose escalation. Risk of dehydration. Avoid in patients with a history of Medullary Thyroid Carcinoma (MTC).',
        stackingNotes: 'Storage: Reconstituted solution is stable refrigerated for 56 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 56,
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
        'Tripeptide-copper complex; stimulates collagen and elastin synthesis, promotes wound healing, and exhibits anti-inflammatory and anti-oxidant activity. Expected Timeline: Skin texture and elasticity changes in 2-4 weeks; tissue/hair restoration in 6-8 weeks.',
      administrationRoutes: ['SubQ', 'Topical'],
      tags: ['skin', 'healing', 'longevity'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'mg', researchBenefits: 'Skin hydration and cosmetic maintenance', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '2.0', unit: 'mg', researchBenefits: 'Advanced dermal collagen promotion and systemic healing', recommendedFrequency: 'Once daily' },
        dosingHigh: { amount: '3.0', unit: 'mg', researchBenefits: 'Maximum subcutaneous dose for systematic tissue repair', recommendedFrequency: 'Once daily' },
        sideEffects: 'Skin flushing at injection site; generally well-tolerated topically. Safety Assessment: Well-tolerated. SubQ injections often cause a transient stinging sensation and localized redness. High doses may alter zinc-copper balance.',
        stackingNotes: 'Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
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
        'Synthetic GHRH analogue; stimulates pituitary GH release, reducing visceral adipose tissue and improving body composition. Expected Timeline: Visceral fat reduction visible within 8-12 weeks; improved sleep and recovery in 4 weeks.',
      administrationRoutes: ['SubQ'],
      tags: ['longevity', 'metabolic', 'cognitive'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'mg', researchBenefits: 'Fat reduction, general body composition maintenance', recommendedFrequency: 'Daily (5 days on, 2 days off)' },
        dosingTypical: { amount: '2.0', unit: 'mg', researchBenefits: 'Standard therapeutic GHRH stimulation and visceral fat loss', recommendedFrequency: 'Daily (5 days on, 2 days off)' },
        dosingHigh: { amount: '2.0', unit: 'mg', researchBenefits: 'Maximum approved pituitary stimulation dose', recommendedFrequency: 'Daily' },
        sideEffects: 'Fluid retention, joint pain, injection-site reactions. Safety Assessment: Side effects include fluid retention, joint pain, muscle stiffness, and transient increases in blood glucose. Contraindicated in active cancer.',
        stackingNotes: 'Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
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
        'Tetrapeptide derived from the pineal gland; stimulates telomerase activity, elongates telomeres, and modulates melatonin production. Expected Timeline: Sleep quality and deep sleep phases improve in 3-7 days; cellular aging improvements are sub-clinical over 6-12 months.',
      administrationRoutes: ['SubQ', 'IM', 'Intranasal'],
      tags: ['longevity'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'mg', researchBenefits: 'Pineal gland maintenance and circadian rhythm regulation', recommendedFrequency: 'Once daily (10-20 day cycle)' },
        dosingTypical: { amount: '5.0', unit: 'mg', researchBenefits: 'Standard longevity protocol for telomere elongation', recommendedFrequency: 'Once daily (10-20 day cycle)' },
        dosingHigh: { amount: '10.0', unit: 'mg', researchBenefits: 'Advanced cellular regeneration and telomerase up-regulation', recommendedFrequency: 'Once daily (10-20 day cycle)' },
        sideEffects: 'Generally well-tolerated; minimal adverse effects reported. Safety Assessment: Extremely high safety profile. No toxic, carcinogenic, or adverse effects reported.',
        stackingNotes: 'Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
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
        'Mitochondria-derived peptide; activates AMPK, improves insulin sensitivity, and upregulates folate-methionine cycle for metabolic homeostasis. Expected Timeline: Increased energy, stamina, and workout recovery in 7-14 days; metabolic/lipid profile shifts in 4 weeks.',
      administrationRoutes: ['SubQ', 'IV'],
      tags: ['longevity', 'metabolic', 'cognitive'],
      profile: {
        dosingLow: { amount: '5.0', unit: 'mg', researchBenefits: 'Mitochondrial efficiency, insulin sensitivity support', recommendedFrequency: 'Once or twice weekly' },
        dosingTypical: { amount: '10.0', unit: 'mg', researchBenefits: 'Metabolic adaptation, athletic endurance enhancement', recommendedFrequency: 'Twice weekly (4-6 week cycle)' },
        dosingHigh: { amount: '15.0', unit: 'mg', researchBenefits: 'Intensive metabolic restoration and insulin resistance treatment', recommendedFrequency: 'Three times weekly' },
        sideEffects: 'Limited human data; rodent studies show excellent tolerability. Transient fatigue/muscle soreness. Safety Assessment: Well-tolerated. Transient fatigue, muscle soreness, or mild headache can occur post-injection.',
        stackingNotes: 'Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        citations: [
          {
            title: 'MOTS-c regulates insulin resistance and metabolic homeostasis',
            doi: '10.1016/j.cmet.2015.03.009',
            pmid: '25738459',
          },
        ],
      },
    },
    {
      name: 'KPV',
      iupacName: 'L-Lysyl-L-prolyl-L-valine',
      synonyms: ['Lys-Pro-Val'],
      mechanismOfAction:
        'C-terminal tripeptide of alpha-melanocyte-stimulating hormone (alpha-MSH); binds to melanocortin receptors (MC1R, MC3R) to inhibit NF-kB activation, reducing inflammatory cytokine transcription. Expected Timeline: Gut bloating or skin redness reductions in 3-7 days; systemic inflammation relief in 2 weeks.',
      administrationRoutes: ['SubQ', 'Oral', 'Topical'],
      tags: ['healing', 'recovery', 'inflammation'],
      profile: {
        dosingLow: { amount: '200', unit: 'mcg', researchBenefits: 'Anti-inflammatory, gut barrier repair', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '500', unit: 'mcg', researchBenefits: 'Gut healing, skin recovery, mast cell stabilization', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '1000', unit: 'mcg', researchBenefits: 'Severe systemic inflammatory response modulation', recommendedFrequency: 'Twice daily' },
        sideEffects: 'Extremely well-tolerated. Rare injection-site irritation or mild flushing. Safety Assessment: Highly safe, non-toxic, and non-melanogenic (does not trigger tanning). Rare localized injection-site itching.',
        stackingNotes: 'Often stacked with BPC-157 for gut/GI healing and mast cell activation syndrome (MCAS) management. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        citations: [
          {
            title: 'KPV reduces intestinal inflammation in rodent models',
            doi: '10.1002/ibd.20144',
            pmid: '17559132',
          },
        ],
      },
    },
    {
      name: 'ARA-290',
      iupacName: 'L-Glutaminyl-L-glutaminyl-L-alpha-glutamyl-L-alanyl-L-valyl-L-alpha-glutamyl-L-alanyl-L-lysyl-L-alpha-glutamyl-L-valyl-L-phenylalanyl-L-serine',
      synonyms: ['Cibinetide', 'ARA290', 'Erythropoietin-derived peptide'],
      mechanismOfAction:
        'Selective agonist of the innate repair receptor (IRR), a heterodimer of erythropoietin receptor and CD131. Activates anti-inflammatory and tissue protective pathways without stimulating erythropoiesis. Expected Timeline: Neuropathic pain relief and sleep comfort in 7-14 days; epidermal nerve fiber growth starts in 4-8 weeks.',
      administrationRoutes: ['SubQ', 'IV'],
      tags: ['healing', 'recovery', 'neuropathy'],
      profile: {
        dosingLow: { amount: '2.0', unit: 'mg', researchBenefits: 'Neuropathic pain relief, anti-inflammation', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '4.0', unit: 'mg', researchBenefits: 'Small fiber neuropathy, sarcoidosis-associated pain', recommendedFrequency: 'Once daily' },
        dosingHigh: { amount: '8.0', unit: 'mg', researchBenefits: 'Severe peripheral nerve injury recovery', recommendedFrequency: 'Once daily' },
        sideEffects: 'Mild injection site reaction, occasional transient headache. Safety Assessment: High safety profile. No hematological abnormalities (no red blood cell elevation). Mild local irritation or headache can occur.',
        stackingNotes: 'Can be stacked with Epitalon or Thymosin Alpha-1 for overall nerve recovery and immune support. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        citations: [
          {
            title: 'Cibinetide (ARA-290) in small fiber neuropathy associated with sarcoidosis',
            doi: '10.1016/j.jns.2013.06.012',
            pmid: '23810243',
          },
        ],
      },
    },
    {
      name: 'Cagrilintide/Semaglutide',
      iupacName: null,
      synonyms: ['CagriSema', 'Amylin/GLP-1 receptor co-agonist'],
      mechanismOfAction:
        'Dual amylin analog (cagrilintide) and GLP-1 receptor agonist (semaglutide). Cagrilintide delays gastric emptying and promotes satiety via central amylin receptors, synergistically complementing GLP-1 hypothalamic satiety pathways. Expected Timeline: Satiety within 24 hours; noticeable weight loss in 4 weeks, with enhanced outcomes compared to semaglutide monotherapy.',
      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '0.25', unit: 'mg', researchBenefits: 'Initial weight management, glycaemic control', recommendedFrequency: 'Weekly' },
        dosingTypical: { amount: '1.0', unit: 'mg', researchBenefits: 'Accelerated weight loss, metabolic health enhancement', recommendedFrequency: 'Weekly' },
        dosingHigh: { amount: '2.4', unit: 'mg', researchBenefits: 'Maximum weight management dose', recommendedFrequency: 'Weekly' },
        sideEffects: 'Gastrointestinal side effects (nausea, vomiting, diarrhoea, constipation). Risk of dehydration. Safety Assessment: High incidence of transient GI side effects. Adequate hydration is essential.',
        stackingNotes: 'Do not stack with other GLP-1 agonists. Maintain adequate hydration and caloric structure. Storage: Reconstituted solution is stable refrigerated for 56 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 56,
        citations: [
          {
            title: 'Cagrilintide plus semaglutide co-administration for weight management: a phase 2 trial',
            doi: '10.1016/S0140-6736(21)01751-7',
            pmid: '34480860',
          },
        ],
      },
    },
    {
      name: 'Retatrutide',
      iupacName: null,
      synonyms: ['LY3437943', 'GIP/GLP-1/glucagon receptor triple agonist'],
      mechanismOfAction:
        'Triple agonist targeting glucose-dependent insulinotropic polypeptide (GIP), glucagon-like peptide-1 (GLP-1), and glucagon receptors. Synergizes lipolysis and energy expenditure with appetite control. Expected Timeline: Appetite suppression in 24 hours; fat mobilization and weight loss visible within 3-4 weeks, peaking at 48 weeks.',
      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '2.0', unit: 'mg', researchBenefits: 'Initiation dose, mild weight reduction', recommendedFrequency: 'Weekly' },
        dosingTypical: { amount: '4.0', unit: 'mg', researchBenefits: 'Substantial weight loss and insulin resistance reversal', recommendedFrequency: 'Weekly' },
        dosingHigh: { amount: '12.0', unit: 'mg', researchBenefits: 'Maximum therapeutic weight loss and visceral fat reduction', recommendedFrequency: 'Weekly' },
        sideEffects: 'Transient mild-to-moderate gastrointestinal events, dose-dependent heart rate elevation. Safety Assessment: Dose-dependent GI distress. Monitor heart rate for mild, transient elevations during early weeks.',
        stackingNotes: 'Often monitored closely due to potent energy expenditure increase from glucagon receptor activity. Storage: Reconstituted solution is stable refrigerated for 56 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 56,
        citations: [
          {
            title: 'Triple–hormone-receptor agonist retatrutide for obesity — phase 2 trial',
            doi: '10.1056/NEJMoa2301972',
            pmid: '37366315',
          },
        ],
      },
    },
    {
      name: 'Thymosin Alpha-1',
      iupacName: null,
      synonyms: ['Tα1', 'Zadaxin', 'Thymalfasin'],
      mechanismOfAction:
        'Immunomodulatory peptide derived from prothymosin alpha. Stimulates T-cell maturation, NK cell activity, and upregulates MHC Class I expression to modulate the adaptive immune response. Expected Timeline: Cellular immune responsiveness increases in 7-10 days; systemic immune resilience increases within 2-4 weeks.',
      administrationRoutes: ['SubQ'],
      tags: ['immunity', 'healing'],
      profile: {
        dosingLow: { amount: '0.75', unit: 'mg', researchBenefits: 'Prophylactic immune support, general wellness', recommendedFrequency: 'Twice weekly' },
        dosingTypical: { amount: '1.5', unit: 'mg', researchBenefits: 'Active immune system modulation, viral response support', recommendedFrequency: 'Twice weekly' },
        dosingHigh: { amount: '3.0', unit: 'mg', researchBenefits: 'Acute immune support or adjunctive oncology research applications', recommendedFrequency: 'Daily or alternate days' },
        sideEffects: 'Extremely high safety profile. Localized transient erythema at injection site. Safety Assessment: High tolerability. Minimal adverse reactions; localized transient redness at the injection site is common.',
        stackingNotes: 'Pairs well with BPC-157 or LL-37 to bolster tissue regeneration and immune response synergy. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        citations: [
          {
            title: 'Thymosin alpha-1: a review of its immunomodulatory properties and clinical use',
            doi: '10.2174/138920109787048604',
            pmid: '19149591',
          },
        ],
      },
    },
    {
      name: 'GLOW50',
      iupacName: null,
      synonyms: ['GHK-Cu/Argireline/Leuphasyl', 'Cosmetic Tri-Peptide Blend'],
      mechanismOfAction:
        'Synergistic combination of GHK-Cu, Argireline (acetyl hexapeptide-8), and Leuphasyl (pentapeptide-18). Targets collagen synthesis via GHK-Cu while relaxing facial micro-muscles via SNARE complex disruption. Expected Timeline: Fine expression line relaxation in 10-14 days; dermal thickness and tone improvement in 4-6 weeks.',
      administrationRoutes: ['Topical', 'SubQ'],
      tags: ['skin', 'longevity'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'mg', researchBenefits: 'Anti-aging skin tone maintenance, light wrinkle support', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '2.0', unit: 'mg', researchBenefits: 'Dermal remodeling, reduction in expression lines, collagen boost', recommendedFrequency: 'Once daily' },
        dosingHigh: { amount: '4.0', unit: 'mg', researchBenefits: 'Rapid skin repair, scar reduction, advanced wrinkle management', recommendedFrequency: 'Once daily' },
        sideEffects: 'Mild transient skin redness or dry patches at topical application site. Safety Assessment: Extremely safe. Topical application can cause mild redness or localized peeling. SubQ may cause transient stinging.',
        stackingNotes: 'Can be stacked topically with hyaluronic acid or subcutaneously with Epitalon for systematic longevity benefits. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 1 year (dry blend).',
        reconstitutedShelfLifeDays: 30,
        citations: [
          {
            title: 'Role of cosmetic peptides in skin health',
            doi: '10.1111/jocd.12209',
            pmid: '27181059',
          },
        ],
      },
    },
    {
      name: 'FOXO4-DRI',
      iupacName: null,
      synonyms: ['Senolytic Peptide', 'FOXO4 D-Retro-Inverso'],
      mechanismOfAction:
        'Interferes with the binding of FOXO4 to p53, releasing p53 to localize in the nucleus and trigger apoptosis specifically in senescent cells (senolysis). Expected Timeline: Systemic vitality, joint mobility, and inflammatory cytokine reductions observed 2-4 weeks post-cycle.',
      administrationRoutes: ['SubQ', 'IV'],
      tags: ['longevity', 'senolytic'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'mg', researchBenefits: 'Mild senescent cell clearance, anti-aging maintenance', recommendedFrequency: 'Every 3 days (3-dose cycle)' },
        dosingTypical: { amount: '3.0', unit: 'mg', researchBenefits: 'Standard senolytic clearance protocol for physiological rejuvenation', recommendedFrequency: 'Every 3 days (3-dose cycle, repeat once a year)' },
        dosingHigh: { amount: '5.0', unit: 'mg', researchBenefits: 'Intensive senescent cell eradication under research surveillance', recommendedFrequency: 'Every 2 days (3-dose cycle)' },
        sideEffects: 'Mild transient kidney stress markers, fatigue, light joint soreness. Safety Assessment: Experimental peptide. Requires monitoring of renal biomarkers (creatinine, BUN) as senescent cell clearance can transiently load kidneys.',
        stackingNotes: 'Can be paired with generic senolytics like Quercetin or Dasatinib to enhance clearance range. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        citations: [
          {
            title: 'Targeted apoptosis of senescent cells restores tissue homeostasis',
            doi: '10.1016/j.cell.2017.02.031',
            pmid: '28340339',
          },
        ],
      },
    },
    {
      name: 'DSIP',
      iupacName: null,
      synonyms: ['Delta Sleep-Inducing Peptide'],
      mechanismOfAction:
        'Neuromodulatory peptide; crosses the blood-brain barrier to interact with NMDA and AMPA receptors, promoting delta-rhythm sleep, easing chronic pain, and reducing stress. Expected Timeline: Induces sleepiness and improves sleep depth on the first night of administration.',
      administrationRoutes: ['SubQ', 'IV'],
      tags: ['sleep', 'cognitive', 'recovery'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Improved sleep onset and mild stress reduction', recommendedFrequency: 'Nightly (30-60 mins before sleep)' },
        dosingTypical: { amount: '250', unit: 'mcg', researchBenefits: 'Deep delta-wave sleep induction and muscle recovery', recommendedFrequency: 'Nightly before sleep' },
        dosingHigh: { amount: '500', unit: 'mcg', researchBenefits: 'Severe sleep disorder mitigation, opioid withdrawal research support', recommendedFrequency: 'Nightly before sleep' },
        sideEffects: 'Morning grogginess, lethargy, transient dizziness. Safety Assessment: Safe. Main reported issue is morning grogginess or mild lethargy if injected too late in the evening.',
        stackingNotes: 'Stacks well with Epitalon for comprehensive sleep-wake cycle optimization. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        citations: [
          {
            title: 'Delta sleep-inducing peptide (DSIP): an overview',
            doi: '10.1016/0149-7634(84)90013-1',
            pmid: '6147775',
          },
        ],
      },
    },
    {
      name: 'Hexarelin',
      iupacName: null,
      synonyms: ['Examorelin', 'GHRP-6 derivative'],
      mechanismOfAction:
        'Potent synthetic growth hormone secretagogue (GHS) that acts as a ghrelin receptor agonist. Promotes growth hormone secretion and exhibits cardioprotective effects via CD36 binding. Expected Timeline: Acute growth hormone pulse within 30 minutes; improvements in recovery, fat loss, and muscle tone in 3-5 weeks.',
      administrationRoutes: ['SubQ'],
      tags: ['longevity', 'recovery'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Stimulates mild GH release, metabolic recovery support', recommendedFrequency: 'Once daily before bed' },
        dosingTypical: { amount: '200', unit: 'mcg', researchBenefits: 'Cardioprotection, cellular healing, and fat loss promotion', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '300', unit: 'mcg', researchBenefits: 'Maximum GH surge for tissue recovery and metabolic support', recommendedFrequency: 'Twice daily' },
        sideEffects: 'Increased appetite, elevated prolactin and cortisol levels, injection-site numbness. Safety Assessment: Increases cortisol and prolactin. Causes appetite stimulation. Pituitary desensitization occurs if run without cycles (typically run 4-8 weeks on, 4 weeks off).',
        stackingNotes: 'Often cycled for 4-8 weeks to prevent pituitary desensitization. Pairs well with ModGRF (CJC-1295 without DAC). Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        citations: [
          {
            title: 'Hexarelin, a GH-releasing peptide, exhibits cardioprotective properties',
            doi: '10.1210/en.2004-1647',
            pmid: '15764610',
          },
        ],
      },
    },
    {
      name: 'Adipotide',
      iupacName: null,
      synonyms: ['FTPP', 'Proapoptotic peptide'],
      mechanismOfAction:
        'Targeted peptidomimetic that binds to prohibitin in white fat vasculature, inducing selective apoptosis of adipose blood vessels and subsequent rapid weight loss. Expected Timeline: Appetite suppression within 48 hours; rapid reduction of visceral fat mass visible in 14-21 days.',
      administrationRoutes: ['SubQ'],
      tags: ['weight-loss', 'metabolic'],
      profile: {
        dosingLow: { amount: '0.25', unit: 'mg', researchBenefits: 'Mild targeted fat mass reduction', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '0.5', unit: 'mg', researchBenefits: 'Significant abdominal and visceral fat reduction', recommendedFrequency: 'Once daily (28-day cycle)', },
        dosingHigh: { amount: '1.0', unit: 'mg', researchBenefits: 'Accelerated fat mass depletion in advanced research models', recommendedFrequency: 'Once daily' },
        sideEffects: 'Renal dysfunction (increased creatinine/BUN), dehydration, lethargy. Safety Assessment: High risk of nephrotoxicity (kidney stress). Must monitor serum creatinine, BUN, and glomerular filtration rate closely. Stacks must prioritize extreme hydration.',
        stackingNotes: 'Must be cycled with frequent laboratory renal monitoring. Stacks well with hydration protocols. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        citations: [
          {
            title: 'A peptidomimetic targeting white fat vasculature in obese monkeys',
            doi: '10.1126/scitranslmed.3002621',
            pmid: '22072637',
          },
        ],
      },
    },
    {
      name: 'Testosterone',
      iupacName: null,
      synonyms: ['Test', 'Enanthate', 'Cypionate', 'TRT'],
      mechanismOfAction:
        'Endogenous androgen receptor agonist. Promotes protein synthesis, nitrogen retention, erythropoiesis, and osteoblast activity, enhancing secondary sexual characteristics. Expected Timeline: Libido and mental clarity in 2-3 weeks; strength increases, fat loss, and muscle mass accretion in 6-12 weeks.',
      administrationRoutes: ['IM', 'SubQ', 'Topical'],
      tags: ['androgen', 'recovery', 'metabolic'],
      profile: {
        dosingLow: { amount: '10', unit: 'mg', researchBenefits: 'Hormone replacement therapy, general wellness', recommendedFrequency: 'Daily (SubQ)' },
        dosingTypical: { amount: '100', unit: 'mg', researchBenefits: 'TRT replacement protocol, lean mass maintenance', recommendedFrequency: 'Weekly (or split twice weekly)' },
        dosingHigh: { amount: '200', unit: 'mg', researchBenefits: 'Maximum replacement dose, rapid tissue recovery', recommendedFrequency: 'Weekly' },
        sideEffects: 'Erythrocytosis, hair loss, gynecomastia, suppression of endogenous testosterone. Safety Assessment: Shuts down endogenous testosterone (testicular atrophy; managed with HCG). Elevates hematocrit and blood viscosity. Risk of aromatization to estrogen.',
        stackingNotes: 'Often stacked with HCG to maintain testicular function during administration. Storage: Multidose vials formulated in carrier oils are stable at room temperature for 90 days once punctured. Do not freeze.',
        reconstitutedShelfLifeDays: 90,
        citations: [
          {
            title: 'Testosterone replacement therapy: a review of benefits and risks',
            doi: '10.2147/tcrm.s68932',
            pmid: '25484889',
          },
        ],
      },
    },
    {
      name: 'Tadalafil',
      iupacName: null,
      synonyms: ['Cialis'],
      mechanismOfAction:
        'Selective, reversible inhibitor of phosphodiesterase type 5 (PDE5). Prevents cGMP degradation, relaxing smooth muscle and enhancing blood flow. Expected Timeline: Vasodilation active within 1-2 hours. Cumulative endothelial improvements reach steady state in 5 days of daily dosing.',
      administrationRoutes: ['Oral'],
      tags: ['recovery', 'vascular'],
      profile: {
        dosingLow: { amount: '2.5', unit: 'mg', researchBenefits: 'Daily vascular support, mild athletic pump', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '5.0', unit: 'mg', researchBenefits: 'Standard daily dose for continuous vascular and prostate support', recommendedFrequency: 'Once daily' },
        dosingHigh: { amount: '20.0', unit: 'mg', researchBenefits: 'On-demand acute athletic or erectile dysfunction response', recommendedFrequency: 'Every 36 hours' },
        sideEffects: 'Headache, dyspepsia, back pain, nasal congestion, flushing. Safety Assessment: Extremely safe. Side effects are typically mild. Absolutely contraindicated with organic nitrates due to risk of fatal hypotension.',
        stackingNotes: 'Do NOT combine with organic nitrates/nitric oxide donors due to risk of life-threatening hypotension. Storage: Stored as raw oral powder or liquid solution, stable at room temperature for 180 days (liquid) or 3 years (dry tablets).',
        reconstitutedShelfLifeDays: 180,
        citations: [
          {
            title: 'Vascular and systemic effects of daily tadalafil administration',
            doi: '10.1111/j.1743-6109.2008.00977.x',
            pmid: '18783431',
          },
        ],
      },
    },
    {
      name: 'Vardenafil',
      iupacName: null,
      synonyms: ['Levitra'],
      mechanismOfAction:
        'Selective phosphodiesterase type 5 (PDE5) inhibitor. Potentiates nitric oxide pathway to promote smooth muscle relaxation and local vascular expansion. Expected Timeline: Onset within 30-60 minutes; active duration is 4-5 hours.',
      administrationRoutes: ['Oral'],
      tags: ['vascular'],
      profile: {
        dosingLow: { amount: '5.0', unit: 'mg', researchBenefits: 'Mild vasodilation support', recommendedFrequency: 'On-demand' },
        dosingTypical: { amount: '10.0', unit: 'mg', researchBenefits: 'Standard therapeutic dose for targeted vasodilation', recommendedFrequency: 'On-demand (prior to activity)' },
        dosingHigh: { amount: '20.0', unit: 'mg', researchBenefits: 'Maximum single-dose on-demand response', recommendedFrequency: 'On-demand' },
        sideEffects: 'Headache, dizziness, flushing, visual changes. Safety Assessment: Common effects are headache, flushing, nasal congestion, and visual changes. Contraindicated with nitroglycerin.',
        stackingNotes: 'Contraindicated with nitroglycerin and other nitrates due to profound hypotension risk. Storage: Stable at room temperature for 180 days (liquid) or 3 years (dry tablets).',
        reconstitutedShelfLifeDays: 180,
        citations: [
          {
            title: 'Efficacy and safety of vardenafil: a review',
            doi: '10.1016/s0022-5347(05)64287-2',
            pmid: '12415053',
          },
        ],
      },
    },
    {
      name: 'Thymalin',
      iupacName: null,
      synonyms: ['Thymus Extract Peptide'],
      mechanismOfAction:
        'Synthetic thymus peptide dipeptide (Glu-Trp). Upregulates expression of differentiation markers on T-lymphocytes, balancing Th1/Th2 cytokine ratios. Expected Timeline: T-cell profile normalization within the 10-day cycle; systemic immunity enhancements last 3-6 months.',
      administrationRoutes: ['SubQ', 'IM'],
      tags: ['immunity', 'longevity'],
      profile: {
        dosingLow: { amount: '5.0', unit: 'mg', researchBenefits: 'General immune system regulation', recommendedFrequency: 'Once daily (10-day cycle)' },
        dosingTypical: { amount: '10.0', unit: 'mg', researchBenefits: 'Deep immunomodulation, lymphatic system support', recommendedFrequency: 'Once daily (10-day cycle, twice yearly)' },
        dosingHigh: { amount: '10.0', unit: 'mg', researchBenefits: 'Standard maximum immune rebuilding dose', recommendedFrequency: 'Once daily (10-day cycle)' },
        sideEffects: 'Excellent safety profile; localized redness at injection site. Safety Assessment: High safety profile with virtually no toxicities. Mild localized redness at the injection site.',
        stackingNotes: 'Often stacked side-by-side with Epitalon (run Epitalon in the morning, Thymalin at night) to mimic natural pineal-thymus axis renewal. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        citations: [
          {
            title: 'Thymalin and Epithalamin clinical trials in gerontology',
            doi: '10.1007/bf02434947',
            pmid: '12510182',
          },
        ],
      },
    },
    {
      name: 'Turinabol',
      iupacName: null,
      synonyms: ['Tbol', 'Oral Turinabol'],
      mechanismOfAction:
        'Chlorinated derivative of methyltestosterone. Binds to androgen receptors to promote nitrogen retention and muscle mass without converting to estrogen. Expected Timeline: Recovery and endurance gains in 7-10 days; measurable strength and lean dry gains in 3-4 weeks.',
      administrationRoutes: ['Oral'],
      tags: ['androgen', 'recovery'],
      profile: {
        dosingLow: { amount: '10', unit: 'mg', researchBenefits: 'Mild athletic recovery, lean tissue support', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '30', unit: 'mg', researchBenefits: 'Significant strength gain and muscle preservation', recommendedFrequency: 'Once daily (4-6 week cycle)' },
        dosingHigh: { amount: '50', unit: 'mg', researchBenefits: 'Maximum performance protocol; high androgen burden', recommendedFrequency: 'Once daily' },
        sideEffects: 'Hepatotoxicity (elevated liver enzymes), lipid strain (reduced HDL), endogenous suppression. Safety Assessment: 17-alpha-alkylated steroid; causes hepatotoxicity. Negatively affects lipid profiles (lowers HDL). Suppresses natural LH feedback loop.',
        stackingNotes: 'Require liver protection supplements (TUDCA/NAC) and standard post-cycle therapy. Storage: Stable at room temperature for up to 3 years.',
        reconstitutedShelfLifeDays: 365,
        citations: [
          {
            title: 'Turinabol misuse and pharmacological properties',
            doi: '10.1002/dta.1969',
            pmid: '26987483',
          },
        ],
      },
    },
    {
      name: 'Dianabol',
      iupacName: null,
      synonyms: ['Dbol', 'Methandrostenolone', 'Methandienone'],
      mechanismOfAction:
        'Potent synthetic oral androgen receptor agonist. Upregulates protein synthesis and glycogenolysis, leading to rapid lean mass and strength increases. Expected Timeline: Water weight and strength gains in 3-5 days; massive cellular size increases in 2-3 weeks.',
      administrationRoutes: ['Oral'],
      tags: ['androgen', 'recovery'],
      profile: {
        dosingLow: { amount: '15', unit: 'mg', researchBenefits: 'Moderate tissue building, rapid recovery', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '30', unit: 'mg', researchBenefits: 'Pronounced muscle hypertrophy and strength gains', recommendedFrequency: 'Once daily (4-6 week cycle)' },
        dosingHigh: { amount: '50', unit: 'mg', researchBenefits: 'High androgen exposure; rapid water retention and tissue mass', recommendedFrequency: 'Once daily' },
        sideEffects: 'Hepatotoxicity, significant estrogenic conversion (gyno, fluid retention), high blood pressure. Safety Assessment: High hepatotoxicity. Strongly aromatizing; can cause severe estrogenic side effects (gynecomastia, fluid retention, hypertension). Deeply suppressive.',
        stackingNotes: 'Aromatase inhibitor (AI) often required to manage estrogen conversion. Storage: Stable at room temperature for up to 3 years.',
        reconstitutedShelfLifeDays: 365,
        citations: [
          {
            title: 'Methandrostenolone: effects on muscle mass and performance',
            doi: '10.1136/bjsm.9.2.82',
            pmid: '1138883',
          },
        ],
      },
    },
    {
      name: 'NA-Selank-Amidate',
      iupacName: null,
      synonyms: ['N-Acetyl Selank Amidate'],
      mechanismOfAction:
        'Synthetic heptapeptide analog of tuftsin modified with N-acetyl and C-terminal amidate groups for enhanced stability. Modulates serotonin, dopamine, and GABA neurotransmission. Expected Timeline: Anxiolytic and focus improvements active within 15-30 minutes of nasal spray.',
      administrationRoutes: ['Intranasal', 'SubQ'],
      tags: ['cognitive', 'anxiolytic'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Mild focus improvement and stress reduction', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '300', unit: 'mcg', researchBenefits: 'Anxiolytic response, enhanced learning, and stress coping mechanisms', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '900', unit: 'mcg', researchBenefits: 'Intensive cognitive support and severe anxiety management', recommendedFrequency: 'Three times daily' },
        sideEffects: 'Temporary nasal irritation, mild fatigue. Safety Assessment: Highly safe. Non-sedating, non-addictive. Occasional mild nasal mucosa irritation.',
        stackingNotes: 'Often stacked with Semax to balance cognitive stimulation with anxiolytic relaxation. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
        citations: [
          {
            title: 'Anxiolytic properties of Selank in clinical trials',
            doi: '10.1007/s11055-008-9008-0',
            pmid: '19093226',
          },
        ],
      },
    },
    {
      name: 'HCG',
      iupacName: null,
      synonyms: ['Pregnyl', 'Novarel', 'Human Chorionic Gonadotropin'],
      mechanismOfAction:
        'Luteinising hormone (LH) analog; stimulates Leydig cells in testicles to synthesize endogenous testosterone, preserving fertility and preventing testicular atrophy. Expected Timeline: Testicular sensation and intratesticular pressure changes in 7 days; volume restoration in 2-3 weeks.',
      administrationRoutes: ['SubQ', 'IM'],
      tags: ['androgen', 'fertility'],
      profile: {
        dosingLow: { amount: '250', unit: 'IU', researchBenefits: 'Maintenance of testicular size and intratesticular testosterone on TRT', recommendedFrequency: 'Every other day' },
        dosingTypical: { amount: '500', unit: 'IU', researchBenefits: 'Preservation of spermatogenesis and fertility support', recommendedFrequency: 'Three times weekly' },
        dosingHigh: { amount: '2000', unit: 'IU', researchBenefits: 'Monotherapy for hypogonadism or fertility restoration cycles', recommendedFrequency: 'Three times weekly' },
        sideEffects: 'Estrogen elevation, gynecomastia, injection-site pain. Safety Assessment: Well tolerated. Can increase estrogen levels due to testicular aromatization (requires monitoring).',
        stackingNotes: 'Crucial adjunct when cycling testosterone to maintain natural LH signaling feedback loop. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
        citations: [
          {
            title: 'Co-administration of HCG with testosterone replacement therapy',
            doi: '10.1016/j.juro.2012.11.027',
            pmid: '23219544',
          },
        ],
      },
    },
    {
      name: 'HMG',
      iupacName: null,
      synonyms: ['Menopur', 'Repronex', 'Human Menopausal Gonadotropin'],
      mechanismOfAction:
        'Contains active follicle-stimulating hormone (FSH) and luteinising hormone (LH). Directly stimulates follicle development in ovaries and spermatogenesis in testes. Expected Timeline: Seminal parameter changes and spermatogenesis recovery visible in 12-24 weeks.',
      administrationRoutes: ['SubQ', 'IM'],
      tags: ['fertility'],
      profile: {
        dosingLow: { amount: '75', unit: 'IU', researchBenefits: 'Mild spermatogenesis stimulation', recommendedFrequency: 'Three times weekly' },
        dosingTypical: { amount: '150', unit: 'IU', researchBenefits: 'Standard fertility protocol for severe azoospermia recovery', recommendedFrequency: 'Three times weekly' },
        dosingHigh: { amount: '150', unit: 'IU', researchBenefits: 'Standard maximum induction protocol', recommendedFrequency: 'Alternate days' },
        sideEffects: 'Abdominal pain, local site reaction, ovarian hyperstimulation in female subjects. Safety Assessment: Well-tolerated. Risk of Ovarian Hyperstimulation Syndrome (OHSS) in females. In males, rare mild gynecomastia.',
        stackingNotes: 'Often combined with HCG for comprehensive LH + FSH fertility recovery protocols. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        citations: [
          {
            title: 'HMG and HCG combination therapy for male hypogonadotropic hypogonadism',
            doi: '10.1002/j.1939-4640.2005.tb02890.x',
            pmid: '15764047',
          },
        ],
      },
    },
    {
      name: 'LL-37',
      iupacName: null,
      synonyms: ['Cathelicidin antimicrobial peptide'],
      mechanismOfAction:
        'Endogenous antimicrobial peptide; disrupts microbial membranes, neutralizes lipopolysaccharides (LPS), and modulates immune cell chemotaxis for wound healing. Expected Timeline: Local wound healing acceleration in 5-10 days; immune response markers within 2 weeks.',
      administrationRoutes: ['SubQ', 'Topical'],
      tags: ['healing', 'immunity'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Local wound healing, general immune system priming', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '250', unit: 'mcg', researchBenefits: 'Broad-spectrum antimicrobial protection and tissue repair', recommendedFrequency: 'Once daily' },
        dosingHigh: { amount: '500', unit: 'mcg', researchBenefits: 'Acute intervention for systemic pathogen exposure research', recommendedFrequency: 'Once daily' },
        sideEffects: 'Injection site pain, risk of localized inflammatory reactions. Safety Assessment: Can cause significant stinging or burning at the injection site. Local inflammatory skin reactions are common.',
        stackingNotes: 'Pairs well with BPC-157 to target localized tissue infection and speed recovery. Storage: Reconstituted solution is stable refrigerated for 14 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 14,
        citations: [
          {
            title: 'The role of LL-37 in wound healing and immune response',
            doi: '10.1111/j.1600-0625.2008.00742.x',
            pmid: '18557934',
          },
        ],
      },
    },
    {
      name: 'Selank',
      iupacName: null,
      synonyms: ['Tuftsin analog'],
      mechanismOfAction:
        'Synthetic peptide analog of tuftsin; modulates the expression of monoamines, increases BDNF expression, and exhibits regulatory anxiolytic effects without sedation. Expected Timeline: Relieves acute anxiety within 30 minutes intranasally. Long-term cognitive stabilization in 2-4 weeks.',
      administrationRoutes: ['Intranasal', 'SubQ'],
      tags: ['cognitive', 'anxiolytic'],
      profile: {
        dosingLow: { amount: '250', unit: 'mcg', researchBenefits: 'Mild anxiety mitigation', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '500', unit: 'mcg', researchBenefits: 'Anxiety relief, cognitive stability, and mood enhancement', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '1000', unit: 'mcg', researchBenefits: 'Severe anxiety control, post-stress cognitive stabilization', recommendedFrequency: 'Twice daily' },
        sideEffects: 'Excellent tolerability profile. Rare local nasal discomfort. Safety Assessment: Non-sedating anxiolytic. High safety. Nasal irritation is rare.',
        stackingNotes: 'Often stacked with BPC-157 for gut-brain axis normalization. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
        citations: [
          {
            title: 'Selank heptapeptide reduces anxiety: clinical and animal studies',
            doi: '10.1007/s11055-007-0047-y',
            pmid: '18084478',
          },
        ],
      },
    },
    {
      name: 'Sermorelin',
      iupacName: null,
      synonyms: ['Geref', 'GRF 1-29'],
      mechanismOfAction:
        'GHRH fragment (1-29) secretagogue. Binds to GHRH receptors in the pituitary to stimulate pulsatile release of endogenous growth hormone. Expected Timeline: Improved sleep depth and REM latency in 7-14 days; fat loss and skin elasticity improvements in 8-12 weeks.',
      administrationRoutes: ['SubQ'],
      tags: ['longevity', 'recovery'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Anti-aging GHRH replacement support', recommendedFrequency: 'Nightly before sleep' },
        dosingTypical: { amount: '200', unit: 'mcg', researchBenefits: 'Pituitary support, fat metabolism optimization, muscle recovery', recommendedFrequency: 'Nightly before sleep' },
        dosingHigh: { amount: '300', unit: 'mcg', researchBenefits: 'Accelerated tissue recovery and energy expenditure', recommendedFrequency: 'Nightly before sleep' },
        sideEffects: 'Flushing, injection-site itching, transient dizziness. Safety Assessment: Facial flushing, injection-site itching, and temporary lightheadedness can occur immediately post-injection.',
        stackingNotes: 'Frequently stacked with Ipamorelin for synergistic pulsatile GH release. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        citations: [
          {
            title: 'Sermorelin (GRF 1-29) in aging: growth hormone secretagogue overview',
            doi: '10.2147/cia.s113',
            pmid: '18728706',
          },
        ],
      },
    },
    {
      name: 'Snap-8',
      iupacName: null,
      synonyms: ['Octapeptide-3', 'Anti-wrinkle octapeptide'],
      mechanismOfAction:
        'Elongation of Argireline (acetyl hexapeptide-3). Competes for a position in the SNARE complex, destabilizing muscle contraction to reduce deep expression wrinkles. Expected Timeline: Facial micro-muscle relaxation and fine line smoothing in 14-28 days.',
      administrationRoutes: ['Topical'],
      tags: ['skin'],
      profile: {
        dosingLow: { amount: '2.0', unit: 'mg', researchBenefits: 'Fine line prevention', recommendedFrequency: 'Twice daily' },
        dosingTypical: { amount: '5.0', unit: 'mg', researchBenefits: 'Expression wrinkle reduction around eyes and forehead', recommendedFrequency: 'Twice daily' },
        dosingHigh: { amount: '10.0', unit: 'mg', researchBenefits: 'Advanced deep-set facial line reduction', recommendedFrequency: 'Twice daily' },
        sideEffects: 'None significant topically. Localized dryness if over-applied. Safety Assessment: Extremely safe. Topical use only; may cause mild dryness or redness if over-applied on sensitive skin.',
        stackingNotes: 'Often stacked with Copper Peptide (GHK-Cu) for comprehensive anti-aging skin protocols. Storage: Reconstituted solution is stable refrigerated for 60 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 60,
        citations: [
          {
            title: 'Anti-wrinkle efficacy of a novel octapeptide (Snap-8) in cosmetics',
            doi: '10.1111/j.1468-2494.2009.00490.x',
            pmid: '19467066',
          },
        ],
      },
    },
    {
      name: 'HGH',
      iupacName: null,
      synonyms: ['Humatrope', 'Genotropin', 'Human Growth Hormone', 'Somatropin'],
      mechanismOfAction:
        'Binds to growth hormone receptors (GHR), stimulating JAK2/STAT5 pathway. Increases hepatic IGF-1 synthesis, promoting cellular mitosis and lipolysis. Expected Timeline: Improved sleep, recovery, and joint lubrication in 2-4 weeks; fat redistribution and lean tissue changes in 3 months.',
      administrationRoutes: ['SubQ', 'IM'],
      tags: ['longevity', 'recovery', 'metabolic'],
      profile: {
        dosingLow: { amount: '1.0', unit: 'IU', researchBenefits: 'Hormone replacement, cellular protection, skin tone improvement', recommendedFrequency: 'Daily' },
        dosingTypical: { amount: '2.0', unit: 'IU', researchBenefits: 'Body composition normalization, fat loss, tissue recovery', recommendedFrequency: 'Daily' },
        dosingHigh: { amount: '4.0', unit: 'IU', researchBenefits: 'Advanced sports medicine musculoskeletal recovery', recommendedFrequency: 'Daily' },
        sideEffects: 'Carpal tunnel syndrome, water retention, joint pain, elevated fasting glucose. Safety Assessment: Fluid retention, joint pain, carpal tunnel symptoms, and elevated fasting glucose. Regular glucose screening is recommended.',
        stackingNotes: 'Monitor blood glucose levels regularly. Can be combined with thyroid hormones (T3) or low-dose insulin in professional settings. Storage: Reconstituted solution is stable refrigerated for 28 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 28,
        citations: [
          {
            title: 'Growth hormone replacement therapy in adults: consensus guidelines',
            doi: '10.1210/jc.2011-1251',
            pmid: '21832115',
          },
        ],
      },
    },
    {
      name: 'Semax',
      iupacName: null,
      synonyms: ['ACTH 4-10 analog'],
      mechanismOfAction:
        'Synthetic heptapeptide ACTH(4-7) analog. Upregulates BDNF and NGF expression in the hippocampus, acts as a melanocortin receptor neuromodulator. Expected Timeline: Nootropic focus and alertness within 15-30 minutes intranasally; long-term cognitive improvement in 2-4 weeks.',
      administrationRoutes: ['Intranasal', 'SubQ'],
      tags: ['cognitive', 'longevity'],
      profile: {
        dosingLow: { amount: '100', unit: 'mcg', researchBenefits: 'Mild focus improvement and cognitive support', recommendedFrequency: 'Once daily' },
        dosingTypical: { amount: '300', unit: 'mcg', researchBenefits: 'Enhanced learning, focus, memory recall, and neuroprotection', recommendedFrequency: 'Once or twice daily' },
        dosingHigh: { amount: '900', unit: 'mcg', researchBenefits: 'Post-stroke rehabilitation or severe cognitive impairment support', recommendedFrequency: 'Three times daily' },
        sideEffects: 'Mild temporary hair loss (rare, linked to BDNF kinetics in predisposed subjects). Safety Assessment: Very safe. Non-stimulating, non-addictive. Rare reports of temporary mild hair loss.',
        stackingNotes: 'Often stacked with Selank to balance cognitive stimulation with anxiolytic relaxation. Storage: Reconstituted solution is stable refrigerated for 30 days; dry lyophilized powder is stable frozen (-20°C) for up to 2 years.',
        reconstitutedShelfLifeDays: 30,
        citations: [
          {
            title: 'Semax regulates BDNF and NGF expression in ischemic brain',
            doi: '10.1007/s10517-009-0714-3',
            pmid: '19707613',
          },
        ],
      },
    },
  ];

  for (const { profile, ...compoundData } of compounds) {
    const dataWithSlug = {
      ...compoundData,
      slug: nameToSlug(compoundData.name),
      // Store synonyms lowercase so case-insensitive synonym search works
      // (Prisma 'has' on string arrays is case-sensitive).
      synonyms: compoundData.synonyms.map((s) => s.toLowerCase()),
    };
    const compound = await prisma.compound.upsert({
      where: { name: compoundData.name },
      update: dataWithSlug,
      create: dataWithSlug,
    });

    if (profile) {
      const { citations, ...profileData } = profile;
      const upsertedProfile = await prisma.compoundProfile.upsert({
        where: { compoundId: compound.id },
        update: profileData,
        create: { compoundId: compound.id, ...profileData },
      });

      // Replace citations on each seed run to keep them in sync.
      await prisma.citation.deleteMany({ where: { profileId: upsertedProfile.id } });
      for (const citation of citations) {
        await prisma.citation.create({
          data: {
            profileId: upsertedProfile.id,
            title: citation.title,
            doi: citation.doi ?? null,
            pmid: citation.pmid ?? null,
            url: null,
          },
        });
      }
    }
  }

  // 1. Create default Power User
  const email = 'test@example.com';
  const password = 'Password123!';
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  const testUser = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      name: 'Test Power User',
      passwordHash,
      role: 'POWER_USER',
      status: 'ACTIVE',
    },
  });

  // 2. Fetch seeded compounds
  const bpc = await prisma.compound.findFirst({ where: { name: 'BPC-157' } });
  const tb500 = await prisma.compound.findFirst({ where: { name: 'TB-500' } });
  const tirz = await prisma.compound.findFirst({ where: { name: 'Tirzepatide' } });

  if (bpc && tb500 && tirz) {
    // 3. Upsert Vendor
    const vendor = await prisma.vendor.upsert({
      where: {
        id: '00000000-0000-0000-0000-000000000009',
      },
      update: {
        status: 'ACTIVE',
      },
      create: {
        id: '00000000-0000-0000-0000-000000000009',
        userId: testUser.id,
        name: 'Peptide Depot',
        telegramUsername: 'peptidedepot_bot',
        preferredCurrency: 'USD',
        status: 'ACTIVE',
      },
    });

    // 4. Upsert VendorProducts
    const products = [
      {
        id: '00000000-0000-0000-0000-000000000091',
        vendorId: vendor.id,
        compoundId: bpc.id,
        name: 'BPC-157 5mg vial',
        priceUsd: '35.00',
        inStock: true,
        form: 'LYOPHILIZED_POWDER',
        vialSizeMg: '5.0',
      },
      {
        id: '00000000-0000-0000-0000-000000000092',
        vendorId: vendor.id,
        compoundId: bpc.id,
        name: '10x BPC-157 10mg (10-pack)',
        priceUsd: '250.00',
        inStock: true,
        form: 'LYOPHILIZED_POWDER',
        vialSizeMg: '10.0',
      },
      {
        id: '00000000-0000-0000-0000-000000000093',
        vendorId: vendor.id,
        compoundId: tb500.id,
        name: 'TB-500 5mg vial',
        priceUsd: '45.00',
        inStock: true,
        form: 'LYOPHILIZED_POWDER',
        vialSizeMg: '5.0',
      },
      {
        id: '00000000-0000-0000-0000-000000000094',
        vendorId: vendor.id,
        compoundId: tirz.id,
        name: 'Tirzepatide 10mg vial',
        priceUsd: '80.00',
        inStock: true,
        form: 'LYOPHILIZED_POWDER',
        vialSizeMg: '10.0',
      },
    ];

    for (const p of products) {
      await prisma.vendorProduct.upsert({
        where: { id: p.id },
        update: p,
        create: p,
      });
    }

    // 5. Upsert active/reconstituted Vials
    // To calculate depletion correctly, let's create a vial of BPC-157 with low remaining Mg
    await prisma.vial.upsert({
      where: { id: '00000000-0000-0000-0000-000000000081' },
      update: {
        remainingMg: 1.2,
      },
      create: {
        id: '00000000-0000-0000-0000-000000000081',
        userId: testUser.id,
        compoundId: bpc.id,
        totalMg: 5.0,
        remainingMg: 1.2,
        bacWaterMl: 2.0,
        status: 'RECONSTITUTED',
        reconstitutedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
        expiresAt: new Date(Date.now() + 25 * 24 * 3600 * 1000),
      },
    });

    // TB-500 reconstituted vial
    await prisma.vial.upsert({
      where: { id: '00000000-0000-0000-0000-000000000082' },
      update: {
        remainingMg: 8.5,
      },
      create: {
        id: '00000000-0000-0000-0000-000000000082',
        userId: testUser.id,
        compoundId: tb500.id,
        totalMg: 10.0,
        remainingMg: 8.5,
        bacWaterMl: 2.0,
        status: 'RECONSTITUTED',
        reconstitutedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
        expiresAt: new Date(Date.now() + 28 * 24 * 3600 * 1000),
      },
    });

    // 6. Upsert active Protocols
    // BPC-157 Protocol: 250 mcg daily (depletes 0.25 mg per day)
    await prisma.protocol.upsert({
      where: { id: '00000000-0000-0000-0000-000000000071' },
      update: {
        status: 'ACTIVE',
      },
      create: {
        id: '00000000-0000-0000-0000-000000000071',
        userId: testUser.id,
        compoundId: bpc.id,
        dose: { amount: '250', unit: 'mcg' } as any,
        schedule: { frequency: 'Daily' } as any,
        administrationRoute: 'SUBCUTANEOUS',
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      },
    });

    // TB-500 Protocol: 2.5 mg EOD (depletes 1.25 mg per day on average)
    await prisma.protocol.upsert({
      where: { id: '00000000-0000-0000-0000-000000000072' },
      update: {
        status: 'ACTIVE',
      },
      create: {
        id: '00000000-0000-0000-0000-000000000072',
        userId: testUser.id,
        compoundId: tb500.id,
        dose: { amount: '2.5', unit: 'mg' } as any,
        schedule: { frequency: 'EOD' } as any,
        administrationRoute: 'SUBCUTANEOUS',
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      },
    });
  }

  console.log('Seed complete — 33 compounds and 1 test user seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
