const IDENTITY_FIELDS = [
  'submissionType',
  'statusDescription',
  'number',
  'expiringPolicyNumber',
  'originalQuoteSubId',
  '_id',
  'expPolOriginalQuoteSubId',
  'expPolId',
];

const SCALAR_PAIRS = [
  { column: 'aggregateLimit', rn: 'rnaggregateLimit', exp: 'expaggregateLimit' },
  { column: 'perClaimLimit', rn: 'rnperClaimLimit', exp: 'expperClaimLimit' },
  { column: 'retention', rn: 'rnretention', exp: 'expretention' },
];

function normalizePrimitive(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }

  return value;
}

function stableStringify(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  const normalized = normalizePrimitive(value);
  if (normalized !== value && (typeof value === 'string' || value === null || value === undefined)) {
    return JSON.stringify(normalized);
  }

  if (Array.isArray(value)) {
    const normalizedItems = value.map((item) => {
      if (item !== null && typeof item === 'object') {
        return stableStringify(item);
      }
      return JSON.stringify(normalizePrimitive(item));
    });
    return `[${normalizedItems.sort().join(',')}]`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(normalizePrimitive(value));
}

function valuesMatch(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function compareDirectFields(rnObj, expObj) {
  if (rnObj == null) {
    return 'missing';
  }
  if (expObj == null) {
    return '';
  }
  if (typeof rnObj !== 'object' || typeof expObj !== 'object' || Array.isArray(rnObj) || Array.isArray(expObj)) {
    return valuesMatch(rnObj, expObj) ? 'match' : 'mismatch';
  }

  const isNestedObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const keys = Object.keys(rnObj).filter((key) => !isNestedObject(rnObj[key]));
  const mismatches = [];

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(expObj, key)) {
      continue;
    }
    if (!valuesMatch(rnObj[key], expObj[key])) {
      mismatches.push(key);
    }
  }

  if (mismatches.length === 0) {
    return 'match';
  }

  return mismatches.sort().join(',');
}

function compareLeafObjects(rnObj, expObj) {
  return compareDirectFields(rnObj, expObj);
}

function hasDirectFields(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    return false;
  }

  return Object.values(object).some(
    (entry) => entry === null || typeof entry !== 'object' || Array.isArray(entry),
  );
}

function findCaseInsensitiveKey(object, key) {
  if (!object || typeof object !== 'object') {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(object, key)) {
    return key;
  }

  const lowerKey = key.toLowerCase();
  return Object.keys(object).find((candidate) => candidate.toLowerCase() === lowerKey);
}

function getAtPath(object, pathSegments) {
  let current = object;
  for (const segment of pathSegments) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    const key = findCaseInsensitiveKey(current, segment);
    if (!key) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function compareNestedTrees(rnRoot, expRoot) {
  const rnNodes = collectComparableObjects(rnRoot);
  const results = new Map();

  for (const node of rnNodes) {
    const pathSegments = node.path.split('.').filter(Boolean);
    const expValue = expRoot == null ? undefined : getAtPath(expRoot, pathSegments);
    results.set(node.column, compareDirectFields(node.object, expValue));
  }

  return results;
}
function collectComparableObjects(object, prefix = '') {
  const results = [];

  if (object == null || typeof object !== 'object' || Array.isArray(object)) {
    return results;
  }

  if (hasDirectFields(object)) {
    results.push({ path: prefix, column: prefix.split('.').pop() || prefix, object });
  }

  for (const [key, value] of Object.entries(object)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      results.push(...collectComparableObjects(value, path));
    }
  }

  return results;
}

function indexArrayByKey(array, keyName) {
  const map = new Map();
  if (!Array.isArray(array)) {
    return map;
  }

  for (const item of array) {
    if (item && typeof item === 'object' && item[keyName] != null && String(item[keyName]).trim() !== '') {
      map.set(String(item[keyName]), item);
    }
  }

  return map;
}

function compareDefaultForms(rnForms, expForms) {
  const results = new Map();
  const rnByNumber = indexArrayByKey(rnForms, 'FormNumber');
  const expByNumber = indexArrayByKey(expForms, 'FormNumber');

  for (const formNumber of rnByNumber.keys()) {
    const column = `form_${formNumber}`;
    results.set(column, compareLeafObjects(rnByNumber.get(formNumber), expByNumber.get(formNumber)));
  }

  return results;
}

function compareQuestions(rnQuestions, expQuestions) {
  const rnByCode = indexArrayByKey(rnQuestions, 'code');
  const expByCode = indexArrayByKey(expQuestions, 'code');

  if (rnByCode.size === 0) {
    return 'missing';
  }
  if (expByCode.size === 0) {
    return '';
  }

  const mismatches = [];

  for (const code of rnByCode.keys()) {
    const rnItem = rnByCode.get(code);
    const expItem = expByCode.get(code);

    if (expItem == null) {
      continue;
    }

    if (!valuesMatch(rnItem.answer, expItem.answer)) {
      mismatches.push(code);
    }
  }

  if (mismatches.length === 0) {
    return 'match';
  }

  return mismatches.sort().join(',');
}

function compareFormsPayload(rnPayload, expPayload) {
  const results = new Map();

  if (rnPayload == null) {
    results.set('requesterDetail', 'missing');
    results.set('questions', 'missing');
    results.set('formsPayload', 'missing');
    return results;
  }

  if (expPayload == null) {
    results.set('requesterDetail', '');
    results.set('questions', '');
    results.set('formsPayload', '');
    return results;
  }

  results.set(
    'requesterDetail',
    compareLeafObjects(rnPayload.requesterDetail, expPayload.requesterDetail),
  );
  results.set('questions', compareQuestions(rnPayload.questions, expPayload.questions));

  const rnRoot = { ...rnPayload };
  const expRoot = { ...expPayload };

  delete rnRoot.requesterDetail;
  delete rnRoot.questions;
  delete expRoot.requesterDetail;
  delete expRoot.questions;

  results.set('formsPayload', compareLeafObjects(rnRoot, expRoot));
  return results;
}

function compareScalar(rnValue, expValue) {
  if (rnValue == null) {
    return 'missing';
  }
  if (expValue == null) {
    return '';
  }
  return valuesMatch(rnValue, expValue) ? 'match' : 'mismatch';
}

function compareRecord(record) {
  const row = {};

  for (const field of IDENTITY_FIELDS) {
    row[field] = record[field] ?? '';
  }

  for (const pair of SCALAR_PAIRS) {
    row[pair.column] = compareScalar(record[pair.rn], record[pair.exp]);
  }

  const coverageDefault = compareLeafObjects(
    record.rnCoverageDefaultPayload,
    record.expCoverageDefaultPayload,
  );
  row.coverageDefaultPayload = coverageDefault;

  const coverageColumns = compareNestedTrees(record.rnCoverages, record.expCoverages);
  for (const [column, value] of coverageColumns) {
    row[column] = value;
  }

  const formColumns = compareDefaultForms(record.rnDefaultForms, record.expDefaultForms);
  for (const [column, value] of formColumns) {
    row[column] = value;
  }

  const formsPayloadColumns = compareFormsPayload(
    record.rnFormsPayloadForAdditionalForms,
    record.expFormsPayloadForAdditionalForms,
  );
  for (const [column, value] of formsPayloadColumns) {
    row[column] = value;
  }

  return row;
}

function escapeCsvValue(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function compareRecords(records) {
  const rows = records.map(compareRecord);
  const columnSet = new Set(IDENTITY_FIELDS);

  for (const pair of SCALAR_PAIRS) {
    columnSet.add(pair.column);
  }

  columnSet.add('coverageDefaultPayload');
  columnSet.add('requesterDetail');
  columnSet.add('questions');
  columnSet.add('formsPayload');

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columnSet.add(key);
    }
  }

  const staticColumns = [
    ...IDENTITY_FIELDS,
    ...SCALAR_PAIRS.map((pair) => pair.column),
    'coverageDefaultPayload',
    'requesterDetail',
    'questions',
    'formsPayload',
  ];

  const dynamicColumns = [...columnSet]
    .filter((column) => !staticColumns.includes(column))
    .sort((a, b) => a.localeCompare(b));

  const columns = [...staticColumns, ...dynamicColumns];

  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvValue(row[column] ?? '')).join(','));
  }

  return {
    columns,
    rows,
    csv: `${lines.join('\n')}\n`,
  };
}
