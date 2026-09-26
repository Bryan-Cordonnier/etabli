// Aperçu 3D d'une pièce de traçage. Chargé seulement quand on choisit la vue 3D ; l'image n'est
// redessinée que quand on tourne la pièce ou qu'une valeur change : rien ne tourne en continu.
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
  Sphere,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { shell, type Line3D, type Model3D, type P3, type Surface3D } from "./modele3d";

export type View = "3d" | "face" | "dessus";

export interface Colors {
  accent: string;
  edge: string;
  trace: string;
  seam: string;
  joint: string;
}

export interface RenderTools {
  /** Position à l'écran (px) d'un point de la scène. */
  project(p: P3): { x: number; y: number };
  /** Vrai si la face de normale `n` au point `p` est tournée vers la caméra. */
  facing(p: P3, n: P3): boolean;
}

const VIEWS: Record<View, Vector3> = {
  "3d": new Vector3(0.55, 0.5, 1).normalize(),
  face: new Vector3(0, 0.0001, 1).normalize(),
  dessus: new Vector3(0, 1, 0.0001).normalize(),
};

export class Tracage3D {
  #renderer: WebGLRenderer;
  #scene = new Scene();
  #camera = new PerspectiveCamera(30, 1, 1, 200000);
  #controls: OrbitControls;
  #parts = new Group();
  #center = new Vector3();
  #radius = 100;
  #observer: ResizeObserver;
  #host: HTMLElement;
  #onRender: (tools: RenderTools) => void;

  constructor(host: HTMLElement, onRender: (tools: RenderTools) => void) {
    this.#host = host;
    this.#onRender = onRender;
    this.#renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.#renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.append(this.#renderer.domElement);

    this.#scene.add(new AmbientLight(0xffffff, 1.3));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 1.6);
    const fill = new DirectionalLight(0xffffff, 0.8);
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

  #clear(): void {
    for (const child of [...this.#parts.children]) {
      this.#parts.remove(child);
      const object = child as Mesh | LineSegments;
      object.geometry.dispose();
      (object.material as Material).dispose();
    }
  }

  #surface(surface: Surface3D, colors: Colors): void {
    const { surface: faces, caps } = shell(surface.rings, surface.thickness);
    // Acier teinté : la pièce tracée à la couleur de l'application, le tube principal en gris.
    const steel = new Color("#c3cad3");
    const color =
      surface.role === "context" ? new Color("#9aa3ad") : steel.clone().lerp(new Color(colors.accent), surface.role === "piece" ? 0.35 : 0.15);
    // Recul des faces : les lignes tracées dessus restent visibles.
    const material = () => new MeshLambertMaterial({ color, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(faces.positions, 3));
    geometry.setIndex(faces.indices);
    geometry.computeVertexNormals();
    this.#parts.add(new Mesh(geometry, material()));

    if (caps.length) {
      const rim = new BufferGeometry();
      rim.setAttribute("position", new Float32BufferAttribute(caps, 3));
      rim.computeVertexNormals();
      this.#parts.add(new Mesh(rim, material()));
      const edges = new LineSegments(new EdgesGeometry(rim, 20), new LineBasicMaterial({ color: new Color(colors.edge), transparent: true, opacity: 0.55 }));
      this.#parts.add(edges);
    }
  }

  #lines(lines: Line3D[], kind: Line3D["kind"], color: string): void {
    const chosen = lines.filter((l) => l.kind === kind);
    if (!chosen.length) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(chosen.flatMap((l) => [...l.from, ...l.to]), 3));
    this.#parts.add(new LineSegments(geometry, new LineBasicMaterial({ color: new Color(color), transparent: kind === "trace", opacity: kind === "trace" ? 0.75 : 1 })));
  }

  show(model: Model3D, colors: Colors): void {
    this.#clear();
    for (const surface of model.surfaces) this.#surface(surface, colors);
    this.#lines(model.lines, "trace", colors.trace);
    this.#lines(model.lines, "joint", colors.joint);
    this.#lines(model.lines, "seam", colors.seam);

    const box = new Box3().setFromObject(this.#parts);
    const sphere = box.isEmpty() ? null : box.getBoundingSphere(new Sphere());
    const radius = sphere?.radius ?? 100;
    // On ne recadre que si la pièce change nettement : tourner puis modifier une cote garde la vue.
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
    if (direction.lengthSq() === 0 || !Number.isFinite(direction.x)) direction.copy(VIEWS["3d"]);
    const aspect = this.#camera.aspect || 1;
    const fov = (this.#camera.fov * Math.PI) / 180;
    // Distance pour que la pièce tienne en hauteur et en largeur, avec une marge pour les étiquettes.
    const fit = Math.max(this.#radius / Math.sin(fov / 2), this.#radius / Math.sin(Math.atan(Math.tan(fov / 2) * aspect)));
    this.#camera.position.copy(this.#center).add(direction.multiplyScalar(fit * 1.08));
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
    const camera = this.#camera.position;
    this.#onRender({
      project: ([x, y, z]) => {
        const p = new Vector3(x, y, z).project(this.#camera);
        return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
      },
      facing: ([x, y, z], [nx, ny, nz]) => (camera.x - x) * nx + (camera.y - y) * ny + (camera.z - z) * nz > 0,
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
    this.#clear();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }
}
