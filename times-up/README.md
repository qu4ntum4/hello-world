# Chrono Mimes

Un jeu de mime et de description pour enfants, dans une seule page statique —
pas de serveur, pas de build, pas d'assets externes hormis les polices.

Ouvrir `index.html`, ou le servir : `python3 -m http.server 8000`.

## Les deux modes

**Tous ensemble** (d'après *Time's Up! Kids*) — coopératif. Un paquet de cartes
à faire deviner **deux fois** — en parlant, puis en mimant — avant que le sablier
ne soit vide. Le sablier tourne pendant toute la partie ; il ne s'arrête qu'entre
les manches. Le meneur change toutes les 5 cartes.

**En équipes** (d'après *Time's Up!*) — 2 à 4 équipes, 3 manches sur le **même**
paquet : parler librement, puis un seul mot, puis mimer. 1 point par carte.
Quand le paquet se vide en plein tour, l'orateur **enchaîne sur la manche
suivante avec le temps qui lui reste** — c'est la règle officielle, et c'est là
que les parties se gagnent. Désactivable dans les réglages.

La passe n'est autorisée qu'à la manche 1 (règle officielle) ; une option la
débloque partout pour les plus jeunes.

## Contenu

200 cartes en cinq thèmes — animaux, objets, métiers & personnages, actions &
nature, trucs rigolos — chacune avec son illustration. On peut ajouter ses
propres cartes ; elles se mélangent aux autres et sont conservées d'une partie
à l'autre.

## Réglages

Durée du tour (30/45/60 s) ou du sablier coopératif (6 à 12 min), taille du
paquet, nombre d'équipes et leurs noms, prénoms des joueurs, sons et vibrations.
Tout est mémorisé dans le `localStorage`.

## Implémentation

Un seul fichier. Le sablier est dessiné au canvas image par image : le sable
restant suit la racine carrée du temps écoulé (dans un cône, l'aire varie comme
le carré de la hauteur), le tas du bas se remplit symétriquement, et un filet de
grains tombe entre les deux. Les sons sont synthétisés à la volée par la Web
Audio API — aucun fichier à charger. Les deux thèmes clair et sombre sont
définis par jetons CSS et suivent le réglage du système.
