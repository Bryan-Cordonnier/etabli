// Aperçu 3D d'une pièce (cahier des charges, section 9.3) : la section du profilé, étirée entre
// ses deux coupes. Chargé seulement quand l'aperçu s'affiche ; l'image n'est redessinée que quand
// on tourne la pièce ou qu'on change une valeur : rien ne tourne en continu.
import {
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  ShapeUtils,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Lin } from "./coupe";
import type { Section } from "./profil";

export type View = "3d" | "dessus" | "cote";

export interface PieceModel {
  section: Section;
  /** Longueur affichée (raccourcie pour les pièces très longues). */
  length: number;
  ends: { left: Lin; right: Lin };
  color: string;
  edgeColor: string;
}

const at = (e: Lin, y: number, z: number) => e.c + e.a * y + e.b * z;

/**
 * Géométrie de la pièce : parois (extérieur et trous) et faces de coupe. Repère three.js :
 * x le long de la pièce, y vers le haut (hauteur de la section), z vers l'avant (−largeur).
 */
export function buildGeometry(model: PieceModel): BufferGeometry {
  const { section: s, length, ends } = model;
  const half = length / 2;
  const left = (y: number, z: number): [number, number, number] => [at(ends.left, y, z) - half, z, -y];
  const right = (y: number, z: number): [number, number, number] => [half - at(ends.right, y, z), z, -y];

  const positions: number[] = [];
  const normals: number[] = [];
  const push = (points: [number, number, number][], normal?: [number, number, number][]) => {
    for (const p of points) positions.push(...p);
    if (normal) for (const n of normal) normals.push(...n);
  };

  // Parois : un quadrilatère par côté du contour, entre les deux coupes.
  const walls: [number, number][][] = [s.outer, ...s.holes];
  walls.forEach((contour, ring) => {
    for (let i = 0; i < contour.length; i++) {
      const [y1, z1] = contour[i]!;
      const [y2, z2] = contour[(i + 1) % contour.length]!;
      const quad = [left(y1, z1), left(y2, z2), right(y2, z2), left(y1, z1), right(y2, z2), right(y1, z1)];
      if (s.round) {
        // Section ronde : normales lissées (vers l'extérieur, ou vers l'axe pour l'alésage).
        const sign = ring === 0 ? 1 : -1;
        const n = (y: number, z: number): [number, number, number] => {
          const l = Math.hypot(y, z) || 1;
          return [0, (sign * z) / l, (-sign * y) / l];
        };
        push(quad, [n(y1, z1), n(y2, z2), n(y2, z2), n(y1, z1), n(y2, z2), n(y1, z1)]);
      } else {
        push(quad);
      }
    }
  });
  const wallVertices = positions.length / 3;

  // Faces de coupe : la section triangulée, posée sur chaque plan de coupe.
  const contour = s.outer.map(([y, z]) => new Vector2(y, z));
  const holes = s.holes.map((h) => h.map(([y, z]) => new Vector2(y, z)));
  const all = [...s.outer, ...s.holes.flat()];
  const triangles = ShapeUtils.triangulateShape(contour, holes);
  for (const place of [left, right]) {
    for (const tri of triangles) push(tri.map((i) => place(...all[i]!)));
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  if (s.round) {
    // Remplace les normales des parois par les normales lissées.
    const attr = geometry.getAttribute("normal");
    for (let i = 0; i < wallVertices; i++) attr.setXYZ(i, normals[i * 3]!, normals[i * 3 + 1]!, normals[i * 3 + 2]!);
  }
  return geometry;
}

const VIEWS: Record<View, Vector3> = {
  "3d": new Vector3(0.45, 0.55, 1).normalize(),
  dessus: new Vector3(0, 1, 0.0001).normalize(),
  cote: new Vector3(0, 0.0001, 1).normalize(),
};

/** Une pièce de la scène : sa géométrie (centrée), sa couleur et la position de son centre. */
export interface Part {
  model: Omit<PieceModel, "color" | "edgeColor">;
  color: string;
  /** Teinte appliquée à l'acier : 0 = acier brut, 1 = couleur pure. */
  tint?: number;
  position: [number, number, number];
}

export type Project = (x: number, y: number, z: number) => { x: number; y: number };

/**
 * Petite scène 3D : une ou plusieurs pièces, qu'on fait tourner à la souris. Sert à l'aperçu
 * d'une pièce comme à la vue 3D du plan de débit (toutes les barres, pièces écartées).
 */
export class Viewer3D {
  #renderer: WebGLRenderer;
  #scene = new Scene();
  #camera = new PerspectiveCamera(30, 1, 1, 200000);
  #controls: OrbitControls;
  #parts = new Group();
  #materials = new Map<string, MeshLambertMaterial>();
  #edges = new LineBasicMaterial({ transparent: true, opacity: 0.7 });
  #center = new Vector3();
  #radius = 100;
  #observer: ResizeObserver;
  #onRender: (project: Project) => void;

  #host: HTMLElement;

  /** @param onRender appelé après chaque image : sert à placer les étiquettes (angles, repères) sur la scène. */
  constructor(host: HTMLElement, onRender: (project: Project) => void = () => {}) {
    this.#host = host;
    this.#onRender = onRender;
    this.#renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.#renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.append(this.#renderer.domElement);

    this.#scene.add(new AmbientLight(0xffffff, 1.4));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 1.6);
    const fill = new DirectionalLight(0xffffff, 0.7);
    fill.position.set(-1.5, -0.5, -1);
    this.#scene.add(key, fill, this.#parts);

    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enablePan = false;
    this.#controls.enableZoom = false;
    this.#controls.addEventListener("change", () => this.render());

    this.#observer = new ResizeObserver(() => this.#resize());
    this.#observer.observe(host);
    this.#resize();
  }

  /** Acier teinté de la couleur du repère : la pièce se reconnaît sans avoir l'air peinte. */
  #material(color: string, tint: number): MeshLambertMaterial {
    const key = `${color}|${tint}`;
    let material = this.#materials.get(key);
    if (!material) {
      material = new MeshLambertMaterial({ side: DoubleSide, color: new Color("#c3cad3").lerp(new Color(color), tint) });
      this.#materials.set(key, material);
    }
    return material;
  }

  show(parts: Part[], edgeColor: string): void {
    for (const child of [...this.#parts.children]) {
      this.#parts.remove(child);
      (child as Mesh).geometry.dispose();
    }
    this.#edges.color = new Color(edgeColor);
    for (const part of parts) {
      const geometry = buildGeometry({ ...part.model, color: part.color, edgeColor });
      const mesh = new Mesh(geometry, this.#material(part.color, part.tint ?? 0.45));
      const edges = new LineSegments(new EdgesGeometry(geometry, 25), this.#edges);
      mesh.position.set(...part.position);
      edges.position.set(...part.position);
      this.#parts.add(mesh, edges);
    }
    const box = new Box3().setFromObject(this.#parts);
    const sphere = box.isEmpty() ? null : box.getBoundingSphere(new Sphere());
    const radius = sphere?.radius ?? 100;
    // On ne recadre que si la scène change nettement : tourner puis modifier un angle garde la vue.
    const moved = sphere ? sphere.center.distanceTo(this.#center) > radius * 0.15 : false;
    if (moved || Math.abs(radius - this.#radius) / this.#radius > 0.15) {
      this.#radius = radius;
      if (sphere) this.#center.copy(sphere.center);
      this.setView(null);
    } else {
      this.render();
    }
  }

  /** Vue prédéfinie, ou recadrage dans la direction actuelle (`null`). */
  setView(view: View | null): void {
    const direction = view ? VIEWS[view].clone() : this.#camera.position.clone().sub(this.#controls.target).normalize();
    if (direction.lengthSq() === 0) direction.copy(VIEWS["3d"]);
    const aspect = this.#camera.aspect || 1;
    const fov = (this.#camera.fov * Math.PI) / 180;
    // Distance pour que la scène tienne en hauteur et en largeur, avec une petite marge.
    const fit = Math.max(this.#radius / Math.sin(fov / 2), this.#radius / Math.sin(Math.atan(Math.tan(fov / 2) * aspect)));
    this.#camera.position.copy(this.#center).add(direction.multiplyScalar(fit * 1.02));
    this.#camera.near = fit / 50;
    this.#camera.far = fit * 10;
    this.#camera.updateProjectionMatrix();
    this.#controls.target.copy(this.#center);
    this.#controls.update();
    this.render();
  }

  render(): void {
    this.#renderer.render(this.#scene, this.#camera);
    const { clientWidth: w, clientHeight: h } = this.#host;
    this.#onRender((x, y, z) => {
      const p = new Vector3(x, y, z).project(this.#camera);
      return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
    });
  }

  #resize(): void {
    const { clientWidth: w, clientHeight: h } = this.#host;
    if (!w || !h) return;
    this.#renderer.setSize(w, h);
    this.#camera.aspect = w / h;
    this.#camera.updateProjectionMatrix();
    this.setView(null);
  }

  dispose(): void {
    this.#observer.disconnect();
    this.#controls.dispose();
    for (const child of this.#parts.children) (child as Mesh).geometry.dispose();
    for (const material of this.#materials.values()) material.dispose();
    this.#edges.dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }
}
