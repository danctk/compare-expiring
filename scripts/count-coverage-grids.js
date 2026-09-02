#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadJson } from '../src/load.js';
import { countCoverageGrids } from '../src/coverage-grid-counts.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  let input = 'rawData.json';
  let output = 'coverage-grid-counts.csv';
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--input' || arg === '-i') {
      input = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--output' || arg === '-o') {
      output = args[index + 1];
      index += 1;
      continue;
    }
    if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional[0]) {
    input = positional[0];
  }
  if (positional[1]) {
    output = positional[1];
  }

  return {
    input: resolve(input),
    output: resolve(output),
  };
}

async function main() {
  const { input, output } = parseArgs(process.argv);
  const records = await loadJson(input);

  if (!Array.isArray(records)) {
    throw new Error('Input JSON must be an array of records');
  }

  const result = countCoverageGrids(records);
  await writeFile(output, result.csv, 'utf8');

  console.log(`Counted freeformGridUnderlyingPolicies for ${result.totalRecords} records`);
  console.log(`Wrote ${result.columns.length} columns to ${output}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
