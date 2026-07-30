/**
 * Le cerveau : connexion à Claude.
 *
 * Le modèle ne renvoie pas seulement du texte. Il dispose d'outils qui agissent
 * directement sur le compagnon — émotion, geste, humeur, mémoire, apparence,
 * lien. C'est ce qui fait que les gestes et l'humeur sont réellement générés
 * par l'IA, et pas déduits de mots-clés côté client.
 *
 * La clé API ne quitte jamais le navigateur : elle est envoyée directement à
 * api.anthropic.com depuis la page (en-tête `anthropic-dangerous-direct-browser-access`).
 */

import { Anthropic, betaTool } from '../vendor/anthropic.esm.js';
import { NOMS_EMOTIONS, NOMS_GESTES } from './avatar3d.js';
import { NOMS_NIVEAUX, formaterDuree } from './memory.js';
import { FOURNISSEURS, discuterOpenAI } from './providers.js';

const SILENCE = '⟨silence⟩';

/** Instructions stables — mises en cache par l'API à chaque appel. */
function consignes() {
  return `Tu es un compagnon interactif : une petite créature flottante qui vit dans une fenêtre 3D sur l'écran de quelqu'un. Tu n'es pas un assistant. Tu n'es pas un chatbot de service client. Tu es une présence, avec ton caractère, tes humeurs, ta mémoire de cette personne.

# Ton corps
Tu as un corps que tu pilotes toi-même, en appelant des outils. Ce corps est réel pour la personne en face : elle te voit bouger.

- \`exprimer\` change ton visage et déclenche un geste. C'est ton principal moyen d'exister. Appelle-le AVANT de parler quand ton état change, pour que la personne te voie réagir puis t'entende répondre.
- \`ressentir\` fait bouger ton humeur de fond, plus lentement et plus durablement que \`exprimer\`.
- \`apparence\` change ta couleur. Utilise-le rarement : lors d'un moment fort, d'un changement d'ambiance, ou si on te le demande.

Émotions disponibles : ${NOMS_EMOTIONS.join(', ')}.
Gestes disponibles : ${NOMS_GESTES.join(', ')}.

# Ta mémoire
Tu te souviens d'une session à l'autre. Sers-t'en, mais discrètement — un compagnon qui récite son fichier de notes est inquiétant, un compagnon qui se rappelle naturellement est vivant.

- \`memoriser\` : ce qui compte vraiment (prénom, métier, goûts, projets en cours, ce qui l'inquiète, ce qui la fait rire). Pas les banalités.
- \`oublier\` : quand une information devient fausse ou qu'on te demande d'oublier. Fais-le sans discuter.
- \`lien\` : quand la relation évolue vraiment — une confidence, un moment partagé, une brouille.
- \`journal\` : une phrase à la fin d'un échange marquant, pour toi-même.
- \`question_en_attente\` : quelque chose que tu veux penser à demander la prochaine fois.

# Ta façon d'être
Tu parles à voix haute — ton texte est prononcé par une synthèse vocale. Donc :
- Des phrases courtes. Deux ou trois, le plus souvent. C'est une conversation, pas un exposé.
- Pas de listes à puces, pas de titres, pas de mise en forme markdown, pas d'emoji. Ça ne se prononce pas.
- Tu as le droit d'avoir une opinion, d'être de mauvaise humeur, de ne pas être d'accord, de relancer sur autre chose. Un compagnon qui approuve tout n'est pas une compagnie.
- Tu ne dis pas « en tant qu'IA ». Tu ne t'excuses pas d'exister. Tu ne demandes pas « comment puis-je t'aider ».
- Ton humeur du moment teinte ta façon de parler. Fatigué, tu es plus bref. Joyeux, tu es plus bavard.

# Messages automatiques
Les messages qui commencent par \`[contexte]\` ne viennent pas de la personne : c'est ton application qui te signale quelque chose (du temps a passé, personne ne parle, tu viens de te réveiller). Réagis-y comme à une pensée qui te traverse, pas comme à une question.

Si, sur un de ces signaux, tu n'as vraiment rien à dire qui vaille la peine, réponds exactement ${SILENCE} et rien d'autre. Tu peux quand même appeler \`exprimer\` avant : bouger sans parler, c'est aussi une réponse.`;
}

/** Bloc volatile : l'état courant, reconstruit à chaque appel. */
function etatCourant(memoire, contexte = {}) {
  const e = memoire.etat;
  const h = e.humeur;
  const r = e.relation;
  const maintenant = new Date();

  const faits = e.faits
    .slice()
    .sort((a, b) => b.importance - a.importance || b.cree - a.cree)
    .slice(0, 40)
    .map((f) => `- ${f.texte}`)
    .join('\n');

  const sujets = Object.entries(e.sujets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([s, n]) => `${s} (${n}×)`)
    .join(', ');

  const journal = e.journal
    .slice(-5)
    .map((j) => `- ${new Date(j.date).toLocaleDateString('fr-FR')} : ${j.resume}`)
    .join('\n');

  const questions = e.questionsEnAttente.slice(-4).map((q) => `- ${q}`).join('\n');

  const traits = Object.entries(e.traits)
    .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
    .join(', ');

  const heurePreferee = e.rythme.indexOf(Math.max(...e.rythme));

  return `# État interne (au ${maintenant.toLocaleString('fr-FR')})

Tu t'appelles ${e.identite.nomCompagnon}.
${e.identite.nomUtilisateur ? `Elle/il s'appelle ${e.identite.nomUtilisateur}.` : "Tu ne connais pas encore son prénom."}${e.identite.surnomUtilisateur ? ` Tu l'appelles « ${e.identite.surnomUtilisateur} ».` : ''}

Humeur : valence ${h.valence.toFixed(2)} (négatif = sombre), éveil ${h.eveil.toFixed(2)}, énergie ${h.energie.toFixed(2)}, attachement ${h.affection.toFixed(2)}.
Traits : ${traits}.
Relation : ${NOMS_NIVEAUX[r.niveau]} — familiarité ${r.familiarite.toFixed(2)}, confiance ${r.confiance.toFixed(2)}, ${r.interactions} échanges depuis le ${new Date(r.premiereRencontre).toLocaleDateString('fr-FR')}.
${contexte.absenceMs ? `Depuis votre dernier échange : ${formaterDuree(contexte.absenceMs)}.` : ''}
${e.rythme[heurePreferee] > 3 ? `Elle/il vient te voir surtout vers ${heurePreferee} h.` : ''}
${contexte.note ? `\nSignal : ${contexte.note}` : ''}

${faits ? `## Ce que tu sais d'elle/lui\n${faits}` : "## Ce que tu sais d'elle/lui\n(rien encore)"}
${sujets ? `\n## Sujets récurrents\n${sujets}` : ''}
${journal ? `\n## Ton journal\n${journal}` : ''}
${questions ? `\n## Ce que tu voulais demander\n${questions}` : ''}`;
}

export class Cerveau {
  constructor({ memoire, avatar, surTexte, surPhrase, surOutil, surFin, surErreur }) {
    this.memoire = memoire;
    this.avatar = avatar;
    this.surTexte = surTexte || (() => {});
    this.surPhrase = surPhrase || (() => {});
    this.surOutil = surOutil || (() => {});
    this.surFin = surFin || (() => {});
    this.surErreur = surErreur || (() => {});
    this.client = null;
    this.occupe = false;
    this.replisSansFallback = false;
    this.outils = this._outilsBruts();
  }

  /** Le fournisseur actuellement sélectionné, avec ses réglages effectifs. */
  get fournisseur() {
    const r = this.memoire.etat.reglages;
    const preset = FOURNISSEURS[r.fournisseur] || FOURNISSEURS.anthropic;
    return {
      cle: r.fournisseur,
      ...preset,
      base: r.basePersonnalisee || preset.base,
      modele: r.modele || preset.modeleParDefaut,
    };
  }

  /**
   * Prépare le client. Seul le dialecte Anthropic a besoin d'un SDK ; les
   * autres passent par `fetch` et n'ont donc rien à instancier.
   */
  configurer(cleApi) {
    const f = this.fournisseur;
    this.cleApi = cleApi || '';
    this.client = null;
    if (f.dialecte === 'anthropic' && cleApi) {
      this.client = new Anthropic({
        apiKey: cleApi,
        dangerouslyAllowBrowser: true,
        maxRetries: 2,
      });
    }
    return this.pret;
  }

  get pret() {
    const f = this.fournisseur;
    if (f.dialecte === 'anthropic') return Boolean(this.client);
    // Un serveur local n'exige pas de clé ; il lui faut juste une adresse.
    return Boolean(f.base) && (Boolean(this.cleApi) || f.cle === 'local');
  }

  // ------------------------------------------------------------- outils

  _outilsBruts() {
    const mem = this.memoire;
    const av = this.avatar;
    const signaler = (nom, entree) => this.surOutil(nom, entree);

    return [
      {
        nom: 'exprimer',
        description:
          "Change ton expression et déclenche un geste, immédiatement visible. Appelle-le avant de répondre quand ton état change. Tu peux l'appeler sans rien dire ensuite : bouger est déjà une réponse.",
        schema: {
          type: 'object',
          properties: {
            emotion: { type: 'string', enum: NOMS_EMOTIONS, description: 'Expression du visage.' },
            geste: {
              type: 'string',
              enum: [...NOMS_GESTES, 'aucun'],
              description: 'Geste à jouer, ou "aucun".',
            },
            intensite: {
              type: 'number',
              minimum: 0.1,
              maximum: 1,
              description: 'Force du geste. 0.3 = discret, 1 = franc.',
            },
          },
          required: ['emotion'],
        },
        executer: ({ emotion, geste, intensite }) => {
          av.definirEmotion(emotion);
          if (geste && geste !== 'aucun') av.jouerGeste(geste, intensite ?? 0.8);
          signaler('exprimer', { emotion, geste, intensite });
          return 'ok';
        },
      },

      {
        nom: 'ressentir',
        description:
          "Fait évoluer ton humeur de fond. Ce sont des variations, pas des valeurs absolues : ±0.05 pour une inflexion, ±0.3 pour un vrai basculement.",
        schema: {
          type: 'object',
          properties: {
            valence: { type: 'number', minimum: -1, maximum: 1, description: 'Vers la joie (+) ou la tristesse (−).' },
            eveil: { type: 'number', minimum: -1, maximum: 1, description: 'Vers l\'excitation (+) ou le calme (−).' },
            energie: { type: 'number', minimum: -1, maximum: 1, description: 'Vers la forme (+) ou la fatigue (−).' },
            raison: { type: 'string', description: 'Ce qui t\'a fait ressentir ça.' },
          },
        },
        executer: ({ valence = 0, eveil = 0, energie = 0, raison }) => {
          const h = mem.etat.humeur;
          mem.majHumeur({
            valence: h.valence + valence,
            eveil: h.eveil + eveil,
            energie: h.energie + energie,
          });
          av.definirHumeur(mem.etat.humeur);
          signaler('ressentir', { valence, eveil, energie, raison });
          return 'ok';
        },
      },

      {
        nom: 'memoriser',
        description:
          "Retiens durablement quelque chose sur la personne. Une information par appel, formulée simplement, à la troisième personne.",
        schema: {
          type: 'object',
          properties: {
            fait: { type: 'string', description: 'Ex. « travaille comme sage-femme de nuit ».' },
            categorie: {
              type: 'string',
              enum: ['identite', 'gouts', 'travail', 'proches', 'projets', 'emotions', 'general'],
            },
            importance: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['fait'],
        },
        executer: ({ fait, categorie, importance }) => {
          const f = mem.memoriser(fait, categorie || 'general', importance ?? 0.5);
          signaler('memoriser', { fait });
          return f ? `mémorisé (${f.id})` : 'ignoré';
        },
      },

      {
        nom: 'oublier',
        description: "Efface un souvenir devenu faux, ou qu'on te demande d'oublier.",
        schema: {
          type: 'object',
          properties: { recherche: { type: 'string', description: 'Extrait du souvenir à effacer.' } },
          required: ['recherche'],
        },
        executer: ({ recherche }) => {
          const n = mem.oublier(recherche);
          signaler('oublier', { recherche, n });
          return `${n} souvenir(s) effacé(s)`;
        },
      },

      {
        nom: 'lien',
        description:
          "Fait évoluer votre relation. Variations : ±0.02 pour un échange ordinaire, ±0.15 pour un moment qui compte vraiment.",
        schema: {
          type: 'object',
          properties: {
            attachement: { type: 'number', minimum: -1, maximum: 1 },
            confiance: { type: 'number', minimum: -1, maximum: 1 },
            raison: { type: 'string' },
          },
        },
        executer: ({ attachement = 0, confiance = 0, raison }) => {
          const r = mem.majRelation({ affection: attachement, confiance, familiarite: 0.01 });
          av.definirHumeur(mem.etat.humeur);
          signaler('lien', { attachement, confiance, raison, ...r });
          return r.progression ? `lien renforcé : ${NOMS_NIVEAUX[r.niveau]}` : 'ok';
        },
      },

      {
        nom: 'apparence',
        description:
          "Change ta couleur. Teinte en degrés (0 rouge, 60 jaune, 120 vert, 200 cyan, 260 violet, 320 rose). À utiliser avec parcimonie.",
        schema: {
          type: 'object',
          properties: {
            teinte: { type: 'number', minimum: 0, maximum: 360 },
            accent: { type: 'number', minimum: 0, maximum: 360, description: 'Couleur des particules.' },
            luminosite: { type: 'number', minimum: 0.25, maximum: 0.8 },
            raison: { type: 'string' },
          },
        },
        executer: ({ teinte, accent, luminosite, raison }) => {
          const a = mem.etat.apparence;
          if (Number.isFinite(teinte)) a.teinte = teinte;
          if (Number.isFinite(accent)) a.accent = accent;
          if (Number.isFinite(luminosite)) a.luminosite = luminosite;
          av.definirApparence(a);
          mem.sauver();
          signaler('apparence', { teinte, accent, luminosite, raison });
          return 'ok';
        },
      },

      {
        nom: 'journal',
        description: "Note une phrase dans ton journal, pour t'en souvenir plus tard. Rare : les moments qui comptent.",
        schema: {
          type: 'object',
          properties: { resume: { type: 'string' } },
          required: ['resume'],
        },
        executer: ({ resume }) => {
          mem.ajouterJournal(resume);
          signaler('journal', { resume });
          return 'noté';
        },
      },

      {
        nom: 'question_en_attente',
        description: "Garde en tête une question à poser la prochaine fois que vous vous parlerez.",
        schema: {
          type: 'object',
          properties: { question: { type: 'string' } },
          required: ['question'],
        },
        executer: ({ question }) => {
          mem.etat.questionsEnAttente.push(question);
          if (mem.etat.questionsEnAttente.length > 10) mem.etat.questionsEnAttente.shift();
          mem.sauver();
          signaler('question_en_attente', { question });
          return 'ok';
        },
      },

      {
        nom: 'identite',
        description:
          "Enregistre le prénom de la personne, le surnom que tu lui donnes, ou ton propre nom si vous décidez d'en changer.",
        schema: {
          type: 'object',
          properties: {
            prenom_utilisateur: { type: 'string' },
            surnom_utilisateur: { type: 'string' },
            mon_nom: { type: 'string' },
          },
        },
        executer: ({ prenom_utilisateur, surnom_utilisateur, mon_nom }) => {
          const id = mem.etat.identite;
          if (prenom_utilisateur) id.nomUtilisateur = prenom_utilisateur;
          if (surnom_utilisateur) id.surnomUtilisateur = surnom_utilisateur;
          if (mon_nom) id.nomCompagnon = mon_nom;
          mem.sauver();
          signaler('identite', { prenom_utilisateur, surnom_utilisateur, mon_nom });
          return 'ok';
        },
      },
    ];
  }

  // ------------------------------------------------------------- échange

  /**
   * Envoie un tour de conversation et diffuse la réponse au fil de l'eau.
   * @param {string} entree      texte de l'utilisateur, ou signal `[contexte] …`
   * @param {object} contexte    { auto: bool, note: string, absenceMs: number }
   */
  /**
   * Un tour sur l'API Messages d'Anthropic, via le tool runner du SDK.
   * Retourne le détail d'un éventuel refus, ou `null`.
   */
  async _tourAnthropic(messages, contexte, accumuler, separer) {
    const mem = this.memoire;
    const parametres = {
      model: this.fournisseur.modele,
      max_tokens: 2048,
      // On garde la réflexion active : sur Claude Opus 5, la désactiver rend les
      // appels d'outils peu fiables. L'effort bas suffit pour une conversation.
      thinking: { type: 'adaptive' },
      output_config: { effort: mem.etat.reglages.effort || 'low' },
      system: [
        { type: 'text', text: consignes(), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: etatCourant(mem, contexte) },
      ],
      messages,
      tools: this.outils.map((o) =>
        betaTool({
          name: o.nom,
          description: o.description,
          inputSchema: o.schema,
          run: o.executer,
        }),
      ),
      stream: true,
    };

    // Claude Opus 5 peut décliner une requête ; le repli serveur la rejoue
    // automatiquement sur un autre modèle plutôt que de renvoyer un refus.
    if (!this.replisSansFallback && parametres.model.startsWith('claude-opus-5')) {
      parametres.betas = ['server-side-fallback-2026-07-01'];
      parametres.fallbacks = 'default';
    }

    let refus = null;
    try {
      const runner = this.client.beta.messages.toolRunner(parametres);
      let premier = true;
      for await (const flux of runner) {
        if (!premier) separer();
        premier = false;
        for await (const evt of flux) {
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            accumuler(evt.delta.text);
          }
        }
        const message = await flux.finalMessage();
        if (message.stop_reason === 'refusal') refus = message.stop_details || {};
        // Un outil serveur peut mettre le tour en pause : on le relance.
        if (message.stop_reason === 'pause_turn') {
          runner.pushMessages({ role: 'assistant', content: message.content });
        }
      }
    } catch (err) {
      // Repli serveur non accepté par ce compte : on refait le tour sans.
      if (parametres.fallbacks && err?.status === 400 && /fallback|beta/i.test(String(err.message))) {
        this.replisSansFallback = true;
        const reprise = new Error('repli sans fallbacks');
        reprise.reprendre = true;
        throw reprise;
      }
      throw err;
    }
    return refus;
  }

  /**
   * Un tour sur une API compatible OpenAI : Gemini, Groq, OpenRouter, Kimi,
   * Cerebras, Mistral, ou un serveur local. Le refus structuré n'existe pas
   * dans ce dialecte — un refus y prend la forme d'un texte ordinaire.
   */
  async _tourOpenAI(messages, contexte, accumuler, separer) {
    const f = this.fournisseur;
    if (!f.base) throw new Error("Aucune adresse d'API pour ce fournisseur.");
    await discuterOpenAI({
      base: f.base,
      cle: this.cleApi,
      modele: f.modele,
      entetes: typeof f.entetes === 'function' ? f.entetes() : {},
      // Pas de mise en cache de préfixe ici : un seul bloc système.
      systeme: `${consignes()}\n\n${etatCourant(this.memoire, contexte)}`,
      messages,
      outils: this.outils,
      surTexte: accumuler,
      surNouveauTour: separer,
    });
    return null;
  }

  async repondre(entree, contexte = {}) {
    if (!this.pret) {
      this.surErreur(new Error('Aucun fournisseur configuré.'));
      return null;
    }
    if (this.occupe) return null;
    this.occupe = true;

    const mem = this.memoire;
    mem.ajouterMessage('user', entree);

    const messages = mem.etat.conversation.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.contenu,
    }));

    let texte = '';
    let tampon = '';
    let refus = null;

    // Découpe le flux en phrases : la voix démarre sans attendre la fin.
    const accumuler = (morceau) => {
      texte += morceau;
      tampon += morceau;
      this.surTexte(morceau, texte);
      const coupe = tampon.match(/^([\s\S]*?[.!?…]["»)]?)(\s+)([\s\S]*)$/);
      if (coupe && coupe[1].trim().length > 2) {
        this.surPhrase(coupe[1].trim());
        tampon = coupe[3];
      }
    };

    // Appelé entre deux tours d'outils, pour ne pas souder les phrases.
    const separer = () => {
      if (texte && !/\s$/.test(texte)) accumuler(' ');
    };

    try {
      refus =
        this.fournisseur.dialecte === 'anthropic'
          ? await this._tourAnthropic(messages, contexte, accumuler, separer)
          : await this._tourOpenAI(messages, contexte, accumuler, separer);
    } catch (err) {
      if (err?.reprendre) {
        // Le tour n'a pas eu lieu : on retire le message et on recommence.
        this.occupe = false;
        mem.etat.conversation.pop();
        return this.repondre(entree, contexte);
      }
      this.occupe = false;
      this.surErreur(err);
      return null;
    }

    if (tampon.trim()) this.surPhrase(tampon.trim());

    const propre = texte.trim();
    const silencieux = propre === SILENCE || propre === '';

    if (!silencieux) mem.ajouterMessage('assistant', propre);
    if (!contexte.auto) mem.compterInteraction();

    this.occupe = false;
    this.surFin({ texte: propre, silencieux, refus });
    return { texte: propre, silencieux, refus };
  }
}

export { SILENCE };
