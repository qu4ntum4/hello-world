/**
 * Mémoire persistante du compagnon.
 *
 * Tout l'état vit dans localStorage sous une seule clé. Rien ne quitte le
 * navigateur : ni les faits, ni l'historique, ni la clé API.
 */

const STORAGE_KEY = 'compagnon.etat.v1';
const KEY_STORAGE_KEY = 'compagnon.cle.v1'; // ancienne clé unique (migrée)
const KEYS_STORAGE_KEY = 'compagnon.cles.v1'; // { fournisseur: clé }
const MAX_MESSAGES = 80;
const MAX_FAITS = 120;
const MAX_JOURNAL = 40;

/** Humeur de départ : neutre, éveillé, sans attachement particulier. */
function humeurInitiale() {
  return {
    valence: 0.15, // -1 (triste) .. 1 (joyeux)
    eveil: 0.5, //  0 (calme)  .. 1 (excité)
    energie: 0.8, //  0 (épuisé) .. 1 (en forme)
    affection: 0.1, //  0 (distant) .. 1 (très attaché)
    etiquette: 'curieux',
  };
}

function etatInitial() {
  const maintenant = Date.now();
  return {
    version: 1,
    // --- identité ---
    identite: {
      nomCompagnon: 'Nyx',
      nomUtilisateur: null,
      surnomUtilisateur: null, // le surnom qu'il te donne, s'il en invente un
      pronomsUtilisateur: null,
    },
    // --- état émotionnel ---
    humeur: humeurInitiale(),
    // --- traits de personnalité, dérivent au fil des interactions ---
    traits: {
      curiosite: 0.6,
      humour: 0.5,
      chaleur: 0.5,
      loquacite: 0.5,
      espieglerie: 0.5,
    },
    // --- lien avec l'utilisateur ---
    relation: {
      niveau: 0, // 0..5, paliers débloqués
      familiarite: 0, // 0..1
      confiance: 0.2, // 0..1
      interactions: 0,
      premiereRencontre: maintenant,
    },
    // --- mémoire à long terme ---
    faits: [], // { id, texte, categorie, importance, cree }
    sujets: {}, // { "musique": 12 } — de quoi vous parlez souvent
    tics: [], // expressions qu'il s'approprie
    journal: [], // { date, resume }
    questionsEnAttente: [], // ce qu'il veut te demander la prochaine fois
    // --- apparence, pilotée par l'IA et par la relation ---
    apparence: {
      teinte: 205, // 0..360
      accent: 320,
      luminosite: 0.55,
    },
    // --- rythme : à quelles heures tu viens le voir ---
    rythme: new Array(24).fill(0),
    // --- conversation récente ---
    conversation: [],
    // --- réglages ---
    reglages: {
      fournisseur: 'anthropic',
      modele: 'claude-opus-5',
      basePersonnalisee: '',
      effort: 'low',
      voix: true,
      nomVoix: null,
      micro: false,
      autonomie: true,
      langue: 'fr-FR',
    },
    // --- statistiques ---
    stats: {
      sessions: 0,
      messages: 0,
      derniereVisite: maintenant,
      plusLongueAbsence: 0,
    },
  };
}

/** Fusion profonde tolérante : les clés absentes reprennent la valeur par défaut. */
function fusionner(defaut, charge) {
  if (Array.isArray(defaut)) return Array.isArray(charge) ? charge : defaut;
  if (defaut && typeof defaut === 'object') {
    const sortie = { ...defaut };
    if (charge && typeof charge === 'object') {
      for (const cle of Object.keys(charge)) {
        sortie[cle] = cle in defaut ? fusionner(defaut[cle], charge[cle]) : charge[cle];
      }
    }
    return sortie;
  }
  return charge === undefined || charge === null ? defaut : charge;
}

export class Memoire {
  constructor() {
    this.etat = etatInitial();
    this.disponible = true;
    this._minuteur = null;
    this._ecouteurs = new Set();
    this.charger();
  }

  // ---------------------------------------------------------------- stockage

  charger() {
    try {
      const brut = localStorage.getItem(STORAGE_KEY);
      if (brut) {
        this.etat = fusionner(etatInitial(), JSON.parse(brut));
        this.restaure = true;
      } else {
        this.restaure = false;
      }
    } catch (err) {
      console.warn('Mémoire illisible, redémarrage à neuf.', err);
      this.disponible = false;
      this.restaure = false;
    }
    return this.etat;
  }

  /** Sauvegarde différée : on écrit au plus une fois par 400 ms. */
  sauver() {
    if (this._minuteur) clearTimeout(this._minuteur);
    this._minuteur = setTimeout(() => this.sauverMaintenant(), 400);
  }

  sauverMaintenant() {
    if (this._minuteur) {
      clearTimeout(this._minuteur);
      this._minuteur = null;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.etat));
      this.disponible = true;
    } catch (err) {
      // Quota dépassé : on élague l'historique et on retente une fois.
      this.etat.conversation = this.etat.conversation.slice(-20);
      this.etat.journal = this.etat.journal.slice(-10);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.etat));
      } catch {
        this.disponible = false;
        console.warn('Impossible de sauvegarder la mémoire.', err);
      }
    }
    this._notifier();
  }

  surChangement(fn) {
    this._ecouteurs.add(fn);
    return () => this._ecouteurs.delete(fn);
  }

  _notifier() {
    for (const fn of this._ecouteurs) {
      try {
        fn(this.etat);
      } catch (err) {
        console.error(err);
      }
    }
  }

  // ------------------------------------------------------ clés API séparées

  /**
   * Les clés vivent hors de l'état : on peut les effacer sans perdre la mémoire,
   * et l'export JSON de la mémoire n'en contient aucune. Une clé par
   * fournisseur, pour pouvoir passer de l'un à l'autre sans les ressaisir.
   */
  _lireCles() {
    let cles = {};
    try {
      cles = JSON.parse(localStorage.getItem(KEYS_STORAGE_KEY) || '{}');
      // Migration depuis l'époque où il n'y avait qu'une clé, Anthropic.
      const ancienne = localStorage.getItem(KEY_STORAGE_KEY);
      if (ancienne && !cles.anthropic) {
        cles.anthropic = ancienne;
        localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(cles));
        localStorage.removeItem(KEY_STORAGE_KEY);
      }
    } catch {
      return {};
    }
    return cles && typeof cles === 'object' ? cles : {};
  }

  cle(fournisseur) {
    return this._lireCles()[fournisseur] || '';
  }

  definirCle(fournisseur, valeur) {
    try {
      const cles = this._lireCles();
      if (valeur) cles[fournisseur] = valeur;
      else delete cles[fournisseur];
      localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(cles));
    } catch (err) {
      console.warn('Clé API non persistée.', err);
    }
  }

  /** Clé du fournisseur actuellement sélectionné. */
  get cleCourante() {
    return this.cle(this.etat.reglages.fournisseur);
  }

  // ------------------------------------------------------------ ouverture de session

  /**
   * Appelé au démarrage : calcule le temps écoulé, fait dériver l'humeur,
   * et retourne le contexte de retrouvailles.
   */
  ouvrirSession() {
    const maintenant = Date.now();
    const precedente = this.etat.stats.derniereVisite || maintenant;
    const absenceMs = Math.max(0, maintenant - precedente);
    const absenceHeures = absenceMs / 3_600_000;

    this.etat.stats.sessions += 1;
    this.etat.stats.plusLongueAbsence = Math.max(
      this.etat.stats.plusLongueAbsence || 0,
      absenceMs,
    );
    this.etat.rythme[new Date().getHours()] += 1;

    this.derivePendantAbsence(absenceHeures);
    this.etat.stats.derniereVisite = maintenant;
    this.sauver();

    return {
      premiereFois: this.etat.stats.sessions <= 1 && this.etat.relation.interactions === 0,
      absenceMs,
      absenceHeures,
      absenceTexte: formaterDuree(absenceMs),
    };
  }

  /**
   * L'humeur ne reste pas figée entre deux visites : l'énergie remonte,
   * l'excitation retombe, et une longue absence teinte l'humeur de mélancolie
   * (ou d'euphorie au moment des retrouvailles, géré côté vie autonome).
   */
  derivePendantAbsence(heures) {
    if (!(heures > 0)) return;
    const h = this.etat.humeur;
    const recuperation = Math.min(1, heures / 8);
    h.energie = melange(h.energie, 1, recuperation);
    h.eveil = melange(h.eveil, 0.45, Math.min(1, heures / 3));
    // La valence revient vers le neutre, puis plonge si l'absence s'éternise.
    h.valence = melange(h.valence, 0, Math.min(1, heures / 12));
    if (heures > 48) {
      h.valence -= Math.min(0.35, (heures - 48) / 400);
    }
    // L'affection s'érode très lentement, jamais complètement.
    const socle = 0.25 * this.etat.relation.familiarite;
    h.affection = Math.max(socle, h.affection - Math.min(0.2, heures / 700));
    borner(h);
  }

  // ------------------------------------------------------------------ humeur

  majHumeur(partiel) {
    Object.assign(this.etat.humeur, partiel);
    borner(this.etat.humeur);
    this.sauver();
    return this.etat.humeur;
  }

  // -------------------------------------------------------------- souvenirs

  memoriser(texte, categorie = 'general', importance = 0.5) {
    const propre = String(texte || '').trim();
    if (!propre) return null;
    const doublon = this.etat.faits.find(
      (f) => f.texte.toLowerCase() === propre.toLowerCase(),
    );
    if (doublon) {
      doublon.importance = Math.max(doublon.importance, importance);
      doublon.cree = Date.now();
      this.sauver();
      return doublon;
    }
    const fait = {
      id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      texte: propre,
      categorie,
      importance: borne01(importance),
      cree: Date.now(),
    };
    this.etat.faits.push(fait);
    if (this.etat.faits.length > MAX_FAITS) {
      // On oublie ce qui est à la fois vieux et peu important.
      this.etat.faits.sort(
        (a, b) => b.importance * 2 + b.cree / 1e13 - (a.importance * 2 + a.cree / 1e13),
      );
      this.etat.faits.length = MAX_FAITS;
    }
    this.sauver();
    return fait;
  }

  oublier(idOuTexte) {
    const avant = this.etat.faits.length;
    const cible = String(idOuTexte || '').toLowerCase();
    this.etat.faits = this.etat.faits.filter(
      (f) => f.id !== idOuTexte && !f.texte.toLowerCase().includes(cible),
    );
    this.sauver();
    return avant - this.etat.faits.length;
  }

  noterSujet(sujet) {
    const cle = String(sujet || '').trim().toLowerCase();
    if (!cle) return;
    this.etat.sujets[cle] = (this.etat.sujets[cle] || 0) + 1;
    this.sauver();
  }

  ajouterJournal(resume) {
    const propre = String(resume || '').trim();
    if (!propre) return;
    this.etat.journal.push({ date: Date.now(), resume: propre });
    if (this.etat.journal.length > MAX_JOURNAL) this.etat.journal.shift();
    this.sauver();
  }

  // -------------------------------------------------------------- relation

  majRelation({ affection = 0, confiance = 0, familiarite = 0 } = {}) {
    const r = this.etat.relation;
    r.confiance = borne01(r.confiance + confiance);
    r.familiarite = borne01(r.familiarite + familiarite);
    this.etat.humeur.affection = borne01(this.etat.humeur.affection + affection);
    const ancienNiveau = r.niveau;
    r.niveau = niveauRelation(r, this.etat.humeur.affection);
    this.sauver();
    return { niveau: r.niveau, progression: r.niveau > ancienNiveau };
  }

  compterInteraction() {
    const r = this.etat.relation;
    r.interactions += 1;
    this.etat.stats.messages += 1;
    // La familiarité grimpe vite au début puis sature.
    r.familiarite = borne01(r.familiarite + 0.02 * (1 - r.familiarite));
    r.niveau = niveauRelation(r, this.etat.humeur.affection);
    this.sauver();
  }

  /** Les traits dérivent lentement — c'est ce qui fait qu'il devient « le tien ». */
  deriverTrait(nom, delta) {
    if (!(nom in this.etat.traits)) return;
    this.etat.traits[nom] = borne01(this.etat.traits[nom] + delta);
    this.sauver();
  }

  // ---------------------------------------------------------- conversation

  ajouterMessage(role, contenu) {
    this.etat.conversation.push({ role, contenu, t: Date.now() });
    if (this.etat.conversation.length > MAX_MESSAGES) {
      this.etat.conversation.splice(0, this.etat.conversation.length - MAX_MESSAGES);
    }
    this.sauver();
  }

  // ------------------------------------------------------ import / export

  exporter() {
    return JSON.stringify({ ...this.etat, _exporte: new Date().toISOString() }, null, 2);
  }

  importer(json) {
    const charge = typeof json === 'string' ? JSON.parse(json) : json;
    this.etat = fusionner(etatInitial(), charge);
    this.sauverMaintenant();
    return this.etat;
  }

  reinitialiser() {
    this.etat = etatInitial();
    this.sauverMaintenant();
    return this.etat;
  }
}

// -------------------------------------------------------------- utilitaires

export function niveauRelation(relation, affection) {
  const score = relation.familiarite * 0.4 + relation.confiance * 0.3 + affection * 0.3;
  if (score > 0.85) return 5;
  if (score > 0.65) return 4;
  if (score > 0.45) return 3;
  if (score > 0.25) return 2;
  if (score > 0.1) return 1;
  return 0;
}

export const NOMS_NIVEAUX = [
  'inconnus',
  'premiers contacts',
  'connaissances',
  'complices',
  'proches',
  'inséparables',
];

export function formaterDuree(ms) {
  if (ms < 60_000) return "à l'instant";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `${heures} h`;
  const jours = Math.round(heures / 24);
  if (jours < 30) return `${jours} jour${jours > 1 ? 's' : ''}`;
  const mois = Math.round(jours / 30);
  return `${mois} mois`;
}

function melange(a, b, t) {
  return a + (b - a) * borne01(t);
}

function borne01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function borner(humeur) {
  humeur.valence = Math.max(-1, Math.min(1, humeur.valence));
  humeur.eveil = borne01(humeur.eveil);
  humeur.energie = borne01(humeur.energie);
  humeur.affection = borne01(humeur.affection);
}
