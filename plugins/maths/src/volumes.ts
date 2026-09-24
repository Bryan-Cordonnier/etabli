// Volumes et contenances : cuves, bacs, trémies, réservoirs. Dimensions intérieures en mm,
// volumes en litres (1 L = 1 000 000 mm³), surfaces de tôle en m².

export type ShapeKind = "cylindre" | "bac" | "cone" | "tremie" | "sphere";

export interface ShapeInput {
  kind: ShapeKind;
  /** Cylindre : diamètre. Cône : grand diamètre. Sphère : diamètre. */
  d1: number;
  /** Cône : petit diamètre. */
  d2: number;
  /** Bac, trémie (bas) : longueur et largeur. */
  a: number;
  b: number;
  /** Trémie (haut) : longueur et largeur. */
  a2: number;
  b2: number;
  /** Hauteur, ou longueur d'un cylindre couché. */
  h: number;
  /** Cylindre couché (axe horizontal). */
  horizontal: boolean;
  /** Hauteur de liquide ; NaN : cuve pleine. */
  fill: number;
}

export interface Volume {
  /** Volume total, en litres. */
  total: number;
  /** Volume à la hauteur de remplissage, en litres (égal au total si non renseignée). */
  filled: number;
  /** Hauteur utile de remplissage (verticale), en mm. */
  depth: number;
  /** Surface des parois latérales, en m² (tôle de la virole ou des côtés). */
  wall: number;
  /** Surface du fond (et du dessus s'il est fermé), en m² chacun. */
  bottom: number;
  top: number;
}

const L = 1e6;
const M2 = 1e6;

/** Aire d'un segment de disque de rayon R pour une hauteur de liquide h (cylindre couché). */
export function segmentArea(R: number, h: number): number {
  const x = Math.min(Math.max(h, 0), 2 * R);
  return R * R * Math.acos((R - x) / R) - (R - x) * Math.sqrt(Math.max(0, 2 * R * x - x * x));
}

export function volume(s: ShapeInput): Volume | string {
  const positive = (label: string, ...values: number[]) => (values.every((v) => v > 0) ? null : `${label} doit être positif.`);
  const fillOf = (depth: number) => (Number.isFinite(s.fill) ? Math.min(Math.max(s.fill, 0), depth) : depth);
  const tooHigh = (depth: number) => (Number.isFinite(s.fill) && s.fill > depth + 1e-9 ? "La hauteur de liquide dépasse la hauteur de la cuve." : null);

  switch (s.kind) {
    case "cylindre": {
      const error = positive("Le diamètre et la hauteur", s.d1, s.h);
      if (error) return error;
      const R = s.d1 / 2;
      const depth = s.horizontal ? s.d1 : s.h;
      const high = tooHigh(depth);
      if (high) return high;
      const h = fillOf(depth);
      const full = Math.PI * R * R * s.h;
      const filled = s.horizontal ? segmentArea(R, h) * s.h : Math.PI * R * R * h;
      const disc = (Math.PI * R * R) / M2;
      return { total: full / L, filled: filled / L, depth, wall: (Math.PI * s.d1 * s.h) / M2, bottom: disc, top: disc };
    }
    case "bac": {
      const error = positive("La longueur, la largeur et la hauteur", s.a, s.b, s.h);
      if (error) return error;
      const high = tooHigh(s.h);
      if (high) return high;
      return {
        total: (s.a * s.b * s.h) / L,
        filled: (s.a * s.b * fillOf(s.h)) / L,
        depth: s.h,
        wall: (2 * (s.a + s.b) * s.h) / M2,
        bottom: (s.a * s.b) / M2,
        top: (s.a * s.b) / M2,
      };
    }
    case "cone": {
      // Tronc de cône, grande base en haut (trémie ronde) : le liquide remplit depuis le petit diamètre.
      const error = positive("Les diamètres et la hauteur", s.d1, s.h) ?? (s.d2 >= 0 ? null : "Le petit diamètre ne peut pas être négatif.");
      if (error) return error;
      if (s.d2 > s.d1) return "Le petit diamètre doit être inférieur au grand.";
      const high = tooHigh(s.h);
      if (high) return high;
      const [R, r] = [s.d1 / 2, s.d2 / 2];
      const frustum = (h: number, big: number) => (Math.PI * h * (big * big + big * r + r * r)) / 3;
      const h = fillOf(s.h);
      const radiusAt = r + ((R - r) * h) / s.h;
      const slant = Math.hypot(R - r, s.h);
      return {
        total: frustum(s.h, R) / L,
        filled: frustum(h, radiusAt) / L,
        depth: s.h,
        wall: (Math.PI * (R + r) * slant) / M2,
        bottom: (Math.PI * r * r) / M2,
        top: (Math.PI * R * R) / M2,
      };
    }
    case "tremie": {
      // Trémie rectangulaire (tronc de pyramide), grande ouverture en haut. Formule du prismatoïde :
      // V = h/6 × (S bas + S haut + 4 × S milieu), exacte pour des faces planes.
      const error = positive("Les dimensions et la hauteur", s.a, s.b, s.a2, s.b2, s.h);
      if (error) return error;
      const high = tooHigh(s.h);
      if (high) return high;
      const at = (h: number): [number, number] => [s.a + ((s.a2 - s.a) * h) / s.h, s.b + ((s.b2 - s.b) * h) / s.h];
      const part = (h: number) => {
        const [ah, bh] = at(h);
        const [am, bm] = at(h / 2);
        return (h / 6) * (s.a * s.b + ah * bh + 4 * am * bm);
      };
      // Faces latérales : trapèzes, de hauteur la vraie grandeur de l'apothème de chaque face.
      const faceA = ((s.a + s.a2) / 2) * Math.hypot(s.h, (s.b2 - s.b) / 2);
      const faceB = ((s.b + s.b2) / 2) * Math.hypot(s.h, (s.a2 - s.a) / 2);
      return {
        total: part(s.h) / L,
        filled: part(fillOf(s.h)) / L,
        depth: s.h,
        wall: (2 * (faceA + faceB)) / M2,
        bottom: (s.a * s.b) / M2,
        top: (s.a2 * s.b2) / M2,
      };
    }
    case "sphere": {
      const error = positive("Le diamètre", s.d1);
      if (error) return error;
      const R = s.d1 / 2;
      const high = tooHigh(s.d1);
      if (high) return high;
      const h = fillOf(s.d1);
      return {
        total: ((4 / 3) * Math.PI * R ** 3) / L,
        filled: ((Math.PI * h * h * (3 * R - h)) / 3) / L,
        depth: s.d1,
        wall: (4 * Math.PI * R * R) / M2,
        bottom: 0,
        top: 0,
      };
    }
  }
}

/** Barème de jaugeage : volume pour chaque hauteur de liquide, par pas réguliers. */
export function gaugeTable(s: ShapeInput, step: number): { height: number; litres: number }[] {
  const full = volume({ ...s, fill: NaN });
  if (typeof full === "string" || !(step > 0)) return [];
  const rows: { height: number; litres: number }[] = [];
  const count = Math.min(200, Math.ceil(full.depth / step));
  for (let i = 1; i <= count; i++) {
    const height = Math.min(full.depth, i * step);
    const v = volume({ ...s, fill: height });
    if (typeof v !== "string") rows.push({ height, litres: v.filled });
  }
  return rows;
}
