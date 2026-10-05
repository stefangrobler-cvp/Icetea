import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scaffold } from '../scripts/new-game.mjs';
import { validateManifest } from '../platform/contract/contract.js';

// The new-game template must always produce a game that follows the contract.

const ROOT = path.resolve(import.meta.dirname, '..');

test('new-game template makes a working game that follows the contract', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'newgame-'));
  try {
    fs.cpSync(path.join(ROOT, 'templates'), path.join(tmp, 'templates'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'platform'));
    fs.writeFileSync(path.join(tmp, 'platform', 'catalogue.json'), '{"games":["pong"]}');

    scaffold(tmp, { id: 'star-test', name: 'Star Test', icon: '⭐' });

    const { manifest } = await import(path.join(tmp, 'games', 'star-test', 'manifest.js'));
    assert.deepEqual(validateManifest(manifest), []);
    assert.equal(manifest.id, 'star-test');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'platform', 'catalogue.json'))).games, ['pong', 'star-test']);
    const testSrc = fs.readFileSync(path.join(tmp, 'test', 'star-test.test.js'), 'utf8');
    assert.ok(!testSrc.includes('__ID__'));
    for (const file of fs.readdirSync(path.join(tmp, 'games', 'star-test'))) {
      assert.ok(!fs.readFileSync(path.join(tmp, 'games', 'star-test', file), 'utf8').includes('__'), `${file} still has a placeholder`);
    }
    assert.throws(() => scaffold(tmp, { id: 'star-test', name: 'Again', icon: '⭐' }), /already exists/);
    assert.throws(() => scaffold(tmp, { id: 'Bad Name', name: 'x', icon: '⭐' }), /lower-case/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
