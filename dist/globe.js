// The globe scene. Forked from the conference globe (Conference Mind Map, dist/globe.js).
// It keeps the Earth texture, detail tiles, atmosphere, graticule, stars, zoom, pinch,
// idle spin, and focus motion. Pins are not drawn here: later milestones register a
// frame callback with onFrame and project positions with vector().

import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { createEarthDetail } from './globe-detail.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => t * t * (3 - 2 * t);
const MIN_ZOOM = 1.08, MAX_ZOOM = 9, IDLE_DELAY = 5000, RADIUS = 1;

export function vector(location, radius = 1.013) {
  const lat = THREE.MathUtils.degToRad(location.lat), lng = THREE.MathUtils.degToRad(location.lng);
  return new THREE.Vector3(radius * Math.cos(lat) * Math.cos(lng), radius * Math.sin(lat), -radius * Math.cos(lat) * Math.sin(lng));
}

export function createGlobe({ stage, container, onStatus = () => {}, isPaused = () => false }) {
  const frameCallbacks = new Set(), touchPoints = new Map();
  let renderer, scene, camera, controls, updateEarthDetail;
  let stageWidth = 1, stageHeight = 1, lastFrame = 0, lastInteraction = performance.now();
  let spinning = !reducedMotion, dragging = false, pinchDistance = 0;
  let zoomMotion = null, zoomTarget = null, focusMotion = null;
  let viewShift = { x: 0, y: 0 }, slideMotion = null;
  const overlay = new THREE.Group();

  // Move the sphere sideways so an open card does not cover it (from the conference globe).
  function slideTo(x, y) { slideMotion = { from: { ...viewShift }, to: { x, y }, start: performance.now(), duration: reducedMotion ? 0 : 850 }; }
  function updateSlide(time) {
    if (!slideMotion) return;
    const m = slideMotion, t = m.duration ? Math.min(1, (time - m.start) / m.duration) : 1;
    viewShift.x = THREE.MathUtils.lerp(m.from.x, m.to.x, ease(t));
    viewShift.y = THREE.MathUtils.lerp(m.from.y, m.to.y, ease(t));
    camera.setViewOffset(stageWidth, stageHeight, viewShift.x, viewShift.y, stageWidth, stageHeight);
    if (t === 1) slideMotion = null;
  }

  // Routes drawn as great-circle arcs just above the surface.
  function arc(a, b) {
    const va = vector(a, 1.004), vb = vector(b, 1.004);
    const angle = va.angleTo(vb), steps = Math.max(2, Math.ceil(angle / 0.01));
    const points = [];
    for (let i = 0; i <= steps; i++) points.push(new THREE.Vector3().copy(va).lerp(vb, i / steps).setLength(1.004));
    return points;
  }
  function setRoutes(routes = []) {
    for (const child of [...overlay.children]) { overlay.remove(child); child.geometry.dispose(); child.material.dispose(); }
    for (const route of routes) {
      const points = [];
      for (let i = 1; i < route.points.length; i++) points.push(...arc({ lat: route.points[i - 1][0], lng: route.points[i - 1][1] }, { lat: route.points[i][0], lng: route.points[i][1] }));
      if (points.length < 2) continue;
      const material = new THREE.LineBasicMaterial({ color: route.color ?? 0xefcc88, transparent: true, opacity: 0.9, depthTest: true });
      overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }
  }

  // Screen position of a point on the globe, or null when it is behind the Earth.
  const scratch = new THREE.Vector3();
  function project(position) {
    if (position.dot(camera.position) - position.lengthSq() < 0.035) return null;
    scratch.copy(position).project(camera);
    return { x: (scratch.x + 1) * stageWidth / 2, y: (1 - scratch.y) * stageHeight / 2 };
  }

  const setSpin = value => { spinning = value; controls.autoRotate = value; };
  const activity = () => { lastInteraction = performance.now(); setSpin(false); };

  function zoomTo(distance) {
    activity();
    zoomTarget = THREE.MathUtils.clamp(distance, MIN_ZOOM, MAX_ZOOM);
    zoomMotion = { from: camera.position.length(), to: zoomTarget, start: performance.now(), duration: reducedMotion ? 0 : 240 };
  }
  function gestureZoom(distance) {
    activity(); zoomMotion = null; zoomTarget = null;
    camera.position.setLength(THREE.MathUtils.clamp(distance, MIN_ZOOM, MAX_ZOOM));
  }
  function resetCamera() {
    camera.position.set(-0.62, 1.3, 3.55);
    if (stageWidth <= 650) camera.position.setLength(Math.min(6.8, Math.max(3.83, 3.83 * 0.95 / camera.aspect)));
  }
  function focusOn(position) {
    activity();
    const from = camera.position.clone().normalize(), to = position.clone().normalize();
    focusMotion = { from, rotation: new THREE.Quaternion().setFromUnitVectors(from, to), start: performance.now(), duration: reducedMotion ? 0 : 850 };
  }

  function updateMotion(time, delta) {
    if (zoomMotion) {
      const t = zoomMotion.duration ? Math.min(1, (time - zoomMotion.start) / zoomMotion.duration) : 1;
      camera.position.setLength(THREE.MathUtils.lerp(zoomMotion.from, zoomMotion.to, 1 - Math.pow(1 - t, 3)));
      if (t === 1) { zoomMotion = null; zoomTarget = null; }
    }
    if (focusMotion) {
      const m = focusMotion, t = m.duration ? Math.min(1, (time - m.start) / m.duration) : 1;
      const q = new THREE.Quaternion().slerp(m.rotation, ease(t));
      camera.position.copy(m.from.clone().applyQuaternion(q).multiplyScalar(camera.position.length()));
      camera.lookAt(controls.target);
      if (t === 1) focusMotion = null;
    }
    const idle = !reducedMotion && !dragging && !isPaused() && time - lastInteraction >= IDLE_DELAY;
    if (idle && !spinning) setSpin(true);
    controls.autoRotateSpeed = THREE.MathUtils.lerp(controls.autoRotateSpeed, spinning ? 0.22 : 0, 1 - Math.exp(-delta * 3));
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    stageWidth = Math.max(1, rect.width); stageHeight = Math.max(1, rect.height);
    renderer.setSize(stageWidth, stageHeight);
    camera.aspect = stageWidth / stageHeight;
    if (viewShift.x || viewShift.y) camera.setViewOffset(stageWidth, stageHeight, viewShift.x, viewShift.y, stageWidth, stageHeight);
    camera.updateProjectionMatrix();
  }

  function renderFrame(time) {
    requestAnimationFrame(renderFrame);
    if (document.hidden) return;
    const delta = lastFrame ? Math.min((time - lastFrame) / 1000, 0.05) : 1 / 60;
    lastFrame = time;
    updateMotion(time, delta);
    controls.rotateSpeed = THREE.MathUtils.clamp(0.24 * (camera.position.length() - 1) / 2.83, 0.015, 0.3);
    controls.update(delta);
    updateSlide(time);
    camera.updateMatrixWorld();
    updateEarthDetail(camera, time, delta);
    renderer.render(scene, camera);
    for (const callback of frameCallbacks) callback({ time, delta, camera, width: stageWidth, height: stageHeight });
  }

  // Scene
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(39, 1, 0.01, 100);
  camera.position.set(-0.62, 1.3, 3.55);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x060b16, 0);
  container.append(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enablePan: false, enableZoom: false, enableDamping: true, dampingFactor: 0.08, minDistance: MIN_ZOOM, maxDistance: MAX_ZOOM, rotateSpeed: 0.5, autoRotate: spinning, autoRotateSpeed: 0.22 });
  controls.addEventListener('start', () => { dragging = true; focusMotion = null; activity(); });
  controls.addEventListener('end', () => { dragging = false; lastInteraction = performance.now(); });

  const canvas = renderer.domElement;
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stageHeight : 1);
    const scale = THREE.MathUtils.clamp((camera.position.length() - 1) / 2.83, 0.1, 1);
    const distance = (zoomTarget ?? camera.position.length()) * Math.exp(THREE.MathUtils.clamp(pixels * (event.ctrlKey ? 0.006 : 0.0012) * scale, -0.35, 0.35));
    if (event.ctrlKey) gestureZoom(distance); else zoomTo(distance);
  }, { passive: false });
  canvas.addEventListener('dblclick', event => { event.preventDefault(); zoomTo((zoomTarget ?? camera.position.length()) * 0.7); });
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.size === 2) { const [a, b] = [...touchPoints.values()]; pinchDistance = Math.hypot(a.x - b.x, a.y - b.y); } else pinchDistance = 0;
  });
  canvas.addEventListener('pointermove', event => {
    if (!touchPoints.has(event.pointerId)) return;
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.size === 2) {
      const [a, b] = [...touchPoints.values()], distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 0 && distance > 0) gestureZoom(camera.position.length() * pinchDistance / distance);
      pinchDistance = distance;
    }
  });
  const releaseTouch = event => { touchPoints.delete(event.pointerId); pinchDistance = 0; };
  canvas.addEventListener('pointerup', releaseTouch);
  canvas.addEventListener('pointercancel', releaseTouch);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onStatus('The globe paused. Reload this page to restore it.'); });

  scene.add(new THREE.AmbientLight(0xabcde2, 2));
  const sunlight = new THREE.DirectionalLight(0xcbe8ff, 3); sunlight.position.set(-3, 3, 5); scene.add(sunlight);
  const blueLight = new THREE.DirectionalLight(0x2b74af, 0.6); blueLight.position.set(4, -2, -3); scene.add(blueLight);

  const material = new THREE.MeshStandardMaterial({ color: 0xc0d7e4, roughness: 1, metalness: 0, emissive: 0x172c43, emissiveIntensity: 0.2 });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 96, 64), material));
  new THREE.TextureLoader().load('assets/earth-base-v2.jpg', texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    material.map = texture; material.needsUpdate = true;
  }, undefined, () => onStatus('The Earth image could not load. Reload the page to try again.'));
  updateEarthDetail = createEarthDetail(scene, renderer, material);

  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.026, 72, 48), new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 normalDirection; varying vec3 viewDirection; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);normalDirection=normalize(normalMatrix*normal);viewDirection=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
    fragmentShader: 'varying vec3 normalDirection; varying vec3 viewDirection; void main(){float rim=pow(1.0-max(dot(normalize(normalDirection),normalize(viewDirection)),0.0),4.0);gl_FragColor=vec4(0.24,0.60,0.94,rim*0.43);}',
    transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending,
  })));

  // Faint latitude and longitude lines over the Earth image.
  const gridMaterial = new THREE.LineBasicMaterial({ color: 0x99d2e7, transparent: true, opacity: 0.08 });
  for (let lat = -60; lat <= 60; lat += 30) {
    const points = []; for (let lng = -180; lng <= 180; lng += 3) points.push(vector({ lat, lng }, 1.003));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial));
  }
  for (let lng = -180; lng < 180; lng += 30) {
    const points = []; for (let lat = -90; lat <= 90; lat += 3) points.push(vector({ lat, lng }, 1.003));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial));
  }

  scene.add(overlay);

  const starPositions = []; let seed = 41;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 1800; i++) {
    const theta = random() * Math.PI * 2, phi = Math.acos(2 * random() - 1), r = 25 + random() * 20;
    starPositions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xc9dcea, size: 0.065, transparent: true, opacity: 0.67, sizeAttenuation: true })));

  new ResizeObserver(resize).observe(stage);
  resize(); resetCamera(); setSpin(spinning);
  for (const type of ['pointerdown', 'wheel']) canvas.addEventListener(type, activity, { passive: true });
  document.addEventListener('visibilitychange', () => { lastInteraction = performance.now(); lastFrame = 0; });
  requestAnimationFrame(renderFrame);

  return {
    vector,
    focusOn,
    slideTo,
    setRoutes,
    project,
    zoomIn: () => zoomTo((zoomTarget ?? camera.position.length()) * 0.8),
    zoomOut: () => zoomTo((zoomTarget ?? camera.position.length()) * 1.25),
    reset() { zoomMotion = null; zoomTarget = null; focusMotion = null; resetCamera(); controls.target.set(0, 0, 0); controls.update(); activity(); },
    distance: () => zoomTarget ?? camera.position.length(),
    limits: { min: MIN_ZOOM, max: MAX_ZOOM },
    onFrame(callback) { frameCallbacks.add(callback); return () => frameCallbacks.delete(callback); },
    activity,
  };
}
