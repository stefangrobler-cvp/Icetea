// Direct phone-to-screen link (WebRTC data channel).
//
// Without this, every swipe travels phone -> internet server -> big screen. With it,
// swipes go straight across the home Wi-Fi, which is many times quicker.
// The server is only used to introduce the two devices ("signalling").
// If the direct link can't be made, everything still works through the server.

const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Unordered and never re-sent: a late paddle position is useless, the next one
// is already on its way. This avoids one lost packet holding up the rest.
const CHANNEL_OPTIONS = { ordered: false, maxRetransmits: 0 };

const supported = typeof RTCPeerConnection !== 'undefined';

// Remote ICE candidates can arrive before the offer/answer; hold them until then.
async function applySignal(pc, data, pending) {
  if (data.sdp) {
    await pc.setRemoteDescription(data.sdp);
    for (const c of pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
  } else if (data.candidate) {
    if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
    else pending.push(data.candidate);
  }
}

/** Phone side: starts the link and sends over it. */
export class PhoneLink {
  constructor({ sendSignal, onMessage }) {
    this.sendSignal = sendSignal;
    this.onMessage = onMessage;
    this.pc = null;
    this.channel = null;
    this.pending = [];
    this.retryTimer = null;
  }

  get open() {
    return this.channel?.readyState === 'open';
  }

  async start() {
    if (!supported) return;
    this.close();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;
    const channel = pc.createDataChannel('game', CHANNEL_OPTIONS);
    this.channel = channel;
    channel.onmessage = (e) => {
      try { this.onMessage(JSON.parse(e.data)); } catch { /* ignore */ }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal({ candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === 'failed') {
        // Try again in a bit; meanwhile the server route keeps the game going.
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.start(), 5000);
      }
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendSignal({ sdp: pc.localDescription.toJSON() });
    } catch { /* stay on the server route */ }
  }

  handleSignal(data) {
    if (this.pc) applySignal(this.pc, data, this.pending).catch(() => {});
  }

  send(text) {
    if (!this.open) return false;
    try { this.channel.send(text); return true; } catch { return false; }
  }

  close() {
    clearTimeout(this.retryTimer);
    if (this.pc) this.pc.close();
    this.pc = null;
    this.channel = null;
    this.pending = [];
  }
}

/** Big-screen side: answers each phone and receives over the link. */
export class HostLinks {
  constructor({ sendSignal, onMessage }) {
    this.sendSignal = sendSignal; // (slot, data)
    this.onMessage = onMessage; // (slot, msg, reply)
    this.links = {}; // slot -> { pc, channel, pending }
  }

  isOpen(slot) {
    return this.links[slot]?.channel?.readyState === 'open';
  }

  async handleSignal(slot, data) {
    if (!supported) return;
    if (data.sdp?.type === 'offer') {
      // A phone (re)starting its link: throw away any old one.
      this.close(slot);
      const pc = new RTCPeerConnection(RTC_CONFIG);
      const link = { pc, channel: null, pending: [] };
      this.links[slot] = link;
      pc.onicecandidate = (e) => {
        if (e.candidate) this.sendSignal(slot, { candidate: e.candidate.toJSON() });
      };
      pc.ondatachannel = (e) => {
        const channel = e.channel;
        link.channel = channel;
        const reply = (msg) => {
          if (channel.readyState === 'open') channel.send(JSON.stringify(msg));
        };
        channel.onmessage = (ev) => {
          let msg;
          try { msg = JSON.parse(ev.data); } catch { return; }
          this.onMessage(slot, msg, reply);
        };
      };
      try {
        await applySignal(pc, data, link.pending);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal(slot, { sdp: pc.localDescription.toJSON() });
      } catch { /* phone stays on the server route */ }
    } else {
      const link = this.links[slot];
      if (link) applySignal(link.pc, data, link.pending).catch(() => {});
    }
  }

  /** Send a message straight to one phone; false if there's no direct link. */
  send(slot, msg) {
    if (!this.isOpen(slot)) return false;
    try { this.links[slot].channel.send(JSON.stringify(msg)); return true; } catch { return false; }
  }

  close(slot) {
    const link = this.links[slot];
    if (link) link.pc.close();
    delete this.links[slot];
  }
}
