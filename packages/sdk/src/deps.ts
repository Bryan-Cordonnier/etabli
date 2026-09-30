// Versions et dépendances entre plugins (docs/13). Fonctions pures, sans navigateur : l'application
// s'en sert pour installer, désinstaller et activer des plugins, et les outils de publication
// peuvent s'en servir aussi.
//
// Un plugin déclare dans son manifeste :
//   "dependencies":         { "fournisseurs": "^1" }   obligatoire : sans lui, le plugin ne marche pas
//   "optionalDependencies": { "machines": "^1" }       facultatif : le plugin marche sans, en mieux avec
// Les clés sont des identifiants de plugin ; les valeurs, des plages de versions (voir `satisfies`).

/** « 1.2.3 » → [1, 2, 3] (les morceaux manquants valent 0, un suffixe « -beta » est ignoré). */
export function parseVersion(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version
    .trim()
    .replace(/^v/, "")
    .split(/[-+]/)[0]!
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  return [major, minor, patch];
}

/** Positif si `a` est plus récente que `b`, négatif si elle est plus ancienne, 0 si elles sont égales. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) {
    const diff = x[i]! - y[i]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Plages comprises :
 * - `*` ou vide : toutes les versions ;
 * - `^1`, `^1.2`, `^1.2.3` : compatible, même version majeure (`^0.3.1` : même version mineure) ;
 * - `~1.2` ou `~1.2.3` : même version mineure ;
 * - `1.x`, `1.2.x` : version majeure (ou mineure) fixée ;
 * - `>=1.2.3`, `>1.2.3`, `<=…`, `<…` ;
 * - `1.2.3` : cette version exactement.
 * Plusieurs conditions séparées par une espace doivent toutes être vraies (`>=1.2 <2`).
 */
export function satisfies(version: string, range: string): boolean {
  const conditions = range.trim().split(/\s+/).filter(Boolean);
  return conditions.every((condition) => satisfiesOne(version, condition));
}

function satisfiesOne(version: string, condition: string): boolean {
  if (condition === "*" || condition === "x") return true;
  const v = parseVersion(version);

  const compare = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(condition);
  const operator = compare?.[1];
  const target = compare?.[2] ?? condition;

  if (target.startsWith("^") || target.startsWith("~")) {
    const parts = target.slice(1).split(".").length;
    const base = parseVersion(target.slice(1));
    if (compareVersions(version, target.slice(1)) < 0) return false;
    if (target.startsWith("~")) return v[0] === base[0] && v[1] === base[1];
    if (base[0] > 0) return v[0] === base[0];
    // ^0.x : tant que la version majeure est 0, la mineure fait office de majeure.
    return parts >= 2 ? v[0] === 0 && v[1] === base[1] : v[0] === 0;
  }

  const wildcard = /^(\d+)(?:\.(\d+|x|\*))?(?:\.(x|\*))?$/.exec(target);
  if (wildcard && (target.includes("x") || target.includes("*"))) {
    const major = Number(wildcard[1]);
    const minor = wildcard[2] && !/^[x*]$/.test(wildcard[2]) ? Number(wildcard[2]) : undefined;
    return v[0] === major && (minor === undefined || v[1] === minor);
  }

  const diff = compareVersions(version, target);
  switch (operator) {
    case ">=":
      return diff >= 0;
    case ">":
      return diff > 0;
    case "<=":
      return diff <= 0;
    case "<":
      return diff < 0;
    default:
      return diff === 0;
  }
}

/** Ce qu'il faut savoir d'un plugin pour résoudre ses dépendances. */
export interface DepNode {
  id: string;
  version: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** Un plugin installé ; `enabled` : il n'a pas été désactivé par l'utilisateur. */
export interface InstalledNode extends DepNode {
  enabled: boolean;
}

export type Problem =
  /** Dépendance obligatoire pas installée. */
  | { kind: "missing"; id: string; range: string }
  /** Dépendance installée, mais dans une version que le plugin ne supporte pas. */
  | { kind: "incompatible"; id: string; range: string; found: string }
  /** Dépendance installée mais désactivée. */
  | { kind: "disabled"; id: string; range: string };

/** Dépendances **obligatoires** d'un plugin installé qui ne sont pas satisfaites. */
export function problemsOf(plugin: DepNode, installed: readonly InstalledNode[]): Problem[] {
  const problems: Problem[] = [];
  for (const [id, range] of Object.entries(plugin.dependencies ?? {})) {
    const found = installed.find((p) => p.id === id);
    if (!found) problems.push({ kind: "missing", id, range });
    else if (!satisfies(found.version, range)) problems.push({ kind: "incompatible", id, range, found: found.version });
    else if (!found.enabled) problems.push({ kind: "disabled", id, range });
  }
  return problems;
}

/**
 * Plugins installés qui ont **besoin** de `id` (dépendance obligatoire), directement ou par un
 * autre plugin. Les dépendances facultatives ne comptent pas : ces plugins marchent sans.
 */
export function dependentsOf(id: string, installed: readonly DepNode[]): string[] {
  const found = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const plugin of installed) {
      if (found.has(plugin.id) || plugin.id === id) continue;
      if (plugin.dependencies && current in plugin.dependencies) {
        found.add(plugin.id);
        queue.push(plugin.id);
      }
    }
  }
  return [...found];
}

/** Plugins installés qui peuvent se servir de `id` sans en avoir besoin. */
export function optionalDependentsOf(id: string, installed: readonly DepNode[]): string[] {
  return installed.filter((p) => p.optionalDependencies && id in p.optionalDependencies && !p.dependencies?.[id]).map((p) => p.id);
}

export interface InstallPlan<E extends DepNode> {
  /** À installer ou mettre à jour, dans cet ordre : les dépendances d'abord, le plugin demandé en dernier. */
  order: E[];
  /** Facultatifs disponibles dans le catalogue et pas encore installés (proposés à l'utilisateur). */
  optional: E[];
  /** Dépendances obligatoires introuvables dans le catalogue, ou dans une version incompatible. */
  missing: Problem[];
}

/**
 * Prépare l'installation de `target` : ses dépendances obligatoires manquantes (ou trop anciennes)
 * sont prises dans le catalogue, récursivement, et les facultatives sont proposées. Avec
 * `withOptional`, les facultatives (et leurs propres dépendances) sont ajoutées à `order`.
 * Les cycles sont ignorés : un plugin n'est jamais planifié deux fois.
 */
export function planInstall<E extends DepNode>(
  target: E,
  catalogue: readonly E[],
  installed: readonly DepNode[],
  withOptional = false,
): InstallPlan<E> {
  const have = new Map(installed.map((p) => [p.id, p]));
  const order: E[] = [];
  const optional: E[] = [];
  const missing: Problem[] = [];
  const seen = new Set<string>();

  const visit = (entry: E): void => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);

    for (const [id, range] of Object.entries(entry.dependencies ?? {})) {
      const current = have.get(id);
      if (current && satisfies(current.version, range)) continue;
      const candidate = newest(catalogue, id, range);
      if (candidate) visit(candidate);
      else if (!seen.has(id)) {
        missing.push(current ? { kind: "incompatible", id, range, found: current.version } : { kind: "missing", id, range });
      }
    }
    order.push(entry);

    for (const [id, range] of Object.entries(entry.optionalDependencies ?? {})) {
      if (have.has(id) || seen.has(id) || optional.some((o) => o.id === id)) continue;
      const candidate = newest(catalogue, id, range);
      if (candidate) optional.push(candidate);
    }
  };

  visit(target);
  if (withOptional) {
    // Les facultatives peuvent en proposer d'autres : on continue jusqu'à ce qu'il n'y en ait plus.
    for (let i = 0; i < optional.length; i++) visit(optional[i]!);
  }
  return { order, optional: withOptional ? [] : optional, missing };
}

/** Version la plus récente d'un plugin du catalogue qui respecte la plage. */
function newest<E extends DepNode>(catalogue: readonly E[], id: string, range: string): E | undefined {
  return catalogue
    .filter((e) => e.id === id && satisfies(e.version, range))
    .sort((a, b) => compareVersions(b.version, a.version))[0];
}
