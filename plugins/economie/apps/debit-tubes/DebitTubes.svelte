<script lang="ts">
  import { STOCK_KINDS, type Saw } from "@etabli/sdk";
  import { Card, Field, Libraries, MiniAppDocument, Segmented, SelectField, colorOf, format, printFiche } from "@etabli/ui";
  import { ends, type PieceShape, type Plane, type Sens } from "../../src/coupe";
  import { groupBars, planCuts, type CutPlan, type CutSettings } from "../../src/debit";
  import { debitFiche } from "../../src/fiche-debit";
  import Piece3D from "../../src/Piece3D.svelte";
  import Plan3D from "../../src/Plan3D.svelte";
  import { nextMark, num, quantity, rowsFromPaste } from "../../src/pieces";
  import {
    DEFAULT_PROFILE,
    PROFILE_KINDS,
    parseProfile,
    profileFromText,
    profileLabel,
    section,
    type ProfileInput,
    type ProfileKind,
  } from "../../src/profil";

  interface PieceRow {
    mark: string;
    /** Longueur pointe à pointe. */
    length: string;
    quantity: string;
    angleL: string;
    angleR: string;
    planeL: Plane;
    planeR: Plane;
    sens: Sens;
  }

  interface Data {
    /** Scie de la bibliothèque Machines ; vide : réglages saisis à la main. */
    machine: string;
    profile: ProfileInput;
    stock: { length: string; quantity: string }[];
    /** Longueurs des chutes déjà en stock, séparées par des espaces ou des points-virgules. */
    offcuts: string;
    kerf: string;
    trim: string;
    keep: string;
    pieces: PieceRow[];
  }

  const newPiece = (mark: string, rest: Partial<PieceRow> = {}): PieceRow => ({
    mark,
    length: "",
    quantity: "1",
    angleL: "0",
    angleR: "0",
    planeL: "grande",
    planeR: "grande",
    sens: "oppose",
    ...rest,
  });

  const DEFAULTS: Data = {
    machine: "",
    profile: DEFAULT_PROFILE,
    stock: [{ length: "6000", quantity: "" }],
    offcuts: "",
    kerf: "3",
    trim: "0",
    keep: "300",
    pieces: [newPiece("A")],
  };

  /** Calculs enregistrés avant les angles : profilé en texte libre, pièces sans angles. */
  function migrate(saved: Record<string, unknown>): Partial<Data> {
    const profile = saved.profile;
    const pieces = Array.isArray(saved.pieces) ? (saved.pieces as Partial<PieceRow>[]) : DEFAULTS.pieces;
    return {
      ...(saved as Partial<Data>),
      profile: typeof profile === "string" ? profileFromText(profile) : { ...DEFAULT_PROFILE, ...(profile as Partial<ProfileInput>) },
      pieces: pieces.map((p) => newPiece(p.mark ?? "?", p)),
    };
  }

  const angle = (text: string) => Math.min(89, Math.max(0, num(text) || 0));
  const shapeOf = (p: PieceRow): PieceShape => ({
    angleL: angle(p.angleL),
    angleR: angle(p.angleR),
    planeL: p.planeL,
    planeR: p.planeR,
    sens: p.sens,
  });

  /** Réglages de coupe : ceux de la scie choisie, sinon ceux saisis à la main. */
  function cutSettings(data: Data): CutSettings {
    const chosen = saws.find((s) => s.id === data.machine);
    const sec = section(parseProfile(data.profile));
    return {
      kerf: chosen ? chosen.kerf : num(data.kerf) || 0,
      trim: chosen ? chosen.trim : num(data.trim) || 0,
      keepMin: num(data.keep) || 0,
      section: sec.valid ? { width: sec.width, height: sec.height, round: sec.round } : undefined,
    };
  }

  function compute(data: Data, settings = cutSettings(data)): CutPlan | null {
    // Les lignes vides gardent leur place : l'indice de la pièce sert à sa couleur.
    const all = data.pieces.map((p) => ({ mark: p.mark || "?", length: num(p.length), quantity: num(p.quantity) || 0, shape: shapeOf(p) }));
    if (!all.some((p) => p.length > 0 && p.quantity > 0)) return null;
    return planCuts(
      data.stock.map((b) => ({ length: num(b.length), quantity: quantity(b.quantity) })).filter((b) => b.length > 0),
      data.offcuts.split(/[\s;]+/).map(num).filter((l) => l > 0),
      all,
      settings,
    );
  }

  const summarize = (plan: CutPlan | null) => {
    if (!plan?.bars.length) return "";
    const bars = plan.bars.filter((b) => b.source === "barre").length;
    const rate = Math.round((plan.piecesLength / plan.usedLength) * 100);
    return `${bars} barre${bars > 1 ? "s" : ""} · ${rate} % utilisé`;
  };

  const doc = new MiniAppDocument<Data>(DEFAULTS, (data) => summarize(compute(data)), migrate);

  // Calcul un peu après la dernière frappe : la saisie reste fluide même avec beaucoup de pièces.
  let plan = $state<CutPlan | null>(null);
  let computing = $state(false);
  $effect(() => {
    const snapshot = JSON.parse(JSON.stringify(doc.data)) as Data;
    // Lu ici : une scie modifiée dans les Paramètres relance aussi le calcul.
    const settings = cutSettings(snapshot);
    computing = true;
    const timer = setTimeout(() => {
      plan = compute(snapshot, settings);
      computing = false;
    }, 250);
    return () => clearTimeout(timer);
  });

  const groups = $derived(plan ? groupBars(plan.bars) : []);
  const newBars = $derived(plan ? plan.bars.filter((b) => b.source === "barre") : []);
  const byLength = $derived(
    [...new Set(newBars.map((b) => b.length))].map((length) => ({ length, count: newBars.filter((b) => b.length === length).length })),
  );
  const kept = $derived(plan ? plan.bars.filter((b) => b.reusable).map((b) => b.remnant) : []);

  /** Plan vu en 2D (schéma à l'échelle) ou en 3D (barres en relief, pièces écartées). */
  let planView = $state<"2d" | "3d">("2d");
  const PLAN_VIEWS: { value: "2d" | "3d"; label: string }[] = [
    { value: "2d", label: "2D" },
    { value: "3d", label: "3D" },
  ];

  // ——— Profilé ———
  const profile = $derived(parseProfile(doc.data.profile));
  const sec = $derived(section(profile));
  const profileName = $derived(profileLabel(profile));
  const kindInfo = $derived(PROFILE_KINDS.find((k) => k.id === doc.data.profile.kind) ?? PROFILE_KINDS[0]!);
  const kindOptions = PROFILE_KINDS.map((k) => ({ value: k.id, label: k.label }));

  /** Libellés des deux faces : grande / petite, ou dessus / côté pour une section carrée. */
  const planeOptions = $derived.by((): { value: Plane; label: string }[] => {
    const big = Math.max(sec.width, sec.height);
    const small = Math.min(sec.width, sec.height);
    if (big === small) {
      const top = sec.width >= sec.height;
      return [
        { value: "grande", label: top ? "Vue de dessus" : "Vue de côté" },
        { value: "petite", label: top ? "Vue de côté" : "Vue de dessus" },
      ];
    }
    return [
      { value: "grande", label: `Grande face (${format(big)})` },
      { value: "petite", label: `Petite face (${format(small)})` },
    ];
  });
  const SENS_OPTIONS: { value: Sens; label: string }[] = [
    { value: "oppose", label: "Sens opposé · trapèze" },
    { value: "meme", label: "Même sens · parallélogramme" },
  ];

  // ——— Pièces ———
  let selected = $state(0);
  const current = $derived(Math.min(selected, doc.data.pieces.length - 1));
  const piece = $derived(doc.data.pieces[current]!);
  const pieceShape = $derived(shapeOf(piece));

  function addPiece(): void {
    doc.data.pieces.push(newPiece(nextMark(doc.data.pieces.map((p) => p.mark))));
    selected = doc.data.pieces.length - 1;
  }

  function removePiece(i: number): void {
    doc.data.pieces.splice(i, 1);
    if (selected >= i && selected > 0) selected--;
  }

  const angleSummary = (p: PieceRow) => {
    const [l, r] = [angle(p.angleL), angle(p.angleR)];
    return l === 0 && r === 0 ? "droit" : `${format(l)}° · ${format(r)}°`;
  };

  function onpaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData("text") ?? "";
    if (!/[\t\n]/.test(text.trim())) return;
    event.preventDefault();
    const rows = rowsFromPaste(text, 1, doc.data.pieces.map((p) => p.mark));
    const kept = doc.data.pieces.filter((p) => p.length.trim() !== "");
    // Colonnes collées : repère, longueur, quantité, puis angle gauche et angle droit s'il y en a.
    doc.data.pieces = [
      ...kept,
      ...rows.map(([mark, length, qty, angleL, angleR]) => newPiece(mark!, { length, quantity: qty, angleL: angleL ?? "0", angleR: angleR ?? "0" })),
    ];
    doc.notify(`${rows.length} pièce${rows.length > 1 ? "s" : ""} collée${rows.length > 1 ? "s" : ""}`);
  }

  // Bibliothèques d'Établi (Paramètres → Bibliothèques) : fournisseurs et machines. Le calcul marche aussi sans.
  const libraries = new Libraries();
  const ADD = "__ajouter__";

  const saws = $derived(libraries.machines.filter((m): m is Saw => m.kind === "scie"));
  const saw = $derived(saws.find((s) => s.id === doc.data.machine));
  const sawOptions = $derived([
    { value: "", label: "Réglages saisis à la main" },
    ...saws.map((s) => ({ value: s.id, label: s.name || "Scie sans nom" })),
    { value: ADD, label: "+ Ajouter une machine…" },
  ]);

  // « + Ajouter une machine… » : les Paramètres s'ouvrent sur une nouvelle scie ; dès qu'elle
  // arrive dans la bibliothèque, elle est choisie ici. En attendant, l'ancien choix reste.
  let knownSaws = $state<Set<string> | null>(null);
  let previous = "";
  $effect(() => {
    if (doc.data.machine !== ADD) previous = doc.data.machine;
  });

  function pickSaw(id: string): void {
    if (id !== ADD) return;
    doc.data.machine = previous;
    knownSaws = new Set(saws.map((s) => s.id));
    libraries.addMachine("scie");
  }

  $effect(() => {
    const added = knownSaws && saws.find((s) => !knownSaws!.has(s.id));
    if (!added) return;
    knownSaws = null;
    doc.data.machine = added.id;
  });

  // ——— Contrôles : ce qui empêcherait de couper la pièce comme saisie ———
  const warnings = $derived.by(() => {
    const list: string[] = [];
    const angled = doc.data.pieces.some((p) => angle(p.angleL) > 0 || angle(p.angleR) > 0);
    if (angled && !sec.valid) list.push("Renseignez les dimensions du profilé : les coupes d'angle en ont besoin.");
    for (const p of doc.data.pieces) {
      const length = num(p.length);
      const shape = shapeOf(p);
      if (saw && Math.max(shape.angleL, shape.angleR) > saw.maxAngle) {
        list.push(`${p.mark} : ${format(Math.max(shape.angleL, shape.angleR))}° dépasse l'angle maxi de la scie (${format(saw.maxAngle)}°).`);
      }
      if (sec.valid && length > 0) {
        const e = ends(shape, sec);
        const recul = (f: typeof e.left) => f.c + (Math.abs(f.a) * sec.width + Math.abs(f.b) * sec.height) / 2;
        if (recul(e.left) + recul(e.right) >= length) list.push(`${p.mark} : trop courte pour ses angles (les coupes se croisent).`);
      }
      if (saw && length > 0 && length < saw.minLength) {
        list.push(`${p.mark} : plus courte que la longueur mini de la scie (${format(saw.minLength)} mm).`);
      }
    }
    return list;
  });

  // ——— Fournisseurs ———
  const kindLabel = (kind: string) => STOCK_KINDS.find((k) => k.id === kind)?.label ?? kind;
  const barOffers = $derived(
    libraries.suppliers.flatMap((s) =>
      s.items
        .filter((item) => item.kind !== "tole" && item.length > 0)
        .map((item) => ({
          value: `${s.id}/${item.id}`,
          label: `${s.name || "Fournisseur"} — ${[kindLabel(item.kind), item.material, item.designation].filter(Boolean).join(" ")} · ${format(item.length, 0)} mm`,
          length: item.length,
        })),
    ),
  );
  let offer = $state("");

  /** Longueur de barre du fournisseur : remplace la ligne vide, sinon s'ajoute. */
  function pickOffer(value: string): void {
    const found = barOffers.find((o) => o.value === value);
    offer = "";
    if (!found) return;
    const empty = doc.data.stock.find((b) => num(b.length) <= 0 || doc.data.stock.length === 1);
    if (empty) empty.length = String(found.length);
    else doc.data.stock.push({ length: String(found.length), quantity: "" });
  }

  function print(): void {
    if (!plan) return;
    printFiche(
      debitFiche({
        title: "",
        profile: profileName,
        plan,
        pieces: doc.data.pieces.map((p) => ({
          mark: p.mark || "?",
          length: num(p.length),
          quantity: num(p.quantity) || 0,
          angleL: angle(p.angleL),
          angleR: angle(p.angleR),
        })),
        colors: colorOf,
        settings: cutSettings(doc.data),
        machine: saw?.name ?? "",
      }),
    );
  }

  function copyPlan(): void {
    if (!plan) return;
    const lines = [`Plan de débit — ${profileName}`, ""];
    groups.forEach(({ bar, count }, i) => {
      const label = bar.source === "chute" ? `chute de ${format(bar.length)}` : `barre de ${format(bar.length)}`;
      lines.push(`${i + 1}. ${count} × ${label} : ${bar.cuts.map((c) => `${c.mark} ${format(c.length)}`).join(" | ")}`);
      lines.push(`   reste ${format(bar.remnant)} mm${bar.reusable ? " (à garder)" : ""}`);
    });
    doc.copy(lines.join("\n"));
  }

  /** Contour d'une pièce sur le schéma de la barre (unités : % de la longueur, hauteur 0 à 100). */
  function polygon(cut: CutPlan["bars"][number]["cuts"][number], barLength: number): string {
    const x = (v: number) => ((v / barLength) * 100).toFixed(3);
    const end = cut.start + cut.length;
    return [
      `${x(cut.start + cut.draw.left[0])},0`,
      `${x(end - cut.draw.right[0])},0`,
      `${x(end - cut.draw.right[1])},100`,
      `${x(cut.start + cut.draw.left[1])},100`,
    ].join(" ");
  }
</script>

<div class="split">
  <div class="inputs">
    <Card title="Profilé">
      <SelectField
        label="Type"
        options={kindOptions}
        bind:value={doc.data.profile.kind}
        onchange={(kind: ProfileKind) => {
          // Changer de type ne garde que les dimensions qui ont encore un sens.
          const keys = PROFILE_KINDS.find((k) => k.id === kind)!.dims.map((d) => d.key);
          for (const key of ["a", "b", "t", "e"] as const) if (!keys.includes(key)) doc.data.profile[key] = "";
        }}
      />
      <div class="dims" style:--n={kindInfo.dims.length}>
        {#each kindInfo.dims as dim (dim.key)}
          <Field label={dim.label} unit="mm" bind:value={doc.data.profile[dim.key]} />
        {/each}
      </div>
      <p class="profile-name">{profileName}</p>
    </Card>

    <Card title="Barres et réglages">
      <div class="table">
        <span class="head">Longueur des barres</span>
        <span class="head">Quantité</span>
        <span></span>
        {#each doc.data.stock as bar, i (i)}
          <Field compact label="Longueur de barre" unit="mm" bind:value={bar.length} />
          <Field compact label="Quantité de barres" placeholder="illimitée" bind:value={bar.quantity} />
          <button class="remove" onclick={() => doc.data.stock.splice(i, 1)} disabled={doc.data.stock.length === 1} aria-label="Retirer cette longueur">✕</button>
        {/each}
      </div>
      <div class="row-actions">
        <button class="btn" onclick={() => doc.data.stock.push({ length: "", quantity: "" })}>+ Autre longueur de barre</button>
        {#if barOffers.length}
          <SelectField
            compact
            label="Longueur d'un fournisseur"
            options={[{ value: "", label: "Longueur d'un fournisseur…" }, ...barOffers]}
            bind:value={offer}
            onchange={pickOffer}
          />
        {/if}
      </div>
      <Field label="Chutes déjà en stock (utilisées en premier)" numeric={false} placeholder="ex. 1200 850 640" unit="mm" bind:value={doc.data.offcuts} />
      <SelectField label="Scie" options={sawOptions} bind:value={doc.data.machine} onchange={pickSaw} />
      {#if saw}
        <!-- Réglages de la scie : modifiables dans Paramètres → Bibliothèques → Machines. -->
        <div class="two">
          <p class="machine-settings">
            Trait de scie <b>{format(saw.kerf)} mm</b> · dressage <b>{format(saw.trim)} mm</b> · angle maxi <b>{format(saw.maxAngle)}°</b>
          </p>
          <Field label="Chute gardée dès" unit="mm" bind:value={doc.data.keep} />
        </div>
      {:else}
        <div class="three">
          <Field label="Trait de scie" unit="mm" bind:value={doc.data.kerf} />
          <Field label="Dressage en bout" unit="mm" bind:value={doc.data.trim} />
          <Field label="Chute gardée dès" unit="mm" bind:value={doc.data.keep} />
        </div>
      {/if}
    </Card>

    <Card title="Pièces à couper">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="pieces" {onpaste}>
        <div class="prow head">
          <span></span>
          <span>Repère</span>
          <span>Longueur</span>
          <span>Qté</span>
          <span>Angles</span>
          <span></span>
        </div>
        {#each doc.data.pieces as p, i (i)}
          <div class="prow" class:selected={i === current} onfocusin={() => (selected = i)}>
            <span class="swatch" style:background={colorOf(i)}></span>
            <Field compact numeric={false} label="Repère" bind:value={p.mark} />
            <Field compact label="Longueur pointe à pointe" unit="mm" bind:value={p.length} />
            <Field compact label="Quantité" bind:value={p.quantity} />
            <button class="angles" class:on={i === current} onclick={() => (selected = i)} title="Régler les angles de {p.mark}">
              {angleSummary(p)}
            </button>
            <button class="remove" onclick={() => removePiece(i)} disabled={doc.data.pieces.length === 1} aria-label="Retirer la pièce {p.mark}">✕</button>
          </div>
        {/each}
      </div>
      <button class="btn" onclick={addPiece}>+ Ajouter une pièce</button>
      <p class="hint">Longueur pointe à pointe (la plus grande). Collez des lignes d'Excel : repère, longueur, quantité, angle gauche, angle droit.</p>

      <div class="detail">
        <div class="detail-head">
          <span class="swatch" style:background={colorOf(current)}></span>
          <b>Pièce {piece.mark || "?"}</b>
          <span class="dim">{profileName}</span>
        </div>
        <Piece3D section={sec} length={num(piece.length) > 0 ? num(piece.length) : 500} shape={pieceShape} color={colorOf(current)} mark={piece.mark || "?"} />
        <div class="ends">
          <div class="end">
            <Field label="Angle gauche" unit="°" bind:value={piece.angleL} />
            {#if angle(piece.angleL) > 0 && !sec.round}
              <Segmented label="Face de l'angle gauche" options={planeOptions} bind:value={piece.planeL} />
            {/if}
          </div>
          <div class="end">
            <Field label="Angle droit" unit="°" bind:value={piece.angleR} />
            {#if angle(piece.angleR) > 0 && !sec.round}
              <Segmented label="Face de l'angle droit" options={planeOptions} bind:value={piece.planeR} />
            {/if}
          </div>
        </div>
        {#if angle(piece.angleL) > 0 && angle(piece.angleR) > 0}
          <Segmented label="Sens des deux coupes" options={SENS_OPTIONS} bind:value={piece.sens} />
        {/if}
        <p class="hint">Angle mesuré depuis la coupe d'équerre : 0° = coupe droite, 45° = onglet de cadre.</p>
      </div>
    </Card>
  </div>

  <Card title="Plan de débit">
    {#snippet actions()}
      {#if plan?.bars.length}
        <Segmented label="Vue du plan" options={PLAN_VIEWS} bind:value={planView} />
        <button class="btn" onclick={copyPlan}>Copier le plan</button>
        <button class="btn primary" onclick={print}>Imprimer la fiche</button>
      {/if}
    {/snippet}
    {#each warnings as warning (warning)}
      <p class="warn">{warning}</p>
    {/each}
    {#if plan && (plan.bars.length || plan.unplaced.length)}
      <div class="kpis" class:stale={computing}>
        <div class="kpi main">
          <span>Barres neuves</span>
          <b>{newBars.length}</b>
          <small>{byLength.map((g) => `${g.count} × ${format(g.length)} mm`).join(" + ") || "aucune"}</small>
        </div>
        <div class="kpi">
          <span>Utilisation</span>
          <b>{plan.usedLength ? format((plan.piecesLength / plan.usedLength) * 100, 1) : "—"} %</b>
        </div>
        <div class="kpi">
          <span>Perte</span>
          <b>{format(plan.waste, 0)} mm</b>
          <small>traits de scie, angles et chutes trop courtes</small>
        </div>
        <div class="kpi">
          <span>Chutes à garder</span>
          <b>{kept.length}</b>
          <small>{kept.map((l) => format(l, 0)).join(", ") || "aucune"}</small>
        </div>
      </div>

      {#if plan.unplaced.length}
        <p class="warn">
          {plan.unplaced.length} pièce{plan.unplaced.length > 1 ? "s" : ""} non placée{plan.unplaced.length > 1 ? "s" : ""} :
          {plan.unplaced.map((c) => `${c.mark} (${format(c.length)} mm)`).join(", ")}. Trop longues, ou plus assez de barres.
        </p>
      {/if}

      {#if planView === "3d"}
        <div class:stale={computing}>
          <Plan3D {groups} shapes={doc.data.pieces.map(shapeOf)} section={sec} colors={colorOf} />
        </div>
      {:else}
      <div class="bars" class:stale={computing}>
        {#each groups as { bar, count }, i (i)}
          <div class="row">
            <span class="label">
              {count > 1 ? `${count} ×` : ""}
              {bar.source === "chute" ? "chute" : "barre"}
              <small>{format(bar.length, 0)}</small>
            </span>
            <div class="bar">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {#each bar.cuts as cut, j (j)}
                  <polygon points={polygon(cut, bar.length)} fill={colorOf(cut.piece)} />
                {/each}
              </svg>
              {#each bar.cuts as cut, j (j)}
                <span
                  class="cut"
                  style:left="{(cut.start / bar.length) * 100}%"
                  style:width="{(cut.length / bar.length) * 100}%"
                  title="{cut.mark} — {format(cut.length)} mm{cut.shared ? ' (coupe partagée avec la précédente)' : ''}"
                >{format(cut.length, 0)}</span>
              {/each}
            </div>
            <span class="rest" class:keep={bar.reusable} title={bar.reusable ? "Chute à garder" : "Perte"}>
              {format(bar.remnant, 0)}
            </span>
          </div>
        {/each}
      </div>
      {/if}
      <p class="hint">
        Longueurs en mm, pointe à pointe. En vert : chutes à garder (≥ {format(num(doc.data.keep) || 0, 0)} mm). Les coupes d'angle
        voisines sont emboîtées (tube retourné) : une seule coupe pour deux pièces.
      </p>
    {:else}
      <p class="empty">Ajoutez les longueurs à couper : le plan de débit s'affiche ici, barre par barre.</p>
    {/if}
  </Card>
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: minmax(380px, 460px) 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 860px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
  .inputs {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .dims {
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    gap: 8px;
  }
  .profile-name {
    margin: -8px 0 0;
    font-size: 12.5px;
    color: var(--muted);
  }
  .table {
    display: grid;
    grid-template-columns: 1fr 110px 28px;
    gap: 4px 6px;
    align-items: center;
  }
  .head {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--faint);
  }
  .pieces {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .prow {
    position: relative;
    display: grid;
    grid-template-columns: 10px 64px 1fr 56px 96px 28px;
    gap: 6px;
    align-items: center;
    padding: 2px 4px 2px 10px;
  }
  /* Pièce affichée dans le panneau : une barre d'accent à gauche, comme la colonne des plugins.
     Pas de fond coloré : les champs de la ligne resteraient noyés dedans. */
  .prow::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--accent);
    opacity: 0;
    transition: opacity 0.12s;
  }
  .prow.selected::before {
    opacity: 1;
  }
  .prow.head::before {
    display: none;
  }
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .angles {
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
    color: var(--text);
    font: 500 12.5px var(--mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    /* Plusieurs clics de suite ne surlignent pas le texte du bouton. */
    user-select: none;
    transition:
      border-color 0.12s,
      color 0.12s;
  }
  .angles:hover {
    border-color: var(--faint);
  }
  .angles.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .detail-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .detail-head .dim {
    margin-left: auto;
    font-size: 12.5px;
    color: var(--muted);
  }
  .ends {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .end {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .three {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .row-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .row-actions :global(.field) {
    flex: 1;
    min-width: 180px;
  }
  .two {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 8px;
    align-items: start;
  }
  .machine-settings {
    margin: 0;
    padding-top: 24px;
    font-size: 13px;
    color: var(--muted);
  }
  .machine-settings b {
    font-family: var(--mono);
    color: var(--text);
  }
  .remove {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--faint);
  }
  .remove:hover:not(:disabled) {
    background: var(--field);
    color: var(--err);
  }
  .remove:disabled {
    opacity: 0.3;
  }
  .btn {
    align-self: flex-start;
  }
  .hint,
  .empty {
    margin: 0;
    font-size: 12.5px;
    color: var(--faint);
  }
  .empty {
    padding: 32px 0;
    text-align: center;
  }
  .warn {
    margin: 0;
    padding: 8px 12px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--err) 12%, transparent);
    font-size: 13px;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
    transition: opacity 0.15s;
  }
  .kpi {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface-2);
  }
  .kpi span {
    color: var(--muted);
    font-size: 12.5px;
  }
  .kpi b {
    font: 600 22px var(--mono);
  }
  .kpi.main b {
    font-size: 30px;
    color: var(--accent);
  }
  .kpi small {
    color: var(--faint);
    font-size: 11.5px;
  }
  .stale {
    opacity: 0.55;
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: opacity 0.15s;
  }
  .row {
    display: grid;
    grid-template-columns: 86px 1fr 52px;
    gap: 10px;
    align-items: center;
  }
  .label {
    font-size: 12px;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .label small {
    font-family: var(--mono);
    color: var(--faint);
  }
  .bar {
    position: relative;
    height: 30px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: repeating-linear-gradient(135deg, var(--field) 0 6px, var(--surface-2) 6px 12px);
  }
  .bar svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .bar polygon {
    stroke: var(--surface);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
  .cut {
    position: absolute;
    top: 0;
    bottom: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    color: #fff;
    font: 600 11px var(--mono);
    white-space: nowrap;
    pointer-events: auto;
  }
  .rest {
    text-align: right;
    font: 500 12px var(--mono);
    color: var(--faint);
  }
  .rest.keep {
    color: var(--ok);
    font-weight: 700;
  }
</style>
