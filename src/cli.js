import { Command } from 'commander';
import { loadJson } from './load.js';
import { queryPath } from './query.js';
import { compareRecords } from './compare.js';

function printQueryResults(results, pretty) {
  if (results.length === 0) {
    console.log('No results.');
    return;
  }

  if (pretty || results.length === 1) {
    console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
    return;
  }

  for (const result of results) {
    console.log(JSON.stringify(result));
  }
}

function printSummary(summary) {
  console.log('index\tkeyCount\tmissingKeys\textraKeys');
  for (const row of summary) {
    console.log(
      `${row.index}\t${row.keyCount}\t${row.missingKeys.join(',') || '-'}\t${row.extraKeys.join(',') || '-'}`,
    );
  }
}

function printPairDiff({ indexA, indexB, diffs }) {
  console.log(`Comparing record ${indexA} vs record ${indexB}`);
  console.log('field\tstatus\trecordA\trecordB');
  for (const diff of diffs) {
    const valueA = diff.recordA === undefined ? '-' : JSON.stringify(diff.recordA);
    const valueB = diff.recordB === undefined ? '-' : JSON.stringify(diff.recordB);
    console.log(`${diff.field}\t${diff.status}\t${valueA}\t${valueB}`);
  }
}

function printDuplicates(groups, keyFields) {
  if (groups.length === 0) {
    console.log('No duplicate records found.');
    return;
  }

  const scope = keyFields.length > 0 ? `by keys: ${keyFields.join(', ')}` : 'by full record';
  console.log(`Found ${groups.length} duplicate group(s) ${scope}`);

  for (const group of groups) {
    console.log(`indices: ${group.indices.join(', ')}`);
  }
}

function parseKeyList(value) {
  return value
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
}

export function run(argv) {
  const program = new Command();

  program
    .name('json-analyze')
    .description('Query and compare records in JSON files')
    .version('1.0.0');

  program
    .command('query')
    .description('Run a JSONPath query against a JSON file')
    .argument('<file>', 'Path to JSON file')
    .argument('<path>', 'JSONPath expression')
    .option('--pretty', 'Pretty-print JSON output')
    .action(async (file, path, options) => {
      try {
        const data = await loadJson(file);
        const results = queryPath(data, path);
        printQueryResults(results, options.pretty);
      } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
      }
    });

  program
    .command('compare')
    .description('Compare records within a JSON file')
    .argument('<file>', 'Path to JSON file')
    .argument('<path>', 'JSONPath to an array of objects')
    .option('--pair <indices>', 'Diff two records by index (e.g. 0,2)', (value) => {
      const [a, b] = value.split(',').map((part) => Number(part.trim()));
      if (Number.isNaN(a) || Number.isNaN(b)) {
        throw new Error('--pair expects two numeric indices separated by a comma');
      }
      return [a, b];
    })
    .option('--duplicates', 'Find duplicate records')
    .option('--keys <fields>', 'Comma-separated fields for duplicate grouping', parseKeyList)
    .action(async (file, path, options) => {
      try {
        const data = await loadJson(file);
        const comparison = compareRecords(data, path, {
          pair: options.pair,
          duplicates: options.duplicates,
          keys: options.keys,
        });

        if (comparison.mode === 'pair') {
          printPairDiff(comparison.result);
          return;
        }

        if (comparison.mode === 'duplicates') {
          printDuplicates(comparison.result, options.keys ?? []);
          return;
        }

        printSummary(comparison.result);
      } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
      }
    });

  program.parse(argv);
}
