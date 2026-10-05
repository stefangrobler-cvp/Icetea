import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_ART, ICON_ART, PALETTE, artFor, avatarArt, glyphs } from '../platform/shared/pixels.js';
import { AVATARS } from '../platform/shared/profile.js';

test('every animal a phone can pick has pixel art (saved choices keep working)', () => {
  for (const a of AVATARS) assert.ok(AVATAR_ART[a], `${a} has no pixel art`);
});

test('pixel pictures are well formed: equal rows, known colours', () => {
  for (const [name, rows] of Object.entries({ ...AVATAR_ART, ...ICON_ART })) {
    assert.ok(rows.length > 0, name);
    for (const row of rows) {
      assert.equal(row.length, rows[0].length, `${name}: rows differ in width`);
      for (const ch of row) assert.ok(ch === '.' || PALETTE[ch], `${name}: unknown colour "${ch}"`);
    }
  }
});

test('games get an animal as plain data, and emoji strings split into icons', () => {
  const art = avatarArt('🦊');
  assert.deepEqual(JSON.parse(JSON.stringify(art)), art);
  assert.ok(art.rows.length && art.palette.o);
  assert.equal(avatarArt('not an animal'), null);
  assert.ok(artFor('⚡️')); // with or without the emoji variation mark
  assert.deepEqual(glyphs('🧒🧒⚡🤖'), ['🧒', '🧒', '⚡', '🤖']);
});
