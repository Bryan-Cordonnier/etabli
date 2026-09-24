// Profilés du débit de tubes (cahier des charges, section 9.3) : type, dimensions, section.
// La section est dessinée dans le plan (y, z) : y horizontal (largeur), z vertical (hauteur),
// centrée sur le milieu de son encombrement. La pièce s'étend ensuite le long de x.
import { num } from "./pieces";

export type ProfileKind =
  | "tube-carre"
  | "tube-rect"
  | "tube-rond"
  | "carre-plein"
  | "rond-plein"
  | "plat"
  | "corniere"
  | "ipe"
  | "upn";

/** Dimensions saisies (texte, comme tous les champs : « 40 », « 2*20 »). */
export interface ProfileInput {
  kind: ProfileKind;
  a: string;
  b: string;
  t: string;
  e: string;
}

type Dim = "a" | "b" | "t" | "e";

export const PROFILE_KINDS: { id: ProfileKind; label: string; dims: { key: Dim; label: string }[] }[] = [
  { id: "tube-carre", label: "Tube carré", dims: [{ key: "a", label: "Côté" }, { key: "t", label: "Épaisseur" }] },
  {
    id: "tube-rect",
    label: "Tube rectangulaire",
    dims: [{ key: "a", label: "Largeur" }, { key: "b", label: "Hauteur" }, { key: "t", label: "Épaisseur" }],
  },
  { id: "tube-rond", label: "Tube rond", dims: [{ key: "a", label: "Diamètre" }, { key: "t", label: "Épaisseur" }] },
  { id: "carre-plein", label: "Carré plein", dims: [{ key: "a", label: "Côté" }] },
  { id: "rond-plein", label: "Rond plein", dims: [{ key: "a", label: "Diamètre" }] },
  { id: "plat", label: "Plat", dims: [{ key: "a", label: "Largeur" }, { key: "t", label: "Épaisseur" }] },
  {
    id: "corniere",
    label: "Cornière",
    dims: [{ key: "a", label: "Aile 1" }, { key: "b", label: "Aile 2" }, { key: "t", label: "Épaisseur" }],
  },
  {
    id: "ipe",
    label: "IPE / HEA",
    dims: [{ key: "a", label: "Hauteur" }, { key: "b", label: "Largeur" }, { key: "t", label: "Âme" }, { key: "e", label: "Aile" }],
  },
  {
    id: "upn",
    label: "UPN",
    dims: [{ key: "a", label: "Hauteur" }, { key: "b", label: "Largeur" }, { key: "t", label: "Âme" }, { key: "e", label: "Aile" }],
  },
];

export const DEFAULT_PROFILE: ProfileInput = { kind: "tube-carre", a: "40", b: "", t: "2", e: "" };

/** Dimensions utiles, en mm. Une dimension manquante vaut 0 (profilé incomplet). */
export interface Profile {
  kind: ProfileKind;
  a: number;
  b: number;
  t: number;
  e: number;
}

export function parseProfile(input: ProfileInput): Profile {
  const value = (text: string) => Math.max(0, num(text ?? "") || 0);
  return { kind: input.kind, a: value(input.a), b: value(input.b), t: value(input.t), e: value(input.e) };
}

/** « Tube carré 40 × 40 × 2 » */
export function profileLabel(p: Profile): string {
  const kind = PROFILE_KINDS.find((k) => k.id === p.kind)!;
  const f = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const dims: Record<ProfileKind, number[]> = {
    "tube-carre": [p.a, p.a, p.t],
    "tube-rect": [p.a, p.b, p.t],
    "tube-rond": [p.a, p.t],
    "carre-plein": [p.a],
    "rond-plein": [p.a],
    plat: [p.a, p.t],
    corniere: [p.a, p.b, p.t],
    ipe: [p.a],
    upn: [p.a],
  };
  if (p.kind === "ipe" || p.kind === "upn") return `${p.kind === "ipe" ? "IPE" : "UPN"} ${f(p.a)}`;
  return `${kind.label} ${dims[p.kind].map(f).join(" × ")}`;
}

/** Section : contour extérieur et trous, en points (y, z) ; `round` pour les sections circulaires. */
export interface Section {
  /** Encombrement : largeur (y) et hauteur (z). */
  width: number;
  height: number;
  round: boolean;
  outer: [number, number][];
  holes: [number, number][][];
  /** Profilé complet (toutes les dimensions utiles saisies et cohérentes). */
  valid: boolean;
}

const rect = (w: number, h: number): [number, number][] => [
  [-w / 2, -h / 2],
  [w / 2, -h / 2],
  [w / 2, h / 2],
  [-w / 2, h / 2],
];

const circle = (d: number, segments = 48): [number, number][] =>
  Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [(Math.cos(a) * d) / 2, (Math.sin(a) * d) / 2];
  });

export function section(p: Profile): Section {
  const { a, t, e } = p;
  const b = p.b;
  switch (p.kind) {
    case "tube-carre":
      return { width: a, height: a, round: false, outer: rect(a, a), holes: t > 0 && 2 * t < a ? [rect(a - 2 * t, a - 2 * t)] : [], valid: a > 0 && t > 0 && 2 * t < a };
    case "tube-rect":
      return {
        width: a,
        height: b,
        round: false,
        outer: rect(a, b),
        holes: t > 0 && 2 * t < Math.min(a, b) ? [rect(a - 2 * t, b - 2 * t)] : [],
        valid: a > 0 && b > 0 && t > 0 && 2 * t < Math.min(a, b),
      };
    case "tube-rond":
      return { width: a, height: a, round: true, outer: circle(a), holes: t > 0 && 2 * t < a ? [circle(a - 2 * t)] : [], valid: a > 0 && t > 0 && 2 * t < a };
    case "carre-plein":
      return { width: a, height: a, round: false, outer: rect(a, a), holes: [], valid: a > 0 };
    case "rond-plein":
      return { width: a, height: a, round: true, outer: circle(a), holes: [], valid: a > 0 };
    case "plat":
      return { width: a, height: t, round: false, outer: rect(a, t), holes: [], valid: a > 0 && t > 0 };
    case "corniere": {
      // L : aile 1 horizontale (en bas), aile 2 verticale (à gauche).
      const [w, h] = [a, b];
      const outer: [number, number][] = [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, -h / 2 + t],
        [-w / 2 + t, -h / 2 + t],
        [-w / 2 + t, h / 2],
        [-w / 2, h / 2],
      ];
      return { width: w, height: h, round: false, outer, holes: [], valid: w > 0 && h > 0 && t > 0 && t < Math.min(w, h) };
    }
    case "ipe":
    case "upn": {
      // Hauteur a (verticale), largeur b, âme t, ailes e.
      const [h, w] = [a, b];
      const valid = h > 0 && w > 0 && t > 0 && e > 0 && 2 * e < h && t < w;
      if (!valid) return { width: w, height: h, round: false, outer: rect(w, h), holes: [], valid: false };
      const outer: [number, number][] =
        p.kind === "ipe"
          ? [
              [-w / 2, -h / 2],
              [w / 2, -h / 2],
              [w / 2, -h / 2 + e],
              [t / 2, -h / 2 + e],
              [t / 2, h / 2 - e],
              [w / 2, h / 2 - e],
              [w / 2, h / 2],
              [-w / 2, h / 2],
              [-w / 2, h / 2 - e],
              [-t / 2, h / 2 - e],
              [-t / 2, -h / 2 + e],
              [-w / 2, -h / 2 + e],
            ]
          : [
              [-w / 2, -h / 2],
              [w / 2, -h / 2],
              [w / 2, -h / 2 + e],
              [-w / 2 + t, -h / 2 + e],
              [-w / 2 + t, h / 2 - e],
              [w / 2, h / 2 - e],
              [w / 2, h / 2],
              [-w / 2, h / 2],
            ];
      return { width: w, height: h, round: false, outer, holes: [], valid };
    }
  }
}

/** Aire de la section en mm² (pour le poids). */
export function sectionArea(s: Section): number {
  const area = (pts: [number, number][]) =>
    Math.abs(pts.reduce((sum, [y, z], i) => {
      const [y2, z2] = pts[(i + 1) % pts.length]!;
      return sum + y * z2 - y2 * z;
    }, 0)) / 2;
  return area(s.outer) - s.holes.reduce((sum, h) => sum + area(h), 0);
}

/** Ancien calcul (profilé en texte libre) : type et dimensions devinés depuis le texte. */
export function profileFromText(text: string): ProfileInput {
  const lower = text.toLowerCase();
  const numbers = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
  const kind: ProfileKind = lower.includes("rond")
    ? lower.includes("plein")
      ? "rond-plein"
      : "tube-rond"
    : lower.includes("rect")
      ? "tube-rect"
      : lower.includes("plat")
        ? "plat"
        : lower.includes("corni")
          ? "corniere"
          : lower.includes("ipe") || lower.includes("hea")
            ? "ipe"
            : lower.includes("upn")
              ? "upn"
              : lower.includes("plein")
                ? "carre-plein"
                : "tube-carre";
  const [n1 = "", n2 = "", n3 = ""] = numbers;
  switch (kind) {
    case "tube-carre":
      return { kind, a: n1 || DEFAULT_PROFILE.a, b: "", t: (numbers.length >= 3 ? n3 : n2) || DEFAULT_PROFILE.t, e: "" };
    case "tube-rect":
    case "corniere":
      return { kind, a: n1, b: n2, t: n3, e: "" };
    case "tube-rond":
    case "plat":
      return { kind, a: n1, b: "", t: n2, e: "" };
    default:
      return { kind, a: n1, b: "", t: "", e: "" };
  }
}
