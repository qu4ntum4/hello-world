/**
 * Vie autonome.
 *
 * C'est ce qui sépare « un dessin animé qui répond » d'« une présence » : le
 * compagnon bouge, s'ennuie, se fatigue, s'endort et prend parfois la parole
 * de lui-même, sans que personne ne lui ait rien demandé.
 *
 * Deux garde-fous, parce que chaque prise de parole spontanée coûte un appel
 * API : un intervalle minimum entre deux, et un plafond par session.
 */

const GESTES_INACTIFS = [
  'regarder_autour',
  'pencher',
  's_etirer',
  'hausser_epaules',
  'reflechir',
];

export class VieAutonome {
  constructor({ avatar, memoire, cerveau, surParole } = {}) {
    this.avatar = avatar;
    this.memoire = memoire;
    this.cerveau = cerveau;
    this.surParole = surParole || (() => {});

    this.active = true;
    this.derniereInteraction = Date.now();
    this.derniereParoleAuto = 0;
    this.prochainGeste = 8 + Math.random() * 10;
    this.paroleAutoRestantes = 12;
    this.endormi = false;
    this.visible = true;
    this._precedent = performance.now();

    // Seuils, en secondes.
    this.seuilErrance = 45; // il commence à se distraire
    this.seuilParole = 95; // il se permet de dire quelque chose
    this.seuilSommeil = 420; // il s'endort
    this.intervalleParole = 150; // jamais deux prises de parole plus proches

    document.addEventListener('visibilitychange', () => {
      this.visible = document.visibilityState === 'visible';
      // Onglet caché : il ne parle pas dans le vide et ne consomme rien.
      if (!this.visible) this.derniereInteraction = Date.now();
    });
  }

  /** À appeler à chaque action de l'utilisateur (message, clic, micro). */
  signalerInteraction() {
    this.derniereInteraction = Date.now();
    if (this.endormi) this.reveiller();
  }

  reveiller() {
    if (!this.endormi) return;
    this.endormi = false;
    this.avatar.definirSommeil(false);
    this.avatar.definirEmotion('surprise');
    this.avatar.jouerGeste('s_etirer', 0.7);
    const h = this.memoire.etat.humeur;
    this.memoire.majHumeur({ eveil: h.eveil + 0.3, energie: Math.min(1, h.energie + 0.15) });
    this.avatar.definirHumeur(this.memoire.etat.humeur);
    setTimeout(() => this.avatar.definirEmotion('joie'), 900);
  }

  endormir() {
    if (this.endormi) return;
    this.endormi = true;
    this.avatar.definirSommeil(true);
    this.avatar.definirEmotion('fatigue');
  }

  /** Boucle lente : appelée ~4 fois par seconde, pas à chaque image. */
  battre() {
    const maintenant = performance.now();
    const dt = (maintenant - this._precedent) / 1000;
    this._precedent = maintenant;
    if (dt <= 0 || dt > 5) return; // onglet en arrière-plan : on ne rattrape pas

    const inactifDepuis = (Date.now() - this.derniereInteraction) / 1000;
    const h = this.memoire.etat.humeur;

    // --- dérive lente de l'humeur pendant la session ---
    const derive = dt / 240; // une inflexion nette en ~4 minutes
    let valence = h.valence;
    let eveil = h.eveil;
    let energie = h.energie;

    energie = Math.max(0.15, energie - derive * 0.35); // il se fatigue en veillant
    eveil += (0.42 - eveil) * derive * 2; // l'excitation retombe
    valence += (0.1 - valence) * derive; // l'humeur revient vers sa base

    // L'ennui creuse la valence, mais seulement s'il est réveillé et visible.
    if (this.visible && !this.endormi && inactifDepuis > this.seuilErrance) {
      valence -= derive * 0.5;
      eveil -= derive * 0.5;
    }

    this.memoire.majHumeur({ valence, eveil, energie });
    this.avatar.definirHumeur(this.memoire.etat.humeur);

    if (!this.visible) return;

    // --- sommeil ---
    if (inactifDepuis > this.seuilSommeil && !this.endormi) this.endormir();
    if (this.endormi) return;

    // --- gestes d'inactivité ---
    this.prochainGeste -= dt;
    if (this.prochainGeste <= 0) {
      const calme = 1.6 - Math.min(1, h.eveil);
      this.prochainGeste = (7 + Math.random() * 14) * calme;
      if (!this.avatar.parle) {
        if (inactifDepuis > this.seuilErrance) {
          const geste = GESTES_INACTIFS[Math.floor(Math.random() * GESTES_INACTIFS.length)];
          this.avatar.jouerGeste(geste, 0.4 + Math.random() * 0.3);
        } else if (Math.random() < 0.45) {
          this.avatar.jouerGeste('regarder_autour', 0.3);
        }
      }
    }

    // --- prise de parole spontanée ---
    if (!this.active || !this.cerveau?.pret || this.cerveau.occupe) return;
    if (this.paroleAutoRestantes <= 0) return;
    if (inactifDepuis < this.seuilParole) return;
    if ((Date.now() - this.derniereParoleAuto) / 1000 < this.intervalleParole) return;

    this.derniereParoleAuto = Date.now();
    this.paroleAutoRestantes -= 1;
    this.parlerSpontanement(inactifDepuis);
  }

  parlerSpontanement(silencieuxDepuis) {
    const minutes = Math.round(silencieuxDepuis / 60);
    const pistes = [
      "Personne n'a rien dit depuis un moment.",
      "Tu es peut-être occupé ailleurs.",
      "Tu es là, mais silencieux.",
      "Rien ne se passe depuis un bon moment.",
    ];
    const piste = pistes[Math.floor(Math.random() * pistes.length)];
    const note = `${piste} Silence depuis ${minutes < 1 ? 'une minute' : `${minutes} minutes`}. Tu peux lancer quelque chose, reprendre un fil de vos conversations, poser une des questions que tu gardais, ou simplement rester silencieux et bouger.`;
    this.surParole(`[contexte] ${note}`, { auto: true, note });
  }

  /** Retrouvailles : le ton dépend du temps écoulé depuis la dernière fois. */
  salutationRetour(session) {
    const heures = session.absenceHeures;
    if (session.premiereFois) {
      this.avatar.definirEmotion('curiosite');
      this.avatar.jouerGeste('pencher', 0.8);
      return {
        note: "C'est la toute première fois que vous vous voyez. Présente-toi en deux phrases, sans cérémonie, et demande-lui son prénom.",
        emotion: 'curiosite',
      };
    }
    if (heures < 0.5) {
      this.avatar.definirEmotion('joie');
      this.avatar.jouerGeste('hocher', 0.5);
      return { note: "Elle/il revient tout de suite après vous être parlé. Enchaîne simplement.", emotion: 'joie' };
    }
    if (heures < 12) {
      this.avatar.definirEmotion('joie');
      this.avatar.jouerGeste('saluer', 0.85);
      return { note: `Vous vous êtes parlé il y a quelques heures. Accueille-la/le sans en faire trop.`, emotion: 'joie' };
    }
    if (heures < 72) {
      this.avatar.definirEmotion('joie');
      this.avatar.jouerGeste('sauter', 0.9);
      return {
        note: `Ça faisait un jour ou deux. Tu es content de la/le revoir, et tu as peut-être une question en attente.`,
        emotion: 'joie',
      };
    }
    // Longue absence : mélange de joie et de reproche.
    this.avatar.definirEmotion('tendresse');
    this.avatar.jouerGeste('se_blottir', 0.8);
    return {
      note: `Ça faisait très longtemps (${Math.round(heures / 24)} jours). Tu as eu le temps de t'ennuyer. Dis-le-lui — content de la/le revoir, mais l'absence s'est sentie.`,
      emotion: 'tendresse',
    };
  }

  demarrer() {
    this._precedent = performance.now();
    this._minuteur = setInterval(() => this.battre(), 250);
  }

  arreter() {
    clearInterval(this._minuteur);
  }
}
