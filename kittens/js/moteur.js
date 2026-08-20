// Moteur de règles — jeu de base, 2 à 5 joueurs.
// Il ne tourne que chez l'hôte : c'est lui qui arbitre. Les autres joueurs
// n'en reçoivent que des vues personnalisées (voir vuePour).

export const CATALOGUE = {
  bombe:        { nom: 'Chaton explosif',  nb: 4,  jouable: false },
  desamorcage:  { nom: 'Désamorçage',      nb: 6,  jouable: false },
  attaque:      { nom: 'Attaque',          nb: 4,  jouable: true  },
  passer:       { nom: 'Passer',           nb: 4,  jouable: true  },
  faveur:       { nom: 'Faveur',           nb: 4,  jouable: true  },
  melanger:     { nom: 'Mélanger',         nb: 4,  jouable: true  },
  avenir:       { nom: "Voir l'avenir",    nb: 5,  jouable: true  },
  nope:         { nom: 'Nope',             nb: 5,  jouable: false },
  tacochat:     { nom: 'Tacochat',         nb: 4,  jouable: false, chat: true },
  chatmelon:    { nom: 'Chatmelon',        nb: 4,  jouable: false, chat: true },
  arcenchat:    { nom: 'Chat arc-en-ciel', nb: 4,  jouable: false, chat: true },
  patachat:     { nom: 'Chat patate',      nb: 4,  jouable: false, chat: true },
  barbichat:    { nom: 'Chat barbu',       nb: 4,  jouable: false, chat: true },
};

export const NB_MIN = 2;
export const NB_MAX = 5;

// Durée de la fenêtre pendant laquelle un Nope peut tomber (ms).
const FENETRE_NOPE = 6000;
const FENETRE_NOPE_COURTE = 4500;
// Sécurités anti-blocage quand un joueur ne répond plus.
const DELAI_EXPLOSION = 6000;
const DELAI_DESAMORCAGE = 45000;

function melangerTableau(t, alea) {
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

export class Partie {
  // joueurs : [{ id, pseudo }] — l'ordre est l'ordre de table.
  // surChangement() est appelé après chaque mutation ; surPrive(id, msg)
  // sert aux informations qu'un seul joueur doit voir (Voir l'avenir).
  constructor(joueurs, { alea = Math.random, surChangement = () => {}, surPrive = () => {} } = {}) {
    this.alea = alea;
    this.surChangement = surChangement;
    this.surPrive = surPrive;
    this.compteurCarte = 0;
    this.journal = [];
    this.gagnant = null;
    this.attente = null;
    this.minuteur = null;
    this.tour = 0;
    this.toursRestants = 1;
    this.defausse = [];
    this.joueurs = joueurs.map((j) => ({ id: j.id, pseudo: j.pseudo, main: [], vivant: true, connecte: true }));
    this.distribuer();
    this.noter(`La partie commence — ${this.joueurs[0].pseudo} ouvre le bal.`);
  }

  carte(type) {
    return { id: 'k' + (++this.compteurCarte), type };
  }

  distribuer() {
    const n = this.joueurs.length;
    const pioche = [];
    for (const [type, def] of Object.entries(CATALOGUE)) {
      if (type === 'bombe' || type === 'desamorcage') continue;
      for (let i = 0; i < def.nb; i++) pioche.push(this.carte(type));
    }
    melangerTableau(pioche, this.alea);

    // 7 cartes chacun, plus un Désamorçage garanti.
    for (const j of this.joueurs) {
      j.main = pioche.splice(0, 7);
      j.main.push(this.carte('desamorcage'));
    }
    // Les Désamorçages restants retournent dans la pioche.
    for (let i = 0; i < CATALOGUE.desamorcage.nb - n; i++) pioche.push(this.carte('desamorcage'));
    // Un chaton explosif de moins que de joueurs : il en restera toujours un debout.
    for (let i = 0; i < n - 1; i++) pioche.push(this.carte('bombe'));
    melangerTableau(pioche, this.alea);
    this.pioche = pioche;
  }

  // ————————————————————————————————————————————————— utilitaires

  joueur(id) { return this.joueurs.find((j) => j.id === id) || null; }
  get courant() { return this.joueurs[this.tour]; }
  vivants() { return this.joueurs.filter((j) => j.vivant); }

  noter(texte, genre = 'info') {
    this.journal.push({ t: Date.now(), texte, genre });
    if (this.journal.length > 120) this.journal.splice(0, this.journal.length - 120);
  }

  estSonTour(id) { return this.courant && this.courant.id === id && !this.gagnant; }

  retirerCarte(j, carteId) {
    const i = j.main.findIndex((c) => c.id === carteId);
    return i === -1 ? null : j.main.splice(i, 1)[0];
  }

  prochainVivant(depuis) {
    for (let k = 1; k <= this.joueurs.length; k++) {
      const i = (depuis + k) % this.joueurs.length;
      if (this.joueurs[i].vivant) return i;
    }
    return depuis;
  }

  passerAuSuivant(tours) {
    this.tour = this.prochainVivant(this.tour);
    this.toursRestants = tours;
    if (tours > 1) this.noter(`${this.courant.pseudo} doit jouer ${tours} tours d'affilée.`, 'alerte');
  }

  finirTour() {
    this.toursRestants -= 1;
    if (this.toursRestants > 0) {
      this.noter(`${this.courant.pseudo} rejoue (${this.toursRestants} tour restant).`);
      return;
    }
    this.passerAuSuivant(1);
  }

  // ————————————————————————————————————————————————— actions des joueurs

  // Retourne null si tout va bien, sinon un message d'erreur destiné au joueur.
  action(id, msg) {
    if (this.gagnant) return 'La partie est terminée.';
    const j = this.joueur(id);
    if (!j) return 'Joueur inconnu.';
    let err = null;
    switch (msg.t) {
      case 'jouer':     err = this.jouer(j, msg.cartes, msg); break;
      case 'piocher':   err = this.piocher(j); break;
      case 'nope':      err = this.jouerNope(j); break;
      case 'laisser':   err = this.laisserPasser(j); break;
      case 'donner':    err = this.donner(j, msg.carte); break;
      case 'nommer':    err = this.nommer(j, msg.type); break;
      case 'reprendre': err = this.reprendre(j, msg.carte); break;
      case 'desamorcer':err = this.desamorcer(j, msg.position); break;
      case 'exploser':  err = this.subirExplosion(j); break;
      default: err = 'Action inconnue.';
    }
    if (!err) this.surChangement();
    return err;
  }

  jouer(j, cartesIds, msg) {
    if (!j.vivant) return "Vous êtes hors de la partie.";
    if (this.attente) return 'Une action est déjà en cours.';
    if (!this.estSonTour(j.id)) return "Ce n'est pas votre tour.";
    if (!Array.isArray(cartesIds) || cartesIds.length === 0) return 'Aucune carte choisie.';

    const cartes = cartesIds.map((cid) => j.main.find((c) => c.id === cid));
    if (cartes.some((c) => !c)) return "Vous n'avez pas ces cartes.";
    if (cartes.some((c) => c.type === 'bombe')) return 'Un chaton explosif ne se joue pas.';

    const types = cartes.map((c) => c.type);
    const uniques = new Set(types);

    if (cartes.length === 1) {
      if (types[0] === 'nope') return 'Le Nope se joue en réaction, avec son propre bouton.';
      if (types[0] === 'desamorcage') return 'Le Désamorçage ne sert qu\'au moment où vous tirez un chaton explosif.';
      if (!CATALOGUE[types[0]].jouable) return 'Cette carte ne fait rien toute seule — assemblez une paire.';
      return this.jouerSeule(j, cartes[0], msg);
    }
    if (cartes.length === 2 && uniques.size === 1) return this.comboPaire(j, cartes, msg);
    if (cartes.length === 3 && uniques.size === 1) return this.comboBrelan(j, cartes, msg);
    if (cartes.length === 5 && uniques.size === 5) return this.comboCinq(j, cartes);
    return 'Combinaison invalide : deux ou trois cartes identiques, ou cinq cartes toutes différentes.';
  }

  // Retire les cartes de la main, les met sur la défausse et ouvre la fenêtre de Nope.
  engager(j, cartes, description, effet) {
    for (const c of cartes) this.retirerCarte(j, c.id);
    this.defausse.push(...cartes);
    this.noter(description, 'jeu');
    this.attente = {
      genre: 'nope',
      auteur: j.id,
      description,
      cartes: cartes.map((c) => c.type),
      nopes: 0,
      passes: [],
      effet,
      finLe: Date.now() + FENETRE_NOPE,
    };
    this.ouvrirFenetre(FENETRE_NOPE);
    return null;
  }

  // Personne ne peut noper ? Inutile de faire patienter toute la table.
  ouvrirFenetre(duree) {
    if (!this.vivants().some((j) => this.peutNoper(j))) { this.resoudreFenetre(); return; }
    this.attente.finLe = Date.now() + duree;
    this.armerFenetre(duree);
  }

  armerFenetre(duree) {
    clearTimeout(this.minuteur);
    this.minuteur = setTimeout(() => this.resoudreFenetre(), duree);
  }

  // Qui peut encore dire Nope : les vivants qui en ont un et qui ne sont pas
  // l'auteur de la dernière carte posée.
  peutNoper(j) {
    const a = this.attente;
    if (!a || a.genre !== 'nope') return false;
    if (!j.vivant || j.id === a.auteur) return false;
    return j.main.some((c) => c.type === 'nope');
  }

  jouerNope(j) {
    if (!this.peutNoper(j)) return 'Impossible de noper maintenant.';
    const a = this.attente;
    const c = j.main.find((x) => x.type === 'nope');
    this.retirerCarte(j, c.id);
    this.defausse.push(c);
    a.nopes += 1;
    a.auteur = j.id;
    a.passes = [];
    this.noter(a.nopes % 2 === 1
      ? `${j.pseudo} : NOPE ! « ${a.description} » est annulé.`
      : `${j.pseudo} : NOPE sur le NOPE — « ${a.description} » repart.`, 'nope');
    this.ouvrirFenetre(FENETRE_NOPE_COURTE);
    return null;
  }

  laisserPasser(j) {
    const a = this.attente;
    if (!a || a.genre !== 'nope') return null;
    if (!a.passes.includes(j.id)) a.passes.push(j.id);
    const attendus = this.vivants().filter((x) => this.peutNoper(x));
    if (attendus.every((x) => a.passes.includes(x.id))) this.resoudreFenetre();
    return null;
  }

  resoudreFenetre() {
    clearTimeout(this.minuteur);
    const a = this.attente;
    if (!a || a.genre !== 'nope') return;
    this.attente = null;
    if (a.nopes % 2 === 0) a.effet();
    this.surChangement();
  }

  jouerSeule(j, c, msg) {
    const nom = CATALOGUE[c.type].nom;
    const desc = `${j.pseudo} joue ${nom}`;
    switch (c.type) {
      case 'attaque':
        return this.engager(j, [c], desc, () => {
          this.toursRestants = 0;
          this.passerAuSuivant(2);
        });
      case 'passer':
        return this.engager(j, [c], desc, () => this.finirTour());
      case 'melanger':
        return this.engager(j, [c], desc, () => {
          melangerTableau(this.pioche, this.alea);
          this.noter('La pioche est mélangée.');
        });
      case 'avenir':
        return this.engager(j, [c], desc, () => {
          const trois = this.pioche.slice(0, 3).map((x) => x.type);
          this.surPrive(j.id, { t: 'avenir', cartes: trois });
          this.noter(`${j.pseudo} consulte le sommet de la pioche.`);
        });
      case 'faveur': {
        const cible = this.joueur(msg.cible);
        if (!cible || !cible.vivant || cible.id === j.id) return 'Choisissez un adversaire.';
        if (cible.main.length === 0) return `${cible.pseudo} n'a plus une seule carte.`;
        return this.engager(j, [c], `${desc} — ${cible.pseudo} doit lui donner une carte`, () => {
          if (cible.main.length === 0) { this.noter(`${cible.pseudo} n'a rien à donner.`); return; }
          this.attente = { genre: 'faveur', donneur: cible.id, receveur: j.id };
        });
      }
      default:
        return 'Cette carte ne se joue pas ainsi.';
    }
  }

  comboPaire(j, cartes, msg) {
    const cible = this.joueur(msg.cible);
    if (!cible || !cible.vivant || cible.id === j.id) return 'Choisissez un adversaire.';
    if (cible.main.length === 0) return `${cible.pseudo} n'a plus une seule carte.`;
    const nom = CATALOGUE[cartes[0].type].nom;
    return this.engager(j, cartes, `${j.pseudo} pose une paire de ${nom} et pioche au hasard chez ${cible.pseudo}`, () => {
      if (cible.main.length === 0) { this.noter(`${cible.pseudo} n'a rien à donner.`); return; }
      const i = Math.floor(this.alea() * cible.main.length);
      const vol = cible.main.splice(i, 1)[0];
      j.main.push(vol);
      this.noter(`${j.pseudo} vole une carte à ${cible.pseudo}.`, 'vol');
      this.surPrive(j.id, { t: 'vol', carte: vol.type, de: cible.pseudo });
      this.surPrive(cible.id, { t: 'vole', carte: vol.type, par: j.pseudo });
    });
  }

  comboBrelan(j, cartes, msg) {
    const cible = this.joueur(msg.cible);
    if (!cible || !cible.vivant || cible.id === j.id) return 'Choisissez un adversaire.';
    const nom = CATALOGUE[cartes[0].type].nom;
    return this.engager(j, cartes, `${j.pseudo} pose trois ${nom} et réclame une carte précise à ${cible.pseudo}`, () => {
      this.attente = { genre: 'demande', joueur: j.id, cible: cible.id };
    });
  }

  comboCinq(j, cartes) {
    if (this.defausse.length === 0) return 'La défausse est vide.';
    return this.engager(j, cartes, `${j.pseudo} pose cinq cartes différentes et repêche dans la défausse`, () => {
      if (this.defausse.length === 0) { this.noter('La défausse est vide.'); return; }
      this.attente = { genre: 'repeche', joueur: j.id };
    });
  }

  donner(j, carteId) {
    const a = this.attente;
    if (!a || a.genre !== 'faveur' || a.donneur !== j.id) return "Ce n'est pas à vous de donner.";
    const c = this.retirerCarte(j, carteId);
    if (!c) return "Vous n'avez pas cette carte.";
    const recu = this.joueur(a.receveur);
    recu.main.push(c);
    this.attente = null;
    this.noter(`${j.pseudo} donne une carte à ${recu.pseudo}.`, 'vol');
    this.surPrive(recu.id, { t: 'vol', carte: c.type, de: j.pseudo });
    return null;
  }

  nommer(j, type) {
    const a = this.attente;
    if (!a || a.genre !== 'demande' || a.joueur !== j.id) return "Ce n'est pas à vous de réclamer.";
    if (!CATALOGUE[type]) return 'Carte inconnue.';
    const cible = this.joueur(a.cible);
    this.attente = null;
    const i = cible.main.findIndex((c) => c.type === type);
    if (i === -1) {
      this.noter(`${j.pseudo} réclame ${CATALOGUE[type].nom} à ${cible.pseudo}… qui n'en a pas.`, 'vol');
      return null;
    }
    const c = cible.main.splice(i, 1)[0];
    j.main.push(c);
    this.noter(`${j.pseudo} réclame ${CATALOGUE[type].nom} à ${cible.pseudo} — et l'obtient.`, 'vol');
    this.surPrive(cible.id, { t: 'vole', carte: c.type, par: j.pseudo });
    return null;
  }

  reprendre(j, carteId) {
    const a = this.attente;
    if (!a || a.genre !== 'repeche' || a.joueur !== j.id) return "Ce n'est pas à vous de repêcher.";
    const i = this.defausse.findIndex((c) => c.id === carteId);
    if (i === -1) return 'Cette carte n\'est pas dans la défausse.';
    const c = this.defausse.splice(i, 1)[0];
    j.main.push(c);
    this.attente = null;
    this.noter(`${j.pseudo} récupère ${CATALOGUE[c.type].nom} dans la défausse.`, 'vol');
    return null;
  }

  // ————————————————————————————————————————————————— pioche et explosion

  piocher(j) {
    if (!j.vivant) return "Vous êtes hors de la partie.";
    if (this.attente) return 'Une action est en cours.';
    if (!this.estSonTour(j.id)) return "Ce n'est pas votre tour.";
    const c = this.pioche.shift();
    if (!c) { // filet de sécurité : ne devrait pas arriver
      this.noter('La pioche est vide.', 'alerte');
      this.finirTour();
      return null;
    }
    if (c.type === 'bombe') {
      this.noter(`${j.pseudo} tire un CHATON EXPLOSIF !`, 'boum');
      const secours = j.main.find((x) => x.type === 'desamorcage');
      this.attente = { genre: 'explosion', joueur: j.id, bombe: c, peutDesamorcer: !!secours };
      // Le joueur voit la carte avant le verdict, mais la table ne l'attend pas
      // indéfiniment : sans réaction, le sort suit son cours.
      clearTimeout(this.minuteur);
      this.minuteur = setTimeout(() => {
        if (!this.attente || this.attente.genre !== 'explosion') return;
        if (secours) this.desamorcer(j, 'hasard'); else this.subirExplosion(j);
        this.surChangement();
      }, secours ? DELAI_DESAMORCAGE : DELAI_EXPLOSION);
      return null;
    }
    j.main.push(c);
    this.surPrive(j.id, { t: 'pioche', carte: c.type });
    this.noter(`${j.pseudo} pioche une carte.`);
    this.finirTour();
    return null;
  }

  desamorcer(j, position) {
    const a = this.attente;
    if (!a || a.genre !== 'explosion' || a.joueur !== j.id) return "Rien à désamorcer.";
    const secours = j.main.find((x) => x.type === 'desamorcage');
    if (!secours) return "Vous n'avez pas de Désamorçage.";
    this.retirerCarte(j, secours.id);
    this.defausse.push(secours);
    const max = this.pioche.length;
    let pos = position === 'hasard' ? Math.floor(this.alea() * (max + 1)) : Number(position);
    if (!Number.isFinite(pos)) pos = 0;
    pos = Math.max(0, Math.min(max, pos));
    this.pioche.splice(pos, 0, a.bombe);
    this.attente = null;
    clearTimeout(this.minuteur);
    this.noter(`${j.pseudo} désamorce le chaton et le replace en douce dans la pioche.`, 'sauve');
    this.finirTour();
    return null;
  }

  subirExplosion(j) {
    const a = this.attente;
    if (!a || a.genre !== 'explosion' || a.joueur !== j.id) return "Rien n'explose.";
    this.defausse.push(a.bombe, ...j.main);
    j.main = [];
    j.vivant = false;
    this.attente = null;
    clearTimeout(this.minuteur);
    this.noter(`💥 ${j.pseudo} explose et quitte la partie.`, 'boum');
    const restants = this.vivants();
    if (restants.length <= 1) {
      this.gagnant = restants[0] ? restants[0].id : null;
      if (this.gagnant) this.noter(`🏆 ${restants[0].pseudo} gagne la partie !`, 'victoire');
      clearTimeout(this.minuteur);
      return null;
    }
    this.toursRestants = 0;
    this.passerAuSuivant(1);
    return null;
  }

  // Le joueur s'est déconnecté : on ne le sort pas de la partie, mais on ne
  // laisse pas la table bloquée derrière lui.
  debloquerSi(id) {
    const a = this.attente;
    if (!a) {
      if (this.estSonTour(id)) this.piocher(this.joueur(id));
      return;
    }
    if (a.genre === 'nope') this.resoudreFenetre();
    else if (a.genre === 'faveur' && a.donneur === id) {
      const d = this.joueur(id);
      if (d.main.length) this.donner(d, d.main[Math.floor(this.alea() * d.main.length)].id);
      else { this.attente = null; }
    } else if (a.genre === 'demande' && a.joueur === id) this.nommer(this.joueur(id), 'nope');
    else if (a.genre === 'repeche' && a.joueur === id) this.reprendre(this.joueur(id), this.defausse[this.defausse.length - 1].id);
    else if (a.genre === 'explosion' && a.joueur === id) {
      if (a.peutDesamorcer) this.desamorcer(this.joueur(id), 'hasard');
      else this.subirExplosion(this.joueur(id));
    }
  }

  arreter() { clearTimeout(this.minuteur); }

  // ————————————————————————————————————————————————— vue transmise aux clients

  vuePour(id) {
    const moi = this.joueur(id);
    const a = this.attente;
    return {
      phase: this.gagnant !== null || this.vivants().length <= 1 ? 'fin' : 'jeu',
      joueurs: this.joueurs.map((j, i) => ({
        id: j.id, pseudo: j.pseudo, nbCartes: j.main.length,
        vivant: j.vivant, connecte: j.connecte, aLaMain: i === this.tour,
      })),
      tour: this.courant ? this.courant.id : null,
      toursRestants: this.toursRestants,
      pioche: this.pioche.length,
      defausse: this.defausse.map((c) => ({ id: c.id, type: c.type })),
      moi: moi ? { id: moi.id, main: moi.main.map((c) => ({ id: c.id, type: c.type })), vivant: moi.vivant } : null,
      attente: a ? {
        genre: a.genre,
        description: a.description || null,
        auteur: a.auteur || null,
        cartes: a.cartes || null,
        finLe: a.finLe || null,
        donneur: a.donneur || null,
        receveur: a.receveur || null,
        joueur: a.joueur || null,
        cible: a.cible || null,
        peutDesamorcer: a.peutDesamorcer || false,
        jePeuxNoper: moi ? this.peutNoper(moi) : false,
        jAiPasse: moi && a.passes ? a.passes.includes(moi.id) : false,
      } : null,
      journal: this.journal.slice(-40),
      gagnant: this.gagnant,
    };
  }
}
