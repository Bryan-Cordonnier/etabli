<script lang="ts">
  // Masse d'une pièce ou d'un profilé (cahier des charges des plugins, section 5.1).
  import { Card, Field, MiniAppDocument, Result, Segmented, SelectField, evaluate, format } from "@etabli/ui";
  import {
    ACIER,
    FAMILLES,
    FORMES,
    MATIERES,
    aireFromKgPerM,
    kgPerM,
    matiere,
    pesee,
    profileKgPerM,
    section,
    tailles,
    type Famille,
    type Forme,
  } from "../../src/masse";

  interface Data {
    forme: Forme;
    matiere: string;
    a: string;
    b: string;
    e: string;
    famille: Famille;
    taille: string;
    longueur: string;
    quantite: string;
    prix: string;
    prixUnite: "kg" | "m";
  }

  type Simple = Exclude<Forme, "profile">;

  const LABELS: Record<Simple, { a: string; b?: string; e?: string }> = {
    plat: { a: "Largeur", e: "Épaisseur" },
    "tube-rond": { a: "Ø extérieur", e: "Épaisseur" },
    "tube-rect": { a: "Côté a", b: "Côté b", e: "Épaisseur" },
    rond: { a: "Diamètre" },
    carre: { a: "Côté" },
    corniere: { a: "Aile a", b: "Aile b", e: "Épaisseur" },
  };

  const num = (text: string) => (text.trim() === "" ? NaN : evaluate(text));

  interface Calc {
    nom: string;
    aire: number;
    /** NaN pour un profilé laminé : sa surface n'est pas dans la table. */
    perimetre: number;
    kgm: number;
    /** Épaisseur d'une tôle, pour la masse au m² (NaN sinon). */
    tole: number;
    rho: number;
  }

  function nom(forme: Simple, a: number, b: number, e: number): string {
    const f = (x: number) => format(x, 2);
    switch (forme) {
      case "plat":
        return `Plat ${f(a)} × ${f(e)}`;
      case "tube-rond":
        return `Tube Ø ${f(a)} × ${f(e)}`;
      case "tube-rect":
        return `Tube ${f(a)} × ${f(b)} × ${f(e)}`;
      case "rond":
        return `Rond Ø ${f(a)}`;
      case "carre":
        return `Carré ${f(a)}`;
      case "corniere":
        return `Cornière ${f(a)} × ${f(b)} × ${f(e)}`;
    }
  }

  function solve(d: Data): Calc | string {
    if (d.forme === "profile") {
      const kgm = profileKgPerM(d.famille, d.taille);
      if (!(kgm > 0)) return "Choisissez un profilé.";
      return { nom: `${d.famille} ${d.taille}`, aire: aireFromKgPerM(kgm, ACIER), perimetre: NaN, kgm, tole: NaN, rho: ACIER };
    }
    const a = num(d.a);
    const e = num(d.e);
    // Côté b vide : tube carré, cornière à ailes égales.
    const b = d.b.trim() === "" ? a : num(d.b);
    const s = section(d.forme, { a, b, e });
    if (typeof s === "string") return s;
    const rho = matiere(d.matiere).masseVolumique;
    return { nom: nom(d.forme, a, b, e), aire: s.aire, perimetre: s.perimetre, kgm: kgPerM(s.aire, rho), tole: d.forme === "plat" ? e : NaN, rho };
  }

  const doc = new MiniAppDocument<Data>(
    {
      forme: "tube-rect",
      matiere: "s235",
      a: "",
      b: "",
      e: "",
      famille: "IPE",
      taille: "200",
      longueur: "",
      quantite: "",
      prix: "",
      prixUnite: "kg",
    },
    (d) => {
      const c = solve(d);
      if (typeof c === "string") return "";
      const l = num(d.longueur);
      const q = Math.max(1, Math.round(num(d.quantite)) || 1);
      return l > 0 ? `${c.nom} · ${format(pesee(c.kgm, c.perimetre, l, q).total, 2)} kg` : `${c.nom} · ${format(c.kgm, 3)} kg/m`;
    },
  );

  const result = $derived(solve(doc.data));
  const c = $derived(typeof result === "string" ? null : result);
  const longueur = $derived(num(doc.data.longueur));
  const quantite = $derived(Math.max(1, Math.round(num(doc.data.quantite)) || 1));
  const p = $derived(c && longueur > 0 ? pesee(c.kgm, c.perimetre, longueur, quantite) : null);
  const prix = $derived(num(doc.data.prix));
  const prixTotal = $derived.by(() => {
    if (!p || !(prix > 0)) return NaN;
    return doc.data.prixUnite === "kg" ? p.total * prix : (prix * longueur * quantite) / 1000;
  });
  const labels = $derived(doc.data.forme === "profile" ? null : LABELS[doc.data.forme]);
  const tubeFroid = $derived(doc.data.forme === "tube-rect" || doc.data.forme === "corniere");
</script>

<div class="split">
  <Card title="Pièce">
    <SelectField label="Forme" options={FORMES.map((f) => ({ value: f.id, label: f.label }))} bind:value={doc.data.forme} />
    {#if labels}
      <SelectField label="Matière" options={MATIERES.map((m) => ({ value: m.id, label: m.nom }))} bind:value={doc.data.matiere} />
      <div class="three">
        <Field label={labels.a} unit="mm" bind:value={doc.data.a} />
        {#if labels.b}<Field label={labels.b} unit="mm" bind:value={doc.data.b} placeholder={doc.data.a ? `${doc.data.a} (= a)` : "= a"} />{/if}
        {#if labels.e}<Field label={labels.e} unit="mm" bind:value={doc.data.e} />{/if}
      </div>
    {:else}
      <div class="two">
        <SelectField label="Famille" options={FAMILLES.map((f) => ({ value: f, label: f }))} bind:value={doc.data.famille} onchange={(f) => {
          if (!tailles(f).includes(doc.data.taille)) doc.data.taille = tailles(f)[0]!;
        }} />
        <SelectField label="Hauteur" options={tailles(doc.data.famille).map((t) => ({ value: t, label: `${doc.data.famille} ${t}` }))} bind:value={doc.data.taille} />
      </div>
    {/if}
    <div class="two">
      <Field label="Longueur" unit="mm" bind:value={doc.data.longueur} placeholder="vide : au mètre" />
      <Field label="Quantité" bind:value={doc.data.quantite} placeholder="1" />
    </div>
    <div class="price">
      <Field label="Prix" unit={doc.data.prixUnite === "kg" ? "€/kg" : "€/m"} bind:value={doc.data.prix} placeholder="facultatif" />
      <Segmented label="Unité du prix" options={[{ value: "kg", label: "au kg" }, { value: "m", label: "au mètre" }]} bind:value={doc.data.prixUnite} />
    </div>
  </Card>

  <Card title="Résultats">
    {#if c}
      {#if p}
        <Result label={quantite > 1 ? `Masse des ${quantite} pièces` : "Masse de la pièce"} value={p.total} unit="kg" decimals={2} big oncopy={doc.copy} />
      {:else}
        <Result label="Masse au mètre" value={c.kgm} unit="kg/m" decimals={3} big oncopy={doc.copy} />
      {/if}
      <div class="grid">
        {#if p && quantite > 1}<Result label="Masse d'une pièce" value={p.unitaire} unit="kg" decimals={2} oncopy={doc.copy} />{/if}
        {#if p}<Result label="Masse au mètre" value={c.kgm} unit="kg/m" decimals={3} oncopy={doc.copy} />{/if}
        {#if Number.isFinite(c.tole)}<Result label="Masse au m²" value={c.tole * c.rho} unit="kg/m²" decimals={2} oncopy={doc.copy} />{/if}
        <Result label="Section" value={c.aire} unit="mm²" decimals={1} oncopy={doc.copy} />
        {#if Number.isFinite(c.perimetre)}
          <Result label="Surface extérieure" value={c.perimetre / 1000} unit="m²/m" decimals={3} oncopy={doc.copy} />
          {#if p}<Result label={quantite > 1 ? "Surface des pièces" : "Surface de la pièce"} value={p.surface * quantite} unit="m²" decimals={3} oncopy={doc.copy} />{/if}
        {/if}
        {#if Number.isFinite(prixTotal)}
          <Result label={quantite > 1 ? "Prix de la série" : "Prix de la pièce"} value={prixTotal} unit="€" decimals={2} oncopy={doc.copy} />
          {#if quantite > 1}<Result label="Prix d'une pièce" value={prixTotal / quantite} unit="€" decimals={2} oncopy={doc.copy} />{/if}
        {/if}
      </div>
      <p class="hint">
        {c.nom}{doc.data.forme === "profile" ? " : masse au mètre du catalogue (acier, 7,85 kg/dm³)." : ` en ${matiere(doc.data.matiere).nom}, ${format(c.rho, 2)} kg/dm³.`}
        {#if tubeFroid}Angles vifs : un tube ou une cornière du commerce, aux angles arrondis, pèse 1 à 3 % de moins.{/if}
        {#if Number.isFinite(c.perimetre)}Surface extérieure hors extrémités, pour la peinture ou la galvanisation.{/if}
      </p>
    {:else}
      <p class="empty">{result}</p>
    {/if}
  </Card>
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 720px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .three {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 8px;
  }
  .price {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: end;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 8px;
  }
  .hint,
  .empty {
    margin: 0;
    font-size: 12.5px;
    color: var(--faint);
  }
  .empty {
    padding: 24px 0;
    text-align: center;
  }
</style>
