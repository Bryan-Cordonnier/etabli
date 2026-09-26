// Développés de traçage (cahier des charges des plugins, section 6, plugin « Traçage »).
// Tous les développés sont calculés sur la fibre moyenne (Ø intérieur + épaisseur), sauf mention
// contraire. Dimensions en mm, angles en degrés. Chaque calcul renvoie un tableau de traçage et le
// flan développé (contour, lignes de pliage léger ou génératrices, repères), prêt pour l'écran, le
// DXF et le gabarit à l'échelle 1.

const DEG = Math.PI / 180;

export type DiameterKind = "int" | "moy" | "ext";

/** Diamètre à la fibre moyenne depuis un diamètre intérieur, moyen ou extérieur. */
export function meanDiameter(d: number, thickness: number, kind: DiameterKind): number {
  return kind === "int" ? d + thickness : kind === "ext" ? d - thickness : d;
}

export type Point = [number, number];

export interface FlatPattern {
  /** Contour fermé du flan, en mm, Y vers le haut. */
  contour: Point[];
  /** Lignes à tracer : pliage léger (« pli ») ou génératrices et repères (« trace »). */
  lines: { from: Point; to: Point; kind: "pli" | "trace" }[];
  labels: { at: Point; text: string }[];
}

/** Ligne d'un tableau de traçage : repère, angle et cotes. */
export interface TraceRow {
  n: number;
  angle: number;
  /** Abscisse sur le développé (le long de la circonférence ou de l'arc). */
  x: number;
  /** Ordonnée (hauteur de la génératrice). */
  y: number;
}

export function bounds(points: Point[]): { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

const positive = (label: string, ...values: number[]) => (values.every((v) => v > 0 && Number.isFinite(v)) ? null : `${label} doit être positif.`);

// ——— Virole ———

export interface ViroleInput {
  diameter: number;
  kind: DiameterKind;
  thickness: number;
  /** Hauteur de la virole (à l'axe si le haut est coupé en biais). */
  height: number;
  /** Angle du bout coupé en biais, depuis l'horizontale (0 : virole droite). */
  bevel: number;
  /** Longueur de tôle disponible ; 0 : pas de limite. */
  sheetLength: number;
  divisions: number;
}

export interface Virole {
  dm: number;
  developed: number;
  /** Nombre de tôles et longueur de chacune si le développé dépasse la tôle disponible. */
  pieces: number;
  pieceLength: number;
  /** Hauteur mini et maxi (bout en biais). */
  minHeight: number;
  maxHeight: number;
  /** Surface de tôle du flan (mm²). */
  area: number;
  table: TraceRow[];
  pattern: FlatPattern;
}

export function virole(input: ViroleInput): Virole | string {
  const error = positive("Le diamètre, l'épaisseur et la hauteur", input.diameter, input.height) ?? (input.thickness >= 0 ? null : "L'épaisseur ne peut pas être négative.");
  if (error) return error;
  const dm = meanDiameter(input.diameter, input.thickness, input.kind);
  if (!(dm > 0)) return "L'épaisseur doit être inférieure au diamètre.";
  if (!(input.bevel >= 0 && input.bevel < 80)) return "L'angle du biais doit être compris entre 0 et 80°.";
  const r = dm / 2;
  const rise = r * Math.tan(input.bevel * DEG);
  if (input.height - rise <= 0) return "Le biais est trop fort pour cette hauteur : la génératrice la plus courte serait nulle.";
  const developed = Math.PI * dm;
  const pieces = input.sheetLength > 0 ? Math.max(1, Math.ceil(developed / input.sheetLength - 1e-9)) : 1;
  const n = Math.max(4, Math.round(input.divisions));
  // Soudure sur la génératrice la plus courte : la hauteur y croît de h − r·tan α à h + r·tan α.
  const heightAt = (phi: number) => input.height - rise * Math.cos(phi);
  const table = Array.from({ length: n + 1 }, (_, k) => {
    const phi = (2 * Math.PI * k) / n;
    return { n: k + 1, angle: (360 * k) / n, x: r * phi, y: heightAt(phi) };
  });
  const steps = 96;
  const top = Array.from({ length: steps + 1 }, (_, i) => {
    const phi = (2 * Math.PI * (steps - i)) / steps;
    return [r * phi, heightAt(phi)] as Point;
  });
  const contour: Point[] = [[0, 0], [developed, 0], ...top];
  const lines: FlatPattern["lines"] = table.slice(1, -1).map((row) => ({ from: [row.x, 0], to: [row.x, row.y], kind: "trace" }));
  // Raccords entre tôles : lignes de coupe supplémentaires.
  for (let p = 1; p < pieces; p++) {
    const x = (developed * p) / pieces;
    lines.push({ from: [x, 0], to: [x, heightAt(x / r)], kind: "pli" });
  }
  return {
    dm,
    developed,
    pieces,
    pieceLength: developed / pieces,
    minHeight: input.height - rise,
    maxHeight: input.height + rise,
    area: developed * input.height,
    table,
    pattern: { contour, lines, labels: table.slice(0, -1).map((row) => ({ at: [row.x, row.y + 6], text: String(row.n) })) },
  };
}

// ——— Tronçon de cône droit ———

export interface ConeInput {
  /** Grand et petit diamètre (petit = 0 : cône complet). */
  big: number;
  small: number;
  kind: DiameterKind;
  thickness: number;
  /** Une seule des trois : hauteur, génératrice ou demi-angle au sommet. */
  height: number;
  slant: number;
  halfAngle: number;
  sectors: number;
  divisions: number;
}

export interface Cone {
  R: number;
  r: number;
  height: number;
  slant: number;
  halfAngle: number;
  /** Rayons de traçage du développé (grand et petit arc). */
  rho: number;
  rhoSmall: number;
  /** Angle total du développé et angle d'un secteur. */
  theta: number;
  sectorAngle: number;
  /** Corde et flèche du grand arc d'un secteur (traçage sans compas géant). */
  chord: number;
  sagitta: number;
  chordSmall: number;
  area: number;
  pattern: FlatPattern;
}

export function cone(input: ConeInput): Cone | string {
  const error = positive("Le grand diamètre", input.big) ?? (input.small >= 0 ? null : "Le petit diamètre ne peut pas être négatif.");
  if (error) return error;
  const R = meanDiameter(input.big, input.thickness, input.kind) / 2;
  const r = input.small > 0 ? meanDiameter(input.small, input.thickness, input.kind) / 2 : 0;
  if (!(R > r)) return "Le grand diamètre doit être plus grand que le petit (sinon c'est une virole).";
  let height: number;
  if (input.height > 0) height = input.height;
  else if (input.slant > 0) {
    if (input.slant <= R - r) return "La génératrice doit être plus longue que la différence des rayons.";
    height = Math.sqrt(input.slant ** 2 - (R - r) ** 2);
  } else if (input.halfAngle > 0 && input.halfAngle < 90) height = (R - r) / Math.tan(input.halfAngle * DEG);
  else return "Renseignez la hauteur, la génératrice ou le demi-angle au sommet.";

  const slant = Math.hypot(R - r, height);
  const sin = (R - r) / slant;
  const rho = R / sin;
  const rhoSmall = r / sin;
  const theta = 360 * sin;
  const sectors = Math.max(1, Math.round(input.sectors));
  const sectorAngle = theta / sectors;
  if (sectorAngle >= 360) return "Angle de développé impossible.";
  const half = (sectorAngle / 2) * DEG;

  // Un secteur, sommet en (0, 0), ouvert vers le haut.
  const steps = 96;
  const arc = (radius: number, reverse: boolean) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const a = -half + (2 * half * (reverse ? steps - i : i)) / steps;
      return [radius * Math.sin(a), radius * Math.cos(a)] as Point;
    });
  const contour: Point[] = rhoSmall > 0 ? [...arc(rho, false), ...arc(rhoSmall, true)] : [...arc(rho, false), [0, 0]];
  const n = Math.max(4, Math.round(input.divisions / sectors));
  const lines: FlatPattern["lines"] = Array.from({ length: n - 1 }, (_, i) => {
    const a = -half + (2 * half * (i + 1)) / n;
    return { from: [rhoSmall * Math.sin(a), rhoSmall * Math.cos(a)] as Point, to: [rho * Math.sin(a), rho * Math.cos(a)] as Point, kind: "pli" as const };
  });
  return {
    R,
    r,
    height,
    slant,
    halfAngle: Math.atan(sin / Math.sqrt(1 - sin * sin)) / DEG,
    rho,
    rhoSmall,
    theta,
    sectorAngle,
    chord: 2 * rho * Math.sin(half),
    sagitta: rho * (1 - Math.cos(half)),
    chordSmall: 2 * rhoSmall * Math.sin(half),
    area: Math.PI * (R + r) * slant,
    pattern: { contour, lines, labels: [{ at: [0, (rho + rhoSmall) / 2], text: `secteur 1/${sectors}` }] },
  };
}

// ——— Piquage cylindre sur cylindre ———

export interface PiquageInput {
  /** Tube principal : diamètre extérieur. */
  mainDiameter: number;
  /** Piquage : diamètre et épaisseur. */
  diameter: number;
  kind: DiameterKind;
  thickness: number;
  /** Angle entre les axes (90 : piquage droit). */
  angle: number;
  /** Décalage de l'axe du piquage par rapport à l'axe du tube principal. */
  offset: number;
  /** Longueur du piquage, du point d'intersection des axes à son bout libre. */
  length: number;
  divisions: number;
}

export interface Piquage {
  dm: number;
  /** Rayon utilisé pour la courbe (intérieur du piquage, posé sur l'extérieur du tube principal). */
  contactRadius: number;
  developed: number;
  table: (TraceRow & { rise: number })[];
  /** Gabarit du trou dans le tube principal : développé sur son diamètre extérieur. */
  hole: Point[];
  pattern: FlatPattern;
}

export function piquage(input: PiquageInput): Piquage | string {
  const error = positive("Les diamètres et la longueur", input.mainDiameter, input.diameter, input.length) ?? (input.thickness >= 0 ? null : "L'épaisseur ne peut pas être négative.");
  if (error) return error;
  if (!(input.angle > 0 && input.angle <= 90)) return "L'angle entre les axes doit être compris entre 0 et 90°.";
  const dm = meanDiameter(input.diameter, input.thickness, input.kind);
  const inner = input.kind === "int" ? input.diameter : input.kind === "ext" ? input.diameter - 2 * input.thickness : input.diameter - input.thickness;
  const r = inner / 2;
  const R = input.mainDiameter / 2;
  if (!(r > 0) || !(dm > 0)) return "L'épaisseur du piquage est trop grande pour son diamètre.";
  if (Math.abs(input.offset) + r > R + 1e-9) return "Le piquage déborde du tube principal : réduisez son diamètre ou le décalage.";
  const beta = input.angle * DEG;
  const [sinB, cosB] = [Math.sin(beta), Math.cos(beta)];
  // Point du piquage à l'angle φ : hauteur t le long de son axe où il touche le tube principal.
  const contact = (phi: number) => {
    const y = input.offset + r * Math.cos(phi);
    const z = Math.sqrt(Math.max(0, R * R - y * y));
    const t = (z - r * Math.sin(phi) * cosB) / sinB;
    return { t, y, z, x: -r * Math.sin(phi) * sinB + t * cosB };
  };
  const n = Math.max(4, Math.round(input.divisions));
  const rm = dm / 2;
  const samples = Array.from({ length: n + 1 }, (_, k) => ({ k, phi: (2 * Math.PI * k) / n, ...contact((2 * Math.PI * k) / n) }));
  const minT = Math.min(...samples.map((s) => s.t));
  const maxT = Math.max(...samples.map((s) => s.t));
  if (input.length <= maxT) return `Le piquage doit dépasser le tube principal : longueur mini ${maxT.toFixed(1)} mm depuis l'axe.`;
  const table = samples.map((s) => ({ n: s.k + 1, angle: (360 * s.k) / n, x: rm * s.phi, y: input.length - s.t, rise: s.t - minT }));

  // Flan : le bout libre (droit) en bas, la courbe de coupe au-dessus, à la longueur de chaque génératrice.
  const steps = 144;
  const curve = Array.from({ length: steps + 1 }, (_, i) => {
    const phi = (2 * Math.PI * (steps - i)) / steps;
    return [rm * phi, input.length - contact(phi).t] as Point;
  });
  const developed = Math.PI * dm;
  const contour: Point[] = [[0, 0], [developed, 0], ...curve];
  const hole = Array.from({ length: steps + 1 }, (_, i) => {
    const c = contact((2 * Math.PI * i) / steps);
    return [R * Math.atan2(c.y, c.z), c.x] as Point;
  });
  return {
    dm,
    contactRadius: r,
    developed,
    table,
    hole,
    pattern: {
      contour,
      lines: table.slice(1, -1).map((row) => ({ from: [row.x, 0] as Point, to: [row.x, row.y] as Point, kind: "trace" as const })),
      labels: table.slice(0, -1).map((row) => ({ at: [row.x, row.y + 6] as Point, text: String(row.n) })),
    },
  };
}

// ——— Coude à segments ———

export interface CoudeInput {
  diameter: number;
  kind: DiameterKind;
  thickness: number;
  /** Rayon de cintrage, à l'axe. */
  bendRadius: number;
  /** Angle total du coude. */
  angle: number;
  /** Nombre de joints (soudures) : 2 demi-segments aux bouts, joints − 1 segments entiers. */
  joints: number;
  /** Longueur droite ajoutée aux demi-segments d'extrémité. */
  straight: number;
  divisions: number;
}

export interface Coude {
  dm: number;
  /** Angle de coupe de chaque joint, depuis la coupe d'équerre. */
  cutAngle: number;
  full: { extrados: number; intrados: number; axis: number; count: number };
  half: { extrados: number; intrados: number; axis: number; count: number };
  /** Longueur de tube si les segments sont coupés à la suite, emboîtés (retournés d'un demi-tour). */
  tubeLength: number;
  table: TraceRow[];
  /** Développé d'un segment entier. */
  pattern: FlatPattern;
}

export function coude(input: CoudeInput): Coude | string {
  const error = positive("Le diamètre, le rayon de cintrage et l'angle", input.diameter, input.bendRadius, input.angle);
  if (error) return error;
  if (input.angle > 180) return "L'angle du coude doit être au plus 180°.";
  const joints = Math.round(input.joints);
  if (!(joints >= 1)) return "Il faut au moins un joint.";
  const dm = meanDiameter(input.diameter, input.thickness, input.kind);
  const r = dm / 2;
  if (!(dm > 0)) return "L'épaisseur doit être inférieure au diamètre.";
  if (input.bendRadius <= r) return "Le rayon de cintrage doit être plus grand que le rayon du tube.";
  const beta = input.angle / (2 * joints);
  const tan = Math.tan(beta * DEG);
  const straight = Math.max(0, input.straight || 0);
  // φ = 0 à l'extrados : ordonnée de la coupe depuis l'axe du segment.
  const y = (phi: number) => (input.bendRadius + r * Math.cos(phi)) * tan;
  const n = Math.max(4, Math.round(input.divisions));
  const table = Array.from({ length: n + 1 }, (_, k) => {
    const phi = (2 * Math.PI * k) / n;
    return { n: k + 1, angle: (360 * k) / n, x: r * phi, y: y(phi) };
  });
  const steps = 144;
  const top = Array.from({ length: steps + 1 }, (_, i) => [r * ((2 * Math.PI * i) / steps), y((2 * Math.PI * i) / steps)] as Point);
  const bottom = top.map(([x, v]) => [x, -v] as Point).reverse();
  const full = { extrados: 2 * (input.bendRadius + r) * tan, intrados: 2 * (input.bendRadius - r) * tan, axis: 2 * input.bendRadius * tan, count: joints - 1 };
  const half = { extrados: full.extrados / 2 + straight, intrados: full.intrados / 2 + straight, axis: full.axis / 2 + straight, count: 2 };
  return {
    dm,
    cutAngle: beta,
    full,
    half,
    tubeLength: full.axis * full.count + half.axis * 2,
    table,
    pattern: {
      contour: [...top, ...bottom],
      lines: [
        { from: [0, 0], to: [Math.PI * dm, 0], kind: "trace" },
        ...table.slice(1, -1).map((row) => ({ from: [row.x, -row.y] as Point, to: [row.x, row.y] as Point, kind: "trace" as const })),
      ],
      labels: table.slice(0, -1).map((row) => ({ at: [row.x, row.y + 6] as Point, text: String(row.n) })),
    },
  };
}
