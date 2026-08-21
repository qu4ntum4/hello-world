// Transport pair à pair (WebRTC via PeerJS). L'hôte est le serveur de la
// partie : tout le monde se connecte à lui, lui seul arbitre les règles.

const PREFIXE = 'chatonsqui-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ni I, ni L, ni O, ni 0/1
const BATTEMENT = 5000;
const PEREMPTION = 16000;

export function genererCode(n = 5) {
  const t = new Uint32Array(n);
  crypto.getRandomValues(t);
  return Array.from(t, (v) => ALPHABET[v % ALPHABET.length]).join('');
}

export function normaliserCode(brut) {
  return String(brut || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

const idPair = (code) => PREFIXE + code.toLowerCase();

// Par défaut on passe par le service de rendez-vous public de PeerJS : il ne
// sert qu'à mettre deux navigateurs en relation, les cartes ne transitent
// jamais par lui. Qui veut le sien met ?relais=mon.serveur:9000 dans l'URL.
export function relaisChoisi() {
  return new URLSearchParams(location.search).get('relais') || localStorage.getItem('chatons.relais') || '';
}

export function oublierRelais() {
  localStorage.removeItem('chatons.relais');
}

// Deux navigateurs derrière des box grand public trouvent presque toujours un
// chemin direct avec du STUN seul. Mais dès qu'un NAT symétrique, un VPN ou un
// pare-feu d'entreprise s'en mêle, il n'existe aucun chemin direct : il faut un
// relais TURN, sans quoi la liaison ne peut tout simplement pas s'ouvrir.
// Le relais ne voit passer que du chiffré — le canal est protégé de bout en
// bout par DTLS — mais il voit passer les paquets, contrairement au service de
// rendez-vous. D'où la possibilité de mettre le sien.
const TURN_PUBLIC = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

// ?turn=turn:mon.serveur:3478|utilisateur|secret — mémorisé et transmis dans le
// lien d'invitation, comme le service de rendez-vous.
export function turnChoisi() {
  return new URLSearchParams(location.search).get('turn') || localStorage.getItem('chatons.turn') || '';
}

export function oublierTurn() { localStorage.removeItem('chatons.turn'); }

export function serveursIce() {
  const brut = turnChoisi();
  if (!brut) return TURN_PUBLIC;
  localStorage.setItem('chatons.turn', brut);
  const [urls, username, credential] = brut.split('|');
  const perso = username ? { urls, username, credential } : { urls };
  return [TURN_PUBLIC[0], perso];
}

function optionsPair() {
  const o = { debug: 0, config: { iceServers: serveursIce(), sdpSemantics: 'unified-plan' } };
  const brut = relaisChoisi();
  if (!brut) return o;
  try {
    const u = new URL(brut.includes('://') ? brut : 'https://' + brut);
    o.host = u.hostname;
    o.secure = u.protocol !== 'http:';
    o.port = Number(u.port) || (o.secure ? 443 : 80);
    if (u.pathname && u.pathname !== '/') o.path = u.pathname;
    localStorage.setItem('chatons.relais', brut);
  } catch { /* relais illisible : on garde le service public */ }
  return o;
}

function attendreOuverture(peer) {
  return new Promise((resolve, reject) => {
    const ok = () => { peer.off('error', ko); resolve(peer); };
    const ko = (e) => { peer.off('open', ok); reject(e); };
    peer.once('open', ok);
    peer.once('error', ko);
  });
}

export function messageErreur(e) {
  switch (e && e.type) {
    case 'peer-unavailable': return "Aucune table n'est ouverte sous ce code.";
    case 'lien-bloque': case 'webrtc':
      return "La table a été trouvée, mais la liaison entre vos deux navigateurs ne s'établit pas.";
    case 'unavailable-id':   return 'Ce code est déjà pris, on en tire un autre.';
    case 'browser-incompatible': return "Ce navigateur ne gère pas le WebRTC. Essayez Chrome, Firefox, Safari ou Edge à jour.";
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
      return 'Connexion au service de rendez-vous impossible. Réseau instable, ou pare-feu trop strict.';
    case 'disconnected': return 'Déconnecté du service de rendez-vous.';
    default: return (e && e.message) || 'Erreur réseau.';
  }
}

// ————————————————————————————————————————————————————————————— hôte

// Ouvre la table. Si le code est déjà pris, on en tire un autre (jusqu'à 5 fois).
export async function heberger({ surMessage, surDepart, surErreur, surEtat = () => {} }) {
  let peer = null;
  let code = null;
  for (let essai = 0; essai < 5; essai++) {
    code = genererCode();
    const p = new Peer(idPair(code), optionsPair());
    try { await attendreOuverture(p); peer = p; break; }
    catch (e) {
      p.destroy();
      if (e && e.type === 'unavailable-id') continue;
      throw e;
    }
  }
  if (!peer) throw { type: 'unavailable-id' };

  const liens = new Map(); // cle -> { conn, vuLe }

  peer.on('connection', (conn) => {
    const cle = conn.peer;
    conn.on('open', () => {
      liens.set(cle, { conn, vuLe: Date.now() });
    });
    conn.on('data', (msg) => {
      const l = liens.get(cle);
      if (l) l.vuLe = Date.now();
      if (msg && msg.t === 'ping') { try { conn.send({ t: 'pong' }); } catch {} return; }
      surMessage(cle, msg);
    });
    conn.on('close', () => { liens.delete(cle); surDepart(cle); });
    conn.on('error', () => { liens.delete(cle); surDepart(cle); });
  });

  peer.on('error', (e) => {
    if (e && e.type === 'peer-unavailable') return; // un invité a raccroché
    surErreur(e);
  });
  peer.on('disconnected', () => {
    surEtat('hors-ligne');
    try { peer.reconnect(); } catch {}
  });
  peer.on('open', () => surEtat('en-ligne'));

  const veille = setInterval(() => {
    const t = Date.now();
    for (const [cle, l] of liens) {
      if (t - l.vuLe > PEREMPTION) { liens.delete(cle); try { l.conn.close(); } catch {} surDepart(cle); }
    }
  }, 3000);

  return {
    code,
    envoyer(cle, msg) {
      const l = liens.get(cle);
      if (!l) return false;
      try { l.conn.send(msg); return true; } catch { return false; }
    },
    diffuser(fabrique) {
      for (const [cle, l] of liens) {
        try { l.conn.send(typeof fabrique === 'function' ? fabrique(cle) : fabrique); } catch {}
      }
    },
    connectes() { return [...liens.keys()]; },
    fermer() { clearInterval(veille); for (const [, l] of liens) { try { l.conn.close(); } catch {} } peer.destroy(); },
  };
}

// Quand rien ne s'ouvre, la nature des adresses rassemblées dit où ça coince :
// pas de « srflx », le STUN est bloqué ; pas de « relay », aucun relais TURN
// n'est joignable.
function sonderIce(conn) {
  const vus = { host: 0, srflx: 0, prflx: 0, relay: 0 };
  let etat = 'jamais démarré';
  let branche = false;

  const brancher = () => {
    const pc = conn.peerConnection;
    if (!pc || branche) return branche;
    branche = true;
    etat = pc.iceConnectionState;
    pc.addEventListener('icecandidate', (ev) => {
      const t = ev.candidate && ev.candidate.candidate && / typ (\w+)/.exec(ev.candidate.candidate);
      if (t && vus[t[1]] !== undefined) vus[t[1]] += 1;
    });
    pc.addEventListener('iceconnectionstatechange', () => { etat = pc.iceConnectionState; });
    return true;
  };

  if (!brancher()) {
    const t = setInterval(() => { if (brancher()) clearInterval(t); }, 120);
    setTimeout(() => clearInterval(t), 8000);
  }
  return () => ({ candidats: { ...vus }, etat });
}

// ————————————————————————————————————————————————————————————— invité

// Se connecte à l'hôte et se rebranche tout seul si le lien saute.
export async function rejoindre(code, { bonjour, surMessage, surEtat, surErreur }) {
  let peer = null;
  let conn = null;
  let vivant = true;
  let battement = null;
  let essais = 0;        // reconnexions après une partie déjà établie
  let tentatives = 0;    // essais du tout premier branchement
  let etabli = false;    // a-t-on déjà été connecté à l'hôte au moins une fois ?

  // Le registre du service de rendez-vous met parfois une seconde à voir une
  // table qui vient d'ouvrir : un premier « introuvable » ne prouve rien.
  const MAX_TENTATIVES = 3;

  async function brancher() {
    if (!vivant) return;
    tentatives += 1;
    surEtat(etabli ? 'reconnexion' : 'rendez-vous', { tentative: tentatives, total: MAX_TENTATIVES });
    peer = new Peer(optionsPair());
    try { await attendreOuverture(peer); } catch (e) { return echec(e); }
    if (!vivant) { peer.destroy(); return; }

    surEtat(etabli ? 'reconnexion' : 'appel', { tentative: tentatives, total: MAX_TENTATIVES });
    conn = peer.connect(idPair(code), { reliable: true });
    const rapportIce = sonderIce(conn);

    // Le service a bien transmis notre appel, mais la liaison ne s'ouvre pas :
    // ce n'est pas la même panne qu'un code inconnu. On laisse le temps à un
    // relais TURN en TCP/443 de s'établir, c'est le chemin le plus lent.
    const minuteurOuverture = setTimeout(() => {
      if (conn && !conn.open) { try { conn.close(); } catch {} echec({ type: 'lien-bloque', ice: rapportIce() }); }
    }, 22000);

    conn.on('open', () => {
      clearTimeout(minuteurOuverture);
      essais = 0; tentatives = 0; etabli = true;
      if (bonjour) { try { conn.send(bonjour()); } catch {} }
      surEtat('connecte');
      clearInterval(battement);
      battement = setInterval(() => { try { conn.send({ t: 'ping' }); } catch {} }, BATTEMENT);
    });
    conn.on('data', (msg) => { if (!msg || msg.t === 'pong') return; surMessage(msg); });
    conn.on('close', () => { clearTimeout(minuteurOuverture); rebrancher(); });
    conn.on('error', () => {});
    peer.on('error', (e) => {
      clearTimeout(minuteurOuverture);
      if (etabli) return rebrancher();
      // PeerJS range sous « webrtc » l'échec de la négociation elle-même :
      // la table a répondu, c'est le canal direct qui refuse de se monter.
      // Le confondre avec une panne de réseau envoie chercher au mauvais endroit.
      const cause = e && (e.type === 'webrtc' || e.type === 'negotiation-failed')
        ? { type: 'lien-bloque', ice: rapportIce() }
        : e;
      echec(cause);
    });
  }

  function echec(e) {
    clearInterval(battement);
    if (peer) { try { peer.destroy(); } catch {} }
    if (!vivant) return;
    if (etabli) return rebrancher();
    // Avant la première connexion : on retente le code quelques fois.
    // Un registre qui n'a pas encore vu la table, ça se retente ; une liaison
    // qui ne s'ouvre pas, non — autant rendre la main tout de suite.
    if (e && e.type === 'peer-unavailable' && tentatives < MAX_TENTATIVES) {
      surEtat('nouvelle-tentative', { tentative: tentatives, total: MAX_TENTATIVES });
      setTimeout(brancher, 1600);
      return;
    }
    vivant = false;
    surErreur(e);
  }

  function rebrancher() {
    clearInterval(battement);
    if (!vivant) return;
    surEtat('reconnexion');
    if (peer) { try { peer.destroy(); } catch {} }
    essais += 1;
    if (essais > 12) { vivant = false; surErreur({ type: 'network' }); return; }
    setTimeout(brancher, Math.min(1000 * 2 ** Math.min(essais, 4), 12000));
  }

  await brancher();

  return {
    envoyer(msg) { try { if (conn && conn.open) { conn.send(msg); return true; } } catch {} return false; },
    fermer() { vivant = false; clearInterval(battement); if (peer) { try { peer.destroy(); } catch {} } },
  };
}
