// Évalue ce que l'utilisateur tape dans un champ numérique (cahier des charges, section 5.6) :
// « 12,5 », « 1200 - 2*15 », « sqrt(3^2 + 4^2) », « cos(30) * 500 ».
// Analyseur écrit à la main : pas d'eval, interdit dans le cadre isolé et dangereux.

const DEG = Math.PI / 180;

/** Fonctions trigonométriques en degrés, comme sur une calculatrice d'atelier. */
const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: (x) => Math.sin(x * DEG),
  cos: (x) => Math.cos(x * DEG),
  tan: (x) => Math.tan(x * DEG),
  asin: (x) => Math.asin(x) / DEG,
  acos: (x) => Math.acos(x) / DEG,
  atan: (x) => Math.atan(x) / DEG,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI };

/** Renvoie NaN si le champ est vide ou l'expression invalide. */
export function evaluate(input: string): number {
  const src = input.trim().toLowerCase().replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/");
  if (!src) return NaN;
  let pos = 0;

  const skipSpaces = () => {
    while (src[pos] === " ") pos++;
  };
  const fail = (): never => {
    throw new Error("expression invalide");
  };

  // expression := terme (('+' | '-') terme)*
  const expression = (): number => {
    let value = term();
    for (;;) {
      skipSpaces();
      if (src[pos] === "+") {
        pos++;
        value += term();
      } else if (src[pos] === "-") {
        pos++;
        value -= term();
      } else return value;
    }
  };

  // terme := unaire (('*' | '/') unaire)*
  const term = (): number => {
    let value = unary();
    for (;;) {
      skipSpaces();
      if (src[pos] === "*") {
        pos++;
        value *= unary();
      } else if (src[pos] === "/") {
        pos++;
        value /= unary();
      } else return value;
    }
  };

  // unaire := ('-' | '+') unaire | puissance      (-2^2 = -4, comme en maths)
  const unary = (): number => {
    skipSpaces();
    if (src[pos] === "-") {
      pos++;
      return -unary();
    }
    if (src[pos] === "+") {
      pos++;
      return unary();
    }
    return power();
  };

  // puissance := primaire ('^' unaire)?          (associatif à droite : 2^3^2 = 2^9)
  const power = (): number => {
    const base = primary();
    skipSpaces();
    if (src[pos] === "^") {
      pos++;
      return base ** unary();
    }
    return base;
  };

  const primary = (): number => {
    skipSpaces();
    const c = src[pos] ?? "";
    if (c === "(") {
      pos++;
      const value = expression();
      skipSpaces();
      if (src[pos] !== ")") fail();
      pos++;
      return value;
    }
    if (/[0-9.]/.test(c)) {
      const match = /^\d*\.?\d*(e[+-]?\d+)?/.exec(src.slice(pos));
      const text = match?.[0] ?? "";
      if (text === "" || text === ".") fail();
      pos += text.length;
      return Number(text);
    }
    if (/[a-z]/.test(c)) {
      const name = /^[a-z]+/.exec(src.slice(pos))?.[0] ?? "";
      pos += name.length;
      if (name in CONSTANTS) return CONSTANTS[name]!;
      const fn = FUNCTIONS[name];
      if (!fn) fail();
      skipSpaces();
      if (src[pos] !== "(") fail();
      pos++;
      const argument = expression();
      skipSpaces();
      if (src[pos] !== ")") fail();
      pos++;
      return fn!(argument);
    }
    return fail();
  };

  try {
    const value = expression();
    skipSpaces();
    return pos === src.length && Number.isFinite(value) ? value : NaN;
  } catch {
    return NaN;
  }
}

/** Vrai si le champ contient un calcul, et pas seulement un nombre. */
export function isExpression(input: string): boolean {
  return /[+*/^()a-z×÷]|\d\s*-/i.test(input.trim());
}

/** Nombre à la française : « 1 234,57 ». */
export function format(value: number, decimals = 2): string {
  return Number.isFinite(value) ? value.toLocaleString("fr-FR", { maximumFractionDigits: decimals }) : "—";
}
