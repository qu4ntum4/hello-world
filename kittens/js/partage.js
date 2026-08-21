// Partage de l'invitation : menu natif du téléphone quand il existe, liens
// directs sinon (WhatsApp, mail, Messenger, SMS, Telegram) et copie du lien.

export function lienPartie(code) {
  const u = new URL(location.href);
  u.hash = code;
  // Les réglages de connexion voyagent avec l'invitation : les deux camps
  // doivent passer par les mêmes services pour se trouver.
  const avant = new URLSearchParams(u.search);
  const apres = new URLSearchParams();
  for (const cle of ['relais', 'turn']) if (avant.get(cle)) apres.set(cle, avant.get(cle));
  u.search = apres.toString() ? '?' + apres.toString() : '';
  return u.toString();
}

export function texteInvitation(code, lien, pseudo) {
  const qui = pseudo ? `${pseudo} vous invite` : 'Vous êtes invité';
  return `${qui} à une partie de Chatons qui explosent 🐱💣\n\nCode de la partie : ${code}\nLien direct : ${lien}\n\nOuvrez le lien, entrez votre prénom, et c'est parti.`;
}

export const partageNatifDisponible = () => typeof navigator.share === 'function';

const mobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export async function partagerNatif(code, pseudo) {
  const lien = lienPartie(code);
  try {
    await navigator.share({ title: 'Chatons qui explosent', text: texteInvitation(code, lien, pseudo), url: lien });
    return true;
  } catch (e) {
    return false; // partage annulé
  }
}

export function urlCanal(canal, code, pseudo) {
  const lien = lienPartie(code);
  const texte = texteInvitation(code, lien, pseudo);
  const t = encodeURIComponent(texte);
  switch (canal) {
    case 'whatsapp': return `https://wa.me/?text=${t}`;
    case 'mail':     return `mailto:?subject=${encodeURIComponent('Partie de Chatons qui explosent — code ' + code)}&body=${t}`;
    case 'sms':      return mobile() && /iPhone|iPad|iPod/i.test(navigator.userAgent)
                       ? `sms:&body=${t}` : `sms:?body=${t}`;
    case 'telegram': return `https://t.me/share/url?url=${encodeURIComponent(lien)}&text=${encodeURIComponent(texte)}`;
    case 'messenger': return mobile()
      ? `fb-messenger://share/?link=${encodeURIComponent(lien)}`
      : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(lien)}`;
    default: return lien;
  }
}

export async function copierLien(code) {
  const lien = lienPartie(code);
  try { await navigator.clipboard.writeText(lien); return true; } catch {}
  try { // repli pour les contextes sans presse-papiers moderne
    const z = document.createElement('textarea');
    z.value = lien; z.setAttribute('readonly', ''); z.style.position = 'fixed'; z.style.opacity = '0';
    document.body.appendChild(z); z.select();
    const ok = document.execCommand('copy');
    z.remove();
    return ok;
  } catch { return false; }
}

export const CANAUX = [
  { id: 'whatsapp',  nom: 'WhatsApp',  emoji: '💬' },
  { id: 'messenger', nom: 'Messenger', emoji: '🟦' },
  { id: 'mail',      nom: 'E-mail',    emoji: '✉️' },
  { id: 'sms',       nom: 'SMS',       emoji: '📱' },
  { id: 'telegram',  nom: 'Telegram',  emoji: '✈️' },
];
