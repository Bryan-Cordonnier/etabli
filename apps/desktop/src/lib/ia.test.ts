import { describe, expect, it } from "vitest";
import { construireRequete, lireConfigIa, lireReponse, MODELE_DEFAUT } from "./iaPur";

describe("lireConfigIa", () => {
  it("rien ou n'importe quoi : non configuré, modèle par défaut", () => {
    for (const brut of [null, undefined, "x", 4, []]) expect(lireConfigIa(brut)).toEqual({ fournisseur: "gemini", cle: "", modele: MODELE_DEFAUT });
  });

  it("garde une clé plausible et un modèle propre, refuse le reste", () => {
    expect(lireConfigIa({ cle: " AIzaSyA-b_c1234567890 ", modele: "gemini-3.8-flash" })).toEqual({ fournisseur: "gemini", cle: "AIzaSyA-b_c1234567890", modele: "gemini-3.8-flash" });
    // Les clés récentes de Google contiennent un point ; des guillemets collés avec la clé sont retirés.
    expect(lireConfigIa({ cle: "AQ.Ab8RN6Jz-x_y12345678901234567890" }).cle).toBe("AQ.Ab8RN6Jz-x_y12345678901234567890");
    expect(lireConfigIa({ cle: `"AIzaSyA-b_c1234567890"` }).cle).toBe("AIzaSyA-b_c1234567890");
    expect(lireConfigIa({ cle: "avec\nretour1234567890" }).cle).toBe("");
    expect(lireConfigIa({ cle: "é".repeat(20) }).cle).toBe("");
    expect(lireConfigIa({ cle: "trop court" }).cle).toBe("");
    expect(lireConfigIa({ cle: "abc def ghi jkl mno" }).cle).toBe("");
    expect(lireConfigIa({ modele: "../../x?key=1" }).modele).toBe(MODELE_DEFAUT);
  });
});

describe("construireRequete", () => {
  it("met la consigne puis les photos, sans JSON imposé quand il n'y a pas de schéma", () => {
    const r = construireRequete({ instruction: "Décris.", images: [{ mime: "image/jpeg", data: "QUJD" }] }) as any;
    expect(r.contents[0].parts[0]).toEqual({ text: "Décris." });
    expect(r.contents[0].parts[1]).toEqual({ inline_data: { mime_type: "image/jpeg", data: "QUJD" } });
    expect(r.generationConfig.response_mime_type).toBeUndefined();
  });

  it("avec la recherche sur internet : l'outil de recherche, et le JSON demandé dans la consigne seulement", () => {
    const r = construireRequete({ instruction: "Propose des menus.", schema: { type: "object" }, recherche: true }) as any;
    expect(r.tools).toEqual([{ google_search: {} }]);
    expect(r.generationConfig.response_mime_type).toBeUndefined();
    expect(r.contents[0].parts[0].text).toContain("UNIQUEMENT");
    expect((construireRequete({ instruction: "x", schema: { type: "object" } }) as any).tools).toBeUndefined();
  });
  it("demande du JSON conforme au schéma quand il y en a un", () => {
    const r = construireRequete({ instruction: "Lis ce ticket.", schema: { type: "object", properties: { total: { type: "number" } } } }) as any;
    expect(r.generationConfig.response_mime_type).toBe("application/json");
    expect(r.contents[0].parts[0].text).toContain('"total"');
    expect(r.contents[0].parts[0].text).toContain("UNIQUEMENT");
  });
});

describe("lireReponse", () => {
  const ok = { candidates: [{ content: { parts: [{ text: '{"a":1}' }, { text: " " }] } }] };

  it("rend le texte de la première réponse", () => {
    expect(lireReponse(200, ok)).toEqual({ ok: true, texte: '{"a":1}' });
  });

  it("traduit les erreurs en français, avec un code exploitable", () => {
    expect(lireReponse(0, null)).toMatchObject({ ok: false, code: "reseau" });
    expect(lireReponse(429, { error: { message: "quota" } })).toMatchObject({ ok: false, code: "limite" });
    expect(lireReponse(400, { error: { message: "API key not valid" } })).toMatchObject({ ok: false, code: "refuse" });
    expect(lireReponse(403, null)).toMatchObject({ ok: false, code: "refuse" });
    expect(lireReponse(404, null)).toMatchObject({ ok: false, code: "erreur" });
    expect(lireReponse(503, null)).toMatchObject({ ok: false, code: "reseau" });
    expect(lireReponse(418, null)).toMatchObject({ ok: false, code: "erreur" });
  });

  it("signale une analyse bloquée ou une réponse vide", () => {
    expect(lireReponse(200, { promptFeedback: { blockReason: "SAFETY" } })).toMatchObject({ ok: false, code: "bloque" });
    expect(lireReponse(200, { candidates: [] })).toMatchObject({ ok: false, code: "erreur" });
    expect(lireReponse(200, "n'importe quoi")).toMatchObject({ ok: false, code: "erreur" });
  });
});
