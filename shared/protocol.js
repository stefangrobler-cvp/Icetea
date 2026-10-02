// Message names shared by the server, the game screen and the phones.
// Every message is a small JSON object with a `t` (type) field.

export const MSG = {
  // game screen -> server
  HOST: 'host', // { t, room?, token? } create a room, or reclaim one after a reload
  BROADCAST: 'bcast', // { t, msg } send `msg` to every phone in the room
  SEND_TO: 'to', // { t, slot, msg } send `msg` to one phone

  // server -> game screen
  ROOM: 'room', // { t, room, token, players: { 1: bool, 2: bool } }
  PLAYER: 'player', // { t, slot, connected }

  // phone -> server
  JOIN: 'join', // { t, room, clientId }
  INPUT: 'in', // { t, y, n, l } paddle position, 0 (top) .. 1 (bottom); n counts up so old ones
  //              are ignored; l = which rod in soccer (0 defence, 1 attack)
  COMMAND: 'cmd', // { t, action, ...extra }

  // server -> phone
  JOINED: 'joined', // { t, slot }
  HOST_STATUS: 'hoststatus', // { t, online }
  STATE: 'state', // relayed from game screen: scores, phase, settings...

  // phone <-> game screen (via the server, or over the direct link once it is up)
  SIGNAL: 'sig', // { t, data } setting up the direct phone-to-tablet link (WebRTC)
  PING: 'ping', // { t, ts, rtt, direct } phone measuring the delay to the game screen
  PONG: 'pong', // { t, ts } reply to a ping

  // either direction
  ERROR: 'error', // { t, reason }
};

// Actions a phone can send with MSG.COMMAND (the game screen uses them too).
export const ACTIONS = {
  SETTINGS: 'settings', // { game?, mode?, difficulty? }
  START: 'start',
  PAUSE: 'pause',
  RESUME: 'resume',
  PLAY_AGAIN: 'playAgain',
  CHANGE_SETTINGS: 'changeSettings',
  MENU: 'menu', // leave the match (from the pause screen) and go back to the main menu
  AIM: 'aim', // { angle } soccer kick-off: where the kicker is aiming (radians, 0 = right)
  KICK: 'kick', // { angle } soccer kick-off: let go of the ball
  PROFILE: 'profile', // { name, avatar } the kid's name and avatar, sent when the phone joins
};

export const MAX_PLAYERS = 2;
