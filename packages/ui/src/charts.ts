// Géométrie des graphiques SVG du kit (LineChart, DonutChart) : fonctions pures, sans Svelte, testées. Les composants ne font que
// dessiner ce qu'elles calculent. Les valeurs sont des nombres ordinaires (des centimes pour l'argent) ; rien ici n'arrondit de l'argent.

export interface Point2D {
  x: number;
  y: number;
}

/** Graduations « rondes » (1, 2, 5 × 10ⁿ) couvrant [min, max], au plus `cible + 1` repères. Toujours croissantes, sans doublon. */
export function graduations(min: number, max: number, cible = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) return min === 0 ? [0, 1] : [min < 0 ? min : 0, min < 0 ? 0 : min].sort((a, b) => a - b);
  const brut = (max - min) / Math.max(1, cible);
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * puissance).find((p) => p >= brut) ?? 10 * puissance;
  const debut = Math.floor(min / pas) * pas;
  const fin = Math.ceil(max / pas) * pas;
  const reperes: number[] = [];
  for (let i = 0; debut + i * pas <= fin + pas / 1000 && i < 100; i++) reperes.push(Math.round((debut + i * pas) / pas) * pas);
  return reperes;
}

/** Fonction d'échelle linéaire d'un domaine vers une plage (domaine réduit à un point : milieu de la plage). */
export function echelle(domaine: [number, number], plage: [number, number]): (v: number) => number {
  const [d0, d1] = domaine;
  const [p0, p1] = plage;
  return d0 === d1 ? () => (p0 + p1) / 2 : (v) => p0 + ((v - d0) / (d1 - d0)) * (p1 - p0);
}

const n2 = (v: number) => String(Math.round(v * 100) / 100);

/** Chemin SVG d'une ligne brisée (« M x y L x y … ») ; vide s'il n'y a aucun point. */
export function cheminLigne(points: readonly Point2D[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${n2(p.x)} ${n2(p.y)}`).join(" ");
}

/** Chemin fermé sous la ligne jusqu'à `base` (ordonnée de la ligne de base), pour remplir l'aire. */
export function cheminAire(points: readonly Point2D[], base: number): string {
  if (points.length === 0) return "";
  const premier = points[0]!;
  const dernier = points[points.length - 1]!;
  return `${cheminLigne(points)} L${n2(dernier.x)} ${n2(base)} L${n2(premier.x)} ${n2(base)} Z`;
}

/** Indice du point dont l'abscisse est la plus proche de `x` (points triés par x croissant) ; -1 s'il n'y en a aucun. */
export function plusProche(points: readonly Point2D[], x: number): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const milieu = (lo + hi) >> 1;
    if (points[milieu]!.x < x) lo = milieu + 1;
    else hi = milieu;
  }
  return lo > 0 && Math.abs(points[lo - 1]!.x - x) <= Math.abs(points[lo]!.x - x) ? lo - 1 : lo;
}

export interface PartDonut {
  label: string;
  value: number;
  color: string;
}

/** Au plus `max` parts : les plus grandes d'abord, le reste regroupé dans « Autres ». Les valeurs nulles ou négatives sont retirées. */
export function regrouper(parts: readonly { label: string; value: number }[], max = 8, autres = "Autres"): { label: string; value: number }[] {
  const positives = parts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  if (positives.length <= max) return positives;
  const gardees = positives.slice(0, max - 1);
  const reste = positives.slice(max - 1).reduce((s, p) => s + p.value, 0);
  return [...gardees, { label: autres, value: reste }];
}

/**
 * Secteurs d'un anneau : `d` du chemin de chaque part (angle de départ en haut, sens horaire), séparées par un écart d'`ecart` px
 * mesuré sur l'arc moyen. Une part unique est un anneau complet (deux demi-arcs). Valeurs nulles : aucun secteur.
 */
export function secteurs(valeurs: readonly number[], rayon: number, epaisseur: number, ecart = 2): { d: string; debut: number; fin: number }[] {
  const total = valeurs.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return [];
  const ext = rayon;
  const int = Math.max(0, rayon - epaisseur);
  const moyen = (ext + int) / 2;
  const point = (r: number, a: number) => `${n2(r * Math.sin(a))} ${n2(-r * Math.cos(a))}`;
  const sortie: { d: string; debut: number; fin: number }[] = [];
  const positives = valeurs.filter((v) => v > 0).length;
  let angle = 0;
  for (const v of valeurs) {
    if (v <= 0) {
      sortie.push({ d: "", debut: angle, fin: angle });
      continue;
    }
    const part = (v / total) * Math.PI * 2;
    if (positives === 1) {
      sortie.push({
        d: `M0 ${n2(-ext)} A${n2(ext)} ${n2(ext)} 0 1 1 0 ${n2(ext)} A${n2(ext)} ${n2(ext)} 0 1 1 0 ${n2(-ext)} Z M0 ${n2(-int)} A${n2(int)} ${n2(int)} 0 1 0 0 ${n2(int)} A${n2(int)} ${n2(int)} 0 1 0 0 ${n2(-int)} Z`,
        debut: 0,
        fin: Math.PI * 2,
      });
      angle += part;
      continue;
    }
    const marge = Math.min(part / 2.01, ecart / (2 * moyen));
    const a0 = angle + marge;
    const a1 = angle + part - marge;
    const grand = a1 - a0 > Math.PI ? 1 : 0;
    sortie.push({
      d: `M${point(ext, a0)} A${n2(ext)} ${n2(ext)} 0 ${grand} 1 ${point(ext, a1)} L${point(int, a1)} A${n2(int)} ${n2(int)} 0 ${grand} 0 ${point(int, a0)} Z`,
      debut: angle,
      fin: angle + part,
    });
    angle += part;
  }
  return sortie;
}
