/**
 * Fournisseurs d'IA.
 *
 * Deux dialectes suffisent à couvrir le paysage :
 *   - `anthropic`  : l'API Messages, via le SDK embarqué (outils natifs)
 *   - `openai`     : l'API /chat/completions, que presque tout le monde expose
 *                    — Gemini, Groq, OpenRouter, Kimi, Cerebras, Mistral,
 *                    DeepSeek, et les serveurs locaux (Ollama, LM Studio).
 *
 * Contrainte propre à cette application : la page appelle l'API *directement*
 * depuis le navigateur. Il faut donc que le fournisseur autorise le CORS. Le
 * champ `cors` ci-dessous dit d'où vient l'information — « vérifié » signifie
 * testé, « documenté » signifie annoncé par le fournisseur mais pas testé ici.
 */

export const FOURNISSEURS = {
  anthropic: {
    nom: 'Anthropic — Claude',
    dialecte: 'anthropic',
    base: 'https://api.anthropic.com',
    modeles: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
    modeleParDefaut: 'claude-opus-5',
    cles: 'https://console.anthropic.com/settings/keys',
    gratuit: null,
    cors: 'vérifié',
    note: "Le plus incarné. Payant à l'usage, pas de palier gratuit.",
  },

  gemini: {
    nom: 'Google Gemini',
    dialecte: 'openai',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modeles: ['gemini-3.5-flash', 'gemini-3.6-flash'],
    modeleParDefaut: 'gemini-3.5-flash',
    cles: 'https://aistudio.google.com/apikey',
    listeModeles: 'https://ai.google.dev/gemini-api/docs/models',
    gratuit: '15 requêtes/min, 1500/jour — sans carte bancaire',
    cors: 'vérifié',
    note: "Le meilleur palier gratuit pour cet usage : limites larges, function calling et streaming.",
  },

  groq: {
    nom: 'Groq',
    dialecte: 'openai',
    base: 'https://api.groq.com/openai/v1',
    modeles: ['llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct'],
    modeleParDefaut: 'llama-3.3-70b-versatile',
    cles: 'https://console.groq.com/keys',
    listeModeles: 'https://console.groq.com/docs/models',
    gratuit: '~30 requêtes/min',
    cors: 'documenté',
    note: 'Le plus rapide. Modèles ouverts ; tous ne gèrent pas les outils.',
  },

  openrouter: {
    nom: 'OpenRouter',
    dialecte: 'openai',
    base: 'https://openrouter.ai/api/v1',
    modeles: [
      'google/gemini-3.5-flash',
      'moonshotai/kimi-k2',
      'anthropic/claude-sonnet-5',
      'deepseek/deepseek-chat',
    ],
    modeleParDefaut: 'google/gemini-3.5-flash',
    cles: 'https://openrouter.ai/keys',
    listeModeles: 'https://openrouter.ai/models',
    gratuit: 'modèles suffixés « :free » — 20 req/min, 50/jour',
    cors: 'documenté',
    entetes: () => ({
      'HTTP-Referer': location.origin,
      'X-Title': 'Compagnon',
    }),
    note: "Une seule clé pour des centaines de modèles, Kimi compris. C'est aussi le seul à revendiquer explicitement l'usage navigateur.",
  },

  moonshot: {
    nom: 'Moonshot — Kimi',
    dialecte: 'openai',
    base: 'https://api.moonshot.ai/v1',
    modeles: ['kimi-k2.5', 'kimi-k3'],
    modeleParDefaut: 'kimi-k2.5',
    cles: 'https://platform.moonshot.ai/console/api-keys',
    listeModeles: 'https://platform.moonshot.ai/docs/pricing',
    gratuit: "crédit d'essai, plafonné à 3 requêtes/min",
    cors: 'inconnu',
    note: "3 req/min ne suffisent pas à un compagnon qui parle seul. Préfère Kimi via OpenRouter.",
  },

  cerebras: {
    nom: 'Cerebras',
    dialecte: 'openai',
    base: 'https://api.cerebras.ai/v1',
    modeles: ['llama-3.3-70b'],
    modeleParDefaut: 'llama-3.3-70b',
    cles: 'https://cloud.cerebras.ai',
    listeModeles: 'https://inference-docs.cerebras.ai/models/overview',
    gratuit: '~1 M tokens/jour',
    cors: 'inconnu',
    note: 'Gros volume quotidien et débit très élevé.',
  },

  mistral: {
    nom: 'Mistral',
    dialecte: 'openai',
    base: 'https://api.mistral.ai/v1',
    modeles: ['mistral-small-latest', 'mistral-large-latest'],
    modeleParDefaut: 'mistral-small-latest',
    cles: 'https://console.mistral.ai/api-keys',
    listeModeles: 'https://docs.mistral.ai/getting-started/models/models_overview/',
    gratuit: 'palier expérimental, très restrictif',
    cors: 'inconnu',
    note: 'Européen. Palier gratuit pensé pour le prototypage.',
  },

  local: {
    nom: 'Serveur local (Ollama, LM Studio)',
    dialecte: 'openai',
    base: 'http://localhost:11434/v1',
    modeles: ['qwen3:8b', 'llama3.1:8b'],
    modeleParDefaut: 'qwen3:8b',
    cles: null,
    listeModeles: 'https://ollama.com/search?c=tools',
    gratuit: 'entièrement gratuit, rien ne sort de ta machine',
    cors: 'à configurer',
    note: "Ollama refuse les appels d'une page web tant que `OLLAMA_ORIGINS` ne l'autorise pas (voir le README). Choisis un modèle qui gère les outils.",
  },

  personnalise: {
    nom: 'Autre (compatible OpenAI)',
    dialecte: 'openai',
    base: '',
    modeles: [],
    modeleParDefaut: '',
    cles: null,
    gratuit: null,
    cors: 'inconnu',
    note: "Pour tout service exposant /chat/completions : DeepSeek, Together, Fireworks, ton propre relais…",
  },
};

export const NOMS_FOURNISSEURS = Object.keys(FOURNISSEURS);

/** Convertit un outil interne en déclaration de fonction OpenAI. */
export function outilVersOpenAI(outil) {
  return {
    type: 'function',
    function: {
      name: outil.nom,
      description: outil.description,
      parameters: outil.schema,
    },
  };
}

/**
 * Un tour de conversation complet sur une API compatible OpenAI, outils compris.
 *
 * Boucle jusqu'à ce que le modèle cesse d'appeler des outils, en diffusant le
 * texte au fil de l'eau. Retourne le texte final concaténé.
 */
export async function discuterOpenAI({
  base,
  cle,
  modele,
  entetes = {},
  systeme,
  messages,
  outils,
  maxTokens = 2048,
  surTexte = () => {},
  surOutil = () => {},
  surNouveauTour = () => {},
  maxTours = 6,
}) {
  const url = `${String(base).replace(/\/+$/, '')}/chat/completions`;
  const fil = [{ role: 'system', content: systeme }, ...messages];
  const declarations = outils.map(outilVersOpenAI);
  let texteFinal = '';

  for (let tour = 0; tour < maxTours; tour++) {
    // Le texte d'avant et d'après un appel d'outil appartient au même message :
    // sans séparateur, les deux moitiés se collent.
    if (tour > 0) surNouveauTour();

    const reponse = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cle ? { authorization: `Bearer ${cle}` } : {}),
        ...entetes,
      },
      body: JSON.stringify({
        model: modele,
        messages: fil,
        tools: declarations.length ? declarations : undefined,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!reponse.ok) throw await erreurHttp(reponse);
    if (!reponse.body) throw new Error('Réponse sans corps — streaming indisponible.');

    const { texte, appels, raison } = await lireFlux(reponse.body, (m) => {
      texteFinal += m;
      surTexte(m, texteFinal);
    });

    if (!appels.length) {
      if (raison === 'length') {
        surTexte('…', texteFinal);
      }
      return texteFinal;
    }

    // Le modèle veut des outils : on les exécute et on relance le tour.
    fil.push({
      role: 'assistant',
      content: texte || null,
      tool_calls: appels.map((a) => ({
        id: a.id,
        type: 'function',
        function: { name: a.nom, arguments: a.arguments || '{}' },
      })),
    });

    for (const appel of appels) {
      const outil = outils.find((o) => o.nom === appel.nom);
      let resultat;
      try {
        const entree = appel.arguments ? JSON.parse(appel.arguments) : {};
        resultat = outil ? String(outil.executer(entree) ?? 'ok') : `outil inconnu : ${appel.nom}`;
        if (outil) surOutil(appel.nom, entree);
      } catch (err) {
        resultat = `erreur : ${err.message}`;
      }
      fil.push({ role: 'tool', tool_call_id: appel.id, content: resultat });
    }
  }

  return texteFinal;
}

/** Lit un flux SSE OpenAI et en extrait le texte et les appels d'outils. */
async function lireFlux(corps, surMorceau) {
  const lecteur = corps.getReader();
  const decodeur = new TextDecoder();
  let tampon = '';
  let texte = '';
  let raison = null;
  const parIndex = new Map();

  while (true) {
    const { done, value } = await lecteur.read();
    if (done) break;
    tampon += decodeur.decode(value, { stream: true });

    // Les événements SSE sont séparés par une ligne vide ; un chunk réseau peut
    // couper n'importe où, d'où le tampon.
    let coupure;
    while ((coupure = tampon.indexOf('\n')) !== -1) {
      const ligne = tampon.slice(0, coupure).trim();
      tampon = tampon.slice(coupure + 1);
      if (!ligne.startsWith('data:')) continue;
      const charge = ligne.slice(5).trim();
      if (!charge || charge === '[DONE]') continue;

      let evt;
      try {
        evt = JSON.parse(charge);
      } catch {
        continue; // fragment incomplet : on laisse tomber cet événement
      }

      const choix = evt.choices?.[0];
      if (!choix) continue;
      if (choix.finish_reason) raison = choix.finish_reason;

      const delta = choix.delta || {};
      if (typeof delta.content === 'string' && delta.content) {
        texte += delta.content;
        surMorceau(delta.content);
      }
      for (const appel of delta.tool_calls || []) {
        const i = appel.index ?? 0;
        const courant = parIndex.get(i) || { id: '', nom: '', arguments: '' };
        if (appel.id) courant.id = appel.id;
        if (appel.function?.name) courant.nom = appel.function.name;
        if (appel.function?.arguments) courant.arguments += appel.function.arguments;
        parIndex.set(i, courant);
      }
    }
  }

  const appels = [...parIndex.values()].filter((a) => a.nom);
  for (const a of appels) if (!a.id) a.id = `appel_${Math.random().toString(36).slice(2, 10)}`;
  return { texte, appels, raison };
}

async function erreurHttp(reponse) {
  let detail = '';
  try {
    const corps = await reponse.json();
    detail = corps?.error?.message || corps?.message || JSON.stringify(corps).slice(0, 200);
  } catch {
    detail = await reponse.text().catch(() => '');
  }
  const err = new Error(detail || `HTTP ${reponse.status}`);
  err.status = reponse.status;
  return err;
}
