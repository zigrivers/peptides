import { describe, it } from 'vitest';

/**
 * Story: US-REF-01 - View Compound Profile
 * Epic: Reference Pillar
 */
describe('US-REF-01: View Compound Profile', () => {
  // AC 1: Given I am on the dashboard, when I search for "BPC-157" and select it, then I see its IUPAC name...
  it.todo('AC-1: displays IUPAC name, mechanism, and routes for selected compound', () => {
    // Hint: check lib/reference/infrastructure/PrismaCompoundRepo
  });

  // AC 2: Every researched benefit must include a clickable PubMed/DOI link.
  it.todo('AC-2: ensures all benefit citations are valid DOI/PubMed links', () => {
    // Hint: check lib/reference/domain/Citation value object
  });

  // AC 3: Dosing ranges are displayed for low, typical, and high categories...
  it.todo('AC-3: displays low/typical/high dosing ranges with protocol context', () => {
    // Hint: check lib/reference/domain/Profile
  });

  // AC 4: If "Stacking Notes" exist, they are displayed prominently...
  it.todo('AC-4: displays curated stacking notes when available', () => {
    // Hint: assert visibility of "Commonly stacked with" text
  });

  // Negative Case: Missing Profile
  it.todo('Negative: handles compounds with missing profile data gracefully', () => {
    // Hint: assert empty state or loading error
  });
});

/**
 * Story: US-REF-02 - Search & Browse Catalog
 */
describe('US-REF-02: Search & Browse Catalog', () => {
  // AC 1: Given I am in the catalog, when I type "sema", then "Semaglutide" appears...
  it.todo('AC-1: filters catalog by name fragment', () => {
    // Hint: check lib/reference/application/SearchService
  });

  // AC 2: When I select the "Healing" category, only peptides tagged with healing... are shown.
  it.todo('AC-2: filters catalog by goal category', () => {
    // Hint: check category tagging in domain
  });
});
