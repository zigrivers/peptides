# Reference Domain

The Reference Domain manages the static knowledge base of compounds, their physiological profiles, and the vendor product catalog.

## Ubiquitous Language
- **Compound**: A biological substance (peptide) with defined mechanism and safety data.
- **Profile**: Detailed research-backed data associated with a compound.
- **Catalog**: A searchable collection of compounds available to the user.

## Entities

### Compound (Aggregate Root)
A peptide or biological substance.
- **Attributes**:
  - `id`: UUID
  - `name`: string (e.g., "BPC-157")
  - `iupacName`: string (optional)
  - `synonyms`: string[]
  - `mechanismOfAction`: text
  - `administrationRoutes`: enum[] (SC, IM, Oral, Nasal)
  - `status`: enum (Draft, Published, Archived)
  - `archivedAt`: timestamp (optional)

### Profile (Entity)
Detailed research data for a Compound.
- **Attributes**:
  - `id`: UUID
  - `compoundId`: UUID (FK)
  - `dosingLow`: DoseAmount
  - `dosingTypical`: DoseAmount
  - `dosingHigh`: DoseAmount
  - `sideEffects`: text
  - `contraindications`: text
  - `stackingNotes`: text (curated)
  - `citations`: Citation[] (Value Objects)

## Value Objects

### Citation
A research reference.
- **Attributes**:
  - `title`: string
  - `url`: string (URL)
  - `doi`: string (optional)
  - `pmid`: string (optional)
- **Invariants**:
  - Must have either a URL, DOI, or PMID.

## Aggregate: Compound Catalog
- **Consistency Boundary**: A Compound and its Profile must be consistent.
- **Root**: Compound
- **Invariants**:
  - A published Compound must have at least one administration route.
  - A Compound name must be unique within the catalog.

## Domain Events
- `CompoundCreated`: Triggered when a new compound is added.
- `CompoundProfileUpdated`: Triggered when mechanism or dosing data changes.
- `CompoundArchived`: Triggered when a compound is soft-deleted.

## Invariants
- `compound.name.length > 0`
- `count(compound.administrationRoutes) > 0` if `status == Published`
