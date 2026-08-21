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
  occupe($('#btn-creer'));
  statut('Ouverture de la table…');
  try {
    const h = await R.heberger({
      surMessage: traiter,
      surEtat: (e, ice) => {
        const t = $('#etat-table');
        t.classList.toggle('hors-ligne', e === 'hors-ligne');
        t.title = e === 'hors-ligne' ? 'Table déconnectée — reconnexion…' : 'Table en ligne';
        if (e === 'hors-ligne') V.bandeau('Table déconnectée du service de rendez-vous — reconnexion…', 4000);
        if (e === 'liaison-ratee') appelRate(ice);
      },
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
    libere($('#btn-creer'), 'Créer une partie');
    echouer(e, null);
  }
}

async function rejoindre(codeBrut) {
  const pseudo = lirePseudo();
  if (!pseudo) return;
  const code = R.normaliserCode(codeBrut);
  if (code.length < 4) return erreurAccueil('Entrez le code de la partie (5 caractères).');
  occupe($('#btn-rejoindre'));
  statut('Connexion au service de rendez-vous…');
  try {
    const lien = await R.rejoindre(code, {
      bonjour: () => ({ t: 'bonjour', jeton: jetonPour(code), pseudo: app.pseudo }),
      surMessage: recevoir,
      surEtat: (e, info = {}) => {
        const suite = info.total > 1 && info.tentative > 1 ? ` (essai ${info.tentative}/${info.total})` : '';
        if (e === 'rendez-vous') statut('Connexion au service de rendez-vous…' + suite);
        else if (e === 'appel') statut(`On appelle la table ${code}…` + suite);
        else if (e === 'nouvelle-tentative') statut('Pas de réponse, on réessaie…' + suite);
        else if (e === 'connecte') statut('');
        else if (e === 'reconnexion') {
          statut('Connexion perdue, on se rebranche…');
          if (app.etat) V.bandeau('Connexion perdue, on se rebranche…', 4000);
        }
      },
      surErreur: (e) => {
        if (app.etat) { V.bandeau(R.messageErreur(e), 6000); return; }
        V.ecran('accueil');
        libere($('#btn-rejoindre'), 'Rejoindre');
        echouer(e, code);
      },
    });
    app.role = 'invite'; app.transport = lien; app.code = code;
    location.hash = code;
  } catch (e) {
    libere($('#btn-rejoindre'), 'Rejoindre');
    echouer(e, code);
  }
}

// L'hôte doit savoir qu'un joueur a frappé sans pouvoir entrer, et voir ses
// propres adresses : sans ça, chacun regarde une moitié du problème.
function appelRate(ice) {
  const c = (ice && ice.candidats) || {};
  const d = (ice && ice.distants) || {};
  const z = $('#salon-alerte');
  z.hidden = false;
  const cause = !((d.host || 0) + (d.srflx || 0) + (d.relay || 0))
    ? "Ce joueur ne nous a envoyé aucune adresse : le blocage est <b>de son côté</b>. Qu'il lance « Réglages réseau → Tester ma connexion »."
    : !c.relay && !d.relay
      ? "Vous avez chacun une adresse, mais <b>aucun relais</b> des deux côtés. Vos routeurs n'autorisent pas de chemin direct : il faut un relais, réglé dans « Réglages réseau »."
      : "Des adresses des deux côtés, mais aucun couple ne fonctionne. Un relais de secours lèvera le blocage.";
  const contenu = `<b>Un joueur a essayé de rejoindre, sans y parvenir.</b>
    <ul><li>${cause}</li></ul>
    <p class="technique">Vos adresses — locales ${c.host || 0}, publiques ${c.srflx || 0}, relayées ${c.relay || 0}<br>
    Les siennes — locales ${d.host || 0}, publiques ${d.srflx || 0}, relayées ${d.relay || 0}</p>`;
  z.innerHTML = contenu;
  // La partie peut avoir commencé : l'hôte n'est alors plus devant le salon.
  if (!$('#salon').classList.contains('actif')) {
    V.modale(`<h2>Connexion refusée</h2><div class="diagnostic">${contenu}</div>
      <button class="bouton" data-fermer>Compris</button>`, (m) => {
      m.querySelector('[data-fermer]').addEventListener('click', V.fermerModale);
    });
  }
  V.bandeau("Un joueur n'a pas réussi à se connecter.", 6000);
  S.jouer('nope');
}

// Une panne pair à pair a plusieurs causes très différentes ; les confondre
// derrière un seul message envoie chercher au mauvais endroit.
function echouer(e, code) {
  statut('');
  erreurAccueil(R.messageErreur(e));
  const relais = R.relaisChoisi();
  const ouRelais = relais
    ? `Vous passez par le service <code>${V.echapper(relais)}</code> ; l'hôte doit utiliser exactement le même.`
    : `Vous passez par le service public, comme l'hôte par défaut.`;
  let corps = '';
  if (e && e.type === 'peer-unavailable') {
    corps = `<b>Le service de rendez-vous répond, mais aucune table n'est ouverte sous le code ${V.echapper(code || '')}.</b>
      <ul>
        <li><b>L'hôte a-t-il toujours sa page ouverte ?</b> La partie vit dans son onglet. Fermé, rechargé, ou téléphone verrouillé : la table disparaît, et le code avec elle.</li>
        <li><b>Le code a-t-il changé ?</b> Chaque clic sur « Créer une partie » en tire un nouveau. Reprenez celui affiché <em>en ce moment</em> chez l'hôte.</li>
        <li>${ouRelais}</li>
      </ul>`;
  } else if (e && (e.type === 'lien-bloque' || e.type === 'webrtc')) {
    const c = (e.ice && e.ice.candidats) || {};
    const d = (e.ice && e.ice.distants) || {};
    const etat = (e.ice && e.ice.etat) || 'inconnu';
    const totalDistant = (d.host || 0) + (d.srflx || 0) + (d.relay || 0);
    const pistes = [];
    if (!totalDistant) {
      pistes.push("<b>L'hôte ne nous a envoyé aucune adresse.</b> Le blocage est de son côté : qu'il ouvre « Réglages réseau » puis « Tester ma connexion » sur son appareil.");
    } else if (!c.srflx && !c.relay) {
      pistes.push("Votre navigateur n'a obtenu <b>aucune adresse joignable de l'extérieur</b>. Pare-feu strict, VPN, ou réseau d'entreprise.");
    } else if (!c.relay && !d.relay) {
      pistes.push("Vous avez chacun une adresse publique, mais <b>aucun relais</b> des deux côtés. Vos routeurs ne laissent pas passer de chemin direct : il faut un relais. Voyez « Réglages réseau ».");
    } else {
      pistes.push('Les deux camps ont des adresses, mais aucun couple ne fonctionne. Un relais de secours réglé des deux côtés lèvera le blocage.');
    }
    pistes.push('Pour trancher vite : essayez en partage de connexion depuis un téléphone, des deux côtés.');
    corps = `<b>La table existe, mais la liaison entre vos deux navigateurs ne s'ouvre pas.</b>
      <ul>${pistes.map((x) => `<li>${x}</li>`).join('')}</ul>
      <p class="technique">Vos adresses — locales ${c.host || 0}, publiques ${c.srflx || 0}, relayées ${c.relay || 0}<br>
      Celles de l'hôte — locales ${d.host || 0}, publiques ${d.srflx || 0}, relayées ${d.relay || 0}<br>
      État ICE : ${V.echapper(etat)}${R.turnChoisi() ? ' · relais personnalisé' : ' · aucun relais réglé'}</p>`;
  } else if (e && e.type === 'browser-incompatible') {
    corps = `<b>Ce navigateur ne sait pas établir de liaison directe.</b>
      <ul><li>Il faut Chrome, Firefox, Safari ou Edge à jour. Certains navigateurs intégrés
      (celui d'une application de messagerie, par exemple) désactivent le WebRTC : ouvrez le
      lien dans votre vrai navigateur.</li></ul>`;
  } else {
    corps = `<b>Le service de rendez-vous est injoignable.</b>
      <ul>
        <li>Vérifiez votre connexion, puis réessayez.</li>
        <li>${ouRelais}</li>
      </ul>`;
  }
  // De quoi nommer la panne si elle doit être rapportée.
  corps += `<p class="technique">Code technique : ${V.echapper((e && e.type) || 'inconnu')}</p>`;
  diagnostic(corps + '<button class="bouton" data-reessayer>Réessayer</button>');
  $('#diagnostic').querySelector('[data-reessayer]').addEventListener('click', () => {
    diagnostic('');
    erreurAccueil('');
    if (code) rejoindre(code); else creer();
  });
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
  statut('');
  diagnostic('');
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
function statut(texte) {
  const z = $('#statut');
  z.hidden = !texte;
  if (texte) z.querySelector('span').textContent = texte;
}

function diagnostic(html) {
  const z = $('#diagnostic');
  z.hidden = !html;
  z.innerHTML = html || '';
}

function erreurAccueil(t, douce = false) {
  const z = $('#accueil-erreur');
  z.textContent = t;
  z.style.color = douce ? 'var(--doux)' : '';
}
function occupe(b) { b.disabled = true; b.classList.add('occupe'); erreurAccueil(''); diagnostic(''); }
function libere(b, t) { b.disabled = false; b.classList.remove('occupe'); b.textContent = t; }

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

  const perso = [
    R.relaisChoisi() && ['Service de rendez-vous', R.relaisChoisi(), R.oublierRelais],
    R.turnChoisi() && ['Relais de secours', R.turnChoisi(), R.oublierTurn],
  ].filter(Boolean);
  if (perso.length) {
    const z = $('#relais-actif');
    z.hidden = false;
    for (const [nom, valeur, oublier] of perso) {
      const ligne = document.createElement('span');
      ligne.innerHTML = `${nom} personnalisé : <code>${V.echapper(valeur.split('|')[0])}</code> — `;
      const b = document.createElement('button');
      b.textContent = 'revenir au réglage public';
      b.addEventListener('click', () => { oublier(); location.search = ''; });
      ligne.appendChild(b);
      ligne.appendChild(document.createElement('br'));
      z.appendChild(ligne);
    }
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
  $('#btn-reseau').addEventListener('click', () => {
    const [urls = '', user = '', pass = ''] = (R.turnChoisi() || '').split('|');
    $('#turn-url').value = urls; $('#turn-user').value = user; $('#turn-pass').value = pass;
    $('#panneau-reseau').hidden = false;
  });
  $('#btn-fermer-reseau').addEventListener('click', () => { $('#panneau-reseau').hidden = true; });
  $('#btn-turn-garder').addEventListener('click', () => {
    const url = $('#turn-url').value.trim();
    if (!url) return V.bandeau("Indiquez l'adresse du relais.");
    R.enregistrerTurn([url, $('#turn-user').value.trim(), $('#turn-pass').value.trim()].join('|'));
    V.bandeau('Relais enregistré. Il voyagera dans vos invitations.');
  });
  $('#btn-turn-oublier').addEventListener('click', () => {
    R.enregistrerTurn('');
    $('#turn-url').value = ''; $('#turn-user').value = ''; $('#turn-pass').value = '';
    V.bandeau('Relais retiré.');
  });
  $('#btn-tester').addEventListener('click', async () => {
    const b = $('#btn-tester');
    const z = $('#resultat-test');
    b.disabled = true; b.textContent = 'Test en cours…';
    z.hidden = false;
    z.innerHTML = '<div class="statut"><i class="rotule"></i><span>On rassemble les adresses…</span></div>';
    const r = await R.testerConnexion();
    b.disabled = false; b.textContent = 'Relancer le test';
    if (r.erreur) { z.innerHTML = `<b>${V.echapper(r.erreur)}</b>`; return; }
    const lignes = [
      [r.host > 0, 'Réseau local', r.host > 0 ? 'votre machine est visible sur son propre réseau.' : "aucune adresse locale — c'est très inhabituel."],
      [r.srflx > 0, 'Adresse publique (STUN)', r.srflx > 0 ? 'vos amis peuvent apprendre où vous joindre.' : 'bloquée : vous ne pourrez jouer que sur votre réseau local.'],
      [r.relay > 0, 'Relais de secours', r.relay > 0 ? 'opérationnel — vous pourrez jouer depuis à peu près partout.' : (r.relaisConfigure ? 'réglé mais sans réponse : vérifiez adresse et identifiants.' : 'aucun relais réglé. Sans lui, il faut un chemin direct entre les deux joueurs.')],
    ];
    z.innerHTML = `<b>${r.srflx > 0 && r.relay > 0 ? 'Tout est au vert.' : r.srflx > 0 ? 'Jouable, mais pas depuis tous les réseaux.' : 'Connexion très restreinte.'}</b>
      <ul>${lignes.map(([ok, titre, texte]) => `<li>${ok ? '✅' : '⚠️'} <b>${titre}</b> — ${texte}</li>`).join('')}</ul>
      <p class="technique">Adresses obtenues — locales ${r.host}, publiques ${r.srflx}, relayées ${r.relay}</p>`;
  });

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
