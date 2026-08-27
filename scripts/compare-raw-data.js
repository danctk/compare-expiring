#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadJson } from '../src/load.js';
import { compareRecords, parseIgnoreList } from '../src/raw-data-compare.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  let input = 'rawData.json';
  let output = 'comparison-results.csv';
  let ignoreList = 'ignore-list.txt';
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
    if (arg === '--ignore-list') {
      ignoreList = args[index + 1];
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
    ignoreList: resolve(ignoreList),
  };
}

async function loadIgnoreList(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

async function main() {
  const { input, output, ignoreList } = parseArgs(process.argv);
  const records = await loadJson(input);

  if (!Array.isArray(records)) {
    throw new Error('Input JSON must be an array of records');
  }

  const ignoredNumbers = parseIgnoreList(await loadIgnoreList(ignoreList));
  const result = compareRecords(records, { ignoredNumbers });
  await writeFile(output, result.csv, 'utf8');

  console.log(
    `Compared ${result.includedRecords} records (${result.excludedCanRecords} CAN excluded, ${result.ignoredListRecords} ignore-list excluded)`,
  );
  console.log(`Wrote ${result.columns.length} columns to ${output}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
