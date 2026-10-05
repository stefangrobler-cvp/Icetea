// Message names shared by the server, the big screen and the phones.
// Every message is a small JSON object with a `t` (type) field.

export const MSG = {
  // big screen -> server
  HOST: 'host', // { t, room?, token?, screenTag } open a room, or reclaim one after a reload
  BROADCAST: 'bcast', // { t, msg } send `msg` to every phone in the room
  SEND_TO: 'to', // { t, slot, msg } send `msg` to one phone
  METRIC: 'metric', // { t, name, data } a measurement (see platform/server/metrics.js)

  // server -> big screen
  ROOM: 'room', // { t, room, token, players: { [seat]: bool } }
  PLAYER: 'player', // { t, slot, connected }

  // phone -> server
  JOIN: 'join', // { t, room, clientId }
  INPUT: 'in', // { t, c, v, n } a controller-kit control changed: control id, value, counter
  COMMAND: 'cmd', // { t, action, ...extra }

  // server -> phone
  JOINED: 'joined', // { t, slot }
  HOST_STATUS: 'hoststatus', // { t, online }
  STATE: 'state', // relayed from the big screen: what each phone should show

  // big screen -> phone
  BUZZ: 'buzz', // { t, ms } vibrate (or flash, where phones can't vibrate)

  // phone <-> big screen (via the server, or over the direct link once it is up)
  SIGNAL: 'sig', // { t, data } setting up the direct phone-to-screen link (WebRTC)
  PING: 'ping', // { t, ts, rtt, direct } phone measuring the delay to the big screen
  PONG: 'pong', // { t, ts } reply to a ping

  // either direction
  ERROR: 'error', // { t, reason }
};

// Actions a phone can send with MSG.COMMAND (the big screen uses them too).
export const ACTIONS = {
  SETTINGS: 'settings', // { game?, mode?, options?: { [id]: value } }
  START: 'start',
  PAUSE: 'pause',
  RESUME: 'resume',
  PLAY_AGAIN: 'playAgain', // rematch from the results screen
  CHANGE_GAME: 'changeGame', // results screen -> back to the lobby
  MENU: 'menu', // leave the match (from the pause screen) and go back to the lobby
  PROFILE: 'profile', // { name, avatar, boost } nickname, avatar and help level, sent when the phone joins
  FEEDBACK: 'feedback', // { vote: 'up' | 'down' } thumbs after a match (one per phone per match)
};

export const MAX_PLAYERS = 4;
