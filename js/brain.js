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

export const MODELES = [
  { id: 'claude-opus-5', nom: 'Claude Opus 5', note: 'le plus fin, le plus incarné' },
  { id: 'claude-sonnet-5', nom: 'Claude Sonnet 5', note: 'excellent équilibre vitesse / qualité' },
  { id: 'claude-haiku-4-5', nom: 'Claude Haiku 4.5', note: 'le plus rapide et le moins cher' },
];

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
    this.outils = this._construireOutils();
  }

  configurer(cleApi) {
    if (!cleApi) {
      this.client = null;
      return false;
    }
    this.client = new Anthropic({
      apiKey: cleApi,
      dangerouslyAllowBrowser: true,
      maxRetries: 2,
    });
    return true;
  }

  get pret() {
    return Boolean(this.client);
  }

  // ------------------------------------------------------------- outils

  _construireOutils() {
    const mem = this.memoire;
    const av = this.avatar;
    const signaler = (nom, entree) => this.surOutil(nom, entree);

    return [
      betaTool({
        name: 'exprimer',
        description:
          "Change ton expression et déclenche un geste, immédiatement visible. Appelle-le avant de répondre quand ton état change. Tu peux l'appeler sans rien dire ensuite : bouger est déjà une réponse.",
        inputSchema: {
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
        run: ({ emotion, geste, intensite }) => {
          av.definirEmotion(emotion);
          if (geste && geste !== 'aucun') av.jouerGeste(geste, intensite ?? 0.8);
          signaler('exprimer', { emotion, geste, intensite });
          return 'ok';
        },
      }),

      betaTool({
        name: 'ressentir',
        description:
          "Fait évoluer ton humeur de fond. Ce sont des variations, pas des valeurs absolues : ±0.05 pour une inflexion, ±0.3 pour un vrai basculement.",
        inputSchema: {
          type: 'object',
          properties: {
            valence: { type: 'number', minimum: -1, maximum: 1, description: 'Vers la joie (+) ou la tristesse (−).' },
            eveil: { type: 'number', minimum: -1, maximum: 1, description: 'Vers l\'excitation (+) ou le calme (−).' },
            energie: { type: 'number', minimum: -1, maximum: 1, description: 'Vers la forme (+) ou la fatigue (−).' },
            raison: { type: 'string', description: 'Ce qui t\'a fait ressentir ça.' },
          },
        },
        run: ({ valence = 0, eveil = 0, energie = 0, raison }) => {
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
      }),

      betaTool({
        name: 'memoriser',
        description:
          "Retiens durablement quelque chose sur la personne. Une information par appel, formulée simplement, à la troisième personne.",
        inputSchema: {
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
        run: ({ fait, categorie, importance }) => {
          const f = mem.memoriser(fait, categorie || 'general', importance ?? 0.5);
          signaler('memoriser', { fait });
          return f ? `mémorisé (${f.id})` : 'ignoré';
        },
      }),

      betaTool({
        name: 'oublier',
        description: "Efface un souvenir devenu faux, ou qu'on te demande d'oublier.",
        inputSchema: {
          type: 'object',
          properties: { recherche: { type: 'string', description: 'Extrait du souvenir à effacer.' } },
          required: ['recherche'],
        },
        run: ({ recherche }) => {
          const n = mem.oublier(recherche);
          signaler('oublier', { recherche, n });
          return `${n} souvenir(s) effacé(s)`;
        },
      }),

      betaTool({
        name: 'lien',
        description:
          "Fait évoluer votre relation. Variations : ±0.02 pour un échange ordinaire, ±0.15 pour un moment qui compte vraiment.",
        inputSchema: {
          type: 'object',
          properties: {
            attachement: { type: 'number', minimum: -1, maximum: 1 },
            confiance: { type: 'number', minimum: -1, maximum: 1 },
            raison: { type: 'string' },
          },
        },
        run: ({ attachement = 0, confiance = 0, raison }) => {
          const r = mem.majRelation({ affection: attachement, confiance, familiarite: 0.01 });
          av.definirHumeur(mem.etat.humeur);
          signaler('lien', { attachement, confiance, raison, ...r });
          return r.progression ? `lien renforcé : ${NOMS_NIVEAUX[r.niveau]}` : 'ok';
        },
      }),

      betaTool({
        name: 'apparence',
        description:
          "Change ta couleur. Teinte en degrés (0 rouge, 60 jaune, 120 vert, 200 cyan, 260 violet, 320 rose). À utiliser avec parcimonie.",
        inputSchema: {
          type: 'object',
          properties: {
            teinte: { type: 'number', minimum: 0, maximum: 360 },
            accent: { type: 'number', minimum: 0, maximum: 360, description: 'Couleur des particules.' },
            luminosite: { type: 'number', minimum: 0.25, maximum: 0.8 },
            raison: { type: 'string' },
          },
        },
        run: ({ teinte, accent, luminosite, raison }) => {
          const a = mem.etat.apparence;
          if (Number.isFinite(teinte)) a.teinte = teinte;
          if (Number.isFinite(accent)) a.accent = accent;
          if (Number.isFinite(luminosite)) a.luminosite = luminosite;
          av.definirApparence(a);
          mem.sauver();
          signaler('apparence', { teinte, accent, luminosite, raison });
          return 'ok';
        },
      }),

      betaTool({
        name: 'journal',
        description: "Note une phrase dans ton journal, pour t'en souvenir plus tard. Rare : les moments qui comptent.",
        inputSchema: {
          type: 'object',
          properties: { resume: { type: 'string' } },
          required: ['resume'],
        },
        run: ({ resume }) => {
          mem.ajouterJournal(resume);
          signaler('journal', { resume });
          return 'noté';
        },
      }),

      betaTool({
        name: 'question_en_attente',
        description: "Garde en tête une question à poser la prochaine fois que vous vous parlerez.",
        inputSchema: {
          type: 'object',
          properties: { question: { type: 'string' } },
          required: ['question'],
        },
        run: ({ question }) => {
          mem.etat.questionsEnAttente.push(question);
          if (mem.etat.questionsEnAttente.length > 10) mem.etat.questionsEnAttente.shift();
          mem.sauver();
          signaler('question_en_attente', { question });
          return 'ok';
        },
      }),

      betaTool({
        name: 'identite',
        description:
          "Enregistre le prénom de la personne, le surnom que tu lui donnes, ou ton propre nom si vous décidez d'en changer.",
        inputSchema: {
          type: 'object',
          properties: {
            prenom_utilisateur: { type: 'string' },
            surnom_utilisateur: { type: 'string' },
            mon_nom: { type: 'string' },
          },
        },
        run: ({ prenom_utilisateur, surnom_utilisateur, mon_nom }) => {
          const id = mem.etat.identite;
          if (prenom_utilisateur) id.nomUtilisateur = prenom_utilisateur;
          if (surnom_utilisateur) id.surnomUtilisateur = surnom_utilisateur;
          if (mon_nom) id.nomCompagnon = mon_nom;
          mem.sauver();
          signaler('identite', { prenom_utilisateur, surnom_utilisateur, mon_nom });
          return 'ok';
        },
      }),
    ];
  }

  // ------------------------------------------------------------- échange

  /**
   * Envoie un tour de conversation et diffuse la réponse au fil de l'eau.
   * @param {string} entree      texte de l'utilisateur, ou signal `[contexte] …`
   * @param {object} contexte    { auto: bool, note: string, absenceMs: number }
   */
  async repondre(entree, contexte = {}) {
    if (!this.client) {
      this.surErreur(new Error('Aucune clé API configurée.'));
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

    const parametres = {
      model: mem.etat.reglages.modele || 'claude-opus-5',
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
      tools: this.outils,
      stream: true,
    };

    // Claude Opus 5 peut décliner une requête ; le repli serveur la rejoue
    // automatiquement sur un autre modèle plutôt que de renvoyer un refus.
    if (!this.replisSansFallback && parametres.model.startsWith('claude-opus-5')) {
      parametres.betas = ['server-side-fallback-2026-07-01'];
      parametres.fallbacks = 'default';
    }

    let texte = '';
    let tampon = '';
    let refus = null;

    try {
      const runner = this.client.beta.messages.toolRunner(parametres);

      for await (const flux of runner) {
        for await (const evt of flux) {
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            const morceau = evt.delta.text;
            texte += morceau;
            tampon += morceau;
            this.surTexte(morceau, texte);
            // On découpe en phrases pour que la voix démarre sans attendre la fin.
            const coupe = tampon.match(/^([\s\S]*?[.!?…]["»)]?)(\s+)([\s\S]*)$/);
            if (coupe && coupe[1].trim().length > 2) {
              this.surPhrase(coupe[1].trim());
              tampon = coupe[3];
            }
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
      // Si le repli serveur n'est pas accepté par ce compte, on réessaie sans.
      const message = String(err?.message || '');
      if (parametres.fallbacks && /fallback|beta/i.test(message) && err?.status === 400) {
        this.replisSansFallback = true;
        this.occupe = false;
        mem.etat.conversation.pop(); // on retire le tour, `repondre` le remettra
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
