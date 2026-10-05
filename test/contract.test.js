import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateManifest, assignSides, CONTROLS, CONTRACT_VERSION } from '../platform/contract/contract.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const { games } = JSON.parse(fs.readFileSync(path.join(ROOT, 'platform', 'catalogue.json'), 'utf8'));

function filesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    (d.isDirectory() ? filesIn(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

for (const id of games) {
  const folder = path.join(ROOT, 'games', id);

  test(`${id}: manifest follows the contract`, async () => {
    const { manifest } = await import(path.join(folder, 'manifest.js'));
    assert.deepEqual(validateManifest(manifest), []);
    assert.equal(manifest.id, id, 'manifest id matches the folder name');
    assert.equal(manifest.contract, CONTRACT_VERSION);
  });

  test(`${id}: game.js exports manifest and createGame`, () => {
    const src = fs.readFileSync(path.join(folder, 'game.js'), 'utf8');
    assert.match(src, /export \{ manifest \}/);
    assert.match(src, /export function createGame\(host\)/);
  });

  // The boundary: a game can be lifted out into its own repository unchanged.
  test(`${id}: stays inside its own folder and only talks to the platform through host`, () => {
    for (const file of filesIn(folder).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(file, 'utf8');
      const where = path.relative(ROOT, file);
      const specifiers = [...src.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)]
        .map((m) => m[1] || m[2]);
      for (const spec of specifiers) {
        assert.ok(spec.startsWith('./') || spec.startsWith('../'), `${where}: "${spec}" must be a relative path inside the game`);
        const target = path.resolve(path.dirname(file), spec);
        assert.ok(target.startsWith(folder + path.sep), `${where}: "${spec}" reaches outside games/${id}/`);
      }
      // No network, storage or platform globals: games get everything from host.
      for (const banned of ['fetch(', 'WebSocket', 'XMLHttpRequest', 'sendBeacon', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'window.platform', '/platform/']) {
        assert.ok(!src.includes(banned), `${where} uses ${banned}`);
      }
    }
  });
}

test('the contract checker catches broken manifests', async () => {
  const { manifest } = await import(path.join(ROOT, 'games', 'pong', 'manifest.js'));
  const broken = structuredClone(manifest);
  broken.contract = 99;
  broken.layouts.play = [{ control: 'joystick', id: 'stick' }];
  broken.modes[0].computer = 'top';
  broken.options[0].default = 'impossible';
  const errors = validateManifest(broken);
  assert.ok(errors.some((e) => e.includes('contract must be')));
  assert.ok(errors.some((e) => e.includes('not a controller kit control')));
  assert.ok(errors.some((e) => e.includes('computer must be one of its sides')));
  assert.ok(errors.some((e) => e.includes('default must be one of the choices')));
  assert.deepEqual(validateManifest({ ...manifest, layouts: { play: [{ control: 'swipe', id: 'p', colour: 'red' }] } }).length, 1);
});

test('the controller kit is small: only the controls the games use', () => {
  assert.deepEqual(Object.keys(CONTROLS).sort(), ['aim', 'swipe', 'tap', 'tilt']);
});

test('players are put on sides: the computer keeps its side, people share the rest', () => {
  const versus = { sides: ['left', 'right'] };
  const team = { sides: ['left', 'right'], computer: 'right' };
  assert.deepEqual(assignSides(versus, [2, 1]), { 1: 'left', 2: 'right' });
  assert.deepEqual(assignSides(team, [1, 3]), { 1: 'left', 3: 'left' });
});
