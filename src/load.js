import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function loadJson(filePath) {
  const absolutePath = resolve(filePath);
  let content;

  try {
    content = await readFile(absolutePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${absolutePath}`);
    }
    throw new Error(`Failed to read file: ${absolutePath} (${error.message})`);
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${absolutePath}: ${error.message}`);
  }
}
