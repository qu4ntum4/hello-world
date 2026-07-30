/**
 * Bouchon utilisé au moment d'empaqueter le SDK Anthropic pour le navigateur.
 *
 * Le SDK ne touche à `node:fs` / `node:path` que pour chercher des profils
 * d'identification sur disque. Dans un navigateur la clé est fournie
 * explicitement, donc ces chemins de code ne s'exécutent jamais — mais esbuild
 * doit quand même pouvoir résoudre les imports.
 *
 * Ce fichier n'est pas chargé par la page : il ne sert qu'à la reconstruction
 * de `vendor/anthropic.esm.js` (voir le README).
 */

const indisponible = () => {
  throw new Error("Accès au système de fichiers indisponible dans le navigateur");
};

export const readFileSync = indisponible;
export const existsSync = () => false;
export const promises = { readFile: indisponible };
export const join = (...p) => p.join('/');
export const resolve = (...p) => p.join('/');
export const dirname = (p) => p.split('/').slice(0, -1).join('/');

export default { readFileSync, existsSync, promises, join, resolve, dirname };
