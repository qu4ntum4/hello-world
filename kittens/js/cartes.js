// Illustrations des cartes — tout est dessiné en SVG, aucun fichier image.
import { CATALOGUE } from './moteur.js';

export const STYLES = {
  bombe:       { fond: '#2a0f18', teinte: '#ff4757', encre: '#ffe9ec' },
  desamorcage: { fond: '#0f2a24', teinte: '#2fe0a8', encre: '#e6fff7' },
  attaque:     { fond: '#2b1533', teinte: '#c86bff', encre: '#f6e9ff' },
  passer:      { fond: '#132a3a', teinte: '#39c0f0', encre: '#e6f7ff' },
  faveur:      { fond: '#332314', teinte: '#ffab3d', encre: '#fff3e2' },
  melanger:    { fond: '#1b2440', teinte: '#7f8cff', encre: '#ecefff' },
  avenir:      { fond: '#241a3d', teinte: '#a58cff', encre: '#f0ebff' },
  nope:        { fond: '#2e1206', teinte: '#ff7a2f', encre: '#ffeede' },
  tacochat:    { fond: '#2c2410', teinte: '#f2c14e', encre: '#fff8e6' },
  chatmelon:   { fond: '#122a1a', teinte: '#5fd75f', encre: '#eaffee' },
  arcenchat:   { fond: '#1d1f3a', teinte: '#ff6fb5', encre: '#ffeaf5' },
  patachat:    { fond: '#2a2118', teinte: '#c69a6d', encre: '#fdf0e2' },
  barbichat:   { fond: '#152430', teinte: '#7ad3c8', encre: '#e8fbf8' },
};

const V = 'viewBox="0 0 120 120"';

// Une tête de chat réutilisable : c'est la base de presque toutes les cartes.
function tete({ x = 60, y = 62, r = 30, fourrure, trait, yeux = 'ronds', bouche = 'w', rotation = 0 } = {}) {
  const o = r * 0.42;
  const yy = y - r * 0.12;
  const oeil = yeux === 'fendus'
    ? `<path d="M${x - o - 6} ${yy} q6 -8 12 0 q-6 8 -12 0Z" fill="${trait}"/>
       <path d="M${x + o - 6} ${yy} q6 -8 12 0 q-6 8 -12 0Z" fill="${trait}"/>`
    : yeux === 'clos'
      ? `<path d="M${x - o - 6} ${yy} q6 7 12 0" stroke="${trait}" stroke-width="3" fill="none" stroke-linecap="round"/>
         <path d="M${x + o - 6} ${yy} q6 7 12 0" stroke="${trait}" stroke-width="3" fill="none" stroke-linecap="round"/>`
      : `<circle cx="${x - o}" cy="${yy}" r="5.4" fill="${trait}"/><circle cx="${x + o}" cy="${yy}" r="5.4" fill="${trait}"/>
         <circle cx="${x - o + 2}" cy="${yy - 2}" r="1.8" fill="#fff"/><circle cx="${x + o + 2}" cy="${yy - 2}" r="1.8" fill="#fff"/>`;
  const lb = bouche === 'w'
    ? `<path d="M${x - 9} ${y + r * 0.30} q4.5 6 9 0 q4.5 6 9 0" stroke="${trait}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    : bouche === 'o'
      ? `<ellipse cx="${x}" cy="${y + r * 0.36}" rx="6" ry="7.5" fill="${trait}"/>`
      : '';
  return `<g transform="rotate(${rotation} ${x} ${y})">
    <path d="M${x - r * 0.86} ${y - r * 0.55} L${x - r * 0.95} ${y - r * 1.5} L${x - r * 0.2} ${y - r * 0.92}Z" fill="${fourrure}"/>
    <path d="M${x + r * 0.86} ${y - r * 0.55} L${x + r * 0.95} ${y - r * 1.5} L${x + r * 0.2} ${y - r * 0.92}Z" fill="${fourrure}"/>
    <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.88}" fill="${fourrure}"/>
    ${oeil}
    <path d="M${x - 5.5} ${y + r * 0.17} L${x + 5.5} ${y + r * 0.17} L${x} ${y + r * 0.33}Z" fill="${trait}"/>
    ${lb}
    <g stroke="${trait}" stroke-width="2" stroke-linecap="round" opacity=".85">
      <path d="M${x - r * 0.72} ${y + r * 0.2} L${x - r * 1.25} ${y + r * 0.05}"/>
      <path d="M${x - r * 0.72} ${y + r * 0.36} L${x - r * 1.22} ${y + r * 0.44}"/>
      <path d="M${x + r * 0.72} ${y + r * 0.2} L${x + r * 1.25} ${y + r * 0.05}"/>
      <path d="M${x + r * 0.72} ${y + r * 0.36} L${x + r * 1.22} ${y + r * 0.44}"/>
    </g>
  </g>`;
}

const DESSINS = {
  bombe: (s) => `<svg ${V}>
    <g fill="${s.teinte}" opacity=".22">
      <path d="M60 4 L70 34 L102 24 L84 52 L116 62 L84 72 L102 100 L70 90 L60 118 L50 90 L18 100 L36 72 L4 62 L36 52 L18 24 L50 34Z"/>
    </g>
    ${tete({ r: 27, y: 66, fourrure: s.teinte, trait: '#2a0f18', yeux: 'fendus', bouche: 'o' })}
    <path d="M60 30 q4 -12 14 -14 q10 -2 8 8" stroke="#f7d488" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="83" cy="22" r="6" fill="#ffd166"/><circle cx="83" cy="22" r="3" fill="#fff"/>
  </svg>`,

  desamorcage: (s) => `<svg ${V}>
    ${tete({ r: 28, y: 68, fourrure: s.teinte, trait: '#0f2a24', yeux: 'clos', bouche: 'w' })}
    <circle cx="94" cy="24" r="7" fill="#ff4d6d"/><circle cx="94" cy="24" r="13" fill="#ff4d6d" opacity=".25"/>
    <path d="M40 44 L88 26" stroke="${s.encre}" stroke-width="2" opacity=".5" stroke-dasharray="4 5"/>
    <path d="M20 96 q40 14 80 0" stroke="${s.teinte}" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/>
  </svg>`,

  attaque: (s) => `<svg ${V}>
    <g stroke="${s.teinte}" stroke-width="3" opacity=".5" fill="none" stroke-linecap="round">
      <path d="M14 26 L26 40 M106 26 L94 40 M10 62 L24 62 M110 62 L96 62"/>
    </g>
    ${tete({ r: 22, y: 44, fourrure: s.teinte, trait: '#2b1533', yeux: 'fendus', bouche: 'o' })}
    <g fill="${s.encre}" stroke="${s.fond}" stroke-width="2.5" stroke-linejoin="round">
      <path d="M6 80 h26 a16 16 0 0 1 0 32 h-26 a4 4 0 0 1 -4 -4 v-24 a4 4 0 0 1 4 -4Z"/>
      <circle cx="34" cy="82" r="8"/>
      <path d="M114 80 h-26 a16 16 0 0 0 0 32 h26 a4 4 0 0 0 4 -4 v-24 a4 4 0 0 0 -4 -4Z"/>
      <circle cx="86" cy="82" r="8"/>
    </g>
    <path d="M60 78 l5 12 l12 2 l-9 8 l3 12 l-11 -7 l-11 7 l3 -12 l-9 -8 l12 -2Z" fill="${s.teinte}" stroke="${s.fond}" stroke-width="2"/>
  </svg>`,

  passer: (s) => `<svg ${V}>
    <g stroke="${s.teinte}" stroke-width="4" stroke-linecap="round" opacity=".45">
      <path d="M6 50 L30 50 M2 66 L26 66 M8 82 L28 82"/>
    </g>
    ${tete({ r: 25, x: 66, y: 60, fourrure: s.teinte, trait: '#132a3a', yeux: 'fendus', bouche: 'w', rotation: -8 })}
    <path d="M74 94 L108 94 M96 82 L110 94 L96 106" stroke="${s.encre}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  faveur: (s) => `<svg ${V}>
    ${tete({ r: 24, y: 46, fourrure: s.teinte, trait: '#332314', yeux: 'ronds', bouche: 'w' })}
    <g fill="${s.teinte}">
      <ellipse cx="42" cy="92" rx="15" ry="12"/><ellipse cx="78" cy="92" rx="15" ry="12"/>
      <circle cx="32" cy="80" r="5"/><circle cx="44" cy="76" r="5"/><circle cx="56" cy="80" r="5"/>
      <circle cx="64" cy="80" r="5"/><circle cx="76" cy="76" r="5"/><circle cx="88" cy="80" r="5"/>
    </g>
    <path d="M60 70 l4 8 h-8Z" fill="${s.encre}" opacity=".7"/>
  </svg>`,

  melanger: (s) => `<svg ${V}>
    <g opacity=".9">
      <rect x="16" y="34" width="40" height="56" rx="7" fill="${s.teinte}" transform="rotate(-14 36 62)"/>
      <rect x="64" y="34" width="40" height="56" rx="7" fill="${s.encre}" opacity=".75" transform="rotate(14 84 62)"/>
    </g>
    ${tete({ r: 17, y: 62, fourrure: s.fond, trait: s.encre, yeux: 'fendus', bouche: '' })}
    <path d="M26 20 q34 -14 68 0 M86 12 l10 8 l-10 8" stroke="${s.encre}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M94 104 q-34 14 -68 0 M34 112 l-10 -8 l10 -8" stroke="${s.encre}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  avenir: (s) => `<svg ${V}>
    <circle cx="60" cy="58" r="36" fill="${s.teinte}" opacity=".2"/>
    <circle cx="60" cy="58" r="36" stroke="${s.teinte}" stroke-width="3" fill="none"/>
    <g fill="${s.encre}" stroke="${s.fond}" stroke-width="2.5">
      <rect x="26" y="44" width="21" height="31" rx="4" transform="rotate(-15 36 59)"/>
      <rect x="49" y="40" width="21" height="31" rx="4"/>
      <rect x="72" y="44" width="21" height="31" rx="4" transform="rotate(15 82 59)"/>
    </g>
    <g fill="${s.fond}" opacity=".45">
      <circle cx="36" cy="58" r="3.4"/><circle cx="59" cy="55" r="3.4"/><circle cx="83" cy="58" r="3.4"/>
    </g>
    ${tete({ r: 13, y: 96, fourrure: s.teinte, trait: s.fond, yeux: 'fendus', bouche: '' })}
    <path d="M30 100 q30 12 60 0" stroke="${s.teinte}" stroke-width="3" fill="none" opacity=".5"/>
  </svg>`,

  nope: (s) => `<svg ${V}>
    ${tete({ r: 24, y: 40, fourrure: s.teinte, trait: '#2e1206', yeux: 'fendus', bouche: 'o' })}
    <rect x="14" y="66" width="92" height="34" rx="10" fill="${s.encre}"/>
    <text x="60" y="91" font-size="24" font-weight="900" text-anchor="middle" fill="${s.fond}"
          font-family="system-ui,-apple-system,sans-serif" textLength="76" lengthAdjust="spacingAndGlyphs">NOPE</text>
  </svg>`,

  tacochat: (s) => `<svg ${V}>
    <path d="M14 92 q46 -54 92 0 q-46 18 -92 0Z" fill="${s.teinte}"/>
    <path d="M24 86 q36 -38 72 0 q-36 12 -72 0Z" fill="#e2543f" opacity=".85"/>
    <g fill="#6fcf6f"><circle cx="44" cy="80" r="5"/><circle cx="60" cy="76" r="5"/><circle cx="76" cy="80" r="5"/></g>
    ${tete({ r: 20, y: 44, fourrure: '#f7e2b5', trait: '#2c2410', yeux: 'ronds', bouche: 'w' })}
  </svg>`,

  chatmelon: (s) => `<svg ${V}>
    <path d="M10 46 a50 50 0 0 0 100 0Z" fill="#f4657f"/>
    <path d="M10 46 a50 50 0 0 0 100 0" stroke="${s.teinte}" stroke-width="9" fill="none"/>
    <g fill="#3a1220"><circle cx="42" cy="66" r="4"/><circle cx="60" cy="76" r="4"/><circle cx="78" cy="66" r="4"/><circle cx="60" cy="58" r="4"/></g>
    ${tete({ r: 19, y: 30, fourrure: '#ffd9e0', trait: '#3a1220', yeux: 'ronds', bouche: 'w' })}
  </svg>`,

  arcenchat: (s) => `<svg ${V}>
    <g fill="none" stroke-width="7" stroke-linecap="round">
      <path d="M52 74 q22 26 54 30" stroke="#ff4d6d"/><path d="M52 74 q26 20 56 16" stroke="#ffa62b"/>
      <path d="M52 74 q28 12 58 2" stroke="#ffe14d"/><path d="M52 74 q28 4 56 -12" stroke="#5fd75f"/>
      <path d="M52 74 q26 -4 52 -24" stroke="#4dc3ff"/>
    </g>
    ${tete({ r: 24, x: 44, y: 52, fourrure: s.teinte, trait: '#2a0f22', yeux: 'clos', bouche: 'o' })}
  </svg>`,

  patachat: (s) => `<svg ${V}>
    <ellipse cx="60" cy="70" rx="42" ry="34" fill="${s.teinte}"/>
    <g stroke="#7a5637" stroke-width="2.5" stroke-linecap="round" opacity=".75">
      <path d="M28 52 l-8 -8 M42 42 l-4 -11 M60 38 l0 -12 M78 42 l4 -11 M92 52 l8 -8 M24 84 l-10 5 M96 84 l10 5"/>
    </g>
    <g fill="#5b3d26"><circle cx="46" cy="66" r="4.5"/><circle cx="74" cy="66" r="4.5"/></g>
    <path d="M50 82 q10 9 20 0" stroke="#5b3d26" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M40 30 L34 12 L54 24Z" fill="${s.teinte}"/><path d="M80 30 L86 12 L66 24Z" fill="${s.teinte}"/>
  </svg>`,

  barbichat: (s) => `<svg ${V}>
    ${tete({ r: 26, y: 46, fourrure: s.teinte, trait: '#152430', yeux: 'ronds', bouche: '' })}
    <path d="M34 58 q26 62 52 0 q-6 44 -26 46 q-20 -2 -26 -46Z" fill="${s.encre}"/>
    <g stroke="${s.fond}" stroke-width="2" opacity=".35" fill="none">
      <path d="M46 70 q4 22 8 34 M60 70 q0 24 0 36 M74 70 q-4 22 -8 34"/>
    </g>
  </svg>`,
};

export function illustration(type) {
  const s = STYLES[type] || STYLES.nope;
  return (DESSINS[type] || DESSINS.nope)(s);
}

export function nomCarte(type) {
  return CATALOGUE[type] ? CATALOGUE[type].nom : type;
}

export const DESCRIPTIONS = {
  bombe: 'Vous êtes éliminé, sauf si vous avez un Désamorçage.',
  desamorcage: 'Neutralise le chaton explosif : vous le replacez où vous voulez dans la pioche.',
  attaque: 'Fin de votre tour sans piocher — le joueur suivant en joue deux.',
  passer: 'Fin de votre tour sans piocher.',
  faveur: 'Un adversaire vous donne la carte de son choix.',
  melanger: 'Mélange la pioche.',
  avenir: 'Vous regardez les trois cartes du dessus, en secret.',
  nope: "Annule l'action d'un autre joueur — jouable à tout moment, même hors de votre tour.",
  tacochat: 'Sans effet seule. En paire, vous volez une carte au hasard.',
  chatmelon: 'Sans effet seule. En paire, vous volez une carte au hasard.',
  arcenchat: 'Sans effet seule. En paire, vous volez une carte au hasard.',
  patachat: 'Sans effet seule. En paire, vous volez une carte au hasard.',
  barbichat: 'Sans effet seule. En paire, vous volez une carte au hasard.',
};

// Élément DOM d'une carte.
export function elementCarte(type, { taille = 'moyenne', id = null } = {}) {
  const s = STYLES[type] || STYLES.nope;
  const el = document.createElement('div');
  el.className = `carte carte--${taille}`;
  el.style.setProperty('--fond', s.fond);
  el.style.setProperty('--teinte', s.teinte);
  el.style.setProperty('--encre', s.encre);
  if (id) el.dataset.carte = id;
  el.dataset.type = type;
  el.innerHTML = `<div class="carte-image">${illustration(type)}</div><div class="carte-nom">${nomCarte(type)}</div>`;
  return el;
}

// Le dos, pour la pioche et les mains adverses.
export function dosCarte(taille = 'moyenne') {
  const el = document.createElement('div');
  el.className = `carte carte--dos carte--${taille}`;
  el.innerHTML = `<svg ${V} aria-hidden="true">
    <rect width="120" height="120" fill="#1a1330"/>
    <g opacity=".55">${tete({ r: 24, y: 60, fourrure: '#3a2f66', trait: '#1a1330', yeux: 'fendus', bouche: '' })}</g>
  </svg>`;
  return el;
}
