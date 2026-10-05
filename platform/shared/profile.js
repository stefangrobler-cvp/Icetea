// Guest nicknames and avatars. Shared by the big screen, the phones and the server.
// A child exists here only as a nickname and an avatar: nothing else is collected.

export const AVATARS = ['🦊', '🐼', '🐯', '🐸', '🦄', '🐵', '🐶', '🐱', '🦁', '🐨', '🐰', '🐙'];
export const NAME_MAX = 12; // letters

/** The avatar a player gets if they haven't picked one. */
export const defaultAvatar = (seat) => AVATARS[(seat - 1) % AVATARS.length];

// A small list of words nicknames may not contain (English and Afrikaans). Kept
// short on purpose: it catches the obvious, and nicknames only show in the room.
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'penis', 'vagina', 'sex', 'porn', 'nazi',
  'slut', 'whore', 'bastard', 'asshole', 'arse', 'wank', 'nigg', 'fag', 'retard', 'rape', 'kill',
  'poes', 'fok', 'kak', 'naai', 'piel', 'doos', 'moer', 'hoer', 'kont',
];

/** Is this nickname OK to show? (Compares without spaces, and common number-for-letter swaps.) */
export function nicknameAllowed(name) {
  const plain = String(name || '').toLowerCase()
    .replace(/[0]/g, 'o').replace(/[1!|]/g, 'i').replace(/[3]/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/[7]/g, 't')
    .replace(/[^a-z]/g, '');
  return !BLOCKED.some((w) => plain.includes(w));
}

/** Tidy up a nickname/avatar sent by a phone, falling back to "Player 1" etc. */
export function cleanProfile(profile, seat) {
  // Array.from keeps emoji in a name in one piece when shortening it.
  const raw = Array.from(String(profile?.name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim());
  let name = raw.slice(0, NAME_MAX).join('').trim();
  if (!nicknameAllowed(name)) name = '';
  const avatar = AVATARS.includes(profile?.avatar) ? profile.avatar : defaultAvatar(seat);
  return { name: name || `Player ${seat}`, avatar };
}

/** "🦊 Mia" */
export function playerLabel(profiles, seat) {
  const p = profiles?.[seat] || cleanProfile(null, seat);
  return `${p.avatar} ${p.name}`;
}
