# Chatons qui explosent

Le jeu de cartes où l'on pioche en priant. Une personne crée la partie, partage
le code (ou le lien) par WhatsApp, mail, Messenger… et tout le monde joue depuis
son téléphone.

Page web statique, sans serveur à administrer et sans compte : les navigateurs
se parlent en direct.

## Jouer

**En ligne** — activer GitHub Pages sur le dépôt, puis ouvrir
`https://<utilisateur>.github.io/<dépôt>/kittens/`.

**En local** — n'importe quel serveur statique fait l'affaire ; ouvrir le
fichier directement ne marche pas (les modules ES exigent `http://`) :

```sh
python3 -m http.server 8000   # puis http://localhost:8000/kittens/
```

L'hôte clique sur **Créer une partie** et obtient un code à cinq caractères.
Les autres ouvrent le lien — le code y est déjà — entrent leur prénom, et
c'est parti. Deux à cinq joueurs ; les arrivants suivants regardent et
jouent la partie d'après.

## Comment la partie circule

Il n'y a pas de serveur de jeu. **L'appareil de l'hôte est la table** : lui
seul tient le paquet, applique les règles et envoie à chacun sa propre vue —
personne ne reçoit la main de personne. Les autres navigateurs s'y branchent
en WebRTC (via [PeerJS](https://peerjs.com)).

Un service public de rendez-vous sert uniquement à mettre deux navigateurs en
relation ; **aucune carte n'y transite**. Pour utiliser le vôtre :

```
…/kittens/?relais=mon.serveur.example:9000
```

Le réglage est mémorisé et voyage dans le lien d'invitation.

Conséquences à connaître :

- si l'hôte ferme son onglet, la partie s'arrête ;
- si un joueur perd la connexion, il retrouve sa place et ses cartes en
  rouvrant le lien — son siège l'attend ;
- une table qu'un absent bloquerait se débloque toute seule (il pioche à sa
  place, ou son chaton explose).

## Quand ça ne marche pas

« Aucune table n'est ouverte sous ce code » a trois causes bien distinctes, et
la page les sépare plutôt que de renvoyer un message unique : la table n'existe
plus (l'hôte a fermé sa page — le code meurt avec l'onglet), la liaison directe
est bloquée (VPN ou pare-feu qui filtre le WebRTC), ou le service de rendez-vous
est injoignable. La page réessaie trois fois avant de conclure, en le disant à
l'écran, et le salon affiche un témoin qui passe à l'orange si la table de
l'hôte décroche.

## Les règles couvertes

Le jeu de base complet, à deux à cinq joueurs :

- 56 cartes, dont un chaton explosif **de moins** qu'il n'y a de joueurs, et un
  Désamorçage garanti dans chaque main de départ ;
- Attaque, Passer, Faveur, Mélanger, Voir l'avenir, Nope ;
- les trois combos : **paire** (vol au hasard), **brelan** (on nomme la carte
  exigée), **cinq cartes différentes** (on repêche dans la défausse) ;
- le Nope annule n'importe quelle action, même hors de son tour, et un Nope sur
  un Nope la relance ;
- au désamorçage, on replace le chaton où l'on veut dans la pioche — position
  au choix, personne ne voit laquelle.

Deux écarts assumés, pour que la table ne s'endorme jamais :

- l'Attaque n'est **pas cumulative** (règle de la boîte d'origine : deux tours,
  pas quatre) ;
- la fenêtre de Nope dure quelques secondes, et disparaît d'elle-même si
  personne autour de la table n'a de Nope en main.

## Architecture

```
kittens/
├── index.html            trois écrans : accueil, salon, table
├── styles.css            sombre, pensé pour le pouce d'abord
├── js/
│   ├── moteur.js         les règles. Aucune notion de réseau ni de DOM.
│   ├── reseau.js         WebRTC : hébergement, connexion, reconnexion
│   ├── main.js           protocole hôte ↔ invités, sons, réactions
│   ├── vue.js            rendu DOM ; ne décide jamais d'une règle
│   ├── cartes.js         les 13 dessins, en SVG écrit à la main
│   ├── sons.js           bruitages synthétisés, vibrations
│   └── partage.js        Web Share, WhatsApp, mail, Messenger, SMS, Telegram
└── vendor/peerjs.min.js  PeerJS 1.5.5 (MIT)
```

`moteur.js` est volontairement pur : il se teste sans navigateur, et c'est ce
qui rend la suite ci-dessous possible.

## Tests

Les règles, sans aucune dépendance :

```sh
node kittens/moteur.test.mjs
```

Mille deux cents parties simulées de deux à cinq joueurs (aucune carte perdue,
aucune partie sans fin) puis une cinquantaine de vérifications ciblées :
composition du paquet, enchaînement des tours, Attaque et Passer, désamorçage
et replacement, Nope et Nope-sur-Nope, les trois combos, Faveur, Voir l'avenir,
déconnexions.

Le parcours complet dans deux vrais navigateurs, liaison WebRTC comprise :

```sh
npm i playwright peer
node kittens/navigateur.test.mjs
```

Il crée une partie, la rejoint par le code, discute, lance, pioche, joue une
carte, fait arriver un spectateur en retard, tue brutalement un onglet et
vérifie que le joueur retrouve sa main.

## À savoir

Jeu de cartes librement inspiré du genre « piochez et priez ». Les règles ne
sont pas protégeables, mais le nom et les illustrations du jeu commercial le
sont : tout ce qui est ici — nom, dessins, textes, code — est original.
