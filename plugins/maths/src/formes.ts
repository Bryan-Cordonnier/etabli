// Perçage sur cercle et polygone régulier (cahier des charges des plugins, section 9.1).

const DEG = Math.PI / 180;

// ——— Perçage sur cercle ———

export interface BoltCircleInput {
  count: number;
  /** Diamètre du cercle de perçage (entraxe des trous opposés). */
  diameter: number;
  /** Angle du premier trou, en degrés, depuis l'axe X (vers la droite). */
  startAngle: number;
  /** 360 : trous répartis sur tout le cercle ; moins : sur un arc, premier et dernier trou aux extrémités. */
  span: number;
  clockwise: boolean;
  /** Position du centre : cotes depuis une origine choisie (coin de la pièce, par exemple). */
  cx: number;
  cy: number;
}

export interface Hole {
  n: number;
  /** Angle du trou, en degrés, dans [0, 360). */
  angle: number;
  x: number;
  y: number;
}

export interface BoltCircle {
  holes: Hole[];
  /** Angle entre deux trous voisins. */
  step: number;
  /** Entraxe entre deux trous voisins (corde). */
  pitch: number;
  /** Longueur d'arc entre deux trous voisins, sur le cercle de perçage. */
  arcPitch: number;
}

export function boltCircle(input: BoltCircleInput): BoltCircle | string {
  const { count, diameter, startAngle, span, clockwise, cx, cy } = input;
  if (!Number.isInteger(count) || count < 2) return "Le nombre de trous doit être un entier d'au moins 2.";
  if (count > 360) return "Au plus 360 trous.";
  if (!(diameter > 0)) return "Le diamètre du cercle de perçage doit être positif.";
  if (!(span > 0) || span > 360) return "L'angle de répartition doit être compris entre 0 et 360°.";
  const full = Math.abs(span - 360) < 1e-9;
  const step = full ? 360 / count : span / (count - 1);
  const sign = clockwise ? -1 : 1;
  const r = diameter / 2;
  const holes = Array.from({ length: count }, (_, i) => {
    const angle = startAngle + sign * i * step;
    const clean = ((angle % 360) + 360) % 360;
    // Arrondi au 1/1000 de mm : pas de « −0,00 » ni de 99,999999.
    const round = (v: number) => Math.round(v * 1e6) / 1e6 || 0;
    return { n: i + 1, angle: round(clean) % 360, x: round(cx + r * Math.cos(angle * DEG)), y: round(cy + r * Math.sin(angle * DEG)) };
  });
  return { holes, step, pitch: diameter * Math.sin((step * DEG) / 2), arcPitch: r * step * DEG };
}

// ——— Polygone régulier ———

export type PolygonKey = "side" | "flats" | "corners" | "area";

export interface Polygon {
  sides: number;
  side: number;
  /** Cercle inscrit (Ø) : la cote « sur plats » d'un polygone à nombre de côtés pair. */
  flats: number;
  /** Cercle circonscrit (Ø) : la cote « sur angles ». */
  corners: number;
  /** Hauteur d'un plat au sommet opposé (polygone impair) ; égale à la cote sur plats sinon. */
  height: number;
  area: number;
  perimeter: number;
  /** Angle au centre entre deux sommets. */
  centralAngle: number;
  /** Angle intérieur entre deux côtés. */
  interiorAngle: number;
  /** Coupe d'onglet de chaque bout pour un cadre en tube, mesurée depuis la coupe d'équerre. */
  miter: number;
}

/** Polygone régulier à n côtés, à partir d'une seule dimension (côté, sur plats, sur angles ou aire). */
export function solvePolygon(sides: number, key: PolygonKey, value: number): Polygon | string {
  if (!Number.isInteger(sides) || sides < 3) return "Le nombre de côtés doit être un entier d'au moins 3.";
  if (sides > 1000) return "Au plus 1 000 côtés.";
  if (!(value > 0)) return "La dimension doit être positive.";
  const t = Math.PI / sides;
  // Côté s : rayon circonscrit R = s / (2 sin t), rayon inscrit r = s / (2 tan t), aire = n·s·r/2.
  const side =
    key === "side"
      ? value
      : key === "flats"
        ? value * Math.tan(t)
        : key === "corners"
          ? value * Math.sin(t)
          : Math.sqrt((4 * value * Math.tan(t)) / sides);
  const R = side / (2 * Math.sin(t));
  const r = side / (2 * Math.tan(t));
  return {
    sides,
    side,
    flats: 2 * r,
    corners: 2 * R,
    height: sides % 2 === 0 ? 2 * r : r + R,
    area: (sides * side * r) / 2,
    perimeter: sides * side,
    centralAngle: 360 / sides,
    interiorAngle: 180 - 360 / sides,
    miter: 180 / sides,
  };
}
