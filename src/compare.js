import { JSONPath } from 'jsonpath-plus';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveRecords(data, path) {
  const results = JSONPath({ path, json: data, wrap: false });

  if (results === undefined || results === null) {
    throw new Error(`Path not found: ${path}`);
  }

  const records = Array.isArray(results) ? results : [results];

  if (records.length === 0) {
    throw new Error(`No records found at path: ${path}`);
  }

  if (!records.every(isPlainObject)) {
    throw new Error(`Path must resolve to an array of objects: ${path}`);
  }

  return records;
}

function allKeys(records) {
  const keys = new Set();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      keys.add(key);
    }
  }
  return [...keys].sort();
}

function pickKeys(record, keys) {
  const picked = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      picked[key] = record[key];
    }
  }
  return picked;
}

export function compareSummary(records) {
  const unionKeys = allKeys(records);

  return records.map((record, index) => {
    const recordKeys = new Set(Object.keys(record));
    const missingKeys = unionKeys.filter((key) => !recordKeys.has(key));
    const extraKeys = [...recordKeys].filter((key) => !unionKeys.includes(key)).sort();

    return {
      index,
      keyCount: recordKeys.size,
      missingKeys,
      extraKeys,
    };
  });
}

export function comparePair(records, indexA, indexB) {
  if (indexA < 0 || indexA >= records.length) {
    throw new Error(`Invalid index for record A: ${indexA}`);
  }
  if (indexB < 0 || indexB >= records.length) {
    throw new Error(`Invalid index for record B: ${indexB}`);
  }

  const recordA = records[indexA];
  const recordB = records[indexB];
  const fields = allKeys([recordA, recordB]);
  const diffs = [];

  for (const field of fields) {
    const inA = Object.prototype.hasOwnProperty.call(recordA, field);
    const inB = Object.prototype.hasOwnProperty.call(recordB, field);

    if (inA && inB) {
      const valueA = recordA[field];
      const valueB = recordB[field];
      const status = stableStringify(valueA) === stableStringify(valueB) ? 'same' : 'changed';
      diffs.push({ field, recordA: valueA, recordB: valueB, status });
      continue;
    }

    if (inA) {
      diffs.push({ field, recordA: recordA[field], recordB: undefined, status: 'onlyInA' });
      continue;
    }

    diffs.push({ field, recordA: undefined, recordB: recordB[field], status: 'onlyInB' });
  }

  return {
    indexA,
    indexB,
    diffs,
  };
}

export function findDuplicates(records, keyFields = []) {
  const groups = new Map();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const hashSource = keyFields.length > 0 ? pickKeys(record, keyFields) : record;
    const hash = stableStringify(hashSource);
    const existing = groups.get(hash) ?? { hash, indices: [] };
    existing.indices.push(index);
    groups.set(hash, existing);
  }

  return [...groups.values()].filter((group) => group.indices.length > 1);
}

export function compareRecords(data, path, options = {}) {
  const records = resolveRecords(data, path);

  if (options.pair) {
    const [indexA, indexB] = options.pair;
    return { mode: 'pair', records, result: comparePair(records, indexA, indexB) };
  }

  if (options.duplicates) {
    const keyFields = options.keys ?? [];
    return {
      mode: 'duplicates',
      records,
      result: findDuplicates(records, keyFields),
    };
  }

  return { mode: 'summary', records, result: compareSummary(records) };
}
