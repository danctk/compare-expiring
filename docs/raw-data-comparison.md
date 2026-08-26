# Raw Data Comparison Specification

Compare renewal (`rn*`) and expiring policy (`exp*`) fields within each record of `rawData.json`, producing a CSV report of matches and mismatches.

## Input

- **File:** `rawData.json` (array of submission records)
- **Note:** Each record contains both `rn*` (renewal) and `exp*` (expiring) sides from a prior merge.

## Field pairs to compare

| Renewal field | Expiring field | Comparison type |
|---------------|----------------|-----------------|
| `rnCoverageDefaultPayload` | `expCoverageDefaultPayload` | Nested object (flat leaf) |
| `rnCoverages` | `expCoverages` | Nested objects by path |
| `rnDefaultForms` | `expDefaultForms` | Array of objects, match by `FormNumber` |
| `rnFormsPayloadForAdditionalForms` | `expFormsPayloadForAdditionalForms` | Nested object (`requesterDetail` only) |
| `rnaggregateLimit` | `expaggregateLimit` | Scalar |
| `rnperClaimLimit` | `expperClaimLimit` | Scalar |
| `rnretention` | `expretention` | Scalar |

## Output CSV columns

### Identity columns (from each record)

| Column | Source field |
|--------|--------------|
| `submissionType` | `submissionType` |
| `statusDescription` | `statusDescription` |
| `number` | `number` |
| `expiringPolicyNumber` | `expiringPolicyNumber` |
| `originalQuoteSubId` | `originalQuoteSubId` |
| `_id` | `_id` |
| `expPolOriginalQuoteSubId` | `expPolOriginalQuoteSubId` |
| `expPolId` | `expPolId` |

### Scalar comparison columns

| Column | Compares | Values |
|--------|----------|--------|
| `aggregateLimit` | `rnaggregateLimit` vs `expaggregateLimit` | *(blank)*, `mismatch` |
| `perClaimLimit` | `rnperClaimLimit` vs `expperClaimLimit` | *(blank)*, `mismatch` |
| `retention` | `rnretention` vs `expretention` | *(blank)*, `mismatch` |

### Nested object comparison columns

Each nested leaf object gets its own column named after the object key (e.g. `professionalLiabilityMpl`).

| Value | Meaning |
|-------|---------|
| *(blank)* | Values match, renewal side missing, expiring side missing/blank, or ignored |
| `field1,field2,...` | Comma-separated list of mismatched field names |
| `mismatch` | Scalar fields differ (non-blank exp value) |

#### Examples

**Coverages** — compare `rnCoverages.mpl.professionalLiabilityMpl` against `expCoverages.mpl.professionalLiabilityMpl` by field path (not array index):

```
professionalLiabilityMpl → mplAggLimit,mplEachClaimLimit
```

**Coverage default payload** — single column `coverageDefaultPayload`:

```
coverageDefaultPayload → dpClassCode,rdoPrimaryVsExcess
```

**Default forms** — match forms by `FormNumber`, one column per form for top-level fields (excluding `formsFillin`):

```
form_0000004823 → FormTitle
```

**Form fill-ins** — each `formsFillin` item matched by normalized `fillin_xmltag` (`"12"` matches `12`):

```
form_0000005837.formsFillin.12 → fillin_caption
form_0000005837.formsFillin.11 → fillin_type.LITERAL,fillin_deftxt
```

(`fillin_xmltag` itself is not compared — it is the match key only.)

**Forms payload** — `requesterDetail` only (`formsPayload` root fields and `questions` are not compared):

```
requesterDetail → productType
```

## Comparison rules

1. **Missing objects:** Leave blank when the renewal (`rn*`) or expiring (`exp*`) object is absent. Only write values for actual mismatches.
2. **Blank exp fields:** If an `exp*` field exists but is blank (`""`, `null`, `undefined`, or empty array), do not flag it. Only flag when `exp*` has a non-blank value that differs from `rn*`.
3. **Ignored fields:** Skip fields that:
   - start with `is` (e.g. `isDefault`, `IsFormEditable`)
   - start with `flag` (e.g. `flagULIssueValidation`, `flagULQuoteValidation`)
   - end with `Range` (e.g. `erpMinRange`, `fieldRange`)
   - match these names (case-insensitive): `_id`, `OrderNumber`, `UserSortColumn`, `includeSpecimen`, `FormTypeName`, `idx`, `FormNameDisplay`, `additionalFormName`, `flagAdditionalForm`, `dgERP`, `ratePerMillion`, `txtRatePerMillion`, `txtRateOfUl`, `txtPremium`, `txtPolicyLimit`, `txtAggregateLimit`, `txtLayerLimit`, `txtRetention`, `txtNumAttachment`, `previousYearRatePerMillion`, `txtpreviousYearRatePerMillion`, `freeformGridSublimitArchNspl`, `txtNSPLArchLimit`
4. **Excluded records:** Skip records where `number` starts with `CAN`.
5. **Output values:** Cells are left blank when values match or when the renewal side is missing. Only actual mismatches are written.
6. **optionalSection arrays:** Compare each item individually under coverages, matched by `coverageCode` (then `moduleId`, then `coverageName`). Columns use the full path (e.g. `mpl.optionalSection.NPIFPL`).
7. **underlyingPolicies arrays:** Compare each item individually under coverages, matched by `layer` (then `srtPolicyNumberCov`, then `index`). Nested objects such as `carrier` are compared at their full path (e.g. `archExcess.underlyingPolicies.layer1.carrier`). Columns use the full path for tracking.
8. **Path-based matching:** Nested objects are matched by field path, not by array index. Arrays of objects with identifiers (`FormNumber`, `code`) are indexed by that key before comparing.
9. **Type coercion:** Numeric strings and numbers are treated as equal (`"1000"` matches `1000`). Boolean strings and booleans are treated as equal (`"false"` matches `false`). Empty strings and `null`/`undefined` are normalized before comparison.
10. **Array fields within leaf objects:** Compared with normalized deep equality (sorted JSON for arrays of primitives/objects).

## Usage

```bash
npm run compare:raw -- --input rawData.json --output comparison-results.csv
```

Or directly:

```bash
node scripts/compare-raw-data.js rawData.json comparison-results.csv
```

## Script location

- [`scripts/compare-raw-data.js`](../scripts/compare-raw-data.js) — CLI entry point
- [`src/raw-data-compare.js`](../src/raw-data-compare.js) — comparison logic
