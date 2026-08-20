// Orchestration : qui héberge, qui rejoint, et qui parle à qui.
// L'hôte fait tourner le moteur ; les autres n'en voient que leur propre vue.
import { Partie, NB_MAX } from './moteur.js';
import { nomCarte } from './cartes.js';
import * as V from './vue.js';
import * as R from './reseau.js';
import * as S from './sons.js';
import * as P from './partage.js';

const $ = (s) => document.querySelector(s);
const HOTE = 'j1';

const app = {
  role: null,        // 'hote' | 'invite'
  code: null,
  moiId: null,
  pseudo: '',
  transport: null,
  etat: null,
  precedent: null,
  table: null,       // hôte seulement
  chatVu: 0,
};

// ————————————————————————————————————————————————————— envoi d'actions

function envoyer(msg) {
  if (app.role === 'hote') traiter('local', msg);
  else if (app.transport && !app.transport.envoyer(msg)) V.bandeau('Message perdu — reconnexion en cours…');
}

const cb = {
  onSelection: () => rendre(),
  onPiocher: () => { S.jouer('pioche'); envoyer({ t: 'piocher' }); },
  onNope: () => { S.jouer('nope'); envoyer({ t: 'nope' }); },
  onLaisser: () => envoyer({ t: 'laisser' }),
  onDonner: (carte) => envoyer({ t: 'donner', carte }),
  onNommer: (type) => envoyer({ t: 'nommer', type }),
  onReprendre: (carte) => envoyer({ t: 'reprendre', carte }),
  onDesamorcer: (position) => envoyer({ t: 'desamorcer', position }),
  onExploser: () => envoyer({ t: 'exploser' }),
  onRejouer: () => envoyer({ t: 'rejouer' }),
  onJouer: (cartes, types) => {
    const v = V.validerSelection(types);
    if (!v.ok) return;
    S.jouer('carte');
    if (v.cible) {
      V.modaleCible(app.etat, v.libelle, (cible) => { V.viderSelection(); envoyer({ t: 'jouer', cartes, cible }); });
    } else {
      V.viderSelection();
      envoyer({ t: 'jouer', cartes });
    }
  },
};

// ————————————————————————————————————————————————————— côté hôte

function nouvelleTable(code) {
  app.table = {
    code,
    joueurs: [{ id: HOTE, pseudo: app.pseudo, jeton: 'local', cle: 'local', connecte: true, spectateur: false }],
    chat: [{ systeme: true, texte: `${app.pseudo} ouvre la table.` }],
    partie: null,
    compteur: 1,
  };
}

function joueurParCle(cle) { return app.table.joueurs.find((j) => j.cle === cle) || null; }

function traiter(cle, msg) {
  const t = app.table;
  if (!t || !msg) return;

  if (msg.t === 'bonjour') {
    let j = t.joueurs.find((x) => x.jeton === msg.jeton);
    const pseudo = String(msg.pseudo || 'Anonyme').slice(0, 14).trim() || 'Anonyme';
    if (j) {
      const revient = !j.connecte;
      j.cle = cle; j.connecte = true; j.pseudo = pseudo;
      if (revient) t.chat.push({ systeme: true, texte: `${pseudo} est de retour.` });
    } else {
      const places = t.joueurs.filter((x) => !x.spectateur).length;
      const spectateur = !!t.partie || places >= NB_MAX;
      j = { id: 'j' + (++t.compteur), pseudo, jeton: msg.jeton, cle, connecte: true, spectateur };
      t.joueurs.push(j);
      t.chat.push({ systeme: true, texte: spectateur ? `${pseudo} rejoint en spectateur.` : `${pseudo} rejoint la partie.` });
      S.jouer('arrivee');
    }
    app.transport.envoyer(cle, { t: 'moi', id: j.id, code: t.code });
    return diffuser();
  }

  const j = cle === 'local' ? t.joueurs[0] : joueurParCle(cle);
  if (!j) return;

  if (msg.t === 'chat') {
    const texte = String(msg.texte || '').slice(0, 200).trim();
    if (!texte) return;
    t.chat.push({ pseudo: j.pseudo, texte });
    if (t.chat.length > 200) t.chat.splice(0, t.chat.length - 200);
    return diffuser();
  }

  if (msg.t === 'demarrer' || msg.t === 'rejouer') {
    if (j.id !== HOTE) return;
    if (msg.t === 'demarrer' && t.partie) return;
    if (msg.t === 'rejouer' && t.partie && !t.partie.gagnant && t.partie.vivants().length > 1) return;
    return lancerPartie();
  }

  if (!t.partie) return;
  const err = t.partie.action(j.id, msg);
  if (err) {
    if (j.cle === 'local') V.bandeau(err);
    else app.transport.envoyer(j.cle, { t: 'ennui', texte: err });
  }
}

function lancerPartie() {
  const t = app.table;
  if (t.partie) t.partie.arreter();
  const dispos = t.joueurs.filter((j) => j.connecte);
  if (dispos.length < 2) { V.bandeau('Il faut au moins deux joueurs.'); return; }
  const retenus = dispos.slice(0, NB_MAX);
  for (const j of t.joueurs) j.spectateur = !retenus.includes(j);
  t.partie = new Partie(retenus.map((j) => ({ id: j.id, pseudo: j.pseudo })), {
    surChangement: diffuser,
    surPrive: (id, m) => {
      const dest = t.joueurs.find((x) => x.id === id);
      if (!dest) return;
      if (dest.cle === 'local') recevoirPrive(m);
      else app.transport.envoyer(dest.cle, { t: 'prive', ...m });
    },
  });
  t.chat.push({ systeme: true, texte: `La partie démarre à ${retenus.length} joueurs.` });
  diffuser();
}

function etatPour(id) {
  const t = app.table;
  const p = t.partie;
  const v = p ? p.vuePour(id) : null;
  const joueurs = t.joueurs.map((j) => {
    const g = v ? v.joueurs.find((x) => x.id === j.id) : null;
    const e = {
      id: j.id, pseudo: j.pseudo, connecte: j.connecte,
      spectateur: j.spectateur || (!!v && !g),
      nbCartes: g ? g.nbCartes : 0, vivant: g ? g.vivant : false, aLaMain: g ? g.aLaMain : false,
    };
    if (v && v.moi && v.moi.id === j.id) { e.main = v.moi.main; e.vivant = v.moi.vivant; }
    return e;
  });
  return {
    code: t.code, hote: HOTE, moi: id,
    phase: v ? v.phase : 'salon',
    joueurs,
    chat: t.chat.slice(-80),
    tour: v ? v.tour : null,
    toursRestants: v ? v.toursRestants : 1,
    pioche: v ? v.pioche : 0,
    defausse: v ? v.defausse : [],
    attente: v ? v.attente : null,
    journal: v ? v.journal : [],
    gagnant: v ? v.gagnant : null,
  };
}

function diffuser() {
  const t = app.table;
  if (!t) return;
  for (const j of t.joueurs) {
    if (j.cle === 'local') { appliquerEtat(etatPour(j.id)); continue; }
    if (j.connecte) app.transport.envoyer(j.cle, { t: 'etat', e: etatPour(j.id) });
  }
}

// Un joueur parti ne doit pas figer la table.
function surveiller() {
  setInterval(() => {
    const t = app.table;
    if (!t || !t.partie || t.partie.gagnant) return;
    const p = t.partie;
    const bloquant = p.attente ? (p.attente.joueur || p.attente.donneur) : (p.courant && p.courant.id);
    if (!bloquant) return;
    const j = t.joueurs.find((x) => x.id === bloquant);
    if (j && !j.connecte) { p.debloquerSi(bloquant); diffuser(); }
  }, 9000);
}

// ————————————————————————————————————————————————————— création / connexion

function jetonPour(code) {
  const cle = 'chatons.jeton.' + code;
  let v = localStorage.getItem(cle);
  if (!v) { v = R.genererCode(12) + Date.now().toString(36); localStorage.setItem(cle, v); }
  return v;
}

async function creer() {
  const pseudo = lirePseudo();
  if (!pseudo) return;
  occupe($('#btn-creer'), 'Ouverture de la table…');
  try {
    const h = await R.heberger({
      surMessage: traiter,
      surDepart: (cle) => {
        const j = joueurParCle(cle);
        if (!j) return;
        j.connecte = false;
        app.table.chat.push({ systeme: true, texte: `${j.pseudo} a perdu la connexion.` });
        diffuser();
      },
      surErreur: (e) => V.bandeau(R.messageErreur(e)),
    });
    app.role = 'hote'; app.transport = h; app.code = h.code; app.moiId = HOTE;
    nouvelleTable(h.code);
    location.hash = h.code;
    surveiller();
    diffuser();
  } catch (e) {
    erreurAccueil(R.messageErreur(e));
  } finally {
    libere($('#btn-creer'), 'Créer une partie');
  }
}

async function rejoindre(codeBrut) {
  const pseudo = lirePseudo();
  if (!pseudo) return;
  const code = R.normaliserCode(codeBrut);
  if (code.length < 4) return erreurAccueil('Entrez le code de la partie (5 caractères).');
  occupe($('#btn-rejoindre'), '…');
  try {
    const lien = await R.rejoindre(code, {
      bonjour: () => ({ t: 'bonjour', jeton: jetonPour(code), pseudo: app.pseudo }),
      surMessage: recevoir,
      surEtat: (e) => {
        if (e === 'reconnexion') V.bandeau('Connexion perdue, on se rebranche…', 4000);
      },
      surErreur: (e) => {
        if (app.etat) V.bandeau(R.messageErreur(e), 6000);
        else { V.ecran('accueil'); erreurAccueil(R.messageErreur(e)); }
      },
    });
    app.role = 'invite'; app.transport = lien; app.code = code;
    location.hash = code;
  } catch (e) {
    erreurAccueil(R.messageErreur(e));
  } finally {
    libere($('#btn-rejoindre'), 'Rejoindre');
  }
}

function recevoir(msg) {
  switch (msg.t) {
    case 'moi': app.moiId = msg.id; app.code = msg.code; break;
    case 'etat': appliquerEtat(msg.e); break;
    case 'prive': recevoirPrive(msg); break;
    case 'ennui': V.bandeau(msg.texte); break;
  }
}

function recevoirPrive(m) {
  switch (m.t) {
    case 'avenir': V.modaleAvenir(m.cartes); break;
    case 'pioche': V.bandeau(`Vous piochez : ${nomCarte(m.carte)}`); break;
    case 'vol': V.bandeau(`Vous prenez ${nomCarte(m.carte)} à ${m.de}`); break;
    case 'vole': V.bandeau(`${m.par} vous prend ${nomCarte(m.carte)}`); break;
  }
}

// ————————————————————————————————————————————————————— rendu et réactions

function appliquerEtat(e) {
  app.precedent = app.etat;
  // En arrivant à table, on ne traîne pas les messages du salon comme non lus.
  if ((!app.etat || app.etat.phase === 'salon') && e.phase !== 'salon') app.chatVu = e.chat.length;
  app.etat = e;
  reagir(app.precedent, e);
  rendre();
}

function rendre() {
  const e = app.etat;
  if (!e) return;
  if (e.phase === 'salon') {
    V.ecran('salon');
    V.rendreSalon(e);
    V.rendreChat('#chat-salon', e.chat);
    rendrePartage();
  } else {
    V.ecran('table');
    V.rendreTable(e, cb);
    V.rendreChat('#chat-table', e.chat);
    const ouvert = !$('#panneau-chat').hidden;
    if (ouvert) app.chatVu = e.chat.length;
    $('#pastille-chat').hidden = e.chat.length <= app.chatVu;
  }
}

function reagir(av, ap) {
  if (!ap) return;
  const dejaVu = new Set((av && av.journal || []).map((l) => l.t + l.texte));
  for (const l of ap.journal || []) {
    if (dejaVu.has(l.t + l.texte)) continue;
    if (l.genre === 'boum') { S.jouer('boum'); V.explosion(); }
    else if (l.genre === 'sauve') S.jouer('sauve');
    else if (l.genre === 'nope') S.jouer('nope');
    else if (l.genre === 'vol') S.jouer('vol');
    else if (l.genre === 'victoire') S.jouer('victoire');
  }
  const avantMoi = av && av.tour === av.moi;
  if (ap.tour === ap.moi && !avantMoi && ap.phase === 'jeu') S.jouer('tour');
  if (av && ap.chat.length > av.chat.length && $('#panneau-chat').hidden) S.jouer('message');
}

function rendrePartage() {
  const z = $('#partage');
  if (z.dataset.code === app.code) return;
  z.dataset.code = app.code;
  z.innerHTML = '';
  if (P.partageNatifDisponible()) {
    const b = document.createElement('button');
    b.className = 'principal';
    b.innerHTML = '<span class="emoji">📤</span><span>Partager l\'invitation</span>';
    b.addEventListener('click', () => P.partagerNatif(app.code, app.pseudo));
    z.appendChild(b);
  }
  for (const c of P.CANAUX) {
    const a = document.createElement('a');
    a.href = P.urlCanal(c.id, app.code, app.pseudo);
    a.target = '_blank'; a.rel = 'noopener';
    a.innerHTML = `<span class="emoji">${c.emoji}</span><span>${c.nom}</span>`;
    z.appendChild(a);
  }
}

// ————————————————————————————————————————————————————— petites aides d'accueil

function lirePseudo() {
  const v = $('#pseudo').value.trim().slice(0, 14);
  if (!v) { erreurAccueil('Il nous faut un prénom pour vous appeler.'); $('#pseudo').focus(); return null; }
  app.pseudo = v;
  localStorage.setItem('chatons.pseudo', v);
  return v;
}
function erreurAccueil(t, douce = false) {
  const z = $('#accueil-erreur');
  z.textContent = t;
  z.style.color = douce ? 'var(--doux)' : '';
}
function occupe(b, t) { b.disabled = true; b.textContent = t; erreurAccueil(''); }
function libere(b, t) { b.disabled = false; b.textContent = t; }

function quitter() {
  if (app.transport) app.transport.fermer();
  if (app.table && app.table.partie) app.table.partie.arreter();
  location.hash = '';
  location.reload();
}

// ————————————————————————————————————————————————————— branchements

function brancher() {
  V.poserLogo();
  $('#pseudo').value = localStorage.getItem('chatons.pseudo') || '';

  const codeUrl = R.normaliserCode(location.hash.slice(1));
  if (codeUrl) {
    $('#code-saisi').value = codeUrl;
    if ($('#pseudo').value) $('#btn-rejoindre').classList.add('bouton--majeur');
    else $('#pseudo').focus();
    erreurAccueil(`Partie ${codeUrl} — entrez votre prénom et rejoignez.`, true);
  }

  $('#btn-creer').addEventListener('click', () => { S.reveiller(); creer(); });
  $('#form-rejoindre').addEventListener('submit', (ev) => { ev.preventDefault(); S.reveiller(); rejoindre($('#code-saisi').value); });
  $('#code-saisi').addEventListener('input', (ev) => { ev.target.value = R.normaliserCode(ev.target.value); });

  $('#btn-copier').addEventListener('click', async () => {
    V.bandeau(await P.copierLien(app.code) ? 'Lien copié !' : 'Copie impossible — sélectionnez le lien à la main.');
  });
  $('#btn-demarrer').addEventListener('click', () => { S.reveiller(); envoyer({ t: 'demarrer' }); });
  $('#btn-quitter-salon').addEventListener('click', () => { if (confirm('Quitter la partie ?')) quitter(); });

  $('#pioche').addEventListener('click', () => {
    const e = app.etat;
    if (!e || e.phase !== 'jeu' || e.attente || e.tour !== e.moi) return;
    cb.onPiocher();
  });

  for (const [b, p] of [['#btn-chat', '#panneau-chat'], ['#btn-regles-table', '#panneau-regles'],
                        ['#btn-regles-salon', '#panneau-regles'], ['#btn-regles-accueil', '#panneau-regles']]) {
    $(b).addEventListener('click', () => {
      if (p === '#panneau-regles') V.rendreRegles();
      $(p).hidden = false;
      if (p === '#panneau-chat' && app.etat) { app.chatVu = app.etat.chat.length; $('#pastille-chat').hidden = true; }
    });
  }
  $('#btn-fermer-chat').addEventListener('click', () => { $('#panneau-chat').hidden = true; });
  $('#btn-fermer-regles').addEventListener('click', () => { $('#panneau-regles').hidden = true; });

  for (const f of ['#form-chat-salon', '#form-chat-table']) {
    $(f).addEventListener('submit', (ev) => {
      ev.preventDefault();
      const input = $(f).querySelector('input');
      const texte = input.value.trim();
      if (!texte) return;
      input.value = '';
      envoyer({ t: 'chat', texte });
    });
  }

  const btnSon = $('#btn-son');
  const majSon = () => btnSon.classList.toggle('eteint', !S.sonsActifs());
  btnSon.addEventListener('click', () => { S.reveiller(); S.basculerSons(); majSon(); });
  majSon();

  document.addEventListener('click', () => S.reveiller(), { once: true });
  window.addEventListener('beforeunload', (ev) => {
    if (app.role === 'hote' && app.table && app.table.partie && !app.table.partie.gagnant) {
      ev.preventDefault(); ev.returnValue = '';
    }
  });

  setInterval(V.tictac, 250);
}

brancher();
