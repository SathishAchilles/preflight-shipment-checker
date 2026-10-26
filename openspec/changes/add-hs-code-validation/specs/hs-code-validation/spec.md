# Spec Delta

## Purpose

Validates each item's HS code against a dated UK tariff snapshot, held in the project's Supabase database and bundled into the app as an export, deterministically, with no database or tariff API calls at runtime. It tells the seller whether the code meets rule R-01, whether it is a real HS subheading and UK commodity code, and how to fix it when it is not.

## ADDED Requirements

### Requirement: Validation from a bundled tariff snapshot
The system SHALL validate HS codes using only a tariff snapshot bundled with the app. It SHALL NOT call any tariff API during validation, and it SHALL give the same result for the same input and snapshot every time. The app itself is used online from its hosted link, so offline operation is not required.

#### Scenario: No tariff API calls
- **WHEN** a file is checked in the hosted app
- **THEN** the browser makes no request to any trade-tariff or data.api.trade.gov.uk address

#### Scenario: Repeat runs are identical
- **WHEN** the same Bookings and Items sheets are checked twice
- **THEN** every HS code result, hint and description is identical between the two runs

### Requirement: Tariff data is held in the project database
The system SHALL hold each loaded tariff snapshot (commodity rows and HMRC search references) in the `preflight` schema of the project's Supabase database, keyed by dataset version, with exactly one version marked current. The index bundled with the app SHALL be exported from the current version's database views, and the app SHALL NOT connect to the database at runtime.

#### Scenario: A load is all or nothing
- **WHEN** loading a new snapshot fails part-way (for example the CSV header has changed)
- **THEN** no rows of that version remain in the database and the previously current version is still current

#### Scenario: Export matches the database
- **WHEN** the index is exported from the current snapshot
- **THEN** its `meta.version` equals that snapshot's version, its `h6`, `cn8` and `l10` counts equal the counts of the corresponding database views, and exporting twice gives byte-identical files

#### Scenario: App works without the database
- **WHEN** the database cannot be reached from a developer machine
- **THEN** `node run.js`, `node verify.js`, `python3 build.py` and the deployed app still work from the committed `assets/hs_index.json`

#### Scenario: Database contents are not public
- **WHEN** the Supabase REST API is called with the publishable (anon) key for any `preflight` table
- **THEN** no tariff rows are returned

### Requirement: Each deployment is built from the database
The Vercel build SHALL load a new tariff version into the database only when the DBT dataset has published a version that is not yet loaded, SHALL then export the index from the database and build the page from that export. If the database cannot be reached or an export self-check fails, the build SHALL fail, unless stale data is explicitly allowed for that build.

#### Scenario: No new DBT version
- **WHEN** a deployment builds and the DBT `latest` version is already in `preflight.tariff_snapshot`
- **THEN** nothing is downloaded or loaded, the index is exported from the current snapshot, and the build log says the version was already present

#### Scenario: New DBT version published
- **WHEN** a deployment builds and DBT `latest` resolves to a version not yet loaded
- **THEN** that version is loaded and made current before the export, and the deployed page shows the new version in its snapshot stamp

#### Scenario: Database unreachable during a build
- **WHEN** the build cannot connect to the database and stale data is not allowed
- **THEN** the build fails and the previous deployment stays live

### Requirement: Snapshot provenance is visible
The system SHALL show the tariff snapshot's dataset version and snapshot date, together with an Open Government Licence attribution, wherever HS existence results are shown.

#### Scenario: Report shows the snapshot stamp
- **WHEN** a booking report is displayed
- **THEN** it states the snapshot version (e.g. `v4.0.1639`), its date (e.g. 26-10-2026), and that the tariff data is from the UK Department for Business and Trade under the Open Government Licence v3.0

### Requirement: HS code normalisation keeps leading zeros and never pads
The system SHALL treat an HS code as a string of digits. A whole-number cell becomes its integer digits. A text cell keeps its leading zeros. An "HS" or "commodity code" prefix, dots, spaces and dashes are removed before digits are counted, and letters are flagged. The system SHALL never add digits on the right of a short code.

#### Scenario: Number cell from a spreadsheet
- **WHEN** the HS code cell holds the number `691200` (read as `691200.0`)
- **THEN** the code is treated as `691200`

#### Scenario: Dotted text code
- **WHEN** the HS code cell holds the text `6912.00` or `6912 00`
- **THEN** the code is treated as `691200`

#### Scenario: Text code with a leading zero
- **WHEN** the HS code cell holds the text `090111`
- **THEN** the code is treated as `090111`, not `90111`

#### Scenario: Short code is not padded
- **WHEN** the HS code is `6912`
- **THEN** the code is treated as 4 digits and is not padded to `691200` or `6912000000`

### Requirement: R-01 digit rule is unchanged
The system SHALL fail R-01 (Red) when an item's HS code is blank, contains letters, or has fewer than 6 digits, and SHALL pass R-01 otherwise. Snapshot lookups SHALL NOT change the R-01 status.

#### Scenario: Blank code
- **WHEN** an item has no HS code
- **THEN** R-01 fails with severity Red

#### Scenario: Valid-length but non-existent code still passes R-01
- **WHEN** an item's HS code is `999999`
- **THEN** R-01 passes, and the existence check reports the problem separately

#### Scenario: 5-digit code stays Red even when a fix is known
- **WHEN** an item's HS code is the number `90111`
- **THEN** R-01 fails with severity Red, even though `090111` exists in the snapshot

### Requirement: Leading-zero recommendation for 5-digit number cells
When R-01 fails because a number cell has exactly 5 digits, the system SHALL look up `0` followed by those digits in the snapshot. If that HS subheading exists, the fix text SHALL name it with its description. Otherwise it SHALL give the generic leading-zero advice.

#### Scenario: Lost leading zero is recommended, not applied
- **WHEN** an item's HS code is the number `90111`
- **THEN** the R-01 fix text recommends `090111`, names it as coffee, not roasted, offers a "Use 090111" action and tells the seller to store the code as text

#### Scenario: No code to recommend
- **WHEN** an item's HS code is the number `99999` and `099999` is not in the snapshot
- **THEN** the R-01 fix text gives the leading-zero advice without naming a code

### Requirement: HS codes are never corrected automatically
The system SHALL validate every HS code exactly as entered. Normalisation may remove formatting only (a number cell's `.0`, dots, spaces, dashes, an "HS" or "commodity code" prefix) and SHALL NOT add, remove or change digits. Any corrected or suggested code SHALL be shown as a recommendation with an explicit "Use this code" action. It SHALL be written into the item only when the user takes that action, and the booking SHALL then be marked as edited and re-checked.

#### Scenario: Recommendation is not applied by itself
- **WHEN** an item's HS code is the number `90111` and `090111` is recommended
- **THEN** the item's HS code is still `90111`, R-01 still fails, and the form shows a "Use 090111" action

#### Scenario: User accepts a recommendation
- **WHEN** the user clicks "Use 090111" for that item
- **THEN** the item's HS code becomes the text `090111`, the booking is marked as edited, R-01 passes on re-check, and the original value is still visible in the edit history or uploaded file

#### Scenario: Chat needs a yes
- **WHEN** the chat recommends `610910` for a T-shirt with no code
- **THEN** the code is only recorded after the seller confirms it, for example by answering "yes" or typing the code

### Requirement: Leading-zero recommendation for 7 and 9 digit number cells
When an HS code comes from a number cell with exactly 7 or 9 digits (lengths no HS or UK code uses), the system SHALL still validate the digits as entered. When `0` plus those digits starts with an existing HS subheading, it SHALL add one Advisory for the item, which does not change the booking's status. The issue SHALL say the spreadsheet probably dropped a leading zero, name what the code reads as now, and recommend the zero-padded code with its description. Text cells SHALL NOT get this recommendation.

#### Scenario: 10-digit coffee code that lost its zero
- **WHEN** an item's HS code is the number `901110000` (from `0901110000`)
- **THEN** R-01 passes, the code is checked as `901110` (microscopes), the status is unchanged, and one Advisory says it reads as microscopes and recommends `0901110000` (coffee, not roasted) with a "Use 0901110000" action and the advice to store codes as text

#### Scenario: One Advisory, not two
- **WHEN** an item's HS code is the number `902400000` (`902400` is not an HS subheading; `0902400000` is black tea)
- **THEN** exactly one HS code Advisory is added for the item, combining "not in the UK tariff" with the recommendation of `0902400000`

#### Scenario: Text cells get no recommendation
- **WHEN** an item's HS code is the text `901110000`
- **THEN** no leading-zero recommendation is made and the digits are validated as given

### Requirement: Heading hint for 4-digit codes
When R-01 fails because the code has exactly 4 digits and that heading exists in the snapshot, the fix text SHALL name the heading's description. It SHALL name the single HS subheading if there is only one, or the number of subheadings if there are more.

#### Scenario: Heading with one subheading
- **WHEN** an item's HS code is `6912`
- **THEN** the R-01 fix text names heading 6912 (ceramic tableware … other than porcelain or china) and recommends `691200` with a "Use 691200" action, without changing the code

#### Scenario: Heading with several subheadings
- **WHEN** an item's HS code is `6115`
- **THEN** the R-01 fix text names heading 6115 and says it has 9 subheadings to choose from, without picking one

#### Scenario: Heading not in the tariff
- **WHEN** an item's HS code is `9999`
- **THEN** the R-01 fix text says the heading does not exist in the UK tariff

### Requirement: HS subheading existence check
For every item that passes R-01, the system SHALL check that the code's first 6 digits are an HS subheading that has at least one current, declarable UK commodity code in the snapshot. If not, it SHALL add an Advisory naming the item and code. The Advisory SHALL NOT change the booking's status, because the fixed rulebook tests only the digit count.

#### Scenario: Existing subheading
- **WHEN** an item's HS code is `691200`, `090111`, `850760`, `330300` or `610910`
- **THEN** no existence issue is raised

#### Scenario: Non-existent code
- **WHEN** an item's HS code is `999999`
- **THEN** an Advisory says `999999` is not an HS subheading in the UK tariff snapshot, and the booking status is the same as it would be without the check

#### Scenario: Heading-level 6-digit code that is not a subheading
- **WHEN** an item's HS code is `850700` (heading 8507 exists but is split into subheadings)
- **THEN** an Advisory is added saying that heading 8507 has 7 subheadings to choose from

#### Scenario: Several items, one bad
- **WHEN** a booking has items coded `691200` and `999999`
- **THEN** exactly one existence Advisory is added, naming only the `999999` item

### Requirement: UK commodity code check for 8 and 10 digit codes
For an item whose code, as entered, has 8 or 10 digits and whose HS subheading exists, the system SHALL check that the full code is a current, declarable UK commodity code (10 digits) or the start of one (8 digits). If not, it SHALL add an Advisory that does not change the booking status. Codes with more than 10 digits are not checked at full length.

#### Scenario: Valid UK 10-digit code
- **WHEN** an item's HS code is `6912002310`
- **THEN** no advisory about the full code is added

#### Scenario: Valid HS subheading but unknown UK code
- **WHEN** an item's HS code is `6912001000`
- **THEN** R-01 passes, no existence issue is raised, and an Advisory says the first 6 digits (`691200`) are valid but `6912001000` is not a current UK commodity code

#### Scenario: Over-long code keeps its single advisory
- **WHEN** an item's HS code has 12 digits, e.g. `691200100099`
- **THEN** the existing "at most 10 digits" advisory is the only HS advisory for that item

### Requirement: Valid codes are named
For every item whose HS subheading exists, the system SHALL show the subheading's description from the snapshot (heading description plus the path below it, HTML removed) next to the code in the report's item table.

#### Scenario: Description shown for a valid code
- **WHEN** an item's HS code is `610910`
- **THEN** the item table shows `610910` with "T-shirts, singlets and other vests, knitted or crocheted > Of cotton"

#### Scenario: No description for an invalid code
- **WHEN** an item's HS code is `999999`
- **THEN** the item table shows the code as not found, with no description
