// Vue 3D du plan de débit : chaque barre (ou groupe de barres identiques) est posée sur une ligne,
// ses pièces écartées les unes des autres pour bien voir chaque coupe, le reste au bout.
// Les pièces sont raccourcies au milieu (une barre de 6 m resterait un fil) ; leurs bouts, eux,
// gardent leur forme exacte. Calcul pur, sans three.js : la scène est construite par piece3d.ts.
import { ends, oriented, type Lin, type PieceShape } from "./coupe";
import type { BarGroup } from "./debit";
import type { Section } from "./profil";

export interface ScenePart {
  model: { section: Section; length: number; ends: { left: Lin; right: Lin } };
  color: string;
  tint: number;
  position: [number, number, number];
}

/** Nom d'une ligne de barres, placé à sa gauche. */
export interface SceneLabel {
  text: string;
  position: [number, number, number];
}

const KEEP = "#1f9d63";
const LOST = "#8b96a3";
const STRAIGHT_END: Lin = { c: 0, a: 0, b: 0 };

const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });

export function planScene(
  groups: BarGroup[],
  shapes: PieceShape[],
  section: Section,
  colors: (piece: number) => string,
): { parts: ScenePart[]; labels: SceneLabel[] } {
  const bounds = { width: section.width, height: section.height, round: section.round };
  const size = Math.max(section.width, section.height, 1);
  // Plus grand recul d'un bout sur la section (distance entre sa pointe et son point le plus en retrait).
  const span = (e: Lin) =>
    section.round ? e.c + (section.width / 2) * Math.hypot(e.a, e.b) : e.c + (Math.abs(e.a) * section.width + Math.abs(e.b) * section.height) / 2;

  const longest = Math.max(1, ...groups.map((g) => g.bar.length));
  const scale = Math.min(1, (28 * size) / longest);
  const spacing = 0.9 * size;
  const minBody = 0.35 * size;
  const rowStep = section.height + 1.5 * size;

  const parts: ScenePart[] = [];
  const labels: SceneLabel[] = [];

  groups.forEach(({ bar, count }, row) => {
    const y = -row * rowStep;
    labels.push({
      text: `${count > 1 ? `${count} × ` : ""}${bar.source === "chute" ? "chute" : "barre"} ${fmt(bar.length)}`,
      position: [-0.6 * size, y, 0],
    });

    let x = 0;
    let lastRight: Lin | null = null;
    for (const cut of bar.cuts) {
      const e = oriented(ends(shapes[cut.piece] ?? { angleL: 0, angleR: 0, planeL: "grande", planeR: "grande", sens: "oppose" }, bounds), cut.orientation);
      const [left, right] = [span(e.left), span(e.right)];
      const length = left + right + Math.max((cut.length - left - right) * scale, minBody);
      // Pas de repère sur les pièces : la couleur suffit à l'écran (la fiche imprimée, elle, les écrit).
      parts.push({ model: { section, length, ends: e }, color: colors(cut.piece), tint: 0.55, position: [x + length / 2, y, 0] });
      x += length + spacing;
      lastRight = e.right;
    }

    if (bar.remnant >= 1 && lastRight) {
      // Le reste commence par la coupe complémentaire de la dernière pièce ; son autre bout est le bout de barre.
      const maxRecul = span(lastRight);
      const left: Lin = { c: maxRecul - lastRight.c, a: -lastRight.a, b: -lastRight.b };
      const length = maxRecul + Math.max(bar.remnant * scale, minBody * 0.8);
      parts.push({
        model: { section, length, ends: { left, right: STRAIGHT_END } },
        color: bar.reusable ? KEEP : LOST,
        tint: bar.reusable ? 0.55 : 0.25,
        position: [x + length / 2, y, 0],
      });
    }
  });

  return { parts, labels };
}
