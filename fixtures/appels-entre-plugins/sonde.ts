// Sonde d'isolation des fixtures d'essai : ce qu'un code hostile pourrait tenter depuis son cadre. Exécutée aussi bien dans la page
// d'une mini-app que dans le cadre invisible d'un fournisseur, pour comparer les deux (scripts/essai-appels.mjs).
// Fixture de test, jamais distribuée : elle fait exprès ce que `npm run valider` interdit aux vrais plugins.
export interface Sonde {
  origine: string;
  parent: string;
  parentStockage: string;
  fetchExterne: string;
  ouvertureFenetre: string;
  stockagePropre: string;
  violationsCsp: number;
}

async function essayer(f: () => unknown | Promise<unknown>): Promise<string> {
  try {
    await f();
    return "permis";
  } catch (e) {
    return `refuse:${(e as Error).name}`;
  }
}

export async function sonde(): Promise<Sonde> {
  let violations = 0;
  document.addEventListener("securitypolicyviolation", () => violations++);
  const parent = await essayer(() => window.parent.document.title);
  const parentStockage = await essayer(() => window.parent.localStorage.length);
  const fetchExterne = await essayer(async () => {
    const r = await fetch("http://127.0.0.1:9/sonde");
    return r.status;
  });
  // `window.open` rend null (sans exception) quand le cadre n'a pas `allow-popups`.
  const ouvertureFenetre = window.open("about:blank", "_blank") ? "ouverte" : "bloquee";
  const stockagePropre = await essayer(() => {
    localStorage.setItem("sonde", "1");
    localStorage.removeItem("sonde");
  });
  // Laisse le navigateur rapporter les violations de CSP (événement asynchrone).
  await new Promise((r) => setTimeout(r, 50));
  return { origine: location.origin, parent, parentStockage, fetchExterne, ouvertureFenetre, stockagePropre, violationsCsp: violations };
}
