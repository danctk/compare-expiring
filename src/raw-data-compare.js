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
  { column: 'name', rn: 'rnName', exp: 'expName' },
  { column: 'aggregateLimit', rn: 'rnaggregateLimit', exp: 'expaggregateLimit' },
  { column: 'perClaimLimit', rn: 'rnperClaimLimit', exp: 'expperClaimLimit' },
  { column: 'retention', rn: 'rnretention', exp: 'expretention' },
];

const SKIPPED_ARRAY_FIELD_NAMES = new Set(['optionalsection', 'underlyingpolicies']);

function normalizePrimitive(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }

    const lower = trimmed.toLowerCase();
    if (lower === 'true') {
      return true;
    }
    if (lower === 'false') {
      return false;
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }

  return value;
}

function stringifyForCompare(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  const normalized = normalizePrimitive(value);
  if (normalized !== value || typeof normalized !== 'object') {
    return JSON.stringify(normalized);
  }

  return stableStringify(value);
}

function isBlankValue(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  return false;
}

const IGNORED_FIELD_NAMES = new Set([
  '_id',
  'ordernumber',
  'usersortcolumn',
  'includespecimen',
  'formtypename',
  'idx',
  'formdisplayname',
  'formnamedisplay',
  'additionalformname',
  'flagadditionalform',
  'dgerp',
  'ratepermillion',
  'rateoful',
  'agentcode',
  'insuredclass',
  'txtratepermillion',
  'txtrateoful',
  'txtpremium',
  'txtpolicylimit',
  'txtaggregatelimit',
  'txtlayerlimit',
  'txtlayer',
  'txtretention',
  'txtnumattachment',
  'originallayer',
  'ulvalid',
  'ulindex',
  'varlayer',
  'previousyearratepermillion',
  'txtpreviousyearratepermillion',
  'freeformgridsublimitarchnspl',
  'txtnsplarchlimit',
]);

const IGNORED_COVERAGE_PATHS = new Set([
  'archtechserprof.coverage',
]);

function isIgnoredField(fieldName) {
  const lower = fieldName.toLowerCase();
  return (
    lower.startsWith('is')
    || lower.startsWith('flag')
    || lower.endsWith('range')
    || IGNORED_FIELD_NAMES.has(lower)
  );
}

function isIgnoredCoveragePath(path) {
  if (!path) {
    return false;
  }
  return IGNORED_COVERAGE_PATHS.has(String(path).toLowerCase());
}

function normalizeResult(result) {
  if (!result || result === 'match' || result === 'missing') {
    return '';
  }
  return result;
}

function normalizeSubmissionNumber(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function parseIgnoreList(text) {
  const numbers = new Set();

  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const value = normalizeSubmissionNumber(trimmed.split('#')[0]);
    if (value) {
      numbers.add(value);
    }
  }

  return numbers;
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
  return stringifyForCompare(a) === stringifyForCompare(b);
}

function compareDirectFields(rnObj, expObj, prefix = '') {
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
  const keys = Object.keys(rnObj).filter(
    (key) =>
      !isNestedObject(rnObj[key])
      && !isIgnoredField(key)
      && !SKIPPED_ARRAY_FIELD_NAMES.has(key.toLowerCase())
      && !isIgnoredCoveragePath(prefix ? `${prefix}.${key}` : key),
  );
  const mismatches = [];

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(expObj, key) || isBlankValue(expObj[key])) {
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

function compareNestedObject(rnObj, expObj) {
  if (rnObj == null) {
    return 'missing';
  }
  if (expObj == null) {
    return '';
  }

  const mismatches = compareObjectFieldPaths(rnObj, expObj);
  return mismatches.length === 0 ? 'match' : mismatches.sort().join(',');
}

function hasDirectFields(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    return false;
  }

  return Object.entries(object).some(([key, entry]) => {
    if (SKIPPED_ARRAY_FIELD_NAMES.has(key.toLowerCase())) {
      return false;
    }
    return entry === null || typeof entry !== 'object' || Array.isArray(entry);
  });
}

function columnNameForPath(path, useFullPath) {
  if (useFullPath && path) {
    return path;
  }
  return path.split('.').pop() || path;
}

function getOptionalSectionKey(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }
  if (item.coverageCode != null && String(item.coverageCode).trim() !== '') {
    return String(item.coverageCode);
  }
  if (item.moduleId != null && String(item.moduleId).trim() !== '') {
    return String(item.moduleId);
  }
  if (item.coverageName != null && String(item.coverageName).trim() !== '') {
    return String(item.coverageName);
  }
  return null;
}

function getUnderlyingPolicyKey(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }
  if (item.layer != null && String(item.layer).trim() !== '') {
    return `layer${item.layer}`;
  }
  if (item.srtPolicyNumberCov != null && String(item.srtPolicyNumberCov).trim() !== '') {
    return String(item.srtPolicyNumberCov).replace(/[^\w.-]+/g, '_');
  }
  if (item.index != null && String(item.index).trim() !== '') {
    return `index${item.index}`;
  }
  return null;
}

function findArrayItem(array, arrayKey, matchKey) {
  if (!Array.isArray(array)) {
    return undefined;
  }

  if (arrayKey === 'optionalsection') {
    return array.find((item) => getOptionalSectionKey(item) === matchKey);
  }

  if (arrayKey === 'underlyingpolicies') {
    if (matchKey.startsWith('layer')) {
      const layer = matchKey.slice(5);
      return array.find((item) => String(item.layer) === layer);
    }
    if (matchKey.startsWith('index')) {
      const index = matchKey.slice(5);
      return array.find((item) => String(item.index) === index);
    }
    return array.find(
      (item) => String(item.srtPolicyNumberCov ?? '').replace(/[^\w.-]+/g, '_') === matchKey,
    );
  }

  return undefined;
}

function getArrayItemKey(arrayKey, item) {
  if (arrayKey === 'optionalsection') {
    return getOptionalSectionKey(item);
  }
  if (arrayKey === 'underlyingpolicies') {
    return getUnderlyingPolicyKey(item);
  }
  return null;
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

  for (let index = 0; index < pathSegments.length; index += 1) {
    const segment = pathSegments[index];
    if (current == null || typeof current !== 'object') {
      return undefined;
    }

    const key = findCaseInsensitiveKey(current, segment);
    if (!key) {
      return undefined;
    }

    current = current[key];
    const arrayKey = key.toLowerCase();
    if (
      Array.isArray(current)
      && SKIPPED_ARRAY_FIELD_NAMES.has(arrayKey)
      && index + 1 < pathSegments.length
    ) {
      const matchKey = pathSegments[index + 1];
      current = findArrayItem(current, arrayKey, matchKey);
      index += 1;
    }
  }

  return current;
}

function compareNestedTrees(rnRoot, expRoot) {
  const rnNodes = collectComparableObjects(rnRoot);
  const results = new Map();

  for (const node of rnNodes) {
    const pathSegments = node.path.split('.').filter(Boolean);
    const expValue = expRoot == null ? undefined : getAtPath(expRoot, pathSegments);
    results.set(node.column, compareDirectFields(node.object, expValue, node.path));
  }

  return results;
}
function collectComparableObjects(object, prefix = '', useFullPath = false) {
  const results = [];

  if (object == null || typeof object !== 'object' || Array.isArray(object)) {
    return results;
  }

  if (hasDirectFields(object) && !isIgnoredCoveragePath(prefix)) {
    results.push({
      path: prefix,
      column: columnNameForPath(prefix, useFullPath),
      object,
    });
  }

  for (const [key, value] of Object.entries(object)) {
    const arrayKey = key.toLowerCase();
    if (Array.isArray(value) && SKIPPED_ARRAY_FIELD_NAMES.has(arrayKey)) {
      for (const item of value) {
        const matchKey = getArrayItemKey(arrayKey, item);
        if (!matchKey || !item || typeof item !== 'object') {
          continue;
        }
        const path = prefix ? `${prefix}.${key}.${matchKey}` : `${key}.${matchKey}`;
        if (isIgnoredCoveragePath(path)) {
          continue;
        }
        results.push({
          path,
          column: path,
          object: item,
        });
        results.push(...collectComparableObjects(item, path, true));
      }
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (isIgnoredCoveragePath(path)) {
        continue;
      }
      results.push(...collectComparableObjects(value, path, useFullPath));
    }
  }

  return results;
}

function indexArrayByKey(array, keyName, keyNormalizer = (value) => String(value)) {
  const map = new Map();
  if (!Array.isArray(array)) {
    return map;
  }

  for (const item of array) {
    if (item && typeof item === 'object' && item[keyName] != null && String(item[keyName]).trim() !== '') {
      map.set(keyNormalizer(item[keyName]), item);
    }
  }

  return map;
}

function normalizeFormsFillinArray(formsFillin) {
  if (Array.isArray(formsFillin)) {
    return formsFillin;
  }
  if (formsFillin && typeof formsFillin === 'object') {
    return [formsFillin];
  }
  return [];
}

function getFillinXmlTagKey(item) {
  if (!item || item.fillin_xmltag == null || String(item.fillin_xmltag).trim() === '') {
    return null;
  }
  return String(normalizePrimitive(item.fillin_xmltag));
}

function isPlainNestedObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compareObjectFieldPaths(rnObj, expObj, prefix = '') {
  if (rnObj == null || expObj == null) {
    return [];
  }

  const mismatches = [];

  for (const key of Object.keys(rnObj)) {
    if (isIgnoredField(key) || key.toLowerCase() === 'fillin_xmltag') {
      continue;
    }

    const path = prefix ? `${prefix}.${key}` : key;
    const rnValue = rnObj[key];
    const expHasKey = Object.prototype.hasOwnProperty.call(expObj, key);
    const expValue = expObj[key];

    if (isPlainNestedObject(rnValue)) {
      if (!expHasKey || isBlankValue(expValue)) {
        continue;
      }
      if (isPlainNestedObject(expValue)) {
        mismatches.push(...compareObjectFieldPaths(rnValue, expValue, path));
      } else if (!valuesMatch(rnValue, expValue)) {
        mismatches.push(path);
      }
      continue;
    }

    if (!expHasKey || isBlankValue(expValue)) {
      continue;
    }
    if (!valuesMatch(rnValue, expValue)) {
      mismatches.push(path);
    }
  }

  return mismatches;
}

function compareFormsFillin(rnFillin, expFillin, formPrefix) {
  const results = new Map();
  const rnItems = normalizeFormsFillinArray(rnFillin);
  const expItems = normalizeFormsFillinArray(expFillin);
  const expByTag = new Map();
  for (const item of expItems) {
    const tag = getFillinXmlTagKey(item);
    if (tag) {
      expByTag.set(tag, item);
    }
  }

  for (const rnItem of rnItems) {
    const tag = getFillinXmlTagKey(rnItem);
    if (!tag) {
      continue;
    }

    const column = `${formPrefix}.formsFillin.${tag}`;
    const expItem = expByTag.get(tag);
    if (!expItem) {
      results.set(column, '');
      continue;
    }

    const mismatches = compareObjectFieldPaths(rnItem, expItem);
    results.set(column, mismatches.length === 0 ? 'match' : mismatches.sort().join(','));
  }

  return results;
}

function compareDefaultForms(rnForms, expForms) {
  const results = new Map();
  const rnByNumber = indexArrayByKey(rnForms, 'FormNumber');
  const expByNumber = indexArrayByKey(expForms, 'FormNumber');

  for (const formNumber of rnByNumber.keys()) {
    const formPrefix = `form_${formNumber}`;
    const rnForm = rnByNumber.get(formNumber);
    const expForm = expByNumber.get(formNumber);

    const rnWithoutFillin = { ...rnForm };
    const expWithoutFillin = expForm ? { ...expForm } : null;
    delete rnWithoutFillin.formsFillin;
    if (expWithoutFillin) {
      delete expWithoutFillin.formsFillin;
    }

    results.set(formPrefix, compareLeafObjects(rnWithoutFillin, expWithoutFillin));

    for (const [column, value] of compareFormsFillin(rnForm?.formsFillin, expForm?.formsFillin, formPrefix)) {
      results.set(column, value);
    }
  }

  return results;
}

function compareFormsPayload(rnPayload, expPayload) {
  const results = new Map();

  if (rnPayload == null) {
    results.set('requesterDetail', 'missing');
    return results;
  }

  if (expPayload == null) {
    results.set('requesterDetail', '');
    return results;
  }

  results.set(
    'requesterDetail',
    compareLeafObjects(rnPayload.requesterDetail, expPayload.requesterDetail),
  );

  return results;
}

function compareScalar(rnValue, expValue) {
  if (rnValue == null) {
    return 'missing';
  }
  if (isBlankValue(expValue)) {
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

  row.InsuredAddressDetails = compareNestedObject(
    record.rnInsuredAddressDetails,
    record.expInsuredAddressDetails,
  );

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

  for (const key of Object.keys(row)) {
    if (!IDENTITY_FIELDS.includes(key)) {
      row[key] = normalizeResult(row[key]);
    }
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

export function compareRecords(records, options = {}) {
  const ignoredNumbers = options.ignoredNumbers instanceof Set
    ? options.ignoredNumbers
    : parseIgnoreList(options.ignoreListText ?? '');

  const includedRecords = [];
  let excludedCanRecords = 0;
  let ignoredListRecords = 0;

  for (const record of records) {
    const number = String(record.number ?? '').trim();
    if (number.startsWith('CAN')) {
      excludedCanRecords += 1;
      continue;
    }
    if (ignoredNumbers.has(normalizeSubmissionNumber(number))) {
      ignoredListRecords += 1;
      continue;
    }
    includedRecords.push(record);
  }

  const rows = includedRecords.map(compareRecord);
  const columnSet = new Set(IDENTITY_FIELDS);

  for (const pair of SCALAR_PAIRS) {
    columnSet.add(pair.column);
  }

  columnSet.add('InsuredAddressDetails');
  columnSet.add('coverageDefaultPayload');
  columnSet.add('requesterDetail');

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columnSet.add(key);
    }
  }

  const staticColumns = [
    ...IDENTITY_FIELDS,
    'name',
    'InsuredAddressDetails',
    ...SCALAR_PAIRS.filter((pair) => pair.column !== 'name').map((pair) => pair.column),
    'coverageDefaultPayload',
    'requesterDetail',
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
    totalRecords: records.length,
    includedRecords: includedRecords.length,
    excludedRecords: records.length - includedRecords.length,
    excludedCanRecords,
    ignoredListRecords,
  };
}
