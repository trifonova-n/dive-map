// Ambient type declarations for global libraries loaded via <script> tags.

export {};

declare global {
  namespace THREE {
    class Vector3 {
      x: number;
      y: number;
      z: number;
      constructor(x?: number, y?: number, z?: number);
      copy(v: Vector3): this;
      set(x: number, y: number, z: number): this;
      project(camera: Camera): this;
    }

    class Box3 {
      constructor();
      isEmpty(): boolean;
      expandByObject(obj: Object3D): this;
      getSize(target: Vector3): Vector3;
      getCenter(target: Vector3): Vector3;
    }

    class Object3D {
      position: Vector3;
      visible: boolean;
      uuid: string;
      name: string;
      children: Object3D[];
      parent: Object3D | null;
      isMesh?: boolean;
      isLine?: boolean;
      material: Material;
      updateMatrixWorld(force?: boolean): void;
    }

    class Scene extends Object3D {
      traverse(callback: (obj: Object3D) => void): void;
    }

    class Camera extends Object3D {
      fov: number;
      lookAt(target: Vector3): void;
      updateProjectionMatrix(): void;
    }

    class PerspectiveCamera extends Camera {}

    class Mesh extends Object3D {
      isMesh: boolean;
    }

    class Group extends Object3D {}

    interface Material {
      color: { setHex(hex: number): void };
      needsUpdate: boolean;
    }

    class WebGLRenderer {
      domElement: HTMLCanvasElement;
      setClearColor(color: number, alpha: number): void;
    }

    interface OrbitControls {
      enabled: boolean;
      autoRotate: boolean;
      target: Vector3;
      update(): void;
      reset(): void;
    }

    class DeviceOrientationControls {
      constructor(camera: Camera);
      alphaOffset: number;
      connect(): void;
      disconnect(): void;
    }

    class Raycaster {
      set(origin: Vector3, direction: Vector3): void;
      intersectObjects(
        objects: Object3D[]
      ): Array<{ point: Vector3; object: Object3D }>;
    }
  }

  function proj4(
    fromCRS: string,
    toCRS: string,
    coord: [number, number]
  ): [number, number];

  interface Q3DSceneUserData {
    origin: { x: number; y: number; z: number };
    zScale: number;
    proj?: string;
    proj4?: string;
    crs?: string;
    crsDef?: string;
    projection?: string;
    baseExtent: {
      cx: number;
      cy: number;
      width: number;
      height: number;
      rotation: number;
    };
    light: string;
    pivot?: { x: number; y: number; z: number };
  }

  interface Q3DMeasure {
    isActive: boolean;
    markerGroup: THREE.Group;
    lineGroup: THREE.Group;
    addPoint(pt: THREE.Vector3): unknown;
    removeLastPoint(): unknown;
    clear(): unknown;
    start(): void;
    formatLength(length: number): string;
    showResult(): void;
  }

  interface Q3DScene extends THREE.Scene {
    userData: Q3DSceneUserData;
    mapLayers: Record<string, unknown>;
    toMapCoordinates(pt: THREE.Vector3): { x: number; y: number; z: number };
    toWorldCoordinates(
      pt: { x: number; y: number; z: number },
      isLonLat?: boolean
    ): { x: number; y: number; z: number };
    loadJSONObject(obj: unknown): void;
  }

  interface Q3DCameraAction {
    move(x?: number, y?: number, z?: number): void;
    zoom(x?: number, y?: number, z?: number, dist?: number): void;
    zoomToLayer(layer: unknown): void;
    orbit(x?: number, y?: number, z?: number): void;
  }

  interface Q3DApplication {
    container: HTMLElement;
    width: number;
    height: number;
    renderer: THREE.WebGLRenderer;
    scene: Q3DScene;
    camera: THREE.PerspectiveCamera;
    controls: THREE.OrbitControls;
    measure: Q3DMeasure;
    cameraAction: Q3DCameraAction;
    queryMarker: THREE.Mesh;
    queryTargetPosition: THREE.Vector3;
    animation: {
      isActive: boolean;
      start(): void;
      stop(): void;
    };
    eventListener: Record<string, (...args: unknown[]) => void>;
    urlParams: Record<string, string>;
    init(container: HTMLElement): void;
    start(): void;
    pause(): void;
    resume(): void;
    render(updateControls?: boolean): void;
    setCanvasSize(width: number, height: number): void;
    setLabelVisible(visible: boolean): void;
    setRotateAnimationMode(enabled: boolean): void;
    setWireframeMode(wireframe: boolean): void;
    loadSceneFile(
      url: string,
      onSceneFileLoaded?: (scene: Q3DScene) => void,
      onSceneLoaded?: (scene: Q3DScene) => void
    ): void;
    loadJSONObject(obj: unknown): void;
  }

  interface Q3DGuiPopup {
    show(
      content: string | HTMLElement,
      title?: string,
      modal?: boolean,
      duration?: number
    ): void;
    hide(): void;
    isVisible(): boolean;
  }

  interface Q3DGuiLayerPanel {
    initialized: boolean;
    init(): void;
    show(): void;
    hide(): void;
    isVisible(): boolean;
  }

  interface Q3DGui {
    popup: Q3DGuiPopup;
    layerPanel: Q3DGuiLayerPanel;
    init(): void;
    showInfo(): void;
    showQueryResult(
      point: unknown,
      layer: unknown,
      obj: unknown,
      showCoords?: boolean
    ): void;
    clean(): void;
  }

  interface Q3DConfig {
    coord: { latlon: boolean; visible: boolean };
    viewpoint: unknown;
    localMode: boolean;
    bgColor: number | null;
    northArrow: { enabled: boolean; color: number };
    AR: { DH: number; FOV: number; MND: number };
    [key: string]: unknown;
  }

  interface Q3DStatic {
    application: Q3DApplication;
    gui: Q3DGui;
    Config: Q3DConfig;
    E(id: string): HTMLElement;
    VERSION: string;
    LayerType: Record<string, string>;
    isTouchDevice: boolean;
    deg2rad: number;
  }

  // eslint-disable-next-line no-var
  var Q3D: Q3DStatic;

  // Qgis2threejs layer class used in instanceof checks (getCurrentPosition)
  class Q3DDEMLayer {
    visibleObjects(): THREE.Object3D[];
  }

  interface Window {
    Q3D: Q3DStatic;
    THREE: typeof THREE;
  }
}
