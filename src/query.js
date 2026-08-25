import { JSONPath } from 'jsonpath-plus';

export function queryPath(data, path) {
  const results = JSONPath({ path, json: data, wrap: false });

  if (results === undefined || results === null) {
    return [];
  }

  return Array.isArray(results) ? results : [results];
}
