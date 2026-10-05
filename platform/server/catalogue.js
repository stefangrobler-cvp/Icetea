// The list of games. Each game's manifest is loaded from its own folder and checked
// against the contract; a game that doesn't follow the contract is left out (and
// the reason is printed) rather than breaking the platform.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { validateManifest } from '../contract/contract.js';

export async function loadCatalogue(root) {
  const { games } = JSON.parse(readFileSync(path.join(root, 'platform', 'catalogue.json'), 'utf8'));
  const list = [];
  for (const id of games) {
    try {
      const file = pathToFileURL(path.join(root, 'games', id, 'manifest.js')).href;
      const { manifest } = await import(file);
      const errors = validateManifest(manifest);
      if (manifest?.id !== id) errors.push(`manifest id "${manifest?.id}" doesn't match its folder "${id}"`);
      if (errors.length) {
        console.error(`Game "${id}" left out:\n  - ${errors.join('\n  - ')}`);
        continue;
      }
      list.push(manifest);
    } catch (e) {
      console.error(`Game "${id}" left out: ${e.message}`);
    }
  }
  return list;
}
