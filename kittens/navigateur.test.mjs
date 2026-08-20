// Test de bout en bout : deux navigateurs, une vraie liaison WebRTC.
// Il vérifie la création de partie, l'arrivée par le code, le chat, le
// lancement, la pioche, un coup joué, l'arrivée tardive en spectateur et la
// reconnexion après fermeture brutale d'un onglet.
//
//   npm i playwright peer
//   node kittens/navigateur.test.mjs
//
// Un service de rendez-vous local remplace celui de PeerJS : la mécanique
// testée est identique, mais le test ne dépend d'aucun réseau extérieur.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mjs': 'text/javascript' };
const serveur = http.createServer((req, res) => {
  const p = path.join(RACINE, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('non'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => serveur.listen(8731, r));
// Relais de rendez-vous local : le service public n'est pas joignable depuis
// ce bac à sable, mais la mécanique testée est exactement la même.
const { PeerServer } = await import('peer');
const relais = PeerServer({ host: '127.0.0.1', port: 9731, path: '/rdv', allow_discovery: false });
await new Promise((r) => setTimeout(r, 800));
const BASE = 'http://localhost:8731/?relais=http://127.0.0.1:9731/rdv';

const nav = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
const soucis = [];
const contextes = {};
async function page(ctxNom, taille) {
  const ctx = contextes[ctxNom] || (contextes[ctxNom] = await nav.newContext({ viewport: taille, permissions: [] }));
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') soucis.push(`[${ctxNom}] console: ${m.text()}`); });
  p.on('pageerror', (e) => soucis.push(`[${ctxNom}] exception: ${e.message}`));
  return p;
}

const mobile = { width: 390, height: 844 };
const A = await page('hôte', mobile);
const B = await page('invité', mobile);

await A.goto(BASE);
await A.fill('#pseudo', 'Alice');
await A.click('#btn-creer');
await A.waitForSelector('#salon.actif', { timeout: 30000 });
const code = (await A.textContent('#code-affiche')).trim();
console.log('code de partie :', code);
if (!/^[A-Z0-9]{5}$/.test(code)) throw new Error('code invalide');

await B.goto(BASE + '#' + code);
await B.fill('#pseudo', 'Bob');
await B.click('#btn-rejoindre');
await B.waitForSelector('#salon.actif', { timeout: 30000 });
await A.waitForFunction(() => document.querySelectorAll('#liste-joueurs li').length === 2, null, { timeout: 20000 });
console.log('deux joueurs dans le salon ✓');

await B.fill('#form-chat-salon input', 'salut !');
await B.click('#form-chat-salon button');
await A.waitForFunction(() => document.querySelector('#chat-salon').textContent.includes('salut !'), null, { timeout: 10000 });
console.log('chat du salon ✓');

if (process.env.CAPTURES) await A.screenshot({ path: process.env.CAPTURES + '/salon.png' });
await A.click('#btn-demarrer');
await A.waitForSelector('#table.actif', { timeout: 15000 });
await B.waitForSelector('#table.actif', { timeout: 15000 });
console.log('partie lancée sur les deux écrans ✓');

const mains = await Promise.all([A, B].map((p) => p.locator('#main-cartes .carte').count()));
console.log('cartes en main :', mains.join(' / '));
if (mains.some((n) => n !== 8)) throw new Error('main initiale incorrecte');

// Vérifie que personne ne voit la main de l'autre.
const fuite = await B.evaluate(() => JSON.stringify(window.__etat || {}));
if (fuite.includes('"main"') && fuite.split('"main"').length > 2) throw new Error('fuite de main');

// Quelques tours : celui qui a la main pioche.
for (let i = 0; i < 8; i++) {
  for (const p of [A, B]) {
    const actif = await p.locator('#pioche.jouable').count();
    if (actif) { await p.click('#pioche'); await p.waitForTimeout(350); }
  }
  await A.waitForTimeout(200);
}
const pioche = Number(await A.textContent('#pioche-compte'));
console.log('cartes restantes dans la pioche :', pioche);
if (pioche >= 37) throw new Error('la pioche ne descend pas');

if (process.env.CAPTURES) await A.screenshot({ path: process.env.CAPTURES + '/table.png' });
const large = await page('bureau', { width: 1280, height: 800 });
await large.goto(BASE + '#' + code);
await large.fill('#pseudo', 'Chloé');
await large.click('#btn-rejoindre');
await large.waitForSelector('#table.actif', { timeout: 20000 });
const spect = await large.textContent('#main-cartes');
console.log('arrivée tardive :', spect.trim().slice(0, 40));
if (process.env.CAPTURES) await large.screenshot({ path: process.env.CAPTURES + '/bureau.png' });

// Panneau des règles : toutes les cartes doivent se dessiner.
await A.click('#btn-regles-table');
await A.waitForSelector('#panneau-regles .fiche .carte svg', { timeout: 5000 });
await A.waitForTimeout(500);
const fiches = await A.locator('#panneau-regles .fiche').count();
console.log('fiches de règles rendues :', fiches);
if (process.env.CAPTURES) await A.screenshot({ path: process.env.CAPTURES + '/regles.png' });

await A.click('#btn-fermer-regles');
// Reconnexion : on ferme brutalement l'onglet de l'invité, il revient sur le
// même lien et doit retrouver sa place et sa main.
const avant = await B.locator('#main-cartes .carte').count();
await B.close();
await A.waitForFunction(() => [...document.querySelectorAll('.adversaire')].some((e) => e.querySelector('.absent-tag')),
  null, { timeout: 30000 });
console.log("déconnexion vue par l'hôte ✓");
const B2 = await page('invité', mobile);
await B2.goto(BASE + '#' + code);
await B2.fill('#pseudo', 'Bob');
await B2.click('#btn-rejoindre');
await B2.waitForSelector('#table.actif', { timeout: 30000 });
await B2.waitForTimeout(1200);
const apres = await B2.locator('#main-cartes .carte').count();
console.log('main avant/après reconnexion :', avant, '/', apres);
if (apres !== avant) throw new Error("la main n'a pas été retrouvée");
const joueursApres = await A.locator('.adversaire').count();
if (joueursApres !== 2) throw new Error('un siège fantôme est apparu');
console.log('reconnexion : place et cartes retrouvées ✓');

// Jouer une carte depuis la main, sans cible à désigner.
let joue = false;
for (let tentative = 0; tentative < 12 && !joue; tentative++) {
  for (const p of [A, B2]) {
    if (!(await p.locator('#pioche.jouable').count())) continue;
    let carte = null;
    for (const type of ['melanger', 'passer', 'attaque']) {
      const c = p.locator(`#main-cartes .carte[data-type=${type}]`).first();
      if (await c.count()) { carte = c; break; }
    }
    if (!carte) { await p.click('#pioche'); await p.waitForTimeout(400); continue; }
    const attendu = await carte.locator('.carte-nom').textContent();
    await carte.click();
    await p.click('#actions .bouton--majeur');
    await p.waitForTimeout(1500);
    const journal = (await p.textContent('#journal')).replace(/\s+/g, ' ').trim();
    console.log('carte jouée :', attendu, '| journal :', journal);
    if (!journal.includes(attendu)) throw new Error("le coup n'est pas passé");
    joue = true;
    break;
  }
}
if (!joue) throw new Error('aucun coup joué');

// Planche de toutes les cartes, pour juger les dessins d'un coup d'œil.
const galerie = await page('galerie', { width: 900, height: 760 });
await galerie.goto(BASE);
await galerie.evaluate(async () => {
  const { elementCarte } = await import('./js/cartes.js');
  const { CATALOGUE } = await import('./js/moteur.js');
  document.body.innerHTML = '<div id="g" style="display:grid;grid-template-columns:repeat(7,1fr);gap:14px;padding:20px"></div>';
  for (const t of Object.keys(CATALOGUE)) document.querySelector('#g').appendChild(elementCarte(t, { taille: 'grande' }));
});
await galerie.waitForTimeout(300);
if (process.env.CAPTURES) await galerie.screenshot({ path: process.env.CAPTURES + '/cartes.png' });

console.log(soucis.length ? '\n⚠ problèmes :\n' + soucis.join('\n') : '\n✅ aucune erreur console');
await nav.close();
serveur.close(); relais.close && relais.close();
process.exit(soucis.length ? 1 : 0);
