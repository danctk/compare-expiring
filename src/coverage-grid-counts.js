const IDENTITY_FIELDS = [
  'number',
  'expPolId',
  'expPolOriginalQuoteSubId',
  'expName',
  'submissionType',
  'statusDescription',
  'expiringPolicyNumber',
  '_id',
  'originalQuoteSubId',
];

const GRID_FIELD_NAMES = new Set([
  'freeformgridunderlyingpolicies',
  'freeformgridunderlingpolicies',
]);

function isGridField(fieldName) {
  return GRID_FIELD_NAMES.has(String(fieldName).toLowerCase());
}

function collectGridCounts(coverages) {
  const counts = new Map();

  function walk(object, prefix) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
      return;
    }

    for (const [key, value] of Object.entries(object)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (isGridField(key) && Array.isArray(value)) {
        counts.set(prefix, value.length);
        continue;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        walk(value, path);
      }
    }
  }

  walk(coverages, '');
  return counts;
}

function escapeCsvValue(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function countRecord(record) {
  const row = {};
  for (const field of IDENTITY_FIELDS) {
    row[field] = record[field] ?? '';
  }

  const rnCounts = collectGridCounts(record.rnCoverages);
  for (const [path, count] of rnCounts) {
    row[`rn.${path}`] = count;
  }

  const expCounts = collectGridCounts(record.expCoverages);
  for (const [path, count] of expCounts) {
    row[`exp.${path}`] = count;
  }

  return row;
}

export function countCoverageGrids(records) {
  const rows = records.map(countRecord);
  const pathSet = new Set();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key.startsWith('rn.') || key.startsWith('exp.')) {
        pathSet.add(key.slice(key.indexOf('.') + 1));
      }
    }
  }

  const countColumns = [...pathSet]
    .sort((a, b) => a.localeCompare(b))
    .flatMap((path) => [`rn.${path}`, `exp.${path}`]);

  const columns = [...IDENTITY_FIELDS, ...countColumns];
  const lines = [columns.join(',')];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvValue(row[column] ?? '')).join(','));
  }

  return {
    columns,
    rows,
    csv: `${lines.join('\n')}\n`,
    totalRecords: records.length,
  };
}
