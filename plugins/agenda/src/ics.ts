// Export iCalendar (.ics) des événements : lu par Calendrier (iPhone), Agenda (Android) et Outlook. Heures « flottantes » (sans fuseau) :
// 8 h reste 8 h où que soit le téléphone. Pas d'alarme ici : les rappels viennent plus tard (docs/24, étape 5).
import { ajouterJours, instantVersIso, MINUTES_PAR_JOUR, type Jour } from "@etabli/ui/civil";
import type { Occurrence } from "./types";

/** `20261005T083000` : jour + minutes depuis minuit (une fin peut dépasser 24 h : le jour suivant). */
export function dateHeureLocale(jour: Jour, minute: number): string {
  const decalage = Math.floor(minute / MINUTES_PAR_JOUR);
  const d = ajouterJours(jour, decalage).replaceAll("-", "");
  const r = minute - decalage * MINUTES_PAR_JOUR;
  return `${d}T${String(Math.floor(r / 60)).padStart(2, "0")}${String(r % 60).padStart(2, "0")}00`;
}

/** Échappement de la valeur d'un champ texte (RFC 5545 §3.3.11). */
const echapper = (t: string): string => t.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);

/** Plie une ligne à 75 octets au plus (RFC 5545 §3.1) sans couper un caractère multi-octets. */
export function plier(ligne: string): string {
  const enc = new TextEncoder();
  if (enc.encode(ligne).length <= 75) return ligne;
  const morceaux: string[] = [];
  let courant = "";
  let octets = 0;
  let limite = 75;
  for (const c of ligne) {
    const n = enc.encode(c).length;
    if (octets + n > limite) {
      morceaux.push(courant);
      courant = "";
      octets = 0;
      limite = 74; // les lignes suivantes commencent par une espace
    }
    courant += c;
    octets += n;
  }
  morceaux.push(courant);
  return morceaux.join("\r\n ");
}

const stamp = (ms: number): string => instantVersIso(ms).replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** Flux iCalendar d'un ensemble d'occurrences. `maintenant` (ms UTC) sert d'horodatage : le fichier est reproductible dans un test. */
export function genererIcs(occ: readonly Occurrence[], maintenant: number): string {
  const lignes: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Etabli//Agenda//FR", "CALSCALE:GREGORIAN"];
  const horodatage = stamp(maintenant);
  for (const o of occ) {
    const fin = o.finMin > o.debutMin ? o.finMin : o.finMin + MINUTES_PAR_JOUR;
    lignes.push(
      "BEGIN:VEVENT",
      `UID:${o.evenementId}-${o.jour}@etabli-agenda`,
      `DTSTAMP:${horodatage}`,
      `DTSTART:${dateHeureLocale(o.jour, o.debutMin)}`,
      `DTEND:${dateHeureLocale(o.jour, fin)}`,
      `SUMMARY:${echapper(o.titre)}`,
    );
    if (o.lieu) lignes.push(`LOCATION:${echapper(o.lieu)}`);
    lignes.push("END:VEVENT");
  }
  lignes.push("END:VCALENDAR");
  return lignes.map(plier).join("\r\n") + "\r\n";
}
