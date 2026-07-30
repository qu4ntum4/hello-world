/**
 * Voix : synthèse vocale (il te parle) et reconnaissance vocale (tu lui parles).
 * Tout passe par les API natives du navigateur — rien n'est envoyé ailleurs.
 */

export class Voix {
  constructor({ langue = 'fr-FR', surSyllabe, surDebut, surFin } = {}) {
    this.langue = langue;
    this.surSyllabe = surSyllabe || (() => {});
    this.surDebut = surDebut || (() => {});
    this.surFin = surFin || (() => {});
    this.synth = window.speechSynthesis || null;
    this.supporte = Boolean(this.synth);
    this.actif = true;
    this.voix = [];
    this.nomVoixPreferee = null;
    this.enCours = null;
    this._battement = null;

    if (this.supporte) {
      const charger = () => {
        this.voix = this.synth.getVoices();
      };
      charger();
      this.synth.addEventListener?.('voiceschanged', charger);
    }
  }

  listerVoix() {
    if (!this.supporte) return [];
    if (!this.voix.length) this.voix = this.synth.getVoices();
    const base = this.langue.slice(0, 2);
    return this.voix
      .filter((v) => v.lang.toLowerCase().startsWith(base))
      .concat(this.voix.filter((v) => !v.lang.toLowerCase().startsWith(base)));
  }

  _choisirVoix() {
    const dispo = this.listerVoix();
    if (!dispo.length) return null;
    if (this.nomVoixPreferee) {
      const trouvee = dispo.find((v) => v.name === this.nomVoixPreferee);
      if (trouvee) return trouvee;
    }
    return dispo[0];
  }

  /**
   * Prononce un texte, avec débit et hauteur modulés par l'humeur.
   * humeur : { valence, eveil, energie }
   */
  parler(texte, humeur = {}) {
    if (!this.supporte || !this.actif) return;
    const propre = nettoyer(texte);
    if (!propre) return;

    const u = new SpeechSynthesisUtterance(propre);
    const voix = this._choisirVoix();
    if (voix) {
      u.voice = voix;
      u.lang = voix.lang;
    } else {
      u.lang = this.langue;
    }

    const valence = clamp(humeur.valence ?? 0, -1, 1);
    const eveil = clamp(humeur.eveil ?? 0.5, 0, 1);
    const energie = clamp(humeur.energie ?? 0.8, 0, 1);

    // Content et éveillé → plus vite et plus haut. Fatigué ou triste → l'inverse.
    u.rate = clamp(0.92 + eveil * 0.34 + valence * 0.1 - (1 - energie) * 0.22, 0.6, 1.6);
    u.pitch = clamp(1 + valence * 0.28 + eveil * 0.18 - (1 - energie) * 0.15, 0.5, 1.8);
    u.volume = 1;

    u.onstart = () => {
      this.enCours = u;
      this.surDebut();
      // Certaines voix n'émettent pas d'événement `boundary` : on anime quand même.
      clearInterval(this._battement);
      this._battement = setInterval(() => this.surSyllabe(0.6), 110);
    };
    const terminer = () => {
      clearInterval(this._battement);
      this._battement = null;
      this.enCours = null;
      this.surFin();
    };
    u.onend = terminer;
    u.onerror = terminer;
    u.onboundary = () => this.surSyllabe(1);

    // Contournement d'un bug Chrome : la file reste bloquée après une pause.
    try {
      this.synth.resume();
    } catch {
      /* sans importance */
    }
    this.synth.speak(u);
  }

  taire() {
    if (!this.supporte) return;
    clearInterval(this._battement);
    this._battement = null;
    try {
      this.synth.cancel();
    } catch {
      /* sans importance */
    }
    this.enCours = null;
    this.surFin();
  }
}

/** Retire ce qui ne se prononce pas : balises, emoji, ponctuation décorative. */
function nettoyer(texte) {
  return String(texte || '')
    .replace(/\*+/g, '')
    .replace(/[_`#>]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export class Micro {
  constructor({ langue = 'fr-FR', surResultat, surPartiel, surEtat } = {}) {
    const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supporte = Boolean(Reco);
    this.ecoute = false;
    this.surResultat = surResultat || (() => {});
    this.surPartiel = surPartiel || (() => {});
    this.surEtat = surEtat || (() => {});
    if (!this.supporte) return;

    this.reco = new Reco();
    this.reco.lang = langue;
    this.reco.continuous = false;
    this.reco.interimResults = true;
    this.reco.maxAlternatives = 1;

    this.reco.onresult = (e) => {
      let partiel = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const texte = r[0].transcript.trim();
          if (texte) this.surResultat(texte);
        } else {
          partiel += r[0].transcript;
        }
      }
      if (partiel) this.surPartiel(partiel);
    };
    this.reco.onstart = () => {
      this.ecoute = true;
      this.surEtat(true);
    };
    this.reco.onend = () => {
      this.ecoute = false;
      this.surEtat(false);
    };
    this.reco.onerror = (e) => {
      this.ecoute = false;
      this.surEtat(false, e.error);
    };
  }

  demarrer() {
    if (!this.supporte || this.ecoute) return;
    try {
      this.reco.start();
    } catch {
      /* déjà démarré */
    }
  }

  arreter() {
    if (!this.supporte || !this.ecoute) return;
    try {
      this.reco.stop();
    } catch {
      /* déjà arrêté */
    }
  }

  basculer() {
    if (this.ecoute) this.arreter();
    else this.demarrer();
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
