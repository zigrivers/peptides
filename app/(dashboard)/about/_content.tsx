export interface AboutSection {
  heading: string;
  /** Paragraphs and/or bullet lists, rendered in order. */
  body: Array<{ kind: 'p'; text: string } | { kind: 'ul'; items: string[] }>;
}

export const ABOUT_SECTIONS: AboutSection[] = [
  {
    heading: 'What this app is (and isn\'t)',
    body: [
      { kind: 'p', text: 'This is a personal operations tool for tracking, calculating, and researching peptides — for people who have already decided to use them and want to do it carefully. It is informational only.' },
      { kind: 'p', text: 'Nothing here is medical advice, a prescription, or a recommendation to take any compound. Doses, protocols, and research shown are reported from studies and community sources for your information; you are responsible for your own decisions. If you have a medical condition or take other medications, talk to a qualified clinician.' },
    ],
  },
  {
    heading: 'The FDA’s stance on peptides',
    body: [
      { kind: 'p', text: 'Most research peptides are not FDA-approved drugs. A small number of specific formulations are; the large majority are sold as “research chemicals,” compounded, or grey-market, and are not approved for the uses people commonly pursue.' },
      { kind: 'p', text: '“Not FDA-approved” does not by itself mean “unsafe” or “illegal to possess” — it means the FDA has not reviewed and approved that compound for that use, so quality, dosing, and safety are not guaranteed by any regulator. This app is honest about that reality rather than hiding behind “research use only” language: it shows what the sources say, labels regulatory status plainly, and leaves the decision to you.' },
    ],
  },
  {
    heading: 'How to read the labels in this app',
    body: [
      { kind: 'ul', items: [
        '“Unverified — not medical advice”: all AI-assisted research output is unverified and informational.',
        '“Not FDA-approved” / regulatory notes: factual status from sources, not a safety judgment.',
        '“Dose figures are reported from studies and protocols for informational purposes only — not dosing advice”: any numbers shown describe what research or community protocols report, not what you should take.',
        'Dosing entries are tagged “clinical” (trials/peer-reviewed) or “community / non-clinical” (forum/vendor protocols) so you can weigh how much to trust them.',
      ] },
    ],
  },
];
