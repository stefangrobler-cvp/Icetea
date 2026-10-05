// Pixel art for the platform: the 12 animals players pick (they replace the emoji
// on screen) and the icons used in the menus. Plain data, shared by the big
// screen, the phones and the tests. Games get their players' animals as data
// (`players[].art`), never by importing this file.
//
// Each picture is a list of rows; each letter is one pixel in a PALETTE colour,
// and '.' is see-through. The avatar ids stay the emoji the phones already save,
// so nothing anyone picked before is lost.

export const PALETTE = {
  k: '#14082e', w: '#f4f2ff', o: '#ff9f1c', r: '#b8560a', c: '#00f0ff', C: '#0090a8', m: '#ff2bd6', M: '#a3168a',
  g: '#39ff7a', G: '#159a48', l: '#c9ffd9', y: '#ffe600', Y: '#b39d00', p: '#a77bff', P: '#6a3fd0', b: '#e2d4ff',
  n: '#9a6440', N: '#6b4129', t: '#e8be92', v: '#7d8cff', s: '#5a34b8', a: '#a3a7c4', i: '#ffb3d9', u: '#7fd8ff',
};

// The players' animals, by the emoji the phones save.
export const AVATAR_ART = {
  '🦊': ['.o........o.', '.oo......oo.', '.oro....oro.', '.oooooooooo.', 'oooooooooooo', 'ookoooooooko',
    'oooowwwwoooo', '.owwwwwwwwo.', '..wwwkkwww..', '...wwwwww...', '....wwww....', '............'],
  '🐼': ['.kk......kk.', 'kkkwwwwwwkkk', '.kwwwwwwwwk.', 'wwwwwwwwwwww', 'wkkkwwwwkkkw', 'wkwkwwwwkwkw',
    'wkkkwwwwkkkw', 'wwwwwkkwwwww', 'wwwwkwwkwwww', '.wwwwwwwwww.', '..wwwwwwww..', '............'],
  '🐯': ['.oo......oo.', 'oooookkooooo', 'kooooooooook', 'oowkooookwoo', 'kooooooooook', 'oooowwwwoooo',
    'kowwwkkwwwok', '.owwwwwwwwo.', '..wwwkkwww..', '...owwwwo...', '....oooo....', '............'],
  '🐸': ['..gg....gg..', '.gwwg..gwwg.', '.gwkg..gkwg.', '.gggggggggg.', 'gggggggggggg', 'gggggggggggg',
    'gkggggggggkg', 'ggkkkkkkkkgg', '.gglllllllg.', '..gllllllg..', '...gggggg...', '............'],
  '🦄': ['.....y......', '.....yy.....', '..w..yy..w..', '.mwwwwwwwww.', 'mmwwwwwwwww.', 'mmwkwwwwkww.',
    'mmwwwwwwwww.', 'pmwwwwiiwww.', '.pwwwwwwwww.', '..wwwwkwkww.', '...wwwwwww..', '............'],
  '🐵': ['....nnnn....', '..nnnnnnnn..', '.nnnnnnnnnn.', 'tnnttnnttnnt', 'tntkttttktnt', 'tnttttttttnt',
    '.nttttttttn.', '.nttkkkkttn.', '..nttttttn..', '...nnnnnn...', '............', '............'],
  '🐶': ['..tttttttt..', '.tttttttttt.', 'NNttttttttNN', 'NNtkttttktNN', 'NNttttttttNN', 'NNttwwwwttNN',
    '.NtwwkkwwtN.', '..twwwwwwt..', '...twmmwt...', '....tmmt....', '............', '............'],
  '🐱': ['.a........a.', '.aa......aa.', '.aia....aia.', '.aaaaaaaaaa.', 'aaaaaaaaaaaa', 'aagkaaaakgaa',
    'kaaaaiiaaaak', '.kaawwwwaak.', '..aaaaaaaa..', '...aaaaaa...', '............', '............'],
  '🦁': ['..oooooooo..', '.oooooooooo.', 'oooyyyyyyooo', 'ooyyyyyyyyoo', 'ooykyyyykyoo', 'ooyyyyyyyyoo',
    'ooyyykkyyyoo', 'ooyywwwwyyoo', '.ooyywwyyoo.', '..oooooooo..', '...oooooo...', '............'],
  '🐨': ['aaa......aaa', 'aiaa....aaia', 'aiaaaaaaaaia', 'aaaaaaaaaaaa', '.akaaaaaaka.', '.aaaakkaaaa.',
    '.aaakkkkaaa.', '.aaaakkaaaa.', '..awwwwwwa..', '...aaaaaa...', '............', '............'],
  '🐰': ['..ww....ww..', '..wi....iw..', '..wi....iw..', '..ww....ww..', '.wwwwwwwwww.', 'wwwkwwwwkwww',
    'wiwwwwwwwwiw', 'wwwwwiiwwwww', '.wwwwwwwwww.', '..wwwwwwww..', '............', '............'],
  '🐙': ['...mmmmmm...', '..mmmmmmmm..', '.mmmmmmmmmm.', '.mwkmmmmwkm.', '.mmmmmmmmmm.', '.mmmmiimmmm.',
    'mmmmmmmmmmmm', 'm.mm.mm.mm.m', 'm.m..mm..m.m', '.m..m..m..m.', '............', '............'],
};

// Menu icons, by the emoji the game manifests and menus already use.
export const ICON_ART = {
  '🤖': ['.....yy.....', '.....kk.....', '.yyyyyyyyyy.', '.yyyyyyyyyy.', '.ykkkkkkkky.', '.ykcckkccky.',
    '.ykcckkccky.', '.ykkkkkkkky.', '.yyyyyyyyyy.', '.yykkkkkkyy.', '.yyyyyyyyyy.', '............'],
  '🧒': ['..NNNNNN..', '.NNNNNNNN.', '.NNttttNN.', '.tkttttkt.', '.itttttti.', '..tkttkt..', '...tkkt...', '.cccccccc.', 'cccccccccc', 'c.cccccc.c'],
  '⚡': ['.....yyy', '....yyy.', '...yyy..', '..yyyyyy', '....yyy.', '...yyy..', '..yy....', '.y......'],
  '💥': ['y..o..y.', '.y.o.y..', '..ooo...', 'oooyooo.', '..ooo...', '.y.o.y..', 'y..o..y.'],
  '🐢': ['....gggg....', '...gGggGg...', '..ggggggggw.', '..gGggggGgwk', '..gggggggg..', '..w..w..w...'],
  '🐇': ['..w..w...', '..w..w...', '..ww.ww..', '..wwwww..', '.wwkwwkw.', '.wwwiiww.', '..wwwww..', '.wwwwwww.', '.ww.w.ww.'],
  '🚀': ['....w....', '...wcw...', '...www...', '...wcw...', '..wwwww..', '..wwwww..', '.mww.wwm.', '.m.ooo.m.', '....o....'],
  '🐣': ['..yyy...', '.yykyy..', '.yyyyoo.', '.yyyy...', 'wwyywwww', 'wwwwwwww', '.wwwwww.'],
  '💪': ['...oo...', '..oooo..', '.ooooo..', 'oo..oo..', 'oo..ooo.', 'oo.oooo.', '.ooooo..', '..ooo...'],
  '🏓': ['............', '.c........m.', '.c........m.', '.c........m.', '.c...ww...m.', '.c...ww...m.',
    '.c........m.', '.c........m.', '.c........m.', '............', '..v.v.v.v...', '............'],
  '⚽': ['....wwww....', '..wwkkwwww..', '.wwkkkkwwww.', '.wwwkkwwwkw.', 'wwwwwwwwkkkw', 'wkwwwwwwwkww',
    'wkkwwwkwwwww', 'wkwwwkkkwwww', '.wwwwwkwwww.', '.wwkwwwwkkw.', '..wwwwwwww..', '....wwww....'],
  '🧊': ['....oooo....', '....oooo....', '...gggg.....', '...gggg.....', '.....mmmm...', '.....mmmm...',
    '...cccc.....', '...cccc.....', '..vvvvvvvv..', '..vvvvvvvv..'],
  '🔍': ['..cccc......', '.c....c.....', 'c..ww..c....', 'c.w....c....', 'c......c....', 'c......c....',
    '.c....c.....', '..ccccmm....', '.......mm...', '........mm..', '.........mm.'],
  '🎹': ['.cccc..mmmm.', '.cccc..mmmm.', '.cccc..mmmm.', '.cccc..mmmm.', '............',
    '.yyyy..gggg.', '.yyyy..gggg.', '.yyyy..gggg.', '.yyyy..gggg.'],
  '👑': ['y...y...y', 'yy.yyy.yy', 'yyyyyyyyy', 'yyyyyyyyy', 'ymyycyymy', 'yyyyyyyyy'],
  '🏆': ['yyyyyyyy', 'yyyyyyyy', 'yyyyyyyy', '.yyyyyy.', '..yyyy..', '...yy...', '..yyyy..', '.yyyyyy.'],
  '🤝': ['.......', '.w...w.', 'wwwwwww', 'wwwwwww', '.wwwww.', '..www..'],
  '👤': ['.ww.', '.ww.', 'wwww', '.ww.', 'w..w'],
  '⏱': ['.www.', 'w.w.w', 'w.ww.', 'w...w', '.www.'],
  '👍': ['....y...', '...yy...', '...y....', 'yyyyyyy.', 'yyyyyyyy', 'yyyyyyy.', 'yyyyyyy.', '.yyyyy..'],
  '👎': ['.yyyyy..', 'yyyyyyy.', 'yyyyyyy.', 'yyyyyyyy', 'yyyyyyy.', '...y....', '...yy...', '....y...'],
  '📱': ['.kkkkkk.', '.kccccck', '.kccccck', '.kccccck', '.kccccck', '.kccccck', '.kkkwkkk', '..kkkkk.'],
  '🎮': ['..........', '.vvvvvvvv.', 'vvwvvvvmvv', 'vwwwvvcvmv', 'vvwvvvvcvv', 'vvvv..vvvv', '.vv....vv.'],
  '🔊': ['...w....', '..ww.w..', 'wwww..w.', 'wwww.ww.', 'wwww..w.', '..ww.w..', '...w....'],
  '🔇': ['...w....', '..ww....', 'wwww.m.m', 'wwww..m.', 'wwww.m.m', '..ww....', '...w....'],
  '🔁': ['.kkkkk..', 'k.....k.', 'k....kkk', 'k.....k.', 'k.......', '.kkkkk..'],
  '🏠': ['....w....', '...www...', '..wwwww..', '.wwwwwww.', 'wwwwwwwww', '.ww...ww.', '.ww.y.ww.', '.ww...ww.'],
  '❓': ['.wwww.', 'ww..ww', '....ww', '...ww.', '..ww..', '......', '..ww..'],
};

/** Every grapheme in a string of emoji, e.g. '🧒🧒⚡🤖' -> ['🧒', '🧒', '⚡', '🤖']. */
export function glyphs(text) {
  const s = String(text || '');
  if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter().segment(s)].map((x) => x.segment);
  return Array.from(s);
}

/** The pixel picture for an emoji (an animal or a menu icon), or null if there isn't one. */
export function artFor(emoji) {
  const key = String(emoji || '').replace(/️/g, '');
  return AVATAR_ART[key] || ICON_ART[key] || null;
}

/** An avatar as plain data a game can draw: { rows, palette }. */
export function avatarArt(emoji) {
  const rows = AVATAR_ART[emoji];
  return rows ? { rows: [...rows], palette: { ...PALETTE } } : null;
}
