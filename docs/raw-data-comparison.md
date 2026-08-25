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
| `rnFormsPayloadForAdditionalForms` | `expFormsPayloadForAdditionalForms` | Nested object + `questions` array |
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
| `aggregateLimit` | `rnaggregateLimit` vs `expaggregateLimit` | `match`, `mismatch`, `missing` |
| `perClaimLimit` | `rnperClaimLimit` vs `expperClaimLimit` | `match`, `mismatch`, `missing` |
| `retention` | `rnretention` vs `expretention` | `match`, `mismatch`, `missing` |

### Nested object comparison columns

Each nested leaf object gets its own column named after the object key (e.g. `professionalLiabilityMpl`).

| Value | Meaning |
|-------|---------|
| `match` | All comparable fields match |
| `missing` | Renewal (`rn*`) object or value is absent |
| *(blank)* | Expiring (`exp*`) object or value is absent (ignored) |
| `field1,field2,...` | Comma-separated list of mismatched field names |

#### Examples

**Coverages** — compare `rnCoverages.mpl.professionalLiabilityMpl` against `expCoverages.mpl.professionalLiabilityMpl` by field path (not array index):

```
professionalLiabilityMpl → mplAggLimit,mplEachClaimLimit
```

**Coverage default payload** — single column `coverageDefaultPayload`:

```
coverageDefaultPayload → dpClassCode,rdoPrimaryVsExcess
```

**Default forms** — match forms by `FormNumber`, one column per form:

```
form_0000004823 → FormTitle,OrderNumber
form_0000058749 → missing
```

**Forms payload** — columns for nested sections:

```
requesterDetail → productType
questions → agentCd,coverages
formsPayload → policyEffectiveDate,stateCdId
```

(`formsPayload` covers root-level scalar/object fields excluding `requesterDetail` and `questions`.)

## Comparison rules

1. **Missing objects:** Mark `missing` only when the renewal (`rn*`) object or field is absent. If the expiring (`exp*`) side is missing, leave the column blank (ignored).
2. **Path-based matching:** Nested objects are matched by field path (e.g. `mpl.professionalLiabilityMpl`), not by array index. Arrays of objects with identifiers (`FormNumber`, `code`) are indexed by that key before comparing.
3. **Type coercion:** Numeric strings and numbers are treated as equal (`"1000"` matches `1000`). Empty strings and `null`/`undefined` are normalized before comparison.
4. **Array fields within leaf objects:** Compared with normalized deep equality (sorted JSON for arrays of primitives/objects).

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
