/**
 * Avatar 3D temps réel.
 *
 * Le personnage est construit entièrement par code (aucun modèle à charger) :
 * un corps en révolution, un visage expressif, deux mains flottantes, une aura.
 *
 * L'animation se compose en trois couches additives :
 *   1. la base procédurale  — respiration, flottement, clignements, regard
 *   2. l'humeur             — pose et couleurs cibles, lissées en continu
 *   3. les gestes           — clips joués par-dessus, déclenchés par l'IA
 */

import * as THREE from '../vendor/three.module.js';

const { MathUtils } = THREE;
const TAU = Math.PI * 2;

// Géométrie du corps : hauteur totale et rayon max.
const HAUTEUR = 1.85;
const BAS = -0.95;
const RAYON = 0.76;

/** Rayon du corps à une hauteur donnée — sert à coller le visage à la surface. */
function rayonA(y) {
  const t = MathUtils.clamp((y - BAS) / HAUTEUR, 0, 1);
  return RAYON * Math.pow(Math.sin(Math.PI * t), 0.55) * (0.86 + 0.28 * t);
}

/**
 * Profondeur de la surface du corps à une hauteur `y` et un écart latéral `x`.
 * Sans ça, les yeux placés loin de l'axe flottent devant le visage au lieu
 * d'y être posés.
 */
function surfaceZ(y, x = 0) {
  const r = rayonA(y);
  return Math.sqrt(Math.max(0, r * r - x * x));
}

// --------------------------------------------------------------- émotions

/**
 * Chaque émotion décrit une pose de visage et une couleur.
 * `teinteDelta` décale la teinte de base choisie par l'IA.
 */
export const EMOTIONS = {
  neutre: { sourcil: 0, inclinaison: 0, bouche: 0.15, ouverture: 0.05, paupiere: 1, teinteDelta: 0, eclat: 1, agitation: 1 },
  joie: { sourcil: 0.18, inclinaison: 0.05, bouche: 1, ouverture: 0.3, paupiere: 0.72, teinteDelta: 18, eclat: 1.35, agitation: 1.35 },
  tendresse: { sourcil: 0.1, inclinaison: 0.16, bouche: 0.7, ouverture: 0.08, paupiere: 0.64, teinteDelta: 42, eclat: 1.2, agitation: 0.75 },
  tristesse: { sourcil: -0.3, inclinaison: -0.12, bouche: -0.75, ouverture: 0.05, paupiere: 0.72, teinteDelta: -34, eclat: 0.6, agitation: 0.55 },
  colere: { sourcil: -0.55, inclinaison: 0, bouche: -0.5, ouverture: 0.18, paupiere: 0.78, teinteDelta: -105, eclat: 1.15, agitation: 1.5 },
  peur: { sourcil: 0.42, inclinaison: -0.06, bouche: -0.3, ouverture: 0.42, paupiere: 1.25, teinteDelta: -60, eclat: 0.85, agitation: 1.7 },
  surprise: { sourcil: 0.55, inclinaison: 0.02, bouche: 0.1, ouverture: 0.65, paupiere: 1.3, teinteDelta: 26, eclat: 1.3, agitation: 1.5 },
  curiosite: { sourcil: 0.3, inclinaison: 0.18, bouche: 0.3, ouverture: 0.12, paupiere: 1.08, teinteDelta: 12, eclat: 1.1, agitation: 1.15 },
  espieglerie: { sourcil: 0.22, inclinaison: 0.2, bouche: 0.85, ouverture: 0.12, paupiere: 0.66, teinteDelta: 55, eclat: 1.25, agitation: 1.3 },
  fierte: { sourcil: 0.12, inclinaison: -0.04, bouche: 0.6, ouverture: 0.08, paupiere: 0.7, teinteDelta: 30, eclat: 1.25, agitation: 0.9 },
  gene: { sourcil: 0.2, inclinaison: 0.18, bouche: 0.25, ouverture: 0.06, paupiere: 0.7, teinteDelta: 48, eclat: 1.05, agitation: 0.8 },
  ennui: { sourcil: -0.1, inclinaison: 0.1, bouche: -0.2, ouverture: 0.05, paupiere: 0.68, teinteDelta: -18, eclat: 0.7, agitation: 0.5 },
  fatigue: { sourcil: -0.08, inclinaison: 0.06, bouche: -0.12, ouverture: 0.08, paupiere: 0.42, teinteDelta: -24, eclat: 0.5, agitation: 0.35 },
  concentration: { sourcil: -0.22, inclinaison: 0.04, bouche: -0.05, ouverture: 0.04, paupiere: 0.8, teinteDelta: -6, eclat: 0.95, agitation: 0.7 },
};

export const NOMS_EMOTIONS = Object.keys(EMOTIONS);

// ----------------------------------------------------------------- gestes

/**
 * Un geste applique des décalages additifs sur la pose.
 * `t` va de 0 à 1 sur la durée du clip, `i` est l'intensité (0..1).
 */
export const GESTES = {
  saluer: {
    duree: 1.7,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      p.mainD.y += 0.55 * e * i;
      p.mainD.x += 0.16 * e * i;
      p.mainD.z += 0.1 * e * i;
      p.mainD.rot += Math.sin(t * TAU * 3) * 0.85 * e * i;
      p.teteRoll += Math.sin(t * TAU * 3) * 0.06 * e * i;
      p.bouche += 0.25 * e * i;
    },
  },
  hocher: {
    duree: 1.1,
    appliquer(p, t, i) {
      p.tetePitch += Math.sin(t * TAU * 2) * 0.3 * enveloppe(t) * i;
    },
  },
  secouer: {
    duree: 1.2,
    appliquer(p, t, i) {
      p.teteYaw += Math.sin(t * TAU * 2.5) * 0.32 * enveloppe(t) * i;
      p.sourcil -= 0.1 * enveloppe(t) * i;
    },
  },
  hausser_epaules: {
    duree: 1.4,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      p.mainG.y += 0.22 * e * i;
      p.mainD.y += 0.22 * e * i;
      p.mainG.x -= 0.1 * e * i;
      p.mainD.x += 0.1 * e * i;
      p.mainG.rot -= 0.7 * e * i;
      p.mainD.rot += 0.7 * e * i;
      p.sourcil += 0.2 * e * i;
      p.teteRoll += 0.07 * e * i;
    },
  },
  sauter: {
    duree: 1.3,
    appliquer(p, t, i) {
      const rebonds = Math.abs(Math.sin(t * Math.PI * 2.5));
      const e = enveloppe(t);
      p.racineY += rebonds * 0.42 * e * i;
      p.echelle.y += rebonds * 0.05 * e * i;
      p.echelle.x -= rebonds * 0.03 * e * i;
      p.mainG.y += rebonds * 0.3 * e * i;
      p.mainD.y += rebonds * 0.3 * e * i;
      p.bouche += 0.4 * e * i;
      p.ouverture += 0.2 * e * i;
    },
  },
  pencher: {
    duree: 1.8,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      p.teteRoll += 0.26 * e * i;
      p.sourcil += 0.18 * e * i;
      p.racineRot += 0.06 * e * i;
    },
  },
  reflechir: {
    duree: 2.6,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      p.mainD.x -= 0.34 * e * i;
      p.mainD.y += 0.32 * e * i;
      p.mainD.z += 0.16 * e * i;
      p.teteRoll += 0.12 * e * i;
      p.tetePitch -= 0.08 * e * i;
      p.sourcil -= 0.2 * e * i;
      p.regardBiais.x += 0.5 * e * i;
      p.regardBiais.y += 0.35 * e * i;
    },
  },
  rire: {
    duree: 1.9,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      const secousse = Math.sin(t * TAU * 6);
      p.racineY += Math.abs(secousse) * 0.09 * e * i;
      p.tetePitch += secousse * 0.1 * e * i;
      p.bouche += 0.7 * e * i;
      p.ouverture += (0.3 + secousse * 0.12) * e * i;
      p.paupiere -= 0.3 * e * i;
      p.mainG.y += 0.14 * e * i;
      p.mainD.y += 0.14 * e * i;
    },
  },
  soupirer: {
    duree: 2.4,
    appliquer(p, t, i) {
      const gonfle = Math.sin(t * Math.PI);
      p.echelle.x += gonfle * 0.05 * i;
      p.echelle.z += gonfle * 0.05 * i;
      p.racineY -= (t > 0.5 ? (t - 0.5) * 0.3 : 0) * i;
      p.tetePitch -= (t > 0.5 ? (t - 0.5) * 0.4 : 0) * i;
      p.ouverture += gonfle * 0.15 * i;
      p.bouche -= gonfle * 0.3 * i;
    },
  },
  applaudir: {
    duree: 1.6,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      const bat = (Math.sin(t * TAU * 5) + 1) / 2;
      p.mainG.x += (0.3 - bat * 0.22) * e * i;
      p.mainD.x -= (0.3 - bat * 0.22) * e * i;
      p.mainG.y += 0.28 * e * i;
      p.mainD.y += 0.28 * e * i;
      p.bouche += 0.5 * e * i;
    },
  },
  pointer: {
    duree: 1.5,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      p.mainD.x += 0.28 * e * i;
      p.mainD.z += 0.42 * e * i;
      p.mainD.y += 0.08 * e * i;
      p.teteYaw += 0.1 * e * i;
    },
  },
  s_etirer: {
    duree: 2.8,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      p.echelle.y += 0.12 * e * i;
      p.echelle.x -= 0.05 * e * i;
      p.racineY += 0.14 * e * i;
      p.mainG.y += 0.5 * e * i;
      p.mainD.y += 0.5 * e * i;
      p.mainG.x -= 0.12 * e * i;
      p.mainD.x += 0.12 * e * i;
      p.tetePitch += 0.16 * e * i;
      p.ouverture += 0.35 * e * i;
      p.paupiere -= 0.5 * e * i;
    },
  },
  danser: {
    duree: 3.6,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      const w = t * TAU * 3;
      p.racineX += Math.sin(w) * 0.22 * e * i;
      p.racineY += Math.abs(Math.sin(w * 2)) * 0.14 * e * i;
      p.racineRot += Math.sin(w) * 0.16 * e * i;
      p.teteRoll += Math.sin(w + 0.6) * 0.16 * e * i;
      p.mainG.y += Math.sin(w) * 0.3 * e * i;
      p.mainD.y += Math.sin(w + Math.PI) * 0.3 * e * i;
      p.bouche += 0.6 * e * i;
    },
  },
  coeur: {
    duree: 2.2,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      p.mainG.x += 0.34 * e * i;
      p.mainD.x -= 0.34 * e * i;
      p.mainG.y += 0.24 * e * i;
      p.mainD.y += 0.24 * e * i;
      p.mainG.z += 0.16 * e * i;
      p.mainD.z += 0.16 * e * i;
      p.bouche += 0.6 * e * i;
      p.paupiere -= 0.35 * e * i;
      p.pulsation += Math.sin(t * TAU * 2) * 0.5 * e * i;
    },
  },
  reculer: {
    duree: 1.2,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      p.racineZ -= 0.3 * e * i;
      p.tetePitch += 0.14 * e * i;
      p.mainG.z -= 0.2 * e * i;
      p.mainD.z -= 0.2 * e * i;
      p.sourcil += 0.35 * e * i;
      p.ouverture += 0.3 * e * i;
    },
  },
  se_blottir: {
    duree: 2.6,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      p.racineZ += 0.26 * e * i;
      p.teteRoll += 0.24 * e * i;
      p.tetePitch -= 0.08 * e * i;
      p.paupiere -= 0.5 * e * i;
      p.bouche += 0.4 * e * i;
      p.echelle.y -= 0.04 * e * i;
    },
  },
  regarder_autour: {
    duree: 3.2,
    appliquer(p, t, i) {
      const e = enveloppe(t);
      p.teteYaw += Math.sin(t * TAU) * 0.34 * e * i;
      p.regardBiais.x += Math.sin(t * TAU) * 0.9 * e * i;
      p.sourcil += 0.1 * e * i;
    },
  },
  dormir: {
    duree: 4,
    appliquer(p, t, i) {
      const e = Math.min(1, t * 4);
      p.tetePitch -= 0.24 * e * i;
      p.teteRoll += 0.2 * e * i;
      p.racineY -= 0.18 * e * i;
      p.paupiere -= 1 * e * i;
      p.echelle.y -= 0.05 * e * i;
    },
  },
};

export const NOMS_GESTES = Object.keys(GESTES);

/** Montée / plateau / descente, pour que les gestes ne « claquent » pas. */
function enveloppe(t) {
  if (t < 0.18) return t / 0.18;
  if (t > 0.78) return (1 - t) / 0.22;
  return 1;
}

function poseVide() {
  return {
    racineX: 0,
    racineY: 0,
    racineZ: 0,
    racineRot: 0,
    tetePitch: 0,
    teteYaw: 0,
    teteRoll: 0,
    echelle: { x: 0, y: 0, z: 0 },
    mainG: { x: 0, y: 0, z: 0, rot: 0 },
    mainD: { x: 0, y: 0, z: 0, rot: 0 },
    sourcil: 0,
    bouche: 0,
    ouverture: 0,
    paupiere: 0,
    regardBiais: { x: 0, y: 0 },
    pulsation: 0,
  };
}

// ------------------------------------------------------------------ avatar

export class Avatar {
  constructor(canvas) {
    this.canvas = canvas;
    this.horloge = new THREE.Clock();
    this.temps = 0;

    // état ciblé / lissé
    this.humeur = { valence: 0.1, eveil: 0.5, energie: 0.8, affection: 0.1 };
    this.emotion = 'neutre';
    this.emotionLisse = { ...EMOTIONS.neutre };
    this.apparence = { teinte: 205, accent: 320, luminosite: 0.55 };

    this.gestes = []; // clips en cours
    this.parle = false;
    this.amplitudeVoix = 0;
    this.endormi = false;

    this.pointeur = new THREE.Vector2(0, 0);
    this.regard = new THREE.Vector2(0, 0);
    this.prochainClignement = 2 + Math.random() * 3;
    this.clignement = 0;

    this._initScene();
    this._construireCreature();
    this._redimensionner();

    this._onResize = () => this._redimensionner();
    window.addEventListener('resize', this._onResize);
  }

  // ------------------------------------------------------------- scène

  _initScene() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    this.camera.position.set(0, 0.28, 6.4);
    this.camera.lookAt(0, 0.1, 0);

    this.lumiereAmbiante = new THREE.HemisphereLight(0xbcd8ff, 0x2a1c3a, 1.15);
    this.scene.add(this.lumiereAmbiante);

    this.lumiereCle = new THREE.DirectionalLight(0xffffff, 1.6);
    this.lumiereCle.position.set(2.6, 3.4, 3.2);
    this.scene.add(this.lumiereCle);

    this.lumiereContre = new THREE.PointLight(0x66ccff, 3.2, 14, 2);
    this.lumiereContre.position.set(-2.2, 1.4, -2.4);
    this.scene.add(this.lumiereContre);

    this.lumiereCoeur = new THREE.PointLight(0xffffff, 1.6, 9, 2);
    this.lumiereCoeur.position.set(0, 0.1, 2.1);
    this.scene.add(this.lumiereCoeur);
  }

  _construireCreature() {
    this.racine = new THREE.Group();
    this.scene.add(this.racine);

    // --- corps en révolution ---
    const profil = [];
    const SEG = 40;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      profil.push(new THREE.Vector2(Math.max(0.0001, rayonA(BAS + t * HAUTEUR)), BAS + t * HAUTEUR));
    }
    // LatheGeometry calcule elle-même des normales lissées sans couture :
    // les recalculer ici ferait apparaître une arête verticale sur le corps.
    const geoCorps = new THREE.LatheGeometry(profil, 72);

    this.matCorps = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.57, 0.55, 0.55),
      roughness: 0.34,
      metalness: 0.06,
      emissive: new THREE.Color().setHSL(0.57, 0.7, 0.16),
      emissiveIntensity: 1,
    });
    this.corps = new THREE.Mesh(geoCorps, this.matCorps);
    this.racine.add(this.corps);

    // --- aura : un panneau face caméra, dégradé doux (une sphère laisserait
    //     un bord net qui trahit la géométrie) ---
    this.matAura = new THREE.MeshBasicMaterial({
      map: texturePoint(0.55),
      color: new THREE.Color().setHSL(0.57, 0.8, 0.6),
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.aura = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), this.matAura);
    this.aura.position.set(0, 0.1, -0.9);
    this.aura.renderOrder = -1;
    this.racine.add(this.aura);

    // --- poussières lumineuses en orbite ---
    const NB = 90;
    const positions = new Float32Array(NB * 3);
    this.motes = [];
    for (let i = 0; i < NB; i++) {
      this.motes.push({
        rayon: 1.05 + Math.random() * 0.85,
        angle: Math.random() * TAU,
        vitesse: 0.12 + Math.random() * 0.3,
        hauteur: -0.5 + Math.random() * 1.9,
        derive: 0.15 + Math.random() * 0.5,
        phase: Math.random() * TAU,
      });
    }
    const geoMotes = new THREE.BufferGeometry();
    geoMotes.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.matMotes = new THREE.PointsMaterial({
      map: texturePoint(0.35),
      color: new THREE.Color().setHSL(0.88, 0.8, 0.72),
      size: 0.09,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.pointsMotes = new THREE.Points(geoMotes, this.matMotes);
    this.racine.add(this.pointsMotes);

    // --- visage ---
    this.tete = new THREE.Group();
    this.tete.position.set(0, 0.42, 0);
    this.racine.add(this.tete);

    const yTete = 0.42; // hauteur du groupe « tête » dans le corps
    const yYeux = 0.06; // hauteur des yeux, relative à la tête
    const ecartYeux = 0.245;
    const zYeux = surfaceZ(yTete + yYeux, ecartYeux) - 0.035;

    const matOeil = new THREE.MeshStandardMaterial({
      color: 0x120c1c,
      roughness: 0.12,
      metalness: 0.1,
      emissive: 0x000000,
    });
    const geoOeil = new THREE.SphereGeometry(0.14, 32, 24);

    this.oeilG = new THREE.Group();
    this.oeilD = new THREE.Group();
    this.oeilG.position.set(-ecartYeux, yYeux, zYeux);
    this.oeilD.position.set(ecartYeux, yYeux, zYeux);
    for (const [groupe, signe] of [
      [this.oeilG, -1],
      [this.oeilD, 1],
    ]) {
      const globe = new THREE.Mesh(geoOeil, matOeil);
      globe.scale.set(0.95, 1.25, 0.6);
      groupe.add(globe);

      const pupille = new THREE.Group();
      const reflet = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      reflet.position.set(0.032 * signe, 0.042, 0.062);
      const petitReflet = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
      );
      petitReflet.position.set(-0.036 * signe, -0.038, 0.06);
      pupille.add(reflet, petitReflet);
      groupe.add(pupille);
      groupe.userData.pupille = pupille;

      this.tete.add(groupe);
    }

    // --- sourcils ---
    this.matSourcil = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.57, 0.5, 0.28),
      roughness: 0.5,
    });
    const geoSourcil = new THREE.CapsuleGeometry(0.024, 0.17, 6, 12);
    this.sourcilG = new THREE.Mesh(geoSourcil, this.matSourcil);
    this.sourcilD = new THREE.Mesh(geoSourcil, this.matSourcil);
    this.sourcilG.rotation.z = Math.PI / 2;
    this.sourcilD.rotation.z = Math.PI / 2;
    this.hauteurSourcil = yYeux + 0.19;
    const ecartSourcil = ecartYeux * 0.92;
    const zSourcil = surfaceZ(yTete + this.hauteurSourcil, ecartSourcil) - 0.02;
    this.sourcilG.position.set(-ecartSourcil, this.hauteurSourcil, zSourcil);
    this.sourcilD.position.set(ecartSourcil, this.hauteurSourcil, zSourcil);
    this.tete.add(this.sourcilG, this.sourcilD);

    // --- bouche : une lèvre courbée + une cavité qui s'ouvre ---
    const yBouche = yYeux - 0.32;
    this.bouche = new THREE.Group();
    this.bouche.position.set(0, yBouche, surfaceZ(yTete + yBouche - 0.16) + 0.035);
    this.tete.add(this.bouche);

    this.matLevre = new THREE.MeshStandardMaterial({
      color: 0x1a1024,
      roughness: 0.35,
    });
    this.levre = new THREE.Mesh(
      new THREE.TorusGeometry(0.145, 0.024, 10, 32, Math.PI),
      this.matLevre,
    );
    this.bouche.add(this.levre);

    this.cavite = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, 24, 18),
      new THREE.MeshStandardMaterial({ color: 0x100a18, roughness: 0.6 }),
    );
    this.cavite.scale.set(1, 0.2, 0.5);
    this.cavite.position.z = -0.03;
    this.bouche.add(this.cavite);

    // --- mains flottantes ---
    this.matMain = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.57, 0.55, 0.6),
      roughness: 0.3,
      metalness: 0.05,
      emissive: new THREE.Color().setHSL(0.57, 0.7, 0.12),
    });
    const geoMain = new THREE.SphereGeometry(0.17, 24, 18);
    this.mainG = new THREE.Mesh(geoMain, this.matMain);
    this.mainD = new THREE.Mesh(geoMain, this.matMain);
    this.mainG.scale.set(1, 0.86, 0.9);
    this.mainD.scale.set(1, 0.86, 0.9);
    this.mainG.position.set(-0.78, -0.2, 0.34);
    this.mainD.position.set(0.78, -0.2, 0.34);
    this.racine.add(this.mainG, this.mainD);
    this.baseMainG = this.mainG.position.clone();
    this.baseMainD = this.mainD.position.clone();

    // --- ombre douce au sol ---
    this.ombre = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 48),
      new THREE.MeshBasicMaterial({
        map: textureOmbre(),
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        color: 0x000000,
      }),
    );
    this.ombre.rotation.x = -Math.PI / 2;
    this.ombre.position.y = -1.22;
    this.scene.add(this.ombre);
  }

  // ------------------------------------------------------------ pilotage

  /** Humeur continue (valence, éveil, énergie, affection) — vient de la mémoire. */
  definirHumeur(humeur) {
    Object.assign(this.humeur, humeur);
  }

  /** Émotion discrète — vient de l'IA. */
  definirEmotion(nom) {
    if (EMOTIONS[nom]) this.emotion = nom;
  }

  definirApparence({ teinte, accent, luminosite } = {}) {
    if (Number.isFinite(teinte)) this.apparence.teinte = ((teinte % 360) + 360) % 360;
    if (Number.isFinite(accent)) this.apparence.accent = ((accent % 360) + 360) % 360;
    if (Number.isFinite(luminosite)) this.apparence.luminosite = MathUtils.clamp(luminosite, 0.25, 0.8);
  }

  /** Joue un geste. Les gestes se cumulent, un même geste ne se superpose pas. */
  jouerGeste(nom, intensite = 0.85) {
    const clip = GESTES[nom];
    if (!clip) return false;
    this.gestes = this.gestes.filter((g) => g.nom !== nom);
    this.gestes.push({ nom, clip, t: 0, intensite: MathUtils.clamp(intensite, 0.1, 1.4) });
    if (this.gestes.length > 3) this.gestes.shift();
    return true;
  }

  definirParole(actif) {
    this.parle = actif;
    if (!actif) this.amplitudeVoix = 0;
  }

  /** Pic d'amplitude à chaque syllabe — la bouche suit la voix. */
  impulsionVoix(force = 1) {
    this.amplitudeVoix = Math.min(1.4, this.amplitudeVoix + 0.55 * force);
  }

  definirSommeil(actif) {
    this.endormi = actif;
    if (actif) this.jouerGeste('dormir', 1);
    else this.gestes = this.gestes.filter((g) => g.nom !== 'dormir');
  }

  /** Coordonnées normalisées (-1..1) du pointeur, pour le suivi du regard. */
  viser(x, y) {
    this.pointeur.set(MathUtils.clamp(x, -1, 1), MathUtils.clamp(y, -1, 1));
  }

  // -------------------------------------------------------------- boucle

  /** Une image. `dt` en secondes. */
  mettreAJour(dtBrut) {
    const dt = Math.min(dtBrut, 0.05);
    this.temps += dt;
    const T = this.temps;

    // --- émotion lissée ---
    const cible = EMOTIONS[this.emotion] || EMOTIONS.neutre;
    for (const cle of Object.keys(cible)) {
      this.emotionLisse[cle] = MathUtils.damp(this.emotionLisse[cle] ?? cible[cle], cible[cle], 4, dt);
    }
    const em = this.emotionLisse;

    const pose = poseVide();
    const energie = this.endormi ? 0.1 : MathUtils.clamp(this.humeur.energie, 0.05, 1);
    const vivacite = (0.35 + energie * 0.9) * em.agitation;

    // --- couche 1 : base procédurale ---
    const respiration = Math.sin(T * (0.85 + energie * 0.7));
    pose.echelle.x += respiration * 0.018;
    pose.echelle.z += respiration * 0.018;
    pose.echelle.y -= respiration * 0.012;
    pose.racineY += Math.sin(T * 0.62) * 0.055 * vivacite + respiration * 0.02;
    pose.racineX += Math.sin(T * 0.41 + 1.3) * 0.035 * vivacite;
    pose.racineRot += Math.sin(T * 0.33) * 0.035 * vivacite;
    pose.teteRoll += Math.sin(T * 0.47 + 0.8) * 0.04 * vivacite;
    pose.tetePitch += Math.sin(T * 0.55) * 0.025 * vivacite;
    this.mainFlotteG = Math.sin(T * 0.9 + 0.4) * 0.045 * vivacite;
    this.mainFlotteD = Math.sin(T * 0.9 + 2.1) * 0.045 * vivacite;

    // clignements
    this.prochainClignement -= dt;
    if (this.prochainClignement <= 0 && !this.endormi) {
      this.clignement = 1;
      this.prochainClignement = 1.8 + Math.random() * 4.5 * (2 - this.humeur.eveil);
    }
    if (this.clignement > 0) this.clignement = Math.max(0, this.clignement - dt * 7.5);
    const fermeture = Math.sin(this.clignement * Math.PI); // 0 → 1 → 0

    // --- couche 3 : gestes ---
    for (const g of this.gestes) {
      g.t += dt / g.clip.duree;
      const t = g.nom === 'dormir' ? Math.min(g.t, 1) : g.t;
      g.clip.appliquer(pose, MathUtils.clamp(t, 0, 1), g.intensite);
    }
    this.gestes = this.gestes.filter((g) => g.t < 1 || g.nom === 'dormir');

    // --- couche 2 : humeur / émotion sur le visage ---
    const valence = MathUtils.clamp(this.humeur.valence, -1, 1);
    const courbeBouche = MathUtils.clamp(em.bouche + valence * 0.35 + pose.bouche, -1, 1);
    let ouverture = MathUtils.clamp(em.ouverture + pose.ouverture, 0, 1);

    // parole : la bouche suit l'enveloppe vocale
    if (this.parle) {
      this.amplitudeVoix = Math.max(0, this.amplitudeVoix - dt * 3.2);
      const bavardage = 0.28 + Math.abs(Math.sin(T * 11.5)) * 0.22;
      ouverture = MathUtils.clamp(ouverture + bavardage * (0.35 + this.amplitudeVoix), 0, 1.2);
    } else {
      this.amplitudeVoix = MathUtils.damp(this.amplitudeVoix, 0, 6, dt);
    }

    // --- regard ---
    const cibleRegard = this.endormi
      ? { x: 0, y: -1 }
      : {
          x: MathUtils.clamp(this.pointeur.x * 1.1 + pose.regardBiais.x, -1, 1),
          y: MathUtils.clamp(this.pointeur.y * 0.8 + pose.regardBiais.y, -1, 1),
        };
    this.regard.x = MathUtils.damp(this.regard.x, cibleRegard.x, 6, dt);
    this.regard.y = MathUtils.damp(this.regard.y, cibleRegard.y, 6, dt);

    // --- application sur la scène ---
    // La créature n'a pas de cou : c'est tout le corps qui penche, sinon le
    // visage — collé à l'avant du corps immobile — glisserait sur le côté.
    const pitch = pose.tetePitch + this.regard.y * 0.16;
    const yaw = pose.teteYaw + this.regard.x * 0.2;
    const roll = pose.teteRoll + em.inclinaison;

    this.racine.position.set(pose.racineX, pose.racineY, pose.racineZ);
    this.racine.rotation.set(
      pitch * 0.55,
      pose.racineRot + this.regard.x * 0.12 + yaw * 0.5,
      roll * 0.75,
    );
    this.corps.scale.set(1 + pose.echelle.x, 1 + pose.echelle.y, 1 + pose.echelle.z);

    // Le reste de l'inclinaison passe dans la tête : le visage garde un léger
    // décalage sur le corps, ce qui donne du relief au mouvement.
    this.tete.rotation.set(pitch * 0.45, yaw * 0.5, roll * 0.25);

    const ouvertureOeil = MathUtils.clamp(
      (em.paupiere + pose.paupiere) * (1 - fermeture),
      0.02,
      1.4,
    );
    for (const [oeil, signe] of [
      [this.oeilG, -1],
      [this.oeilD, 1],
    ]) {
      oeil.scale.y = ouvertureOeil;
      const p = oeil.userData.pupille;
      p.position.x = this.regard.x * 0.045;
      p.position.y = this.regard.y * 0.035;
      p.position.z = 0;
      void signe;
    }

    const sourcil = em.sourcil + pose.sourcil;
    this.sourcilG.position.y = this.hauteurSourcil + sourcil * 0.07;
    this.sourcilD.position.y = this.hauteurSourcil + sourcil * 0.07;
    this.sourcilG.rotation.y = -sourcil * 0.55;
    this.sourcilD.rotation.y = sourcil * 0.55;

    // L'arc reste orienté en sourire ; c'est l'échelle Y *signée* qui courbe la
    // lèvre — positive = sourire, proche de zéro = trait neutre, négative = moue.
    const courbure = Math.sign(courbeBouche || 1) * Math.max(0.14, Math.abs(courbeBouche));
    this.levre.rotation.z = Math.PI;
    this.levre.scale.set(
      1 + Math.abs(courbeBouche) * 0.14,
      courbure * (1 + ouverture * 0.35),
      1,
    );
    this.cavite.scale.set(0.9 + ouverture * 0.5, 0.06 + ouverture * 0.85, 0.5);
    this.cavite.position.y = -ouverture * 0.045;

    this.mainG.position.set(
      this.baseMainG.x + pose.mainG.x - Math.abs(pose.echelle.x) * 0.2,
      this.baseMainG.y + pose.mainG.y + this.mainFlotteG,
      this.baseMainG.z + pose.mainG.z,
    );
    this.mainD.position.set(
      this.baseMainD.x + pose.mainD.x + Math.abs(pose.echelle.x) * 0.2,
      this.baseMainD.y + pose.mainD.y + this.mainFlotteD,
      this.baseMainD.z + pose.mainD.z,
    );
    this.mainG.rotation.z = pose.mainG.rot;
    this.mainD.rotation.z = pose.mainD.rot;

    // --- couleurs ---
    const teinteBase = (this.apparence.teinte + em.teinteDelta + valence * 12) / 360;
    const h = ((teinteBase % 1) + 1) % 1;
    const s = MathUtils.clamp(0.35 + this.humeur.eveil * 0.4 + Math.abs(valence) * 0.15, 0.2, 0.9);
    const l = MathUtils.clamp(this.apparence.luminosite * (0.55 + energie * 0.6), 0.18, 0.72);

    this.matCorps.color.setHSL(h, s, l);
    this.matCorps.emissive.setHSL(h, s, 0.1 + this.humeur.affection * 0.16);
    this.matCorps.emissiveIntensity = em.eclat * (0.7 + this.humeur.affection * 0.8);
    this.matMain.color.setHSL(h, s, Math.min(0.8, l + 0.08));
    this.matMain.emissive.setHSL(h, s, 0.08 + this.humeur.affection * 0.12);
    this.matSourcil.color.setHSL(h, Math.min(0.9, s + 0.1), Math.max(0.12, l - 0.3));

    const hAccent = (((this.apparence.accent / 360) % 1) + 1) % 1;
    this.matMotes.color.setHSL(hAccent, 0.8, 0.68);
    this.matMotes.opacity = 0.35 + this.humeur.eveil * 0.5 + pose.pulsation * 0.3;
    this.matAura.color.setHSL(h, 0.85, 0.6);
    this.matAura.opacity = 0.12 + this.humeur.affection * 0.22 + em.eclat * 0.08 + pose.pulsation * 0.12;
    this.aura.scale.setScalar(1 + Math.sin(T * 1.1) * 0.025 + pose.pulsation * 0.08);

    this.lumiereContre.color.setHSL(hAccent, 0.7, 0.6);
    this.lumiereContre.intensity = 2 + this.humeur.eveil * 2.5;
    this.lumiereCoeur.color.setHSL(h, 0.6, 0.6);
    this.lumiereCoeur.intensity = 1.2 + this.humeur.affection * 3.2 + pose.pulsation;

    // --- poussières ---
    const attr = this.pointsMotes.geometry.getAttribute('position');
    const orbite = 0.25 + this.humeur.eveil * 0.9;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.angle += dt * m.vitesse * orbite;
      const rayon = m.rayon * (1 + Math.sin(T * m.derive + m.phase) * 0.08);
      attr.setXYZ(
        i,
        Math.cos(m.angle) * rayon,
        m.hauteur + Math.sin(T * m.derive + m.phase) * 0.28,
        Math.sin(m.angle) * rayon * 0.75,
      );
    }
    attr.needsUpdate = true;

    this.ombre.material.opacity = 0.2 + energie * 0.22;
    this.ombre.scale.setScalar(1 - pose.racineY * 0.25);

    this.renderer.render(this.scene, this.camera);
  }

  demarrer() {
    const boucle = () => {
      this._raf = requestAnimationFrame(boucle);
      this.mettreAJour(this.horloge.getDelta());
    };
    this.horloge.getDelta();
    boucle();
  }

  arreter() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  detruire() {
    this.arreter();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }

  _redimensionner() {
    const parent = this.canvas.parentElement || document.body;
    const l = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    this.renderer.setSize(l, h, false);
    this.camera.aspect = l / h;
    // Sur mobile / portrait, on recule pour que le personnage tienne à l'écran.
    this.camera.position.z = l / h < 0.85 ? 8.4 : 6.4;
    this.camera.updateProjectionMatrix();
  }
}

/**
 * Tache ronde dégradée, dessinée en canvas. Sert à la fois pour l'aura et pour
 * les poussières lumineuses — sans elle, `PointsMaterial` affiche des carrés.
 * `douceur` règle la vitesse d'extinction du dégradé.
 */
function texturePoint(douceur = 0.4) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(douceur, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Petit dégradé radial dessiné en canvas — sert d'ombre portée. */
function textureOmbre() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
