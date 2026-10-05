import { afterEach, describe, expect, it, vi } from "vitest";
import { lireReponse, pageSonde, pluginsAccessiblesEnOpaque } from "./sondeCors";

describe("sonde du CORS des plugins", () => {
  it("la page de sonde fait un fetch CORS sans identifiants vers l'adresse donnée, échappée", () => {
    const page = pageSonde('http://h/plugins/index.json"</script>');
    expect(page).toContain('mode:"cors"');
    expect(page).toContain('credentials:"omit"');
    expect(page.match(/<\/script>/g)).toHaveLength(1);
    expect(page).toContain("\\u003c/script>");
  });

  it("ne croit que le message marqué, avec un booléen", () => {
    expect(lireReponse({ marque: "etabli:sonde-cors", ok: true })).toBe(true);
    expect(lireReponse({ marque: "etabli:sonde-cors", ok: false })).toBe(false);
    expect(lireReponse({ marque: "etabli:sonde-cors", ok: "oui" })).toBeUndefined();
    expect(lireReponse({ ok: true })).toBeUndefined();
    expect(lireReponse(null)).toBeUndefined();
    expect(lireReponse("etabli:sonde-cors")).toBeUndefined();
  });
});

describe("pluginsAccessiblesEnOpaque", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Un document minimal : le cadre de sonde et la fenêtre qui reçoit ses messages. */
  function monde() {
    let ecouteur: ((e: MessageEvent) => void) | undefined;
    const contentWindow = {};
    const cadre = {
      contentWindow,
      srcdoc: "",
      style: {} as Record<string, string>,
      attrs: {} as Record<string, string>,
      retire: false,
      setAttribute(k: string, v: string) {
        this.attrs[k] = v;
      },
      remove() {
        this.retire = true;
      },
      tabIndex: 0,
    };
    const doc = { baseURI: "https://exemple.fr/app/", createElement: () => cadre, body: { appendChild: vi.fn() } };
    vi.stubGlobal("window", {
      addEventListener: (_: string, f: (e: MessageEvent) => void) => (ecouteur = f),
      removeEventListener: () => (ecouteur = undefined),
    });
    return { doc: doc as unknown as Document, cadre, repondre: (data: unknown, source: unknown = contentWindow) => ecouteur?.({ data, source } as MessageEvent) };
  }

  it("cadre opaque (sandbox sans allow-same-origin), adresse résolue, réponse vraie", async () => {
    const m = monde();
    const p = pluginsAccessiblesEnOpaque("plugins", { document: m.doc });
    expect(m.cadre.attrs["sandbox"]).toBe("allow-scripts");
    expect(m.cadre.srcdoc).toContain("https://exemple.fr/app/plugins/index.json");
    m.repondre({ marque: "etabli:sonde-cors", ok: true });
    expect(await p).toBe(true);
    expect(m.cadre.retire).toBe(true);
  });

  it("ignore un message d'une autre source, puis la réponse négative du cadre", async () => {
    const m = monde();
    const p = pluginsAccessiblesEnOpaque("plugins", { document: m.doc });
    m.repondre({ marque: "etabli:sonde-cors", ok: true }, {});
    m.repondre({ marque: "etabli:sonde-cors", ok: false });
    expect(await p).toBe(false);
  });

  it("sans réponse dans le délai : pas de CORS", async () => {
    const m = monde();
    expect(await pluginsAccessiblesEnOpaque("plugins", { document: m.doc, delaiMs: 5 })).toBe(false);
    expect(m.cadre.retire).toBe(true);
  });

  it("sans document : faux", async () => {
    expect(await pluginsAccessiblesEnOpaque("plugins")).toBe(false);
  });
});
