// The game plug-in contract: the one agreement between the platform and every game.
//
// A game is a self-contained folder (games/<id>/) whose `game.js` exports:
//   manifest            - a plain description of the game (checked by validateManifest below)
//   createGame(host)    - returns the game object the platform drives
//
// A game gets everything it needs from `host` and never imports platform code.
// See README.md in this folder for the full description, written for game makers.

export const CONTRACT_VERSION = 1;

// Controls in the controller kit. A game's phone layouts may only use these.
// New controls are added only when a game genuinely needs one (and after asking).
export const CONTROLS = {
  // A big swipe area. Relative drag up and down. Value: number 0 (top) .. 1 (bottom).
  // With direction 'horizontal': drag left and right, 0 (left) .. 1 (right).
  swipe: { settings: ['id', 'label', 'look', 'direction'], looks: ['bar', 'rod'], directions: ['vertical', 'horizontal'] },
  // An aiming circle: touch, slide round to aim, let go to fire.
  // Value while aiming: { angle }. When let go: { angle, release: true }.
  aim: { settings: ['id', 'label'] },
  // A giant button. Value: { down: true } when pressed, { down: false } when let go.
  tap: { settings: ['id', 'label'] },
  // Tilt the phone left / right (or drag a rail where there's no motion sensor). Value: -1 .. 1.
  tilt: { settings: ['id', 'label'] },
  // 2-4 big pads in fixed colours (cyan, pink, yellow, green). Value: { pad, down: true|false }.
  pads: { settings: ['id', 'label', 'pads'] },
  // A touchpad moving a cursor on the big screen. Value: { x, y } (0..1), { x, y, tap: true }, { back: true }.
  pointer: { settings: ['id', 'label'] },
};

// Events a game reports with host.report({ type, ... }).
export const EVENTS = {
  MATCH_STARTED: 'match-started', // { }
  POINT_SCORED: 'point-scored', // { side, scores: { [side]: number } }
  MATCH_ENDED: 'match-ended', // { winner: side | null, scores, stats?: { [name]: number } }
  HIGHLIGHT: 'highlight', // { name, seat?, side? } something worth celebrating (optional)
};

// What the game object returned by createGame(host) must / may have.
export const REQUIRED_METHODS = ['start', 'input', 'update', 'draw', 'pause', 'resume', 'stop'];
export const OPTIONAL_METHODS = ['optionChanged', 'playerLeft', 'playerBack', 'playerJoined'];

export const MAX_SEATS = 4;

const isText = (v, max = 60) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isCount = (v) => Number.isInteger(v) && v >= 1 && v <= MAX_SEATS;

/** Check a manifest. Returns a list of problems (empty when it's fine). */
export function validateManifest(m) {
  const errors = [];
  const err = (msg) => errors.push(msg);
  if (!m || typeof m !== 'object') return ['manifest is missing'];

  if (m.contract !== CONTRACT_VERSION) err(`contract must be ${CONTRACT_VERSION} (got ${m.contract})`);
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(m.id || '')) err('id must be lower-case letters, numbers and dashes');
  if (!isText(m.name, 30)) err('name is required (max 30 characters)');
  if (!isText(m.icon, 8)) err('icon is required (an emoji)');
  if (!/^\d+\.\d+\.\d+$/.test(m.version || '')) err('version must look like 1.0.0');
  if (!isText(m.ages, 12)) err('ages is required, e.g. "4+"');
  if (!isText(m.matchLength, 20)) err('matchLength is required, e.g. "2–5 min"');
  if (!m.players || !isCount(m.players.min) || !isCount(m.players.max) || m.players.min > m.players.max) {
    err(`players needs min and max between 1 and ${MAX_SEATS}`);
  }

  // Modes: how players are split into sides, and whether the computer plays one.
  if (!Array.isArray(m.modes) || m.modes.length === 0) err('at least one mode is required');
  for (const mode of m.modes || []) {
    const where = `mode "${mode?.id}"`;
    if (!/^[a-z][a-z0-9-]*$/.test(mode?.id || '')) err(`${where}: id is required`);
    if (!isText(mode?.icon, 16)) err(`${where}: icon is required`);
    if (!isText(mode?.label, 30)) err(`${where}: label is required`);
    if (!Array.isArray(mode?.sides) || mode.sides.length < 1) err(`${where}: sides is required, e.g. ["left", "right"]`);
    if (mode?.computer && !mode.sides?.includes(mode.computer)) err(`${where}: computer must be one of its sides`);
    if (!mode?.players || !isCount(mode.players.min) || !isCount(mode.players.max)) err(`${where}: players needs min and max`);
    else if (mode.players.max > m.players?.max) err(`${where}: more players than the game allows`);
  }

  // Options: simple choices shown as icon buttons (e.g. difficulty).
  for (const opt of m.options || []) {
    const where = `option "${opt?.id}"`;
    if (!/^[a-z][a-zA-Z0-9]*$/.test(opt?.id || '')) err(`${where}: id is required`);
    if (!isText(opt?.label, 30)) err(`${where}: label is required`);
    if (!Array.isArray(opt?.choices) || opt.choices.length < 2) err(`${where}: needs at least two choices`);
    for (const c of opt?.choices || []) {
      if (!c?.id || !isText(c?.icon, 8) || !isText(c?.label, 20)) err(`${where}: each choice needs id, icon and label`);
    }
    if (!opt?.choices?.some((c) => c.id === opt.default)) err(`${where}: default must be one of the choices`);
  }

  // Phone layouts: one or two controls from the kit, side by side.
  const layouts = m.layouts && typeof m.layouts === 'object' ? Object.entries(m.layouts) : [];
  if (layouts.length === 0) err('at least one phone layout is required');
  for (const [name, controls] of layouts) {
    const where = `layout "${name}"`;
    if (!Array.isArray(controls) || controls.length < 1 || controls.length > 2) {
      err(`${where}: needs one or two controls`);
      continue;
    }
    for (const c of controls) {
      const kind = CONTROLS[c?.control];
      if (!kind) { err(`${where}: "${c?.control}" is not a controller kit control`); continue; }
      if (!/^[a-z][a-zA-Z0-9]*$/.test(c.id || '')) err(`${where}: each control needs an id`);
      for (const key of Object.keys(c)) {
        if (key !== 'control' && !kind.settings.includes(key)) err(`${where}: ${c.control} has no setting "${key}"`);
      }
      if (c.look && !kind.looks?.includes(c.look)) err(`${where}: ${c.control} has no look "${c.look}"`);
      if (c.direction && !kind.directions?.includes(c.direction)) err(`${where}: ${c.control} has no direction "${c.direction}"`);
      if (c.control === 'pads' && c.pads !== undefined && !(Number.isInteger(c.pads) && c.pads >= 2 && c.pads <= 4)) err(`${where}: pads must be 2, 3 or 4`);
    }
  }

  // Tips for the how-to screen: icon first, a few words after.
  for (const tip of m.howTo || []) {
    if (!isText(tip?.icon, 8) || !isText(tip?.text, 90)) err('each howTo tip needs an icon and short text');
  }
  return errors;
}

/** Check that a game object has the methods the platform calls. */
export function validateGameObject(game) {
  const missing = REQUIRED_METHODS.filter((name) => typeof game?.[name] !== 'function');
  return missing.map((name) => `game object is missing ${name}()`);
}

/**
 * Put players on sides for a mode: the computer (if any) takes its side and the
 * people share the others, in seat order. Returns { [seat]: side }.
 */
export function assignSides(mode, seats) {
  const open = mode.sides.filter((s) => s !== mode.computer);
  const sides = {};
  [...seats].sort((a, b) => a - b).forEach((seat, i) => { sides[seat] = open[i % open.length]; });
  return sides;
}
