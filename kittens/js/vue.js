// Rendu de l'interface. Aucune règle ici : la vue affiche ce que l'hôte
// envoie et renvoie les intentions du joueur à main.js.
import { CATALOGUE } from './moteur.js';
import { elementCarte, dosCarte, illustration, nomCarte, DESCRIPTIONS } from './cartes.js';

const $ = (s) => document.querySelector(s);
const choisies = new Set();
let dernierGenre = null;
let dernierJournal = 0;

export function ecran(nom) {
  for (const e of document.querySelectorAll('.ecran')) e.classList.toggle('actif', e.id === nom);
}

let minuteurBandeau = null;
export function bandeau(texte, duree = 2600) {
  const b = $('#bandeau');
  b.textContent = texte;
  b.classList.add('visible');
  clearTimeout(minuteurBandeau);
  minuteurBandeau = setTimeout(() => b.classList.remove('visible'), duree);
}

export function modale(html, montage) {
  const v = $('#voile'); const m = $('#modale');
  m.innerHTML = html;
  v.hidden = false;
  if (montage) montage(m);
  return m;
}
export function fermerModale() { $('#voile').hidden = true; $('#modale').innerHTML = ''; }
export const modaleOuverte = () => !$('#voile').hidden;

export function explosion() {
  const d = document.createElement('div');
  d.className = 'explosion';
  d.textContent = '💥';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 950);
}

export function poserLogo() {
  $('#logo').innerHTML = illustration('bombe');
}

// ————————————————————————————————————————————————————— salon

export function rendreSalon(etat) {
  $('#code-affiche').textContent = etat.code;
  const joueurs = etat.joueurs;
  $('#compteur-joueurs').textContent = `${joueurs.filter((j) => !j.spectateur).length}/5`;
  const ul = $('#liste-joueurs');
  ul.innerHTML = '';
  for (const j of joueurs) {
    const li = document.createElement('li');
    li.innerHTML = `<i class="pastille-etat ${j.connecte ? '' : 'absent'}"></i>
      <span>${echapper(j.pseudo)}${j.id === etat.moi ? ' <small>(vous)</small>' : ''}</span>
      <span class="role">${j.id === etat.hote ? 'hôte' : j.spectateur ? 'spectateur' : j.connecte ? 'prêt' : 'déconnecté'}</span>`;
    ul.appendChild(li);
  }
  const jouables = joueurs.filter((j) => !j.spectateur && j.connecte).length;
  const estHote = etat.moi === etat.hote;
  const btn = $('#btn-demarrer');
  btn.hidden = !estHote;
  btn.disabled = jouables < 2;
  btn.textContent = jouables < 2 ? "En attente d'un deuxième joueur…" : `Lancer la partie à ${jouables}`;
  $('#salon-note').textContent = estHote
    ? "Vous êtes l'hôte : la partie tourne sur votre appareil, ne fermez pas cet onglet pendant le jeu."
    : "L'hôte lancera la partie quand tout le monde sera là.";
}

// ————————————————————————————————————————————————————— table

export function rendreTable(etat, cb) {
  $('#table-code').textContent = etat.code;
  const moi = etat.joueurs.find((j) => j.id === etat.moi);
  const spectateur = !moi || moi.spectateur;

  // adversaires
  const zone = $('#adversaires');
  zone.innerHTML = '';
  for (const j of etat.joueurs) {
    if (j.spectateur) continue;
    const d = document.createElement('div');
    d.className = 'adversaire'
      + (j.aLaMain && j.vivant ? ' actif' : '')
      + (j.vivant ? '' : ' mort');
    d.dataset.joueur = j.id;
    d.innerHTML = `<div class="nom">${echapper(j.pseudo)}${j.id === etat.moi ? ' •' : ''}</div>
      <div class="cartes">${j.vivant ? j.nbCartes + ' carte' + (j.nbCartes > 1 ? 's' : '') : 'explosé'}</div>
      ${j.connecte ? '' : '<span class="absent-tag" title="déconnecté">📴</span>'}`;
    zone.appendChild(d);
  }

  // piles
  $('#pioche-compte').textContent = etat.pioche;
  const monTour = etat.tour === etat.moi && !etat.attente && !spectateur && moi.vivant && etat.phase === 'jeu';
  $('#pioche').classList.toggle('jouable', monTour);
  const def = $('#defausse');
  def.innerHTML = '';
  const dessus = etat.defausse[etat.defausse.length - 1];
  if (dessus) def.appendChild(elementCarte(dessus.type));
  else def.innerHTML = '<span class="pile-vide">défausse</span>';

  // annonce
  const a = etat.attente;
  const nom = (id) => { const j = etat.joueurs.find((x) => x.id === id); return j ? j.pseudo : '?'; };
  let texte = '';
  if (etat.phase === 'fin') texte = etat.gagnant ? `🏆 ${nom(etat.gagnant)} remporte la partie !` : 'Partie terminée.';
  else if (a && a.genre === 'nope') texte = `${a.description} — <span class="compte-a-rebours" data-fin="${a.finLe}"></span>`;
  else if (a && a.genre === 'faveur') texte = `${nom(a.donneur)} choisit une carte à donner à ${nom(a.receveur)}…`;
  else if (a && a.genre === 'demande') texte = `${nom(a.joueur)} réclame une carte précise à ${nom(a.cible)}…`;
  else if (a && a.genre === 'repeche') texte = `${nom(a.joueur)} fouille la défausse…`;
  else if (a && a.genre === 'explosion') texte = `💣 ${nom(a.joueur)} a tiré un chaton explosif !`;
  else if (spectateur) texte = `Tour de ${nom(etat.tour)} — vous regardez.`;
  else if (!moi.vivant) texte = `Vous avez explosé. Tour de ${nom(etat.tour)}.`;
  else if (monTour) texte = etat.toursRestants > 1 ? `À vous — ${etat.toursRestants} tours à jouer !` : 'À vous de jouer.';
  else texte = `Tour de ${nom(etat.tour)}.`;
  $('#annonce').innerHTML = texte;
  $('#table-etat').textContent = etat.phase === 'fin' ? 'Partie terminée' : `Tour de ${nom(etat.tour)}`;

  // journal
  $('#journal').innerHTML = etat.journal.slice(-3).map((l) => `<div class="${l.genre}">${echapper(l.texte)}</div>`).join('');

  // main
  const main = $('#main-cartes');
  main.innerHTML = '';
  const cartes = (moi && moi.main) || [];
  for (const id of [...choisies]) if (!cartes.some((c) => c.id === id)) choisies.delete(id);
  if (spectateur) {
    main.innerHTML = '<p class="indice">Vous suivez la partie en spectateur — vous jouerez la prochaine.</p>';
  } else {
    for (const c of cartes) {
      const el = elementCarte(c.type, { id: c.id });
      if (choisies.has(c.id)) el.classList.add('choisie');
      el.addEventListener('click', () => {
        if (choisies.has(c.id)) choisies.delete(c.id); else choisies.add(c.id);
        cb.onSelection();
      });
      main.appendChild(el);
    }
    if (!cartes.length) main.innerHTML = '<p class="indice">Votre main est vide.</p>';
  }

  rendreActions(etat, cb, { monTour, spectateur, moi });

  // modales liées à l'attente : ouvertes une seule fois, à la bascule
  const genre = a ? a.genre + ':' + (a.joueur || a.donneur || '') : (etat.phase === 'fin' ? 'fin' : null);
  if (genre !== dernierGenre) {
    dernierGenre = genre;
    if (modaleOuverte()) fermerModale();
    ouvrirModaleAttente(etat, cb);
  }
}

function rendreActions(etat, cb, { monTour, spectateur, moi }) {
  const barre = $('#actions');
  barre.innerHTML = '';
  const a = etat.attente;

  if (a && a.genre === 'nope' && a.jePeuxNoper && !a.jAiPasse) {
    barre.appendChild(bouton('NOPE !', 'bouton bouton--danger', () => cb.onNope()));
    barre.appendChild(bouton('Laisser passer', 'bouton', () => cb.onLaisser()));
    return;
  }
  if (etat.phase === 'fin') {
    if (etat.moi === etat.hote) barre.appendChild(bouton('Relancer une partie', 'bouton bouton--majeur', () => cb.onRejouer()));
    else barre.innerHTML = '<p class="indice">En attente de l\'hôte pour rejouer…</p>';
    return;
  }
  if (spectateur || !moi.vivant) { barre.innerHTML = '<p class="indice">Vous regardez.</p>'; return; }

  const sel = [...choisies];
  if (sel.length) {
    const types = sel.map((id) => moi.main.find((c) => c.id === id).type);
    const v = validerSelection(types);
    const b = bouton(v.ok ? v.libelle : v.libelle, 'bouton bouton--majeur', () => cb.onJouer(sel, types));
    b.disabled = !v.ok || !monTour;
    if (!monTour && v.ok) b.textContent = 'Attendez votre tour';
    barre.appendChild(b);
    barre.appendChild(bouton('Annuler', 'bouton', () => { choisies.clear(); cb.onSelection(); }));
    return;
  }
  if (monTour) {
    barre.appendChild(bouton(`Piocher et finir le tour`, 'bouton bouton--majeur', () => cb.onPiocher()));
  } else {
    barre.innerHTML = '<p class="indice">Touchez vos cartes pour préparer un coup.</p>';
  }
}

export function validerSelection(types) {
  const uniques = new Set(types);
  if (types.length === 1) {
    const t = types[0];
    if (!CATALOGUE[t].jouable) return { ok: false, libelle: `${nomCarte(t)} ne fait rien seule` };
    return { ok: true, libelle: `Jouer ${nomCarte(t)}`, cible: t === 'faveur' };
  }
  if (types.length === 2 && uniques.size === 1) return { ok: true, libelle: 'Paire : voler une carte au hasard', cible: true };
  if (types.length === 3 && uniques.size === 1) return { ok: true, libelle: 'Brelan : réclamer une carte précise', cible: true };
  if (types.length === 5 && uniques.size === 5) return { ok: true, libelle: 'Cinq différentes : fouiller la défausse' };
  return { ok: false, libelle: 'Combinaison invalide' };
}

export function selection() { return [...choisies]; }
export function viderSelection() { choisies.clear(); }

function bouton(texte, classe, action) {
  const b = document.createElement('button');
  b.className = classe; b.textContent = texte;
  b.addEventListener('click', action);
  return b;
}

// ————————————————————————————————————————————————————— modales de jeu

function ouvrirModaleAttente(etat, cb) {
  const a = etat.attente;
  const moi = etat.moi;
  const nom = (id) => { const j = etat.joueurs.find((x) => x.id === id); return j ? j.pseudo : '?'; };

  if (etat.phase === 'fin') {
    const jeGagne = etat.gagnant === moi;
    modale(`<h2>${jeGagne ? '🏆 Vous gagnez !' : etat.gagnant ? `🏆 ${echapper(nom(etat.gagnant))} gagne` : 'Partie terminée'}</h2>
      <p>${jeGagne ? 'Dernier chaton debout. Respect.' : 'La prochaine sera la bonne.'}</p>
      <button class="bouton" data-fermer>Voir la table</button>`);
    $('#modale').querySelector('[data-fermer]').addEventListener('click', fermerModale);
    return;
  }
  if (!a) return;

  if (a.genre === 'explosion' && a.joueur === moi) {
    if (a.peutDesamorcer) {
      modale(`<h2>💣 Chaton explosif !</h2>
        <p>Vous avez un Désamorçage. Jouez-le, puis remettez la bombe où vous voulez dans la pioche — personne ne verra où.</p>
        <div class="choix-cartes" id="apercu-desamorcage"></div>
        <button class="bouton bouton--majeur" data-desamorcer>Désamorcer</button>`, (m) => {
        m.querySelector('#apercu-desamorcage').append(elementCarte('bombe'), elementCarte('desamorcage'));
        m.querySelector('[data-desamorcer]').addEventListener('click', () => modalePosition(etat, cb));
      });
    } else {
      modale(`<h2>💣 Chaton explosif !</h2>
        <p>Aucun Désamorçage en main. C'est fini pour vous.</p>
        <div class="choix-cartes" id="apercu-boum"></div>
        <button class="bouton bouton--danger" data-exploser>Fermer les yeux…</button>`, (m) => {
        m.querySelector('#apercu-boum').appendChild(elementCarte('bombe', { taille: 'grande' }));
        m.querySelector('[data-exploser]').addEventListener('click', () => { fermerModale(); cb.onExploser(); });
      });
    }
    return;
  }

  if (a.genre === 'faveur' && a.donneur === moi) {
    const moiJ = etat.joueurs.find((j) => j.id === moi);
    modale(`<h2>Faveur</h2><p>${echapper(nom(a.receveur))} vous réclame une carte. Choisissez celle que vous lâchez.</p>
      <div class="choix-cartes" id="choix-don"></div>`, (m) => {
      const z = m.querySelector('#choix-don');
      for (const c of moiJ.main) {
        const el = elementCarte(c.type, { taille: 'petite', id: c.id });
        el.addEventListener('click', () => { fermerModale(); cb.onDonner(c.id); });
        z.appendChild(el);
      }
    });
    return;
  }

  if (a.genre === 'demande' && a.joueur === moi) {
    modale(`<h2>Réclamer une carte</h2><p>Nommez la carte que vous exigez de ${echapper(nom(a.cible))}. S'il ne l'a pas, tant pis pour vous.</p>
      <div class="grille-choix" id="choix-type"></div>`, (m) => {
      const z = m.querySelector('#choix-type');
      for (const t of Object.keys(CATALOGUE)) {
        if (t === 'bombe') continue;
        z.appendChild(bouton(nomCarte(t), 'bouton', () => { fermerModale(); cb.onNommer(t); }));
      }
    });
    return;
  }

  if (a.genre === 'repeche' && a.joueur === moi) {
    modale(`<h2>Fouiller la défausse</h2><p>Prenez la carte de votre choix.</p>
      <div class="choix-cartes" id="choix-defausse"></div>`, (m) => {
      const z = m.querySelector('#choix-defausse');
      for (const c of [...etat.defausse].reverse()) {
        const el = elementCarte(c.type, { taille: 'petite', id: c.id });
        el.addEventListener('click', () => { fermerModale(); cb.onReprendre(c.id); });
        z.appendChild(el);
      }
    });
  }
}

function modalePosition(etat, cb) {
  const n = etat.pioche;
  modale(`<h2>Où cachez-vous la bombe ?</h2>
    <p>La pioche compte ${n} carte${n > 1 ? 's' : ''}. Vous seul saurez où elle est.</p>
    <div class="grille-choix" id="positions"></div>
    <label class="champ" style="margin-top:14px">
      <span>Position exacte : <b id="pos-val">0</b> carte(s) sous le sommet</span>
      <input id="pos-curseur" type="range" min="0" max="${n}" value="0" style="width:100%">
    </label>
    <button class="bouton bouton--majeur" data-valider>Replacer ici</button>`, (m) => {
    const z = m.querySelector('#positions');
    const curseur = m.querySelector('#pos-curseur');
    const val = m.querySelector('#pos-val');
    const propositions = [
      ['Tout en haut (le suivant explose)', 0],
      ['Juste en dessous', 1],
      ['Au milieu', Math.floor(n / 2)],
      ['Tout en bas', n],
      ['Au hasard', 'hasard'],
    ];
    for (const [libelle, p] of propositions) {
      z.appendChild(bouton(libelle, 'bouton', () => { fermerModale(); cb.onDesamorcer(p); }));
    }
    curseur.addEventListener('input', () => { val.textContent = curseur.value; });
    m.querySelector('[data-valider]').addEventListener('click', () => { fermerModale(); cb.onDesamorcer(Number(curseur.value)); });
  });
}

export function modaleCible(etat, libelle, action) {
  const cibles = etat.joueurs.filter((j) => j.vivant && !j.spectateur && j.id !== etat.moi);
  modale(`<h2>${echapper(libelle)}</h2><p>Sur qui ?</p><div class="grille-choix" id="choix-cible"></div>
    <button class="bouton" data-annuler>Annuler</button>`, (m) => {
    const z = m.querySelector('#choix-cible');
    for (const j of cibles) {
      z.appendChild(bouton(`${j.pseudo} · ${j.nbCartes}`, 'bouton', () => { fermerModale(); action(j.id); }));
    }
    m.querySelector('[data-annuler]').addEventListener('click', fermerModale);
  });
}

export function modaleAvenir(types) {
  modale(`<h2>Voir l'avenir</h2><p>Les trois cartes du dessus de la pioche, de haut en bas.</p>
    <div class="choix-cartes" id="apercu-avenir"></div>
    <button class="bouton" data-fermer>Compris</button>`, (m) => {
    const z = m.querySelector('#apercu-avenir');
    if (!types.length) z.innerHTML = '<p class="indice">La pioche est vide.</p>';
    types.forEach((t, i) => {
      const el = elementCarte(t, { taille: 'petite' });
      el.insertAdjacentHTML('afterbegin', `<div style="text-align:center;font-size:10px;color:var(--doux)">${i + 1}ᵉ</div>`);
      z.appendChild(el);
    });
    m.querySelector('[data-fermer]').addEventListener('click', fermerModale);
  });
}

// ————————————————————————————————————————————————————— compte à rebours

export function tictac() {
  const el = document.querySelector('.compte-a-rebours');
  if (!el) return;
  const reste = Math.max(0, Math.ceil((Number(el.dataset.fin) - Date.now()) / 1000));
  el.textContent = reste > 0 ? `${reste} s pour dire NOPE` : 'résolution…';
}

// ————————————————————————————————————————————————————— chat

export function rendreChat(selecteur, messages) {
  const fil = document.querySelector(selecteur);
  if (!fil) return;
  const bas = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 40;
  fil.innerHTML = messages.map((m) => m.systeme
    ? `<div class="systeme">${echapper(m.texte)}</div>`
    : `<div class="msg"><b>${echapper(m.pseudo)}</b> ${echapper(m.texte)}</div>`).join('');
  if (bas) fil.scrollTop = fil.scrollHeight;
}

// ————————————————————————————————————————————————————— règles

export function rendreRegles() {
  const z = document.querySelector('.regles');
  if (z.dataset.pret) return;
  z.dataset.pret = '1';
  const fiches = ['bombe', 'desamorcage', 'attaque', 'passer', 'faveur', 'melanger', 'avenir', 'nope', 'tacochat']
    .map((t) => `<div class="fiche" data-t="${t}"><div><b>${nomCarte(t)}</b><span>${DESCRIPTIONS[t]}</span></div></div>`).join('');
  z.innerHTML = `
    <h3>Le principe</h3>
    <p>La pioche contient un chaton explosif de moins qu'il n'y a de joueurs. Piochez-en un
    et vous êtes éliminé — sauf si vous avez un Désamorçage. Le dernier survivant gagne.</p>
    <h3>Votre tour</h3>
    <ul>
      <li>Jouez autant de cartes que vous voulez, ou aucune.</li>
      <li>Puis <b>piochez une carte</b> : votre tour s'achève là.</li>
      <li>Attaque et Passer terminent le tour <b>sans</b> piocher.</li>
    </ul>
    <h3>Les combos</h3>
    <ul>
      <li><b>Deux cartes identiques</b> : vous volez une carte au hasard chez un adversaire.</li>
      <li><b>Trois cartes identiques</b> : vous nommez la carte que vous exigez ; s'il l'a, il la donne.</li>
      <li><b>Cinq cartes toutes différentes</b> : vous reprenez la carte de votre choix dans la défausse.</li>
    </ul>
    <h3>Nope</h3>
    <p>Le Nope annule l'action de n'importe qui, même hors de votre tour, tant que la fenêtre
    est ouverte. Un Nope sur un Nope relance l'action. Rien ne peut noper un chaton explosif
    ni un Désamorçage.</p>
    <h3>Les cartes</h3>
    ${fiches}
    <h3>Bon à savoir</h3>
    <ul>
      <li>La partie tourne chez l'hôte : s'il ferme son onglet, elle s'arrête.</li>
      <li>Si votre connexion saute, revenez sur le lien : vous retrouvez votre place et vos cartes.</li>
      <li>Arriver après le début, ou exploser, vous met en spectateur jusqu'à la partie suivante.</li>
    </ul>
    <p class="note" style="margin-top:20px">Jeu de cartes librement inspiré du genre « piochez et priez ».
    Illustrations et code originaux.</p>`;
  for (const f of z.querySelectorAll('.fiche')) f.prepend(elementCarte(f.dataset.t, { taille: 'petite' }));
}

export function echapper(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
