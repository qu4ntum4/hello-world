"""Patrons A3 d'une maquette de Tour Eiffel de 60 cm en carton mousse 3 mm.

Toute la géométrie est calculée ici (en mm) puis imprimée à l'échelle 1:1.
Usage : python3 generate.py  ->  tour-eiffel-patrons-A3.pdf
"""
import math
import os

from reportlab.lib.pagesizes import A3
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

T = 3.0            # épaisseur du carton mousse
BAR = 3.0          # largeur des barres des croisillons (pochoir)
PAGE_W, PAGE_H = 297.0, 420.0
MARGIN = 10.0
HERE = os.path.dirname(os.path.abspath(__file__))

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("Sans", f"{FONT_DIR}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", f"{FONT_DIR}/DejaVuSans-Bold.ttf"))

BROWN = (0.42, 0.33, 0.25)
DARK = (0.20, 0.15, 0.11)


# ---------------------------------------------------------------- géométrie
class Section:
    """Tronçon de tour : 4 faces planes inclinées formant un tronc de pyramide."""

    def __init__(self, key, z0, H, wb, wt):
        self.key, self.z0, self.H, self.wb, self.wt = key, z0, H, wb, wt
        self.alpha = math.atan((wb - wt) / 2 / H)   # inclinaison des faces
        self.k = 1 / math.cos(self.alpha)          # hauteur vraie / hauteur vue
        self.d = T * self.k                        # retrait des faces B de chaque côté

    def half(self, z):
        return (self.wb + (self.wt - self.wb) * z / self.H) / 2


S1 = Section("T1", 0, 102, 227, 116)     # sol -> 1er étage
S2 = Section("T2", 105, 102, 116, 69)    # 1er -> 2e étage
S3 = Section("T3", 210, 332, 69, 12)     # 2e étage -> sommet
P1_SIDE, P2_SIDE, P3_SIDE, CAP_SIDE = 128, 76, 32, 16
Z_P3 = 499 - S3.z0                        # bas de l'anneau P3 (local T3)
Z_TOP, Z_TOTAL = 545, 600

# Tronçon 1 : piliers + grande arche + poutre du 1er étage
T1_LEG_B, T1_LEG_T, T1_BAND, T1_SPRING = 47, 26, 84, 30
# Tronçon 2 : bande basse (galerie du 1er), piliers, ouverture, poutre du 2e
T2_LOW, T2_TOP, T2_LEG_B, T2_LEG_T, T2_SPRING = 10, 88, 22, 16, 78


def t1_inner(z):
    leg = T1_LEG_B + (T1_LEG_T - T1_LEG_B) * z / T1_BAND
    return S1.half(z) - leg


def t2_inner(z):
    leg = T2_LEG_B + (T2_LEG_T - T2_LEG_B) * (z - T2_LOW) / (T2_TOP - T2_LOW)
    return S2.half(z) - leg


def arch(cx, cz, a, b, n=40):
    return [(cx + a * math.cos(math.pi * i / n), cz + b * math.sin(math.pi * i / n))
            for i in range(n + 1)]


def opening(sec):
    """Grande ouverture d'une face, en élévation (u, z)."""
    if sec is S1:
        a = t1_inner(T1_SPRING)
        pts = [(t1_inner(0) + 2, -2), (t1_inner(0), 0), (a, T1_SPRING)]
        pts += arch(0, T1_SPRING, a, T1_BAND - T1_SPRING)
        pts += [(-t1_inner(0), 0), (-t1_inner(0) - 2, -2)]
        return Polygon(pts)
    if sec is S2:
        a = t2_inner(T2_SPRING)
        pts = [(t2_inner(T2_LOW), T2_LOW), (a, T2_SPRING)]
        pts += arch(0, T2_SPRING, a, T2_TOP - T2_SPRING)
        pts += [(-t2_inner(T2_LOW), T2_LOW)]
        return Polygon(pts)
    return None


def lattice_quads(sec):
    """Cases des croisillons (quadrilatères en élévation)."""
    quads = []

    def strip_v(left, right, z0, z1, n):        # bande verticale découpée en n cases
        for i in range(n):
            za, zb = z0 + (z1 - z0) * i / n, z0 + (z1 - z0) * (i + 1) / n
            quads.append([(left(za), za), (right(za), za), (right(zb), zb), (left(zb), zb)])

    def strip_h(z0, z1, n):                      # bande horizontale pleine largeur
        for i in range(n):
            f0, f1 = i / n, (i + 1) / n
            x = lambda z, f: -sec.half(z) + 2 * sec.half(z) * f
            quads.append([(x(z0, f0), z0), (x(z0, f1), z0), (x(z1, f1), z1), (x(z1, f0), z1)])

    if sec is S1:
        strip_v(t1_inner, S1.half, 0, T1_BAND, 3)
        strip_v(lambda z: -S1.half(z), lambda z: -t1_inner(z), 0, T1_BAND, 3)
        strip_h(T1_BAND, S1.H, 12)
    elif sec is S2:
        strip_v(t2_inner, S2.half, T2_LOW, T2_TOP, 4)
        strip_v(lambda z: -S2.half(z), lambda z: -t2_inner(z), T2_LOW, T2_TOP, 4)
        strip_h(0, T2_LOW, 9)
        strip_h(T2_TOP, S2.H, 5)
    else:
        z = 0.0
        while True:
            h = 0.95 * 2 * S3.half(z)
            if 2 * S3.half(z + h) < 22:
                break
            quads.append([(-S3.half(z), z), (S3.half(z), z),
                          (S3.half(z + h), z + h), (-S3.half(z + h), z + h)])
            z += h
    return quads


def flat(geom, sec):
    """Élévation -> forme vraie (déroulée) de la face inclinée."""
    return affinity.scale(geom, 1, sec.k, origin=(0, 0))


def face_outline(sec, kind):
    i = sec.d if kind == "B" else 0
    return Polygon([(-sec.wb / 2 + i, 0), (sec.wb / 2 - i, 0),
                    (sec.wt / 2 - i, sec.H), (-sec.wt / 2 + i, sec.H)])


def lattice_holes(sec):
    """Triangles à évider dans le pochoir, en coordonnées déroulées."""
    face = flat(face_outline(sec, "A"), sec)
    out = []
    for q in lattice_quads(sec):
        q = [(u, z * sec.k) for u, z in q]
        c = (sum(p[0] for p in q) / 4, sum(p[1] for p in q) / 4)
        for j in range(4):
            tri = Polygon([q[j], q[(j + 1) % 4], c]).buffer(-BAR / 2, join_style=2)
            tri = tri.intersection(face.buffer(-BAR / 2, join_style=2))
            if not tri.is_empty and tri.area > 8 and tri.geom_type == "Polygon":
                out.append(tri)
    return out


def cale_side(sec, z_from, z_to):
    """Cale carrée qui entre dans le tronçon, avec 1 mm de jeu par côté."""
    w = min(2 * sec.half(z_from), 2 * sec.half(z_to))
    return math.floor(w - 4 * sec.d - 2)


C1 = cale_side(S1, S1.H - T, S1.H)
C2 = cale_side(S2, 0, T)
C3 = cale_side(S2, S2.H - T, S2.H)
C4 = cale_side(S3, 0, T)
P3_HOLE = round(2 * S3.half(Z_P3), 1)


# ------------------------------------------------------------------ pièces
class Piece:
    def __init__(self, name, geom, texts=(), shade=None, guides=(), dots=(), ticks=()):
        self.name, self.geom = name, geom
        self.texts = list(texts)    # (x, y, taille, texte, gras, angle)
        self.shade = shade          # zone grise à évider
        self.guides = list(guides)  # lignes pointillées à reporter
        self.dots = list(dots)      # points à piquer à l'épingle
        self.ticks = list(ticks)    # repères d'axe

    def moved(self, dx, dy, rot=0):
        def tf(g):
            if rot:
                g = affinity.rotate(g, rot, origin=(0, 0))
            return affinity.translate(g, dx, dy)

        p = Piece(self.name, tf(self.geom), shade=tf(self.shade) if self.shade else None,
                  guides=[tf(g) for g in self.guides], dots=[tf(g) for g in self.dots],
                  ticks=[tf(g) for g in self.ticks])
        for x, y, s, t, b, a in self.texts:
            q = tf(Point(x, y))
            p.texts.append((q.x, q.y, s, t, b, a + rot))
        return p


def face_piece(sec, kind, n):
    name = f"{sec.key}-{kind}{n}"
    full = flat(face_outline(sec, kind), sec)
    op = opening(sec)
    geom = full.difference(flat(op, sec)) if op is not None else full
    shade = full.intersection(flat(op, sec)) if op is not None else None
    Hf = sec.H * sec.k
    desc = "face A · pleine largeur" if kind == "A" else "face B · se colle ENTRE les faces A"
    num = {"T1": "1", "T2": "2", "T3": "3"}[sec.key]
    texts = []
    if sec is S1:
        zb = (T1_BAND + (S1.H - T1_BAND) * 0.62) * sec.k
        texts += [(0, zb, 5.5, name, True, 0),
                  (0, zb - 6.5, 2.6, f"tronçon {num} · {desc} · ↑ haut", False, 0)]
        texts += [(0, 25, 6, "À ÉVIDER", True, 0)]
    elif sec is S2:
        zb = (T2_TOP + (S2.H - T2_TOP) * 0.32) * sec.k
        texts += [(0, zb, 5.5, name, True, 0),
                  (0, T2_LOW * sec.k * 0.35, 2.4, f"tronçon {num} · {desc} · ↑ haut", False, 0),
                  (0, 50 * sec.k, 5, "À ÉVIDER", True, 0)]
    else:
        texts += [(1.8, 25, 6, name, True, 90),
                  (-6.0, 25, 2.6, f"tronçon {num} · {desc} · ↑ haut", False, 90)]
    ticks = [LineString([(0, 0), (0, 5)]), LineString([(0, Hf), (0, Hf - 5)])]
    guides = []
    if sec is S3:
        zf = Z_P3 * sec.k
        hw = (sec.half(Z_P3) - (sec.d if kind == "B" else 0))
        guides.append(LineString([(-hw, zf), (hw, zf)]))
        texts.append((0, zf + 2.5, 2.4, "P3", True, 0))
    return Piece(name, geom, texts, shade=shade, guides=guides, ticks=ticks)


def square_piece(name, side, lines, guide=None, cale=None, hole=None):
    g = box(-side / 2, 0, side / 2, side)
    if hole:
        g = g.difference(box(-hole / 2, side / 2 - hole / 2, hole / 2, side / 2 + hole / 2))
    guides, dots = [], []
    if guide:
        sq = box(-guide / 2, side / 2 - guide / 2, guide / 2, side / 2 + guide / 2)
        guides.append(sq.exterior)
        dots += [Point(p) for p in list(sq.exterior.coords)[:4]]
    if cale:
        guides.append(box(-cale / 2, side / 2 - cale / 2, cale / 2, side / 2 + cale / 2).exterior)
    texts = []
    y = side / 2 + (len(lines) - 1) * 3
    for i, (t, s, b) in enumerate(lines):
        texts.append((0, y - i * 6 if not hole else side - 4.5 - i * 4, s, t, b, 0))
    shade = box(-hole / 2, side / 2 - hole / 2, hole / 2, side / 2 + hole / 2) if hole else None
    return Piece(name, g, texts, guides=guides, dots=dots, shade=shade)


def all_pieces():
    P = {}
    for sec in (S1, S2, S3):
        for kind in "AB":
            for n in (1, 2):
                p = face_piece(sec, kind, n)
                P[p.name] = p
    P["P1"] = square_piece("P1", P1_SIDE, [("P1", 7, True), ("plateau du 1er étage", 3, False),
                                           ("- - -  place des faces T1 (dessous)", 2.6, False),
                                           ("et T2 (dessus) · ···· cales", 2.6, False)],
                           guide=S1.wt, cale=C1)
    P["P2"] = square_piece("P2", P2_SIDE, [("P2", 6, True), ("plateau du 2e étage", 2.6, False),
                                           ("- - - faces T2 / T3", 2.4, False)],
                           guide=S2.wt, cale=C3)
    P["P3"] = square_piece("P3", P3_SIDE, [("P3", 2.6, True)], hole=P3_HOLE)
    P["C1"] = square_piece("C1", C1, [("C1", 7, True), ("cale sous P1", 3, False)])
    P["C2"] = square_piece("C2", C2, [("C2", 7, True), ("cale sur P1", 3, False)])
    P["C3"] = square_piece("C3", C3, [("C3", 6, True), ("cale sous P2", 2.6, False)])
    P["C4"] = square_piece("C4", C4, [("C4", 6, True), ("cale sur P2", 2.6, False)])
    cap = square_piece("K", CAP_SIDE, [("K", 4, True)])
    cap.dots.append(Point(0, CAP_SIDE / 2))
    cap.texts = [(0, CAP_SIDE - 5, 3.2, "K", True, 0)]
    P["K"] = cap
    return P


def row(items, x0, y0, gap, align="bottom", height=None):
    """Place les pièces côte à côte (en les emboîtant) sur une ligne."""
    placed = []
    for piece, rot in items:
        g = affinity.rotate(piece.geom, rot, origin=(0, 0)) if rot else piece.geom
        minx, miny, maxx, maxy = g.bounds
        dy = y0 - miny if align == "bottom" else y0 + height - maxy
        x = x0 if not placed else placed[-1].geom.bounds[0]
        while True:
            cand = affinity.translate(g, x - minx, dy)
            if all(cand.distance(p.geom) >= gap for p in placed):
                break
            x += 0.5
        placed.append(piece.moved(x - minx, dy, rot))
    return placed


def rows_down(spec, top, gap=8, x0=MARGIN + 4):
    out, y = [], top
    for items in spec:
        h = max((affinity.rotate(p.geom, r, origin=(0, 0)) if r else p.geom).bounds[3]
                - (affinity.rotate(p.geom, r, origin=(0, 0)) if r else p.geom).bounds[1]
                for p, r in items)
        y -= h
        out += row(items, x0, y, gap)
        y -= gap
    return out


# ------------------------------------------------------------------ dessin
class Doc:
    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=A3)
        self.c.setTitle("Tour Eiffel 60 cm – patrons A3")
        self.c.setAuthor("Patrons générés par Claude")
        self.page_no = 0

    def begin(self, title, subtitle=""):
        self.page_no += 1
        c = self.c
        c.saveState()
        c.scale(mm, mm)
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Sans-Bold", 6)
        c.drawString(MARGIN, PAGE_H - MARGIN - 6, title)
        c.setFont("Sans", 3)
        if subtitle:
            c.drawString(MARGIN, PAGE_H - MARGIN - 11, subtitle)
        c.drawRightString(PAGE_W - MARGIN, MARGIN - 4, f"Tour Eiffel 60 cm · page {self.page_no}")

    def end(self):
        self.c.restoreState()
        self.c.showPage()

    def ruler(self, x, y):
        c = self.c
        c.setLineWidth(0.3)
        c.setStrokeColorRGB(0, 0, 0)
        c.line(x, y, x + 100, y)
        for i in range(11):
            c.line(x + i * 10, y, x + i * 10, y + (4 if i % 5 == 0 else 2.5))
        c.setFont("Sans", 2.6)
        c.drawString(x, y - 4, "Contrôle : ce trait doit mesurer exactement 10 cm (impression à 100 %)")

    def text(self, x, y, size, t, bold=False, angle=0, align="center", color=(0, 0, 0)):
        c = self.c
        c.saveState()
        c.setFillColorRGB(*color)
        c.translate(x, y)
        c.rotate(angle)
        c.setFont("Sans-Bold" if bold else "Sans", size)
        if align == "center":
            c.drawCentredString(0, -size * 0.35, t)
        elif align == "left":
            c.drawString(0, 0, t)
        else:
            c.drawRightString(0, 0, t)
        c.restoreState()

    def poly_path(self, g, fill=None, stroke=(0, 0, 0), width=0.35, dash=None):
        c = self.c
        polys = [g] if g.geom_type == "Polygon" else list(g.geoms)
        for poly in polys:
            p = c.beginPath()
            for ring in [poly.exterior] + list(poly.interiors):
                pts = list(ring.coords)
                p.moveTo(*pts[0])
                for q in pts[1:]:
                    p.lineTo(*q)
                p.close()
            c.setLineWidth(width)
            c.setDash(dash or [])
            if stroke:
                c.setStrokeColorRGB(*stroke)
            if fill:
                c.setFillColorRGB(*fill)
            c.drawPath(p, fill=1 if fill else 0, stroke=1 if stroke else 0, fillMode=0)
            c.setDash([])

    def line(self, g, width=0.3, dash=None, color=(0, 0, 0)):
        c = self.c
        pts = list(g.coords)
        p = c.beginPath()
        p.moveTo(*pts[0])
        for q in pts[1:]:
            p.lineTo(*q)
        c.setStrokeColorRGB(*color)
        c.setLineWidth(width)
        c.setDash(dash or [])
        c.drawPath(p, stroke=1, fill=0)
        c.setDash([])

    def piece(self, p, scale_text=1.0, minimal=False):
        if p.shade is not None and not minimal:
            self.poly_path(p.shade, fill=(0.86, 0.86, 0.86), stroke=None)
        self.poly_path(p.geom, stroke=(0, 0, 0), width=0.45 if not minimal else 0.25)
        if minimal:
            return
        for g in p.guides:
            self.line(g, 0.3, dash=[2, 1.5], color=(0.1, 0.3, 0.7))
        for d in p.dots:
            self.c.setFillColorRGB(0.1, 0.3, 0.7)
            self.c.circle(d.x, d.y, 0.8, stroke=0, fill=1)
        for t in p.ticks:
            self.line(t, 0.5, color=(0.8, 0.1, 0.1))
        for x, y, s, t, b, a in p.texts:
            self.text(x, y, s * scale_text, t, b, a)


# -------------------------------------------------------------- élévation
def elevation_parts():
    """Silhouette de la tour montée vue de face (mm, origine au sol au centre)."""
    faces = []
    for sec in (S1, S2, S3):
        full = face_outline(sec, "A")
        op = opening(sec)
        g = full.difference(op) if op is not None else full
        holes = [affinity.scale(h, 1, 1 / sec.k, origin=(0, 0)) for h in lattice_holes(sec)]
        faces.append((affinity.translate(g, 0, sec.z0),
                      [affinity.translate(h, 0, sec.z0) for h in holes]))
    plates = [box(-P1_SIDE / 2, 102, P1_SIDE / 2, 105), box(-P2_SIDE / 2, 207, P2_SIDE / 2, 210),
              box(-P3_SIDE / 2, 499, P3_SIDE / 2, 502), box(-CAP_SIDE / 2, 542, CAP_SIDE / 2, 545)]
    return faces, plates


def draw_tower(doc, ox, oy, s, labels=True):
    c = doc.c
    faces, plates = elevation_parts()
    c.saveState()
    c.translate(ox, oy)
    c.scale(s, s)
    for g, holes in faces:
        doc.poly_path(g, fill=BROWN, stroke=DARK, width=0.4 / s)
        for h in holes:
            doc.poly_path(h, fill=DARK, stroke=None)
    for pl in plates:
        doc.poly_path(pl, fill=(0.55, 0.45, 0.35), stroke=DARK, width=0.3 / s)
    c.setStrokeColorRGB(0.55, 0.4, 0.25)
    c.setLineWidth(1.6)
    c.line(0, Z_TOP, 0, Z_TOTAL)
    c.restoreState()
    if labels:
        c.setStrokeColorRGB(0.3, 0.3, 0.3)
        c.setLineWidth(0.2)
        xr = ox + 125 * s
        for z, t in [(0, "sol"), (105, "1er étage"), (210, "2e étage"), (502, "3e étage"),
                     (Z_TOP, "sommet"), (Z_TOTAL, "antenne : 60 cm")]:
            c.setDash([1, 1])
            c.line(ox - 10 * s, oy + z * s, xr, oy + z * s)
            c.setDash([])
            doc.text(xr + 2, oy + z * s - 1, 2.6, f"{t} · {z / 10:g} cm", align="left")


# ------------------------------------------------------------------ pages
def page_cover(doc, P):
    doc.begin("Maquette de la Tour Eiffel · 60 cm",
              "Patrons à l'échelle 1:1 pour carton mousse 3 mm (Clairefontaine 70 × 100 cm) · "
              "échelle de la tour ≈ 1/550")
    draw_tower(doc, 75, 42, 0.55)
    c = doc.c
    x, y = 196, 375
    blocks = [
        ("IMPRESSION", [
            "• Format A3, « Taille réelle » ou « 100 % ».",
            "• Surtout PAS « Ajuster à la page ».",
            "• Vérifier la règle de 10 cm sur chaque page.",
            "• Noir et blanc suffit.",
        ]),
        ("MATÉRIEL", [
            "• 1 plaque de carton mousse 70 × 100 cm, 3 mm",
            "• Cutter à lame NEUVE + règle métallique",
            "• Planche ou tapis de découpe",
            "• Pistolet à colle BASSE TEMPÉRATURE",
            "  (la colle chaude normale fait fondre le",
            "  polystyrène : faire un essai sur une chute)",
            "• Ruban de masquage, 1 épingle, 1 crayon",
            "• 1 pique à brochette en bois (antenne)",
            "• Peinture acrylique brune + brun foncé,",
            "  éponge, pinceau",
            "• Papier épais 200 g ou carton fin",
            "  (boîte de céréales) pour les pochoirs",
        ]),
        ("LES PIÈCES (22)", [
            "Tronçon 1 (sol → 1er) : T1-A1, A2, B1, B2",
            "Tronçon 2 (1er → 2e) : T2-A1, A2, B1, B2",
            "Tronçon 3 (2e → sommet) : T3-A1, A2, B1, B2",
            "Plateaux : P1, P2, P3 (anneau)",
            "Cales de centrage : C1, C2, C3, C4",
            "Chapeau : K   ·   + la pique (antenne)",
        ]),
        ("SIGNES SUR LES PATRONS", [
            "—— trait noir : ligne de coupe",
            "zone grise : à évider (ouverture)",
            "- - - bleu : repère à reporter au crayon",
            "• bleu : piquer à l'épingle à travers",
            "| rouge : axe central (pour le pochoir)",
        ]),
    ]
    for title, lines in blocks:
        doc.text(x, y, 3.8, title, True, align="left")
        y -= 6
        for ln in lines:
            doc.text(x, y, 2.75, ln, align="left")
            y -= 4.3
        y -= 4
    doc.text(x, y - 2, 2.75, "Pages : 1 aperçu · 2 plan de découpe", align="left")
    doc.text(x, y - 6.5, 2.75, "3 montage · 4 à 7 patrons · 8 et 9 pochoirs", align="left")
    doc.ruler(180, 22)
    doc.end()


def board_layout(P):
    g = 10
    spec = [
        [(P["T1-A1"], 0), (P["T1-A2"], 180), (P["T1-B1"], 0), (P["T1-B2"], 180)],
        [(P["T3-A1"], 0), (P["T3-A2"], 180), (P["T3-B1"], 0), (P["T3-B2"], 180),
         (P["T2-A1"], 0), (P["T2-A2"], 180), (P["T2-B1"], 0), (P["T2-B2"], 180)],
        [(P["P1"], 0), (P["C1"], 0), (P["C2"], 0), (P["P2"], 0), (P["C3"], 0), (P["C4"], 0),
         (P["P3"], 0), (P["K"], 0)],
    ]
    placed, y = [], 15
    for items in spec:
        r = row(items, 15, y, g)
        placed += r
        y = max(p.geom.bounds[3] for p in r) + g
    return placed


def page_board(doc, P):
    doc.begin("Plan de découpe sur la plaque 100 × 70 cm",
              "Disposition conseillée (vue réduite). Il reste beaucoup de place : de quoi refaire une pièce ratée.")
    placed = board_layout(P)
    s, ox, oy = 0.27, 13, 205
    c = doc.c
    c.saveState()
    c.translate(ox, oy)
    c.scale(s, s)
    doc.poly_path(box(0, 0, 1000, 700), fill=(0.97, 0.97, 0.95), stroke=(0, 0, 0), width=0.4 / s)
    for p in placed:
        assert p.geom.within(box(0, 0, 1000, 700)), p.name
        doc.poly_path(p.geom, fill=(0.85, 0.78, 0.68), stroke=(0, 0, 0), width=0.25 / s)
        cx, cy = p.geom.centroid.x, p.geom.centroid.y
        if p.shade is not None:
            sh = [q for q in placed if q is p][0].shade
            doc.poly_path(sh, fill=(0.97, 0.97, 0.95), stroke=None)
        if p.name == "K":
            continue
        lbl = p.name
        size = 14 if p.geom.area > 3000 else 9
        doc.text(cx, cy, size, lbl, True)
    c.restoreState()
    doc.text(ox + 500 * s, oy - 5, 3, "100 cm", align="center")
    doc.text(ox - 3, oy + 350 * s, 3, "70 cm", angle=90)
    used = sum(p.geom.area for p in placed) / 1e4
    doc.text(MARGIN, 192, 3.2, f"Surface utilisée ≈ {used:.0f} dm² sur 70 dm² de plaque.", align="left")

    y = 180
    tips = [
        ("DÉCOUPE (avec un adulte)", [
            "1. Découper chaque patron aux ciseaux en laissant ± 1 cm autour.",
            "2. Le scotcher sur la plaque (ruban de masquage aux coins), comme sur le plan ci-dessus.",
            "3. Couper à travers le papier : d'abord les zones grises (ouvertures), ensuite le contour.",
            "    Lame bien droite, 2 ou 3 passages légers plutôt qu'un seul fort. Règle métallique pour",
            "    les lignes droites ; pour les arches, petits coups de lame successifs.",
            "4. Avant d'enlever le papier : piquer l'épingle dans les points bleus et aux deux bouts des",
            "    traits rouges et bleus, puis relier les trous au crayon sur le carton.",
            "5. Écrire au crayon le nom de la pièce (T1-A1…) sur la face qui sera à l'intérieur.",
        ]),
        ("PEINTURE ET POCHOIRS (pièces encore à plat, avant le collage)", [
            "6. Peindre la face extérieure des 12 faces et les plateaux en brun. Couches fines :",
            "    trop d'eau fait gondoler le carton.",
            "7. Pochoirs (pages 8 et 9) : coller la feuille sur du carton fin, évider les triangles gris.",
            "8. Poser le pochoir sur la face sèche : trait rouge sur le trait rouge, bas sur le bas.",
            "    Tamponner le brun foncé avec une éponge presque sèche. Un pochoir sert pour les 4 faces",
            "    d'un tronçon. Sur les faces B, plus étroites, il dépasse un peu sur les côtés : c'est normal.",
            "9. Ne pas peindre les bords à coller (le haut et le bas des faces).",
        ]),
    ]
    for title, lines in tips:
        doc.text(MARGIN, y, 4, title, True, align="left")
        y -= 7
        for ln in lines:
            doc.text(MARGIN, y, 3.1, ln, align="left")
            y -= 5
        y -= 5
    doc.ruler(PAGE_W - MARGIN - 105, 18)
    doc.end()


def draw_corner_diagram(doc, x, y):
    """Vue du dessus d'un tronçon : les faces B entre les faces A."""
    s, t = 50, 5
    A = (0.85, 0.6, 0.35)
    B = (0.45, 0.65, 0.85)
    doc.poly_path(box(x, y + s - t, x + s, y + s), fill=A, stroke=(0, 0, 0), width=0.3)
    doc.poly_path(box(x, y, x + s, y + t), fill=A, stroke=(0, 0, 0), width=0.3)
    doc.poly_path(box(x, y + t, x + t, y + s - t), fill=B, stroke=(0, 0, 0), width=0.3)
    doc.poly_path(box(x + s - t, y + t, x + s, y + s - t), fill=B, stroke=(0, 0, 0), width=0.3)
    doc.text(x + s / 2, y + s + 3.5, 3, "face A", True)
    doc.text(x + s / 2, y - 3.5, 3, "face A", True)
    doc.text(x - 3.5, y + s / 2, 3, "face B", True, angle=90)
    doc.text(x + s + 3.5, y + s / 2, 3, "face B", True, angle=90)
    doc.text(x + s / 2, y + s / 2, 2.8, "vue du dessus")
    doc.text(x + s / 2, y - 9, 2.8, "Les faces B se collent ENTRE les A.")


def draw_exploded(doc, x0, y0, s):
    """Vue éclatée : ordre d'empilement des pièces, écartées de 12 mm."""
    faces, plates = elevation_parts()
    c = doc.c
    c.saveState()
    c.translate(x0, y0)
    c.scale(s, s)
    for (g, _), dz in zip(faces, (0, 24, 48)):
        doc.poly_path(affinity.translate(g, 0, dz), fill=(0.85, 0.78, 0.68), stroke=(0, 0, 0), width=0.3 / s)
    for pl, dz in zip(plates, (12, 36, 60, 72)):
        doc.poly_path(affinity.translate(pl, 0, dz), fill=(0.45, 0.65, 0.85), stroke=(0, 0, 0), width=0.3 / s)
    c.setStrokeColorRGB(0.55, 0.4, 0.25)
    c.setLineWidth(1.2 / s)
    c.line(0, Z_TOP + 80, 0, Z_TOTAL + 80)
    c.restoreState()
    lab = [(40, 0, S1.half(40), "T1 : 4 faces"), (104, 12, P1_SIDE / 2, "P1 (+ C1 dessous, C2 dessus)"),
           (156, 24, S2.half(51), "T2 : 4 faces"), (209, 36, P2_SIDE / 2, "P2 (+ C3 dessous, C4 dessus)"),
           (380, 48, S3.half(170), "T3 : 4 faces"), (501, 60, P3_SIDE / 2, "P3 (anneau)"),
           (544, 72, CAP_SIDE / 2, "K (chapeau)"), (600, 80, 2, "pique (antenne)")]
    for z, dz, hw, t in lab:
        doc.text(x0 - hw * s - 3, y0 + (z + dz) * s - 1, 2.8, t, align="right")


def page_assembly(doc):
    doc.begin("Montage, étape par étape",
              "Colle basse température, un petit cordon à la fois, toujours sur le côté intérieur.")
    draw_exploded(doc, 225, 28, 0.5)
    draw_corner_diagram(doc, 45, 40)
    y = 386
    steps = [
        ("A. LE PRINCIPE", [
            "Chaque tronçon est une boîte à 4 faces : 2 faces A (les plus larges) et",
            "2 faces B (un peu plus étroites) qui se glissent entre les A. Les faces",
            "penchent toutes seules quand les 4 coins sont collés.",
            "Les cales (C1 à C4) sont des carrés qui se cachent à l'intérieur : elles",
            "centrent les faces sur les plateaux et rendent la tour solide.",
        ]),
        ("B. TRONÇON 1 (on le colle à l'envers)", [
            "1. Poser P1 sur la table. Coller C1 au centre, dans le petit carré.",
            "2. Coller T1-A1 tête en bas : son bord du haut sur le trait bleu, le dos",
            "    appuyé contre la cale.",
            "3. Coller T1-A2 de la même façon, en face.",
            "4. Glisser T1-B1 puis T1-B2 entre les deux faces A, coller.",
            "5. Mettre un cordon de colle dans les 4 coins intérieurs. Retourner.",
        ]),
        ("C. TRONÇON 2 (à l'endroit)", [
            "6. Coller C2 au centre du dessus de P1 (même carré).",
            "7. Coller T2-A1, T2-A2, puis T2-B1, T2-B2 autour de C2, sur le trait.",
            "8. Coller C3 au centre du dessous de P2, puis poser P2 sur le",
            "    tronçon 2 (C3 entre dans le tronçon). Coller C4 sur le dessus de P2.",
        ]),
        ("D. TRONÇON 3 (le grand)", [
            "9.  Monter d'abord le tube couché sur la table : T3-A1 à plat,",
            "     coller T3-B1 et T3-B2 debout sur ses bords, puis T3-A2 dessus.",
            "10. Quand c'est froid, poser le tube sur P2 autour de C4 et coller.",
            "     Vérifier qu'il est bien droit, de face ET de côté.",
            "11. Enfiler l'anneau P3 par le haut jusqu'au trait « P3 », coller.",
            "     Trop serré ? Agrandir le trou au papier de verre.",
            "12. Coller le chapeau K au sommet. Le percer au centre avec la pique,",
            "     enfoncer la pique d'environ 6 cm avec un peu de colle.",
            "13. Mesurer la tour et couper la pique pour faire 60 cm en tout.",
        ]),
        ("E. FINITION", [
            "14. Retouches de peinture sur les coins et la colle visible.",
            "15. Fixer la tour sur le décor par 4 points de colle sous les pieds.",
        ]),
    ]
    for title, lines in steps:
        doc.text(MARGIN, y, 4, title, True, align="left")
        y -= 7
        for ln in lines:
            doc.text(MARGIN, y, 3.1, ln, align="left")
            y -= 4.8
        y -= 4
    doc.text(MARGIN, y - 2, 3.0, "Astuce : tenir chaque collage 20 secondes sans bouger, le temps que la colle prenne.",
             align="left")
    doc.end()


def pattern_pages(doc, P):
    top = PAGE_H - MARGIN - 20
    pages = [
        ("Patrons 1/4 · tronçon 1", [[(P["T1-A1"], 0)], [(P["T1-A2"], 0)], [(P["T1-B1"], 0)]]),
        ("Patrons 2/4 · tronçon 1, plateau 1, tronçon 2",
         [[(P["T1-B2"], 0)], [(P["P1"], 0), (P["C1"], 0)], [(P["T2-A1"], 0), (P["T2-A2"], 0)]]),
        ("Patrons 3/4 · tronçon 2, plateaux, cales",
         [[(P["T2-B1"], 0), (P["T2-B2"], 0)], [(P["C2"], 0), (P["P2"], 0), (P["C3"], 0)],
          [(P["C4"], 0), (P["P3"], 0), (P["K"], 0)]]),
        ("Patrons 4/4 · tronçon 3",
         [[(P["T3-A1"], 0), (P["T3-A2"], 180), (P["T3-B1"], 0), (P["T3-B2"], 180)]]),
    ]
    frame = box(MARGIN, MARGIN + 12, PAGE_W - MARGIN, PAGE_H - MARGIN - 14)
    for title, spec in pages:
        doc.begin(title, "Échelle 1:1 · trait noir = coupe · gris = à évider · bleu = repère à reporter")
        for p in rows_down(spec, top):
            assert p.geom.within(frame), (title, p.name, p.geom.bounds)
            doc.piece(p)
        doc.ruler(PAGE_W - MARGIN - 105, MARGIN + 5)
        doc.end()


def stencil_piece(sec):
    face = flat(face_outline(sec, "A"), sec)
    op = opening(sec)
    texts = [(0, -6, 3.2, f"POCHOIR {sec.key} · sert pour les 4 faces du tronçon", True, 0)]
    p = Piece(f"S{sec.key}", face, texts,
              guides=[face.exterior] + ([flat(op, sec).intersection(face).exterior] if op else []))
    p.holes = lattice_holes(sec)
    Hf = sec.H * sec.k
    p.ticks = [LineString([(0, -2), (0, 6)]), LineString([(0, Hf + 2), (0, Hf - 6)])]
    p.geom = box(face.bounds[0] - 8, -2, face.bounds[2] + 8, Hf + 2)
    return p


def stencil_pages(doc):
    info = ("Coller sur du carton fin, évider les triangles gris foncé. Poser sur la face peinte :"
            " trait rouge sur trait rouge, bas sur le bas.")
    for title, secs in [("Pochoirs 1/2 · tronçons 1 et 2", (S1, S2)), ("Pochoirs 2/2 · tronçon 3", (S3,))]:
        doc.begin(title, info)
        y = PAGE_H - MARGIN - 28
        for sec in secs:
            sp = stencil_piece(sec)
            h = sp.geom.bounds[3] - sp.geom.bounds[1]
            dx, dy = PAGE_W / 2, y - h + 2
            doc.poly_path(affinity.translate(sp.geom, dx, dy), stroke=(0, 0, 0), width=0.35)
            for g in sp.guides:
                doc.line(affinity.translate(g, dx, dy), 0.3, dash=[2, 1.5], color=(0.1, 0.3, 0.7))
            for hh in sp.holes:
                doc.poly_path(affinity.translate(hh, dx, dy), fill=(0.35, 0.35, 0.35), stroke=None)
            for t in sp.ticks:
                doc.line(affinity.translate(t, dx, dy), 0.6, color=(0.8, 0.1, 0.1))
            doc.text(dx, dy - 7, 3.2, f"POCHOIR {sec.key} · sert pour les 4 faces du tronçon {sec.key[1]}", True)
            y = dy - 20
        doc.ruler(PAGE_W - MARGIN - 105, MARGIN + 5)
        doc.end()


def main():
    P = all_pieces()
    out = os.path.join(HERE, "tour-eiffel-patrons-A3.pdf")
    doc = Doc(out)
    page_cover(doc, P)
    page_board(doc, P)
    page_assembly(doc)
    pattern_pages(doc, P)
    stencil_pages(doc)
    doc.c.save()
    for sec in (S1, S2, S3):
        print(f"{sec.key}: inclinaison {math.degrees(sec.alpha):.1f}°, hauteur vraie "
              f"{sec.H * sec.k:.1f} mm, faces B réduites de {sec.d:.2f} mm par côté")
    print(f"cales C1..C4 = {C1}, {C2}, {C3}, {C4} mm ; trou P3 = {P3_HOLE} mm")
    print("écrit :", out)


if __name__ == "__main__":
    main()
