// Basic measurement, first-party only: no third-party analytics or tracking code.
//
// Every event is one line of JSON: { at, type, ...fields }. Device and screen tags
// are random ids made in the browser; they are stored hashed, used only to tell
// whether a device has been here before, and never linked to a person.
//
// Storage sits behind a tiny interface ({ append(line), readAll() }) so the file
// used during alpha can be swapped for a proper database at roll-out without
// touching the rest of the platform.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Store events as lines in a file (alpha). Note: Render's free plan wipes files on restart. */
export function fileStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return {
    append(line) {
      fs.appendFile(file, `${line}\n`, () => {});
    },
    readAll() {
      try {
        return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
      } catch {
        return [];
      }
    },
  };
}

/** Keep events in memory only (tests). */
export function memoryStore() {
  const lines = [];
  return { append: (line) => lines.push(line), readAll: () => lines.map((l) => JSON.parse(l)) };
}

// Measurements the big screen may send, and the fields kept for each.
// Anything else is ignored, so nothing unexpected can be recorded.
export const SCREEN_METRICS = {
  start_pressed: [],
  match_started: ['game', 'mode', 'difficulty', 'players', 'firstMatch', 'msSinceStart'],
  match_ended: ['game', 'mode', 'difficulty', 'players', 'durationMs', 'winner', 'scores', 'stats', 'computerWon'],
  match_abandoned: ['game', 'durationMs'],
  rematch: ['game'],
  drop_out: ['game', 'seat'],
  latency: ['samples', 'p50', 'p95', 'directShare'],
};

const hashTag = (tag) => crypto.createHash('sha256').update(`fgp:${tag}`).digest('hex').slice(0, 16);

export function createMetrics(store) {
  const events = store.readAll();
  const seen = new Set(events.filter((e) => e.tag).map((e) => `${e.type}:${e.tag}`));

  function record(type, fields = {}) {
    const event = { at: new Date().toISOString(), type, ...fields };
    events.push(event);
    store.append(JSON.stringify(event));
    return event;
  }

  /** Record that a screen or phone showed up; returns whether it has been seen before. */
  function arrival(type, tag, fields = {}) {
    const hashed = tag ? hashTag(String(tag)) : null;
    const returning = hashed ? seen.has(`${type}:${hashed}`) : false;
    if (hashed) seen.add(`${type}:${hashed}`);
    record(type, { ...fields, tag: hashed, returning });
    return returning;
  }

  /** A measurement sent by a big screen: only known names and fields are kept. */
  function fromScreen(room, name, data) {
    const allowed = SCREEN_METRICS[name];
    if (!allowed) return null;
    const fields = { room };
    for (const key of allowed) {
      const v = data?.[key];
      if (v === undefined) continue;
      // Small plain values only.
      const text = JSON.stringify(v);
      if (text && text.length <= 300) fields[key] = v;
    }
    return record(name, fields);
  }

  /** The numbers that answer "can they get in, is it fun, do they come back, does it work". */
  function summary() {
    const of = (type) => events.filter((e) => e.type === type);
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const median = (xs) => {
      if (!xs.length) return null;
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const screens = of('screen_opened');
    const phones = of('phone_joined');
    const started = of('match_started');
    const ended = of('match_ended');
    const perGame = {};
    for (const e of started) (perGame[e.game] ||= { started: 0, finished: 0, rematches: 0 }).started += 1;
    for (const e of ended) (perGame[e.game] ||= { started: 0, finished: 0, rematches: 0 }).finished += 1;
    for (const e of of('rematch')) (perGame[e.game] ||= { started: 0, finished: 0, rematches: 0 }).rematches += 1;
    const firstMatch = started.filter((e) => e.firstMatch && Number.isFinite(e.msSinceStart)).map((e) => e.msSinceStart);
    const lat = of('latency');
    const durations = ended.map((e) => e.durationMs).filter(Number.isFinite);
    return {
      since: events[0]?.at || null,
      screens: screens.length,
      returningScreensPct: pct(screens.filter((e) => e.returning).length, screens.length),
      phonesJoined: phones.length,
      returningPhonesPct: pct(phones.filter((e) => e.returning).length, phones.length),
      roomsReachingAMatch: new Set(started.map((e) => e.room)).size,
      roomsOpened: of('room_opened').length,
      medianSecondsStartToFirstMatch: firstMatch.length ? Math.round(median(firstMatch) / 1000) : null,
      matchesStarted: started.length,
      matchesFinished: ended.length,
      rematches: of('rematch').length,
      medianMatchMinutes: durations.length ? Math.round((median(durations) / 60000) * 10) / 10 : null,
      dropOutsPerMatch: started.length ? Math.round((of('drop_out').length / started.length) * 100) / 100 : 0,
      medianDelayMs: median(lat.map((e) => e.p50).filter(Number.isFinite)),
      p95DelayMs: median(lat.map((e) => e.p95).filter(Number.isFinite)),
      directConnectionPct: lat.length ? Math.round(median(lat.map((e) => e.directShare ?? 0)) * 100) : null,
      perGame,
    };
  }

  return { record, arrival, fromScreen, summary, events };
}
