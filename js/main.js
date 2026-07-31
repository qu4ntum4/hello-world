/**
 * Assemblage : mémoire ↔ avatar ↔ cerveau ↔ voix ↔ vie autonome ↔ interface.
 */

import { Memoire, NOMS_NIVEAUX, formaterDuree } from './memory.js';
import { Avatar } from './avatar3d.js';
import { Cerveau } from './brain.js';
import { FOURNISSEURS } from './providers.js';
import { Voix, Micro } from './voice.js';
import { VieAutonome } from './life.js';

const $ = (id) => document.getElementById(id);

const el = {
  toile: $('toile'),
  lueur: $('lueur'),
  nom: $('nom-compagnon'),
  lien: $('etat-lien'),
  dialogue: $('dialogue'),
  signal: $('signal-outil'),
  composer: $('composer'),
  saisie: $('saisie'),
  btnEnvoyer: $('btn-envoyer'),
  btnMicro: $('btn-micro'),
  btnVoix: $('btn-voix'),
  btnReglages: $('btn-reglages'),
  btnMemoire: $('btn-memoire'),
  tiroir: $('tiroir'),
  tiroirTitre: $('tiroir-titre'),
  btnFermerTiroir: $('btn-fermer-tiroir'),
  panneauReglages: $('panneau-reglages'),
  panneauMemoire: $('panneau-memoire'),
  voile: $('voile'),
  accueil: $('accueil'),
  cleAccueil: $('cle-accueil'),
  btnAccueilOk: $('btn-accueil-ok'),
  btnAccueilPlusTard: $('btn-accueil-plus-tard'),
  cleApi: $('cle-api'),
  fournisseur: $('fournisseur'),
  noteFournisseur: $('note-fournisseur'),
  lienCles: $('lien-cles'),
  lienModeles: $('lien-modeles'),
  baseApi: $('base-api'),
  labelBase: $('label-base'),
  labelEffort: $('label-effort'),
  modele: $('modele'),
  suggestions: $('modeles-suggeres'),
  fournisseurAccueil: $('fournisseur-accueil'),
  noteAccueil: $('note-accueil'),
  lienClesAccueil: $('lien-cles-accueil'),
  effort: $('effort'),
  voixChoisie: $('voix-choisie'),
  optVoix: $('opt-voix'),
  optMicro: $('opt-micro'),
  optAutonomie: $('opt-autonomie'),
  resumeMemoire: $('resume-memoire'),
  listeFaits: $('liste-faits'),
  listeJournal: $('liste-journal'),
  btnExporter: $('btn-exporter'),
  btnImporter: $('btn-importer'),
  btnReinitialiser: $('btn-reinitialiser'),
  fichierImport: $('fichier-import'),
  jauges: {
    valence: $('j-valence'),
    eveil: $('j-eveil'),
    energie: $('j-energie'),
    affection: $('j-affection'),
  },
};

// ------------------------------------------------------------------ noyau

const memoire = new Memoire();
const avatar = new Avatar(el.toile);
avatar.definirHumeur(memoire.etat.humeur);
avatar.definirApparence(memoire.etat.apparence);
avatar.demarrer();

let bulleEnCours = null;
let voixEnAttente = 0;

const voix = new Voix({
  langue: memoire.etat.reglages.langue,
  surSyllabe: (f) => avatar.impulsionVoix(f),
  surDebut: () => {
    voixEnAttente += 1;
    avatar.definirParole(true);
  },
  surFin: () => {
    voixEnAttente = Math.max(0, voixEnAttente - 1);
    if (voixEnAttente === 0) avatar.definirParole(false);
  },
});
voix.actif = memoire.etat.reglages.voix;
voix.nomVoixPreferee = memoire.etat.reglages.nomVoix;

const micro = new Micro({
  langue: memoire.etat.reglages.langue,
  surResultat: (texte) => {
    el.saisie.value = texte;
    envoyer();
  },
  surPartiel: (texte) => {
    el.saisie.value = texte;
  },
  surEtat: (actif) => {
    el.btnMicro.classList.toggle('ecoute', actif);
  },
});

const cerveau = new Cerveau({
  memoire,
  avatar,
  surTexte: (morceau) => {
    if (!bulleEnCours) bulleEnCours = ajouterBulle('lui', '', true);
    bulleEnCours.textContent += morceau;
    defiler();
  },
  surPhrase: (phrase) => {
    if (voix.actif) voix.parler(phrase, memoire.etat.humeur);
  },
  surOutil: (nom, entree) => afficherJeton(nom, entree),
  surFin: ({ texte, silencieux, refus }) => {
    if (bulleEnCours) {
      bulleEnCours.classList.remove('curseur');
      if (silencieux) bulleEnCours.remove();
      bulleEnCours = null;
    }
    if (silencieux && !texte) {
      // Il a choisi de ne rien dire : c'est une réponse en soi.
      avatar.jouerGeste('regarder_autour', 0.4);
    }
    if (refus) {
      ajouterBulle('erreur', "Il n'a pas pu répondre à ça. Essaie de reformuler.");
    }
    majInterface();
    if (memoire.etat.reglages.micro && micro.supporte && !silencieux) {
      setTimeout(() => micro.demarrer(), 700);
    }
  },
  surErreur: (err) => {
    if (bulleEnCours) {
      bulleEnCours.classList.remove('curseur');
      if (!bulleEnCours.textContent.trim()) bulleEnCours.remove();
      bulleEnCours = null;
    }
    ajouterBulle('erreur', messageErreur(err));
    avatar.definirEmotion('gene');
    avatar.jouerGeste('hausser_epaules', 0.6);
  },
});

const vie = new VieAutonome({
  avatar,
  memoire,
  cerveau,
  surParole: (texte, contexte) => cerveau.repondre(texte, contexte),
});
vie.active = memoire.etat.reglages.autonomie;
vie.demarrer();

// -------------------------------------------------------------- interface

// Combien de temps un avis passager reste à l'écran, en millisecondes.
const DUREE_ERREUR = 9000;
const DUREE_AVIS = 6000;

function ajouterBulle(genre, texte, curseur = false, ephemere = undefined) {
  const div = document.createElement('div');
  div.className = `bulle ${genre}${curseur ? ' curseur' : ''}`;
  div.textContent = texte;
  el.dialogue.appendChild(div);
  // On ne garde pas 200 bulles dans le DOM.
  while (el.dialogue.children.length > 60) el.dialogue.firstChild.remove();
  defiler();

  // Les erreurs s'effacent seules ; le fil de conversation, jamais.
  const duree = ephemere === undefined && genre === 'erreur' ? DUREE_ERREUR : ephemere;
  if (duree) programmerDisparition(div, duree);
  return div;
}

/**
 * Efface une bulle après un délai, en fondu. Le survol suspend le compte à
 * rebours — on ne veut pas qu'un message disparaisse pendant sa lecture — et
 * un clic la referme tout de suite.
 */
function programmerDisparition(bulle, duree) {
  let minuteur = null;
  bulle.classList.add('ephemere');

  const partir = () => {
    clearTimeout(minuteur);
    if (!bulle.isConnected) return;
    bulle.classList.add('sort');
    bulle.addEventListener('animationend', () => bulle.remove(), { once: true });
    // Filet de sécurité si l'animation ne se déclenche pas (onglet caché,
    // animations désactivées) : la bulle doit disparaître quand même.
    setTimeout(() => bulle.remove(), 900);
  };

  const armer = () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(partir, duree);
  };

  bulle.addEventListener('pointerenter', () => clearTimeout(minuteur));
  bulle.addEventListener('pointerleave', armer);
  bulle.addEventListener('click', partir);
  armer();
}

function defiler() {
  el.dialogue.scrollTop = el.dialogue.scrollHeight;
}

const LIBELLES_OUTILS = {
  exprimer: (e) => `${e.emotion}${e.geste && e.geste !== 'aucun' ? ` · ${e.geste}` : ''}`,
  ressentir: () => 'humeur',
  memoriser: () => 'mémorise',
  oublier: () => 'oublie',
  lien: (e) => (e.progression ? `lien : ${NOMS_NIVEAUX[e.niveau]}` : 'lien'),
  apparence: () => 'change de couleur',
  journal: () => 'journal',
  question_en_attente: () => 'note une question',
  identite: () => 'identité',
};

function afficherJeton(nom, entree) {
  const libelle = (LIBELLES_OUTILS[nom] || (() => nom))(entree || {});
  const jeton = document.createElement('span');
  jeton.className = 'jeton';
  jeton.textContent = libelle;
  el.signal.appendChild(jeton);
  setTimeout(() => jeton.remove(), 2600);
}

function messageErreur(err) {
  const statut = err?.status;
  if (statut === 401) return 'Clé API refusée. Vérifie-la dans les réglages.';
  if (statut === 429) return 'Trop de requêtes. Laisse-lui quelques secondes.';
  if (statut === 400) return `Requête refusée : ${err.message || 'paramètre invalide'}`;
  if (statut >= 500) return "L'API est indisponible. Réessaie dans un instant.";
  if (statut === 404) return "Modèle ou adresse introuvable. Vérifie le nom du modèle dans les réglages.";
  if (/fetch|network|Failed|NetworkError|load failed/i.test(String(err?.message))) {
    // Sans serveur intermédiaire, un blocage CORS est indiscernable d'une
    // panne réseau côté JavaScript : on donne les deux pistes.
    const f = FOURNISSEURS[memoire.etat.reglages.fournisseur];
    const hote = (f?.base || '').replace(/^https?:\/\//, '').split('/')[0] || "l'API";
    return `Impossible de joindre ${hote}. Soit la connexion a échoué, soit ce fournisseur refuse les appels depuis un navigateur (CORS).`;
  }
  return err?.message || 'Erreur inconnue.';
}

function majInterface() {
  const e = memoire.etat;
  el.nom.textContent = e.identite.nomCompagnon;
  el.lien.textContent = NOMS_NIVEAUX[e.relation.niveau];

  const h = e.humeur;
  const largeur = { valence: (h.valence + 1) / 2, eveil: h.eveil, energie: h.energie, affection: h.affection };
  for (const [cle, jauge] of Object.entries(el.jauges)) {
    jauge.style.width = `${Math.round(largeur[cle] * 100)}%`;
  }

  const teinte = Math.round(e.apparence.teinte);
  const accent = Math.round(e.apparence.accent);
  document.documentElement.style.setProperty('--teinte', String(teinte));
  document.documentElement.style.setProperty('--accent', String(accent));
}

// ---------------------------------------------------------------- envoi

function envoyer() {
  const texte = el.saisie.value.trim();
  if (!texte) return;
  if (cerveau.occupe) return;

  if (!cerveau.pret) {
    ajouterBulle('erreur', 'Il lui faut une clé API pour te répondre. Réglages → Connexion.');
    ouvrirTiroir('reglages');
    return;
  }

  el.saisie.value = '';
  el.saisie.style.height = 'auto';
  ajouterBulle('moi', texte);
  vie.signalerInteraction();
  voix.taire();
  cerveau.repondre(texte, {});
}

el.composer.addEventListener('submit', (ev) => {
  ev.preventDefault();
  envoyer();
});

el.saisie.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    envoyer();
  }
});

el.saisie.addEventListener('input', () => {
  el.saisie.style.height = 'auto';
  el.saisie.style.height = `${Math.min(el.saisie.scrollHeight, 140)}px`;
  vie.signalerInteraction();
});

el.btnMicro.addEventListener('click', () => {
  if (!micro.supporte) {
    ajouterBulle('erreur', "Ce navigateur ne sait pas écouter. Chrome ou Edge, plutôt.");
    return;
  }
  vie.signalerInteraction();
  voix.taire();
  micro.basculer();
});

el.btnVoix.addEventListener('click', () => {
  voix.actif = !voix.actif;
  memoire.etat.reglages.voix = voix.actif;
  memoire.sauver();
  el.btnVoix.classList.toggle('actif', voix.actif);
  el.btnVoix.classList.toggle('eteint', !voix.actif);
  el.btnVoix.textContent = voix.actif ? '🔊' : '🔇';
  el.optVoix.checked = voix.actif;
  if (!voix.actif) voix.taire();
});

// --------------------------------------------------------------- tiroir

function ouvrirTiroir(onglet) {
  el.tiroir.hidden = false;
  el.voile.hidden = false;
  const memoirePanneau = onglet === 'memoire';
  el.panneauReglages.hidden = memoirePanneau;
  el.panneauMemoire.hidden = !memoirePanneau;
  el.tiroirTitre.textContent = memoirePanneau ? 'Mémoire' : 'Réglages';
  if (memoirePanneau) rendreMemoire();
  else rendreReglages();
}

function fermerTiroir() {
  el.tiroir.hidden = true;
  el.voile.hidden = true;
}

el.btnReglages.addEventListener('click', () => ouvrirTiroir('reglages'));
el.btnMemoire.addEventListener('click', () => ouvrirTiroir('memoire'));
el.btnFermerTiroir.addEventListener('click', fermerTiroir);
el.voile.addEventListener('click', fermerTiroir);
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !el.tiroir.hidden) fermerTiroir();
});

/** Remplit un <select> avec la liste des fournisseurs. */
function garnirFournisseurs(select) {
  if (select.options.length) return;
  for (const [cle, f] of Object.entries(FOURNISSEURS)) {
    const opt = document.createElement('option');
    opt.value = cle;
    // Libellé court : le détail du palier gratuit tient dans la note en dessous,
    // où il ne risque pas d'être tronqué par la largeur du menu.
    opt.textContent = f.gratuit ? `${f.nom} · gratuit` : f.nom;
    select.appendChild(opt);
  }
}

/** « Google Gemini » plutôt que « Google Gemini — Claude / (Ollama, LM Studio) ». */
function nomCourt(cle) {
  return (FOURNISSEURS[cle]?.nom || '').split(' — ')[0].split(' (')[0].trim();
}

/**
 * Pointe le lien vers la page où *ce* fournisseur délivre les clés.
 * Masqué quand il n'y en a pas : un serveur local n'en demande aucune.
 */
function majLienCles(lien, cleFournisseur, fort = false) {
  const f = FOURNISSEURS[cleFournisseur];
  const dispo = Boolean(f?.cles);
  lien.hidden = !dispo;
  if (!dispo) return;
  lien.href = f.cles;
  lien.textContent = fort
    ? `Créer une clé sur ${nomCourt(cleFournisseur)} ↗`
    : `Obtenir une clé ${nomCourt(cleFournisseur)}`;
}

/** Une phrase honnête sur ce que vaut ce fournisseur ici. */
function noteFournisseur(cle) {
  const f = FOURNISSEURS[cle];
  const cors = {
    'vérifié': "Appels navigateur vérifiés.",
    'documenté': "Appels navigateur annoncés par le fournisseur, non vérifiés ici.",
    'inconnu': "Appels navigateur non vérifiés : si ça échoue, c'est le CORS.",
    'à configurer': '',
  }[f.cors] || '';
  const gratuit = f.gratuit ? `Gratuit : ${f.gratuit}.` : null;
  return [gratuit, f.note, cors].filter(Boolean).join(' ');
}

function rendreReglages() {
  const r = memoire.etat.reglages;
  garnirFournisseurs(el.fournisseur);
  el.fournisseur.value = r.fournisseur;

  const f = FOURNISSEURS[r.fournisseur] || FOURNISSEURS.anthropic;
  el.cleApi.value = memoire.cleCourante;
  el.cleApi.placeholder = r.fournisseur === 'local' ? 'aucune clé nécessaire' : 'clé API';
  el.noteFournisseur.textContent = noteFournisseur(r.fournisseur);

  majLienCles(el.lienCles, r.fournisseur);
  el.lienModeles.href = f.listeModeles || f.cles || '#';
  el.lienModeles.hidden = !(f.listeModeles || f.cles);

  // L'adresse n'est modifiable que là où elle a un sens.
  const baseVisible = r.fournisseur === 'personnalise' || r.fournisseur === 'local';
  el.baseApi.hidden = !baseVisible;
  el.labelBase.hidden = !baseVisible;
  el.baseApi.value = r.basePersonnalisee || f.base || '';

  // `effort` est propre à Anthropic.
  const effortVisible = f.dialecte === 'anthropic';
  el.effort.hidden = !effortVisible;
  el.labelEffort.hidden = !effortVisible;

  el.suggestions.innerHTML = '';
  for (const m of f.modeles) {
    const opt = document.createElement('option');
    opt.value = m;
    el.suggestions.appendChild(opt);
  }
  el.modele.value = r.modele || f.modeleParDefaut;
  el.effort.value = r.effort;
  el.optVoix.checked = memoire.etat.reglages.voix;
  el.optMicro.checked = memoire.etat.reglages.micro;
  el.optAutonomie.checked = memoire.etat.reglages.autonomie;

  const dispos = voix.listerVoix();
  el.voixChoisie.innerHTML = '';
  if (!dispos.length) {
    const opt = document.createElement('option');
    opt.textContent = 'Aucune voix détectée';
    el.voixChoisie.appendChild(opt);
    el.voixChoisie.disabled = true;
  } else {
    el.voixChoisie.disabled = false;
    for (const v of dispos) {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      el.voixChoisie.appendChild(opt);
    }
    if (memoire.etat.reglages.nomVoix) el.voixChoisie.value = memoire.etat.reglages.nomVoix;
  }
}

el.cleApi.addEventListener('change', () => {
  const cle = el.cleApi.value.trim();
  memoire.definirCle(memoire.etat.reglages.fournisseur, cle);
  cerveau.configurer(cle);
});

el.fournisseur.addEventListener('change', () => {
  const r = memoire.etat.reglages;
  const f = FOURNISSEURS[el.fournisseur.value];
  r.fournisseur = el.fournisseur.value;
  // Changer de fournisseur remet un modèle valide et efface une adresse
  // héritée du précédent, sinon on part avec des réglages incohérents.
  r.modele = f.modeleParDefaut;
  r.basePersonnalisee = '';
  memoire.sauver();
  cerveau.configurer(memoire.cleCourante);
  rendreReglages();
  ajouterBulle('systeme', `Il écoute maintenant ${f.nom}.`, false, DUREE_AVIS);
});

el.baseApi.addEventListener('change', () => {
  memoire.etat.reglages.basePersonnalisee = el.baseApi.value.trim();
  memoire.sauver();
  cerveau.configurer(memoire.cleCourante);
});

el.modele.addEventListener('change', () => {
  memoire.etat.reglages.modele = el.modele.value.trim();
  memoire.sauver();
});

el.effort.addEventListener('change', () => {
  memoire.etat.reglages.effort = el.effort.value;
  memoire.sauver();
});

el.voixChoisie.addEventListener('change', () => {
  voix.nomVoixPreferee = el.voixChoisie.value;
  memoire.etat.reglages.nomVoix = el.voixChoisie.value;
  memoire.sauver();
  voix.parler('Voilà à quoi je ressemble.', memoire.etat.humeur);
});

el.optVoix.addEventListener('change', () => {
  voix.actif = el.optVoix.checked;
  memoire.etat.reglages.voix = voix.actif;
  memoire.sauver();
  el.btnVoix.classList.toggle('actif', voix.actif);
  el.btnVoix.classList.toggle('eteint', !voix.actif);
  el.btnVoix.textContent = voix.actif ? '🔊' : '🔇';
});

el.optMicro.addEventListener('change', () => {
  memoire.etat.reglages.micro = el.optMicro.checked;
  memoire.sauver();
});

el.optAutonomie.addEventListener('change', () => {
  vie.active = el.optAutonomie.checked;
  memoire.etat.reglages.autonomie = vie.active;
  memoire.sauver();
});

// -------------------------------------------------------------- mémoire

function rendreMemoire() {
  const e = memoire.etat;
  const jours = Math.max(
    1,
    Math.round((Date.now() - e.relation.premiereRencontre) / 86_400_000),
  );

  el.resumeMemoire.innerHTML = '';
  const cases = [
    [NOMS_NIVEAUX[e.relation.niveau], 'lien'],
    [e.relation.interactions, 'échanges'],
    [e.faits.length, 'souvenirs'],
    [jours, jours > 1 ? 'jours' : 'jour'],
  ];
  for (const [valeur, libelle] of cases) {
    const div = document.createElement('div');
    div.innerHTML = `<strong></strong><span></span>`;
    div.querySelector('strong').textContent = String(valeur);
    div.querySelector('span').textContent = libelle;
    el.resumeMemoire.appendChild(div);
  }

  el.listeFaits.innerHTML = '';
  const faits = e.faits.slice().sort((a, b) => b.cree - a.cree);
  if (!faits.length) {
    el.listeFaits.innerHTML = '<li class="vide">Rien encore. Parle-lui.</li>';
  }
  for (const f of faits) {
    const li = document.createElement('li');
    const texte = document.createElement('span');
    texte.textContent = f.texte;
    const meta = document.createElement('small');
    meta.textContent = f.categorie;
    li.append(texte, meta);
    el.listeFaits.appendChild(li);
  }

  el.listeJournal.innerHTML = '';
  const journal = e.journal.slice().reverse();
  if (!journal.length) {
    el.listeJournal.innerHTML = '<li class="vide">Il n\'a encore rien noté.</li>';
  }
  for (const j of journal) {
    const li = document.createElement('li');
    const texte = document.createElement('span');
    texte.textContent = j.resume;
    const meta = document.createElement('small');
    meta.textContent = new Date(j.date).toLocaleDateString('fr-FR');
    li.append(texte, meta);
    el.listeJournal.appendChild(li);
  }
}

el.btnExporter.addEventListener('click', () => {
  const blob = new Blob([memoire.exporter()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compagnon-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

el.btnImporter.addEventListener('click', () => el.fichierImport.click());

el.fichierImport.addEventListener('change', async () => {
  const fichier = el.fichierImport.files?.[0];
  if (!fichier) return;
  try {
    memoire.importer(await fichier.text());
    avatar.definirHumeur(memoire.etat.humeur);
    avatar.definirApparence(memoire.etat.apparence);
    majInterface();
    rendreMemoire();
    rendreReglages();
    ajouterBulle('systeme', 'Mémoire restaurée.', false, DUREE_AVIS);
  } catch (err) {
    ajouterBulle('erreur', `Fichier illisible : ${err.message}`);
  }
  el.fichierImport.value = '';
});

el.btnReinitialiser.addEventListener('click', () => {
  const sur = confirm(
    "Effacer toute sa mémoire — souvenirs, humeur, relation, journal ?\nC'est irréversible.",
  );
  if (!sur) return;
  memoire.reinitialiser();
  avatar.definirHumeur(memoire.etat.humeur);
  avatar.definirApparence(memoire.etat.apparence);
  avatar.definirEmotion('neutre');
  el.dialogue.innerHTML = '';
  majInterface();
  rendreMemoire();
  ajouterBulle('systeme', 'Il ne se souvient plus de rien.', false, DUREE_AVIS);
});

// ---------------------------------------------------------------- regard

window.addEventListener('pointermove', (ev) => {
  avatar.viser(
    (ev.clientX / window.innerWidth) * 2 - 1,
    -((ev.clientY / window.innerHeight) * 2 - 1),
  );
});

window.addEventListener('pointerdown', () => vie.signalerInteraction());

// Sur mobile, sans pointeur, le regard suit l'inclinaison de l'écran.
window.addEventListener('deviceorientation', (ev) => {
  if (ev.gamma == null) return;
  avatar.viser(ev.gamma / 45, -(ev.beta - 45) / 45);
});

window.addEventListener('beforeunload', () => memoire.sauverMaintenant());

// -------------------------------------------------------------- démarrage

function reprendreConversation() {
  const recents = memoire.etat.conversation.slice(-12);
  for (const m of recents) {
    if (typeof m.contenu !== 'string') continue;
    if (m.contenu.startsWith('[contexte]')) continue;
    ajouterBulle(m.role === 'assistant' ? 'lui' : 'moi', m.contenu);
  }
  if (recents.length) {
    const ecart = Date.now() - (memoire.etat.stats.derniereVisite || Date.now());
    ajouterBulle(
      'systeme',
      ecart > 120_000 ? `— ${formaterDuree(ecart)} plus tard —` : '— reprise —',
    );
  }
}

function demarrer() {
  majInterface();
  const session = memoire.ouvrirSession();
  avatar.definirHumeur(memoire.etat.humeur);
  reprendreConversation();

  const accueil = vie.salutationRetour(session);
  majInterface();

  // Un rechargement de page ne doit pas coûter un appel API : en deçà d'une
  // minute d'absence, il reprend le fil sans se resaluer.
  const salueDeNouveau = session.premiereFois || session.absenceMs > 60_000;

  if (cerveau.pret && salueDeNouveau) {
    // On laisse une seconde au personnage pour apparaître avant qu'il parle.
    setTimeout(() => {
      cerveau.repondre(
        `[contexte] Tu viens de réapparaître à l'écran. ${accueil.note}`,
        { auto: true, absenceMs: session.absenceMs, note: accueil.note },
      );
    }, 1100);
  } else if (!cerveau.pret) {
    ajouterBulle(
      'systeme',
      "Il est là, mais il ne peut pas encore parler : ajoute ta clé API dans les réglages.",
    );
  }
}

// Clé déjà connue → on démarre. Sinon, on demande.
if (memoire.cleCourante || memoire.etat.reglages.fournisseur === 'local') {
  cerveau.configurer(memoire.cleCourante);
  demarrer();
} else {
  el.accueil.hidden = false;
  garnirFournisseurs(el.fournisseurAccueil);
  el.fournisseurAccueil.value = memoire.etat.reglages.fournisseur;
  const majAccueil = () => {
    const choix = el.fournisseurAccueil.value;
    el.noteAccueil.textContent = noteFournisseur(choix);
    majLienCles(el.lienClesAccueil, choix, true);
    el.cleAccueil.value = memoire.cle(choix);
    el.cleAccueil.placeholder =
      choix === 'local' ? 'aucune clé nécessaire' : 'clé API';
  };
  majAccueil();
  el.fournisseurAccueil.addEventListener('change', () => {
    const f = FOURNISSEURS[el.fournisseurAccueil.value];
    memoire.etat.reglages.fournisseur = el.fournisseurAccueil.value;
    memoire.etat.reglages.modele = f.modeleParDefaut;
    memoire.sauver();
    majAccueil();
  });
  el.btnAccueilOk.addEventListener('click', () => {
    const cle = el.cleAccueil.value.trim();
    if (cle) memoire.definirCle(memoire.etat.reglages.fournisseur, cle);
    cerveau.configurer(cle);
    el.accueil.hidden = true;
    demarrer();
  });
  el.btnAccueilPlusTard.addEventListener('click', () => {
    el.accueil.hidden = true;
    demarrer();
  });
  el.cleAccueil.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') el.btnAccueilOk.click();
  });
}

// La couleur de l'interface suit celle du personnage, en douceur.
setInterval(majInterface, 1500);

// Utile pour bidouiller depuis la console du navigateur.
window.compagnon = { memoire, avatar, cerveau, voix, micro, vie };
