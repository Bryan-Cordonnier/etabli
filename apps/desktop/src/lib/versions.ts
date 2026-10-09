// Comparaison de versions « 1.2.3 » (SemVer sans suffixe) : vrai si `proposee` est strictement plus récente que `actuelle`.
export function versionPlusRecente(proposee: string, actuelle: string): boolean {
  const lire = (v: string): number[] => v.replace(/^v/, "").split("-")[0]!.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const a = lire(proposee);
  const b = lire(actuelle);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}