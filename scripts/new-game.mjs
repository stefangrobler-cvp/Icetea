// Start a new game from the template:
//   npm run new-game -- <id> "<Name>" <icon>
//   e.g. npm run new-game -- air-hockey "Air Hockey" 🏒
//
// Creates games/<id>/ (a small working starter game), test/<id>.test.js, and adds
// the game to platform/catalogue.json so it shows up in the lobby.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function scaffold(root, { id, name, icon }) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(id || '')) throw new Error('id must be lower-case letters, numbers and dashes, e.g. air-hockey');
  if (!name || name.length > 30) throw new Error('name is required (max 30 characters)');
  if (!icon || icon.length > 8) throw new Error('icon is required (one emoji)');

  const template = path.join(root, 'templates', 'game');
  const folder = path.join(root, 'games', id);
  const testFile = path.join(root, 'test', `${id}.test.js`);
  if (fs.existsSync(folder)) throw new Error(`games/${id}/ already exists`);
  if (fs.existsSync(testFile)) throw new Error(`test/${id}.test.js already exists`);

  const fill = (text) => text.replaceAll('__ID__', id).replaceAll('__NAME__', name).replaceAll('__ICON__', icon);
  fs.mkdirSync(folder, { recursive: true });
  for (const file of fs.readdirSync(template)) {
    const src = fill(fs.readFileSync(path.join(template, file), 'utf8'));
    if (file === 'test.js') {
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, src);
    } else {
      fs.writeFileSync(path.join(folder, file), src);
    }
  }

  const catalogueFile = path.join(root, 'platform', 'catalogue.json');
  const catalogue = JSON.parse(fs.readFileSync(catalogueFile, 'utf8'));
  if (!catalogue.games.includes(id)) catalogue.games.push(id);
  fs.writeFileSync(catalogueFile, `${JSON.stringify(catalogue, null, 2)}\n`);
  return { folder, testFile };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [id, name, icon] = process.argv.slice(2);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    scaffold(root, { id, name, icon });
    console.log(`Made games/${id}/ and test/${id}.test.js, and added "${id}" to the game list.`);
    console.log('Next: npm test, then npm start and pick the game in the lobby.');
  } catch (e) {
    console.error(`Could not make the game: ${e.message}`);
    console.error('Usage: npm run new-game -- <id> "<Name>" <icon>');
    process.exit(1);
  }
}
