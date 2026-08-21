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

// Tirer un chaton explosif ouvre une modale : on la joue, ce qui couvre au
// passage l'écran de désamorçage et le choix de la position.
let desamorcages = 0;
async function repondreAuxModales(p) {
  if (!(await p.locator('#voile:not([hidden])').count())) return;
  if (await p.locator('[data-desamorcer]').count()) {
    await p.click('[data-desamorcer]');
    await p.waitForSelector('#positions .bouton', { timeout: 5000 });
    await p.locator('#positions .bouton').last().click();   // « au hasard »
    desamorcages += 1;
  } else if (await p.locator('[data-exploser]').count()) {
    await p.click('[data-exploser]');
  } else if (await p.locator('[data-fermer]').count()) {
    await p.click('[data-fermer]');
  }
  await p.waitForTimeout(300);
}

// Quelques tours : celui qui a la main pioche.
for (let i = 0; i < 8; i++) {
  for (const p of [A, B]) {
    await repondreAuxModales(p);
    const actif = await p.locator('#pioche.jouable').count();
    if (actif) { await p.click('#pioche'); await p.waitForTimeout(400); }
    await repondreAuxModales(p);
  }
  await A.waitForTimeout(200);
}
console.log('chatons désamorcés pendant la partie :', desamorcages);
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

// La fiche d'une carte : la pastille doit expliquer ce qu'elle fait sans
// sélectionner la carte.
await repondreAuxModales(A);
const premiere = A.locator('#main-cartes .carte').first();
const nomCarte = (await premiere.locator('.carte-nom').textContent()).trim();
await premiere.locator('.carte-info').click();
await A.waitForSelector('#modale h2', { timeout: 5000 });
const fiche = (await A.textContent('#modale')).replace(/\s+/g, ' ').trim();
console.log('fiche de carte :', fiche.slice(0, 80), '…');
if (!fiche.includes(nomCarte)) throw new Error('la fiche ne parle pas de la bonne carte');
if (await A.locator('#main-cartes .carte.choisie').count()) throw new Error('la pastille a sélectionné la carte');
if (process.env.CAPTURES) await A.screenshot({ path: process.env.CAPTURES + '/fiche.png' });
await A.click('#modale [data-fermer]');
console.log('fiche au toucher ✓');

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
await B.close();
await A.waitForFunction(() => [...document.querySelectorAll('.adversaire')].some((e) => e.querySelector('.absent-tag')),
  null, { timeout: 30000 });
console.log("déconnexion vue par l'hôte ✓");
const B2 = await page('invité', mobile);
await B2.goto(BASE + '#' + code);
await B2.fill('#pseudo', 'Bob');
await B2.click('#btn-rejoindre');
await B2.waitForSelector('#table.actif', { timeout: 30000 });
await B2.waitForTimeout(1500);
// Pendant l'absence, l'hôte joue à la place de l'absent pour ne pas figer la
// table : la main a donc pu bouger. Ce qui doit tenir, c'est qu'elle
// corresponde exactement à ce que l'hôte lui compte.
const retrouvee = await B2.locator('#main-cartes .carte').count();
const vueParLHote = Number((await A.locator('.adversaire', { hasText: 'Bob' }).locator('.cartes').textContent()).match(/\d+/)[0]);
console.log('main retrouvée :', retrouvee, '| comptée par l\'hôte :', vueParLHote);
if (retrouvee !== vueParLHote || retrouvee === 0) throw new Error('la main ne correspond pas à celle de la table');
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

// Code inexistant : l'attente doit être visible, puis le diagnostic doit
// nommer la bonne cause plutôt qu'un message unique fourre-tout.
const perdu = await page('égaré', mobile);
await perdu.goto(BASE);
await perdu.fill('#pseudo', 'Dora');
await perdu.fill('#code-saisi', 'ZZZZZ');
await perdu.click('#btn-rejoindre');
await perdu.waitForSelector('#statut:not([hidden])', { timeout: 5000 });
const enAttente = await perdu.locator('#btn-rejoindre.occupe').count();
console.log('pendant la recherche — statut :', (await perdu.textContent('#statut')).trim(),
            '| bouton occupé :', enAttente === 1);
if (!enAttente) throw new Error("le bouton ne montre pas qu'il travaille");
await perdu.waitForSelector('#diagnostic:not([hidden])', { timeout: 45000 });
const diag = (await perdu.textContent('#diagnostic')).replace(/\s+/g, ' ').trim();
console.log('diagnostic :', diag.slice(0, 95), '…');
if (!diag.includes("aucune table n'est ouverte")) throw new Error('mauvaise cause diagnostiquée');
if (!(await perdu.locator('#diagnostic [data-reessayer]').count())) throw new Error('pas de bouton Réessayer');
if (await perdu.locator('#btn-rejoindre.occupe').count()) throw new Error('le bouton est resté bloqué');
if (process.env.CAPTURES) await perdu.screenshot({ path: process.env.CAPTURES + '/diagnostic.png' });
console.log('diagnostic du code inconnu ✓');

// Réglages réseau : le test de connexion doit rendre un verdict lisible, et le
// relais doit se garder et se relire.
const reseau = await page('réseau', mobile);
await reseau.goto(BASE);
await reseau.click('#btn-reseau');
await reseau.fill('#turn-url', 'turn:essai.example:3478');
await reseau.fill('#turn-user', 'moi');
await reseau.fill('#turn-pass', 'secret');
await reseau.click('#btn-turn-garder');
await reseau.reload();
await reseau.click('#btn-reseau');
if ((await reseau.inputValue('#turn-url')) !== 'turn:essai.example:3478') throw new Error('le relais ne se relit pas');
if (!(await reseau.locator('#relais-actif:not([hidden])').count())) throw new Error("le relais réglé n'est pas signalé à l'accueil");
await reseau.click('#btn-tester');
await reseau.waitForSelector('#resultat-test ul', { timeout: 30000 });
const verdict = (await reseau.textContent('#resultat-test')).replace(/\s+/g, ' ').trim();
console.log('test de connexion :', verdict.slice(0, 110), '…');
if (!/locales [1-9]/.test(verdict)) throw new Error('le test ne relève aucune adresse locale');
if (process.env.CAPTURES) await reseau.screenshot({ path: process.env.CAPTURES + '/reseau.png' });
await reseau.click('#btn-turn-oublier');
console.log('réglages réseau ✓');

// Liaison impossible : on empêche l'invité de terminer la négociation. La page
// ne doit surtout pas conclure « code inconnu » — la table, elle, existe.
const ctxSourd = await nav.newContext({ viewport: mobile });
await ctxSourd.addInitScript(() => {
  // La réponse de l'hôte n'est jamais appliquée : le canal ne s'ouvrira pas.
  RTCPeerConnection.prototype.setRemoteDescription = () => new Promise(() => {});
});
const sourd = await ctxSourd.newPage();
sourd.on('pageerror', (e) => soucis.push(`[sourd] exception: ${e.message}`));
await sourd.goto(BASE + '#' + code);
await sourd.fill('#pseudo', 'Eve');
await sourd.click('#btn-rejoindre');
await sourd.waitForSelector('#diagnostic:not([hidden])', { timeout: 60000 });
const bloque = (await sourd.textContent('#diagnostic')).replace(/\s+/g, ' ').trim();
console.log('diagnostic liaison :', bloque.slice(0, 100), '…');
if (!bloque.includes("ne s'ouvre pas")) throw new Error('liaison bloquée mal diagnostiquée — reçu : ' + bloque.slice(-90));
if (!bloque.includes('Vos adresses')) throw new Error('le relevé ICE manque');
if (!bloque.includes("Celles de l'hôte")) throw new Error("le relevé ne dit rien de l'hôte");
if (!/Vos adresses — locales [1-9]/.test(bloque)) throw new Error('la sonde ne lit aucune adresse locale');
if (!/Celles de l'hôte — locales [1-9]/.test(bloque)) throw new Error("la sonde ne lit pas les adresses distantes");
if (process.env.CAPTURES) await sourd.screenshot({ path: process.env.CAPTURES + '/bloque.png' });
console.log('diagnostic de la liaison bloquée ✓');

// L'hôte, lui aussi, doit voir qu'un joueur a frappé sans pouvoir entrer.
await A.waitForFunction(() => document.querySelector('#salon-alerte').textContent.length > 20,
  null, { timeout: 40000 });
const alerte = (await A.textContent('#salon-alerte')).replace(/\s+/g, ' ').trim();
console.log('alerte côté hôte :', alerte.slice(0, 90), '…');
if (!alerte.includes('essayé de rejoindre')) throw new Error("l'hôte n'est pas averti de l'appel raté");
if (!alerte.includes('Les siennes')) throw new Error("l'hôte ne voit pas les adresses du joueur");
console.log("l'hôte est averti de l'appel raté ✓");

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
