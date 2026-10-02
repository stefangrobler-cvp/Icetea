// Player names and avatars. Shared by the game screen and the phones.

import { AVATARS, NAME_MAX } from './config.js';

/** The avatar a player gets if they haven't picked one. */
export const defaultAvatar = (slot) => AVATARS[(slot - 1) % AVATARS.length];

/** Tidy up a name/avatar sent by a phone, falling back to "Player 1" etc. */
export function cleanProfile(profile, slot) {
  // Array.from keeps emoji in a name in one piece when shortening it.
  const raw = Array.from(String(profile?.name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim());
  const name = raw.slice(0, NAME_MAX).join('').trim();
  const avatar = AVATARS.includes(profile?.avatar) ? profile.avatar : defaultAvatar(slot);
  return { name: name || `Player ${slot}`, avatar };
}

/** "🦊 Mia" */
export function playerLabel(profiles, slot) {
  const p = profiles?.[slot] || cleanProfile(null, slot);
  return `${p.avatar} ${p.name}`;
}
