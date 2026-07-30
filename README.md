# Compagnon

Un compagnon interactif : un avatar 3D animé en temps réel dont **les gestes,
l'humeur, l'apparence, les souvenirs et la parole sont générés par Claude**.
Il vit dans une page web statique — pas de serveur, pas de build.

Il n'oublie pas. D'une visite à l'autre il retrouve son humeur, ce que vous
vous êtes dit, ce qu'il a appris de vous, et le lien qui s'est construit.
Laissé seul, il s'ennuie, se fatigue, finit par s'endormir — et prend parfois
la parole tout seul.

## Démarrer

**En ligne** — activer GitHub Pages sur ce dépôt (Settings → Pages → branche
`main`, dossier `/`), puis ouvrir l'URL publiée.

**En local** — n'importe quel serveur statique fait l'affaire ; ouvrir le
fichier directement ne marche pas (les modules ES exigent `http://`) :

```sh
python3 -m http.server 8000   # puis http://localhost:8000
```

Au premier lancement, il demande **quelle IA doit l'animer** et la clé
correspondante. Sans clé, il apparaît et bouge, mais reste muet.

## Choisir l'IA

Le compagnon n'est pas lié à un fournisseur. Deux dialectes couvrent tout :
l'API Messages d'Anthropic, et `/chat/completions` que presque tous exposent.
Le fournisseur se change à chaud dans les réglages ; une clé est mémorisée par
fournisseur.

Deux contraintes filtrent les options, et les comparatifs génériques les
ignorent : la page appelle l'API **directement depuis le navigateur** (il faut
donc que le fournisseur autorise le CORS), et le compagnon a besoin du
**function calling en streaming** pour piloter ses gestes.

| Fournisseur | Gratuit | Navigateur | Pour cette app |
| --- | --- | --- | --- |
| **Google Gemini** | 15 req/min, 1500/jour, permanent | ✅ vérifié par test | **Le meilleur choix gratuit** |
| **Groq** | ~30 req/min | documenté | Le plus rapide ; tous les modèles ne gèrent pas les outils |
| **OpenRouter** | modèles `:free`, 20 req/min | documenté | Une clé, des centaines de modèles — **dont Kimi** |
| **Cerebras** | ~1 M tokens/jour | non vérifié | Gros volume |
| **Moonshot (Kimi)** | crédit d'essai, **3 req/min** | non vérifié | Trop contraint : passe par OpenRouter |
| **Mistral** | palier expérimental | non vérifié | Prototypage |
| **Anthropic** | — (payant) | ✅ vérifié | Le plus incarné |
| **Ollama / LM Studio** | total | à configurer | Rien ne quitte ta machine |

« Vérifié par test » signifie que le préflight CORS a été exécuté et que la
réponse autorise l'origine. « Documenté » vient de la documentation du
fournisseur. Les paliers gratuits et les identifiants de modèles bougent vite —
en cas d'erreur « modèle inconnu », prends le nom exact chez le fournisseur.

### Faire tourner un modèle local

Ollama refuse par défaut les appels venant d'une page web. Il faut l'autoriser
puis le relancer :

```sh
OLLAMA_ORIGINS='https://qu4ntum4.github.io,http://localhost:8000' ollama serve
ollama pull qwen3:8b   # choisis un modèle qui sait appeler des outils
```

Une page servie en HTTPS peut appeler `http://localhost` — les navigateurs
considèrent localhost comme sûr — mais pas un serveur en HTTP sur une autre
machine.

### Sur la clé API — à lire avant de publier la page

Les clés sont enregistrées dans le `localStorage` de votre navigateur et
envoyées **directement** à l'API choisie depuis la page. Il n'y a aucun serveur
intermédiaire, donc aucun endroit où une clé pourrait être cachée. (Elles sont
stockées hors de l'état du compagnon : l'export JSON de sa mémoire n'en contient
aucune.)

Concrètement :

- Utilisez-le sur **vos** machines. Toute personne ayant accès au navigateur a
  accès à la clé.
- Une page GitHub Pages est publique, mais **votre clé ne l'est pas** : elle
  n'est jamais dans le code, seulement dans le navigateur de qui la saisit.
- Pour un usage partagé ou exposé, il faudrait un petit proxy côté serveur qui
  détient la clé. Ce dépôt ne va pas jusque-là, volontairement — c'est le prix
  du « zéro backend ».

## Ce que l'IA pilote réellement

Le modèle ne renvoie pas que du texte : il dispose d'outils qui agissent sur le
personnage. C'est ce qui distingue une vraie génération d'un habillage par
mots-clés.

| Outil | Effet |
| --- | --- |
| `exprimer` | Change l'expression du visage et déclenche un geste, tout de suite |
| `ressentir` | Fait dériver l'humeur de fond (valence, éveil, énergie) |
| `memoriser` / `oublier` | Écrit ou efface un souvenir durable |
| `lien` | Fait évoluer l'attachement et la confiance |
| `apparence` | Change sa couleur et celle de ses particules |
| `journal` | Note une phrase dans son journal de bord |
| `question_en_attente` | Garde une question pour la prochaine fois |
| `identite` | Retient votre prénom, le surnom qu'il vous donne, ou change le sien |

14 émotions (`joie`, `tristesse`, `colère`, `tendresse`, `espièglerie`,
`ennui`, `fatigue`…) et 18 gestes (`saluer`, `hocher`, `hausser_epaules`,
`réfléchir`, `rire`, `soupirer`, `danser`, `cœur`, `se_blottir`, `dormir`…).

## Ce qui est conservé entre deux sessions

Tout est dans le `localStorage`, sous une seule clé :

- **humeur et énergie**, qui dérivent pendant votre absence — trois jours sans
  venir et il est mélancolique ;
- **historique de conversation** (80 derniers messages), réinjecté comme contexte ;
- **faits appris** sur vous, classés et hiérarchisés par importance ;
- **relation** : familiarité, confiance, attachement, six paliers de `inconnus`
  à `inséparables` ;
- **traits de personnalité** qui dérivent lentement — c'est ce qui fait qu'il
  devient *le vôtre* ;
- **journal de bord**, **sujets récurrents**, **questions en attente**,
  **surnoms**, **apparence**, et l'**histogramme des heures** auxquelles vous
  venez le voir.

Le panneau ◍ montre tout ça et permet d'**exporter / importer** la mémoire en
JSON (utile : vider les données du site l'efface définitivement).

## Architecture

```
index.html          structure de la page
styles.css          interface ; --teinte / --accent suivent l'humeur
js/avatar3d.js      corps, visage, animation trois couches (base · humeur · gestes)
js/brain.js         orchestration : outils, prompt système, streaming
js/providers.js     registre des fournisseurs + adaptateur compatible OpenAI
js/memory.js        état persistant, dérive de l'humeur, import/export
js/voice.js         synthèse vocale et reconnaissance vocale du navigateur
js/life.js          vie autonome : ennui, sommeil, prises de parole spontanées
js/main.js          assemblage et interface
vendor/             three.js et le SDK Anthropic, embarqués (voir plus bas)
```

L'avatar est **entièrement construit par code** — aucun modèle 3D à charger.
Le corps est un solide de révolution, le visage est posé sur sa surface par
calcul, et l'animation se compose en trois couches additives : la base
procédurale (respiration, flottement, clignements, suivi du regard), l'humeur
(pose et couleurs cibles, lissées), et les gestes joués par-dessus.

### Ajouter un geste ou une émotion

Une entrée dans `GESTES` ou `EMOTIONS` (`js/avatar3d.js`) suffit : la liste
envoyée au modèle est dérivée de ces objets, il saura s'en servir sans rien
changer d'autre.

```js
saluer_timidement: {
  duree: 1.4,
  appliquer(p, t, i) {
    const e = enveloppe(t);       // 0 → 1 → 0
    p.mainD.y += 0.3 * e * i;
    p.teteRoll += 0.1 * e * i;
  },
},
```

## Réglages

- **Fournisseur et modèle** — voir *Choisir l'IA* plus haut. Le champ modèle
  est libre : les suggestions ne sont qu'un point de départ.
- **Profondeur de réflexion** — propre à Anthropic, masqué ailleurs. `low` par
  défaut : une conversation n'a pas besoin de plus, et la latence compte. La
  réflexion reste *activée* (la désactiver rend les appels d'outils peu fiables
  sur Opus 5).
- **Autonomie** — ses prises de parole spontanées sont bornées : une toutes les
  2 min 30 au plus, douze par session, jamais quand l'onglet est en arrière-plan.

## Limites connues

- La **voix** dépend du navigateur. La synthèse marche partout ; la
  reconnaissance vocale demande Chrome ou Edge.
- Le `localStorage` est **par navigateur et par appareil** : il ne vous suit pas
  d'une machine à l'autre. L'export JSON est là pour ça.
- Chaque prise de parole coûte un appel API. C'est visible surtout avec
  l'autonomie activée.

## Dépendances embarquées

`vendor/` contient [three.js](https://threejs.org) r180 et le
[SDK Anthropic](https://github.com/anthropics/anthropic-sdk-typescript) 0.115.0
(tous deux MIT), afin que la page fonctionne sans CDN ni étape de build. Pour
les régénérer :

```sh
npm pack three@0.180.0 && tar xzf three-0.180.0.tgz
cp package/build/three.module.js package/build/three.core.js vendor/

npm i @anthropic-ai/sdk esbuild
printf "export { default as Anthropic } from '@anthropic-ai/sdk';\n\
export * from '@anthropic-ai/sdk';\n\
export { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';\n" > entry.js
npx esbuild entry.js --bundle --format=esm --platform=browser --target=es2022 \
  --alias:node:fs=./vendor/node-stub.js --alias:node:path=./vendor/node-stub.js \
  --outfile=vendor/anthropic.esm.js
```

`vendor/node-stub.js` neutralise les accès disque que le SDK n'utilise que côté
Node (lecture de profils d'identification) et qui n'existent pas dans un
navigateur. Il n'est pas chargé par la page.
