// Tests du moteur : invariants sur des milliers de parties simulées, puis
// vérifications ciblées des règles qui se trompent facilement.
// Lancer : node kittens/moteur.test.mjs
import { Partie, CATALOGUE } from './js/moteur.js';

let echecs = 0;
function verifie(condition, titre) {
  if (condition) console.log('  ✓', titre);
  else { console.log('  ✗', titre); echecs++; }
}
function egal(a, b, titre) { verifie(Object.is(a, b), `${titre} (attendu ${b}, obtenu ${a})`); }

// Générateur reproductible (xorshift32).
function graine(s) {
  let x = s || 123456789;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

const total = (p) => p.joueurs.reduce((n, j) => n + j.main.length, 0) + p.pioche.length
  + p.defausse.length + (p.attente && p.attente.bombe ? 1 : 0);

function nouvellePartie(n, alea) {
  const joueurs = Array.from({ length: n }, (_, i) => ({ id: 'j' + i, pseudo: 'J' + i }));
  return new Partie(joueurs, { alea });
}

// ————————————————————————————————————————— parties aléatoires

function simuler(n, alea, maxTours = 4000) {
  const p = nouvellePartie(n, alea);
  const attendu = 51 + n;
  let tours = 0;
  while (!p.gagnant && tours++ < maxTours) {
    if (total(p) !== attendu) throw new Error(`cartes perdues : ${total(p)} au lieu de ${attendu}`);
    const a = p.attente;
    if (a && a.genre === 'nope') {
      for (const j of p.vivants()) if (p.peutNoper(j) && alea() < 0.18) p.jouerNope(j);
      p.resoudreFenetre();
      continue;
    }
    if (a && a.genre === 'faveur') {
      const d = p.joueur(a.donneur);
      p.action(d.id, { t: 'donner', carte: d.main[Math.floor(alea() * d.main.length)].id });
      continue;
    }
    if (a && a.genre === 'demande') {
      const types = Object.keys(CATALOGUE).filter((t) => t !== 'bombe');
      p.action(a.joueur, { t: 'nommer', type: types[Math.floor(alea() * types.length)] });
      continue;
    }
    if (a && a.genre === 'repeche') {
      p.action(a.joueur, { t: 'reprendre', carte: p.defausse[p.defausse.length - 1].id });
      continue;
    }
    if (a && a.genre === 'explosion') {
      if (a.peutDesamorcer && alea() < 0.9) p.action(a.joueur, { t: 'desamorcer', position: 'hasard' });
      else p.action(a.joueur, { t: 'exploser' });
      continue;
    }
    const j = p.courant;
    const adversaires = p.vivants().filter((x) => x.id !== j.id && x.main.length > 0);
    let joue = false;
    if (alea() < 0.55) {
      const parType = new Map();
      for (const c of j.main) { if (c.type === 'bombe') continue; parType.set(c.type, [...(parType.get(c.type) || []), c]); }
      const paires = [...parType.values()].filter((v) => v.length >= 2);
      if (paires.length && adversaires.length && alea() < 0.5) {
        const g = paires[Math.floor(alea() * paires.length)];
        const cible = adversaires[Math.floor(alea() * adversaires.length)];
        joue = !p.action(j.id, { t: 'jouer', cartes: g.slice(0, alea() < 0.5 && g.length >= 3 ? 3 : 2).map((c) => c.id), cible });
      }
      if (!joue) {
        const seules = j.main.filter((c) => CATALOGUE[c.type].jouable);
        if (seules.length) {
          const c = seules[Math.floor(alea() * seules.length)];
          const cible = adversaires.length ? adversaires[Math.floor(alea() * adversaires.length)].id : null;
          joue = !p.action(j.id, { t: 'jouer', cartes: [c.id], cible });
        }
      }
    }
    if (!joue) p.action(j.id, { t: 'piocher' });
  }
  p.arreter();
  if (!p.gagnant) throw new Error('partie sans fin');
  if (total(p) !== attendu) throw new Error('cartes perdues en fin de partie');
  return p;
}

console.log('\nParties simulées');
let ok = 0, longueurs = [];
for (let i = 0; i < 1200; i++) {
  const n = 2 + (i % 4);
  const alea = graine(i * 2654435761 + 7);
  try { const p = simuler(n, alea); ok++; longueurs.push(p.journal.length); }
  catch (e) { console.log(`  ✗ partie #${i} à ${n} joueurs : ${e.message}`); echecs++; break; }
}
verifie(ok === 1200, `1200 parties de 2 à 5 joueurs se terminent, cartes conservées (${ok} réussies)`);

// ————————————————————————————————————————— composition du paquet

console.log('\nComposition');
{
  const p = nouvellePartie(5, graine(42));
  const compte = {};
  for (const c of [...p.pioche, ...p.defausse, ...p.joueurs.flatMap((j) => j.main)]) compte[c.type] = (compte[c.type] || 0) + 1;
  egal(compte.bombe, 4, 'quatre chatons explosifs à cinq joueurs (nb - 1)');
  egal(compte.desamorcage, 6, 'six désamorçages au total');
  egal(compte.nope, 5, 'cinq Nope');
  egal(compte.avenir, 5, "cinq Voir l'avenir");
  egal(compte.tacochat, 4, 'quatre Tacochat');
  verifie(p.joueurs.every((j) => j.main.length === 8), 'huit cartes en main au départ');
  verifie(p.joueurs.every((j) => j.main.some((c) => c.type === 'desamorcage')), 'un désamorçage garanti pour chacun');
  verifie(p.joueurs.every((j) => !j.main.some((c) => c.type === 'bombe')), 'aucune bombe distribuée en main');
  p.arreter();
}
{
  const p = nouvellePartie(2, graine(9));
  egal(p.pioche.filter((c) => c.type === 'bombe').length, 1, 'un seul chaton explosif à deux joueurs');
  p.arreter();
}

// ————————————————————————————————————————— règles ciblées

// Petit atelier : on force la main d'un joueur et le sommet de la pioche.
function atelier(n = 3) {
  const p = nouvellePartie(n, graine(5));
  p.pioche = p.pioche.filter((c) => c.type !== 'bombe');
  for (const j of p.joueurs) j.main = [];
  const donner = (j, ...types) => { j.main.push(...types.map((t) => p.carte(t))); return j.main; };
  const poser = (...types) => { p.pioche.unshift(...types.map((t) => p.carte(t))); };
  return { p, donner, poser };
}

console.log('\nTours, Attaque et Passer');
{
  const { p, donner } = atelier(3);
  donner(p.joueurs[0], 'attaque');
  p.action('j0', { t: 'jouer', cartes: [p.joueurs[0].main[0].id] });
  p.resoudreFenetre();
  egal(p.courant.id, 'j1', "l'Attaque passe la main au suivant");
  egal(p.toursRestants, 2, "la victime d'une Attaque joue deux tours");
  donner(p.joueurs[1], 'passer');
  p.action('j1', { t: 'jouer', cartes: [p.joueurs[1].main[0].id] });
  p.resoudreFenetre();
  egal(p.courant.id, 'j1', "Passer n'annule qu'un seul des deux tours");
  egal(p.toursRestants, 1, 'il reste un tour à jouer');
  p.action('j1', { t: 'piocher' });
  egal(p.courant.id, 'j2', 'piocher clôt le dernier tour');
  p.arreter();
}

console.log('Chaton explosif et Désamorçage');
{
  const { p, donner, poser } = atelier(2);
  donner(p.joueurs[0], 'desamorcage');
  poser('bombe');
  p.action('j0', { t: 'piocher' });
  egal(p.attente.genre, 'explosion', 'tirer une bombe ouvre la phase explosion');
  verifie(p.attente.peutDesamorcer, 'le désamorçage disponible est repéré');
  p.action('j0', { t: 'desamorcer', position: 0 });
  egal(p.pioche[0].type, 'bombe', 'la bombe est replacée au sommet');
  egal(p.joueurs[0].main.length, 0, 'le désamorçage est consommé');
  egal(p.courant.id, 'j1', 'le tour se termine après le désamorçage');
  p.action('j1', { t: 'piocher' });
  egal(p.attente.genre, 'explosion', 'le joueur suivant tire la bombe replacée');
  verifie(!p.attente.peutDesamorcer, "l'absence de désamorçage est repérée");
  p.action('j1', { t: 'exploser' });
  verifie(!p.joueurs[1].vivant, 'sans désamorçage, le joueur est éliminé');
  egal(p.gagnant, 'j0', 'le dernier debout gagne');
  p.arreter();
}
{
  const { p, donner, poser } = atelier(3);
  donner(p.joueurs[0], 'desamorcage', 'nope', 'faveur');
  poser('bombe');
  p.action('j0', { t: 'piocher' });
  p.action('j0', { t: 'exploser' });
  verifie(!p.joueurs[0].vivant, 'on peut refuser de désamorcer');
  egal(p.defausse.filter((c) => c.type === 'nope').length, 1, "la main de l'éliminé part à la défausse");
  egal(p.courant.id, 'j1', 'la main passe au joueur suivant vivant');
  p.arreter();
}

console.log('Nope');
{
  const { p, donner } = atelier(3);
  donner(p.joueurs[0], 'attaque');
  donner(p.joueurs[1], 'nope');
  p.action('j0', { t: 'jouer', cartes: [p.joueurs[0].main[0].id] });
  p.action('j1', { t: 'nope' });
  p.resoudreFenetre();
  egal(p.courant.id, 'j0', "un Nope annule l'Attaque");
  egal(p.toursRestants, 1, 'le tour du joueur courant continue');
  p.arreter();
}
{
  const { p, donner } = atelier(3);
  donner(p.joueurs[0], 'attaque');
  donner(p.joueurs[1], 'nope');
  donner(p.joueurs[2], 'nope');
  p.action('j0', { t: 'jouer', cartes: [p.joueurs[0].main[0].id] });
  p.action('j1', { t: 'nope' });
  p.action('j2', { t: 'nope' });
  p.resoudreFenetre();
  egal(p.courant.id, 'j1', 'un Nope sur un Nope relance l\'action');
  egal(p.toursRestants, 2, "l'Attaque reprend ses effets");
  p.arreter();
}
{
  const { p, donner } = atelier(2);
  donner(p.joueurs[0], 'melanger');
  donner(p.joueurs[1], 'melanger');
  p.action('j0', { t: 'jouer', cartes: [p.joueurs[0].main[0].id] });
  verifie(!p.peutNoper(p.joueurs[1]), 'sans Nope en main, impossible de noper');
  verifie(!!p.action('j1', { t: 'nope' }), 'la tentative est refusée');
  egal(p.attente, null, "sans Nope à table, l'action est résolue sans attendre");
  p.arreter();
}
{
  const { p, donner } = atelier(3);
  donner(p.joueurs[0], 'melanger');
  donner(p.joueurs[2], 'nope');
  p.action('j0', { t: 'jouer', cartes: [p.joueurs[0].main[0].id] });
  verifie(p.attente && p.attente.genre === 'nope', 'un Nope chez un adversaire ouvre bien la fenêtre');
  verifie(p.attente.finLe > Date.now(), 'la fenêtre porte une échéance');
  p.action('j2', { t: 'laisser' });
  egal(p.attente, null, 'quand le seul opposant laisse passer, on enchaîne aussitôt');
  p.arreter();
}

console.log('Combos');
{
  const { p, donner } = atelier(3);
  donner(p.joueurs[0], 'tacochat', 'tacochat');
  donner(p.joueurs[1], 'faveur');
  const ids = p.joueurs[0].main.map((c) => c.id);
  p.action('j0', { t: 'jouer', cartes: ids, cible: 'j1' });
  p.resoudreFenetre();
  egal(p.joueurs[1].main.length, 0, 'la paire vole une carte à la cible');
  egal(p.joueurs[0].main.length, 1, 'la carte volée arrive en main');
  p.arreter();
}
{
  const { p, donner } = atelier(3);
  donner(p.joueurs[0], 'chatmelon', 'chatmelon', 'chatmelon');
  donner(p.joueurs[1], 'faveur', 'melanger');
  p.action('j0', { t: 'jouer', cartes: p.joueurs[0].main.map((c) => c.id), cible: 'j1' });
  p.resoudreFenetre();
  egal(p.attente.genre, 'demande', 'le brelan ouvre la demande nominative');
  p.action('j0', { t: 'nommer', type: 'melanger' });
  verifie(p.joueurs[0].main.some((c) => c.type === 'melanger'), 'la carte nommée est bien prise');
  egal(p.joueurs[1].main.length, 1, "la cible n'a perdu qu'une carte");
  p.arreter();
}
{
  const { p, donner } = atelier(3);
  donner(p.joueurs[0], 'chatmelon', 'chatmelon', 'chatmelon');
  donner(p.joueurs[1], 'faveur');
  p.action('j0', { t: 'jouer', cartes: p.joueurs[0].main.map((c) => c.id), cible: 'j1' });
  p.resoudreFenetre();
  p.action('j0', { t: 'nommer', type: 'avenir' });
  egal(p.joueurs[0].main.length, 0, "réclamer une carte absente ne donne rien");
  egal(p.joueurs[1].main.length, 1, 'la cible garde tout');
  p.arreter();
}
{
  const { p, donner } = atelier(2);
  donner(p.joueurs[0], 'tacochat', 'chatmelon', 'arcenchat', 'patachat', 'barbichat');
  p.defausse.push(p.carte('attaque'));
  const cible = p.defausse[0].id;
  p.action('j0', { t: 'jouer', cartes: p.joueurs[0].main.map((c) => c.id) });
  p.resoudreFenetre();
  egal(p.attente.genre, 'repeche', 'cinq cartes différentes ouvrent la défausse');
  p.action('j0', { t: 'reprendre', carte: cible });
  verifie(p.joueurs[0].main.some((c) => c.id === cible), 'la carte choisie est récupérée');
  p.arreter();
}
{
  const { p, donner } = atelier(2);
  donner(p.joueurs[0], 'tacochat', 'chatmelon');
  verifie(!!p.action('j0', { t: 'jouer', cartes: p.joueurs[0].main.map((c) => c.id), cible: 'j1' }),
    'deux chats différents ne forment pas une paire');
  egal(p.joueurs[0].main.length, 2, 'les cartes restent en main');
  p.arreter();
}
{
  const { p, donner } = atelier(2);
  donner(p.joueurs[0], 'tacochat');
  verifie(!!p.action('j0', { t: 'jouer', cartes: [p.joueurs[0].main[0].id] }), 'un chat seul ne fait rien');
  donner(p.joueurs[0], 'desamorcage');
  verifie(!!p.action('j0', { t: 'jouer', cartes: [p.joueurs[0].main[1].id] }), 'un désamorçage ne se joue pas à la main');
  p.arreter();
}

console.log('Faveur et Voir l\'avenir');
{
  const { p, donner } = atelier(3);
  donner(p.joueurs[0], 'faveur');
  donner(p.joueurs[1], 'melanger', 'attaque');
  p.action('j0', { t: 'jouer', cartes: [p.joueurs[0].main[0].id], cible: 'j1' });
  p.resoudreFenetre();
  egal(p.attente.genre, 'faveur', 'la Faveur attend le choix de la cible');
  verifie(!!p.action('j0', { t: 'donner', carte: p.joueurs[1].main[0].id }), "le demandeur ne choisit pas à la place de la cible");
  const choix = p.joueurs[1].main[1].id;
  p.action('j1', { t: 'donner', carte: choix });
  verifie(p.joueurs[0].main.some((c) => c.id === choix), 'la carte choisie change de main');
  egal(p.attente, null, 'la Faveur est close');
  p.arreter();
}
{
  const { p, donner, poser } = atelier(2);
  let vu = null;
  p.surPrive = (id, m) => { if (m.t === 'avenir') vu = m.cartes; };
  donner(p.joueurs[0], 'avenir');
  poser('attaque', 'nope', 'melanger');
  p.action('j0', { t: 'jouer', cartes: [p.joueurs[0].main[0].id] });
  p.resoudreFenetre();
  verifie(vu && vu.join() === 'attaque,nope,melanger', "Voir l'avenir montre les trois du dessus, dans l'ordre");
  egal(p.pioche.length + p.defausse.length, 40, "la pioche n'est pas entamée par Voir l'avenir");
  p.arreter();
}

console.log('Tour de table et déconnexions');
{
  const { p, donner } = atelier(3);
  donner(p.joueurs[0], 'melanger');
  verifie(!!p.action('j1', { t: 'piocher' }), 'on ne pioche pas hors de son tour');
  verifie(!!p.action('j1', { t: 'jouer', cartes: [] }), 'on ne joue pas hors de son tour');
  p.joueurs[1].connecte = false;
  p.action('j0', { t: 'piocher' });
  egal(p.courant.id, 'j1', 'un joueur déconnecté garde sa place');
  p.debloquerSi('j1');
  egal(p.courant.id, 'j2', 'le déblocage fait piocher à sa place');
  p.arreter();
}

console.log(`\n${echecs === 0 ? '✅ Tout passe.' : `❌ ${echecs} échec(s).`}`);
process.exit(echecs ? 1 : 0);
