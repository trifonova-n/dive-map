// Typed ES module conversion of mobile.js
// Original: (C) 2018 Minoru Akagi, SPDX-License-Identifier: MIT

import "./types";

let ARMode = false;
let orbitControls: THREE.OrbitControls;
let devControls: THREE.DeviceOrientationControls;
let oldFOV: number;

/**
 * Early setup: sets Q3D.Config.AR defaults and patches Q3D.application
 * methods for mobile/AR support. Must be called BEFORE app.init().
 */
export function setupMobile(): void {
  Q3D.Config.AR = {
    DH: 1.5,
    FOV: 70,
    MND: 0,
  };

  const app = Q3D.application;

  app.start = function () {
    if (ARMode) devControls.connect();
    else orbitControls.enabled = true;
  };

  app.pause = function () {
    if (ARMode) devControls.disconnect();
    else orbitControls.enabled = false;
  };

  app.resume = function () {
    if (ARMode) devControls.connect();
    else orbitControls.enabled = true;
  };

  app.eventListener.resize = function () {
    let width: number, height: number;
    if (ARMode) {
      const v = Q3D.E("video") as HTMLVideoElement;
      const asp = window.innerWidth / window.innerHeight;
      const vasp = v.videoWidth / v.videoHeight;
      if (vasp > asp) {
        width = window.innerWidth;
        height = Math.floor(width / vasp);
      } else {
        height = window.innerHeight;
        width = Math.floor(height * vasp);
      }
    } else {
      width = window.innerWidth;
      height = window.innerHeight;
    }
    app.setCanvasSize(width, height);
    app.render();
  };

  // Wrap cameraAction.move to add device height offset
  const origMove = app.cameraAction.move;
  app.cameraAction.move = function (x?: number, y?: number, z?: number) {
    origMove.call(
      app.cameraAction,
      app.queryTargetPosition.x,
      app.queryTargetPosition.y,
      app.queryTargetPosition.z +
        Q3D.Config.AR.DH * app.scene.userData.zScale
    );
  };

  // Wrap setRotateAnimationMode to show/hide stop button
  const origSetRotate = app.setRotateAnimationMode;
  app.setRotateAnimationMode = function (enabled: boolean) {
    origSetRotate.call(app, enabled);
    Q3D.E("stop-button").style.display = enabled ? "block" : "none";
  };
}

/**
 * Initialize mobile controls, load settings, and wire up UI event listeners.
 * Must be called AFTER app.init().
 */
export function initMobile(): void {
  const app = Q3D.application;

  orbitControls = app.controls;
  devControls = new THREE.DeviceOrientationControls(app.camera);
  devControls.alphaOffset =
    (-Q3D.Config.AR.MND * Math.PI) / 180;

  oldFOV = app.camera.fov;

  // Load settings from localStorage
  try {
    const data = JSON.parse(
      localStorage.getItem("Qgis2threejs") || "null"
    );
    if (data) {
      Q3D.Config.AR.FOV = data.fov;
    }
  } catch (e) {
    console.warn(e);
  }

  // --- Event listeners ---

  // AR mode switch
  Q3D.E("ar-checkbox").addEventListener("change", function (this: HTMLInputElement) {
    if (this.checked) startARMode();
    else stopARMode();
  });

  // Current location button
  Q3D.E("current-location").addEventListener("click", function () {
    if (ARMode) moveToCurrentLocation();
    else zoomToCurrentLocation();
  });

  // Layers button
  Q3D.E("layers-button").addEventListener("click", function () {
    const panel = Q3D.gui.layerPanel;
    if (!panel.initialized) panel.init();

    const visible = panel.isVisible();
    hideAll();

    if (visible) panel.hide();
    else {
      panel.show();
      Q3D.E("layers-button").classList.add("pressed");
    }
  });

  // Settings button
  Q3D.E("settings-button").addEventListener("click", function () {
    const visible = Q3D.E("settings").classList.contains("visible");
    hideAll();
    if (!visible) {
      (Q3D.E("fov") as HTMLInputElement).value = String(Q3D.Config.AR.FOV);
      Q3D.E("settings").classList.add("visible");
      Q3D.E("settings-button").classList.add("pressed");
    }
  });

  Q3D.E("settings-ok").addEventListener("click", function () {
    Q3D.Config.AR.FOV = Number((Q3D.E("fov") as HTMLInputElement).value);
    if (ARMode) {
      app.camera.fov = Q3D.Config.AR.FOV;
      app.camera.updateProjectionMatrix();
    }

    hideAll();

    try {
      if ((Q3D.E("save-in-storage") as HTMLInputElement).checked) {
        const data = { fov: Q3D.Config.AR.FOV };
        localStorage.setItem("Qgis2threejs", JSON.stringify(data));
      }
    } catch (e) {
      console.warn(e);
    }
  });

  Q3D.E("settings-cancel").addEventListener("click", function () {
    hideAll();
  });

  // Info button
  Q3D.E("info-button").addEventListener("click", function () {
    const active = Q3D.E("info-button").classList.contains("pressed");
    hideAll();
    if (!active) {
      Q3D.gui.showInfo();
      Q3D.E("info-button").classList.add("pressed");
    }
  });

  // Stop orbit button
  Q3D.E("stop-button").addEventListener("click", function () {
    app.setRotateAnimationMode(false);
  });

  // "Start AR mode here" / "Move here" popup buttons (replacing inline onclick)
  document.getElementById("start-ar-here-btn")
    ?.addEventListener("click", startARModeHere);
  document.getElementById("move-here-btn")
    ?.addEventListener("click", moveHere);

  // --- GUI patches ---

  const origPopupHide = Q3D.gui.popup.hide;
  Q3D.gui.popup.hide = function () {
    Q3D.E("info-button").classList.remove("pressed");
    origPopupHide.call(Q3D.gui.popup);
  };

  const origLayerPanelHide = Q3D.gui.layerPanel.hide;
  Q3D.gui.layerPanel.hide = function () {
    Q3D.E("layers-button").classList.remove("pressed");
    origLayerPanelHide.call(Q3D.gui.layerPanel);
  };
}

// --- AR mode lifecycle ---

export function startARMode(position?: THREE.Vector3): void {
  const app = Q3D.application;
  ARMode = true;
  app.camera.fov = Q3D.Config.AR.FOV;
  app.camera.updateProjectionMatrix();

  if (position === undefined) {
    app.camera.position.set(0, 0, 30);
    Q3D.E("current-location").classList.add("touchme");
  } else {
    app.camera.position.copy(position);
  }

  if (Q3D.Config.bgColor !== null) {
    app.renderer.setClearColor(0, 0);
  }

  if (orbitControls.autoRotate) {
    app.setRotateAnimationMode(false);
  }
  orbitControls.enabled = false;

  app.controls = devControls as unknown as THREE.OrbitControls;
  (app.controls as unknown as THREE.DeviceOrientationControls).connect();

  app.animation.start();

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "environment" } })
    .then(function (stream) {
      const v = Q3D.E("video") as HTMLVideoElement;
      v.addEventListener("loadedmetadata", function () {
        app.eventListener.resize();
      });
      v.srcObject = stream;

      Q3D.E("view").classList.add("transparent");
    })
    .catch(function (error) {
      alert(error);
    });

  document.querySelectorAll(".action-move").forEach(function (elm) {
    elm.classList.toggle("hidden");
  });
  document.querySelector(".action-zoom")?.classList.add("hidden");
  document.querySelector(".action-orbit")?.classList.add("hidden");
}

function startARModeHere(): void {
  const app = Q3D.application;
  const vec3 = new THREE.Vector3();
  vec3.copy(app.queryTargetPosition);
  vec3.z += Q3D.Config.AR.DH * app.scene.userData.zScale;
  startARMode(vec3);
  (Q3D.E("ar-checkbox") as HTMLInputElement).checked = true;
}

function moveHere(): void {
  const app = Q3D.application;
  app.camera.position.copy(app.queryTargetPosition);
  app.camera.position.z +=
    Q3D.Config.AR.DH * app.scene.userData.zScale;
}

function stopARMode(): void {
  const app = Q3D.application;
  ARMode = false;

  devControls.disconnect();

  app.controls = orbitControls;
  app.controls.enabled = true;

  app.animation.stop();
  Q3D.E("current-location").classList.remove("touchme");

  orbitControls.reset();

  (Q3D.E("video") as HTMLVideoElement).srcObject = null;

  Q3D.E("view").classList.remove("transparent");

  app.camera.fov = oldFOV;
  app.camera.updateProjectionMatrix();
  app.setCanvasSize(window.innerWidth, window.innerHeight);

  if (Q3D.Config.bgColor !== null)
    app.renderer.setClearColor(Q3D.Config.bgColor || 0, 1);

  document.querySelectorAll(".action-move").forEach(function (elm) {
    elm.classList.toggle("hidden");
  });
  document.querySelector(".action-zoom")?.classList.remove("hidden");
  document.querySelector(".action-orbit")?.classList.remove("hidden");
}

// --- Geolocation ---

function getCurrentPosition(
  callback: (pt: { x: number; y: number; z: number }) => void
): void {
  const app = Q3D.application;
  Q3D.gui.popup.show("Fetching current location...");

  navigator.geolocation.getCurrentPosition(
    function (position) {
      const pos = position.coords;
      if (
        pos.longitude === undefined ||
        pos.latitude === undefined ||
        pos.altitude === undefined
      ) {
        Q3D.gui.popup.show("Could not fetch current location.", "", false, 3000);
        return;
      }

      // Get z from DEM layer via raycasting
      const objects: THREE.Object3D[] = [];
      for (const lyrId in app.scene.mapLayers) {
        const layer = app.scene.mapLayers[lyrId] as {
          visibleObjects?: () => THREE.Object3D[];
        };
        if ((layer as unknown) instanceof Q3DDEMLayer) {
          objects.push(...(layer.visibleObjects?.() || []));
        }
      }

      const pt = app.scene.toWorldCoordinates(
        { x: pos.longitude, y: pos.latitude, z: pos.altitude! },
        true
      );
      const vec3 = new THREE.Vector3();
      vec3.copy(pt as unknown as THREE.Vector3);
      vec3.z = 99999;

      const ray = new THREE.Raycaster();
      ray.set(vec3, new THREE.Vector3(0, 0, -1));

      const objs = ray.intersectObjects(objects);
      if (objs.length) {
        pt.z =
          (objs[0].point.z + Q3D.Config.AR.DH) *
          app.scene.userData.zScale;
      }

      callback(pt);

      let acc = Number.parseFloat(String(pos.accuracy));
      const accStr = acc > 2 ? acc.toFixed(0) : acc.toFixed(1);
      const msg =
        "Accuracy: <span class='accuracy'>" + accStr + "</span>m";
      Q3D.gui.popup.show(msg, "Current location", false, 5000);
    },
    function (error) {
      Q3D.gui.popup.hide();
      alert("Cannot get current location: " + error.message);
    },
    { enableHighAccuracy: true }
  );
}

export function moveToCurrentLocation(): void {
  Q3D.E("current-location").classList.remove("touchme");

  getCurrentPosition(function (pt) {
    Q3D.application.cameraAction.move(pt.x, pt.y, pt.z);
  });
}

function zoomToCurrentLocation(): void {
  getCurrentPosition(function (pt) {
    const app = Q3D.application;
    app.queryMarker.position.set(pt.x, pt.y, pt.z);
    app.queryMarker.visible = true;
    app.queryMarker.updateMatrixWorld();
    app.cameraAction.zoom(pt.x, pt.y, pt.z);
  });
}

// --- Utility ---

function hideAll(): void {
  Q3D.E("layers-button").classList.remove("pressed");
  Q3D.E("settings-button").classList.remove("pressed");
  Q3D.E("info-button").classList.remove("pressed");

  Q3D.E("settings").classList.remove("visible");

  Q3D.gui.clean();
}
