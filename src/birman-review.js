import * as THREE from '../vendor/three.module.js';
import { loadBirmanCat } from './birman-cat.js';

const $ = selector => document.querySelector(selector);
const labels = {
  idle: '原始待机', walk: '原地行走', happy: '开心回应', eating: '低头进食',
  play_ball: '拨弄小球', play_wand: '追逗猫棒', lazy: '坐姿打盹',
  angry: '生气警告', scared: '受到惊吓', sick: '虚弱不适',
};
const viewPresets = {
  front: [0, .14], left: [Math.PI / 2, .14], right: [-Math.PI / 2, .14],
  quarter: [.62, .28], back: [Math.PI, .14],
};
const host = $('#review-stage');
let renderer, scene, camera, cat, frameId, observer;
let selected = 'idle', paused = false, yaw = .62, pitch = .28, zoom = 1;
let fitDiameter = 4.8, elapsed = 0, previousTime = 0;
const target = new THREE.Vector3(0, 1.25, 0);
const size = new THREE.Vector2();
let pointer = null;

function updateCamera() {
  if (!camera || !renderer) return;
  const { width, height } = host.getBoundingClientRect();
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const viewHeight = fitDiameter / Math.min(aspect, 1) / zoom;
  camera.left = -viewHeight * aspect / 2;
  camera.right = viewHeight * aspect / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.position.copy(target).add(new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch),
  ).multiplyScalar(8));
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  renderer.getSize(size);
  if (size.x !== Math.round(width) || size.y !== Math.round(height)) {
    renderer.setSize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)), false);
  }
}

// Include only visible geometry: hidden donor hats must not enlarge the fit.
// A sphere-sized view keeps the whole tail inside the frame at every azimuth.
function fitModel() {
  if (!cat) return;
  cat.model.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  cat.model.traverseVisible(node => {
    if (!node.isMesh || !node.geometry) return;
    if (node.isSkinnedMesh) {
      node.computeBoundingBox();
      part.copy(node.boundingBox);
    } else {
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      part.copy(node.geometry.boundingBox);
    }
    box.union(part.applyMatrix4(node.matrixWorld));
  });
  if (!box.isEmpty()) {
    box.getCenter(target);
    fitDiameter = box.getBoundingSphere(new THREE.Sphere()).radius * 2.28;
  }
  zoom = 1;
  updateCamera();
}

function setView(name) {
  [yaw, pitch] = viewPresets[name] || viewPresets.quarter;
  for (const button of document.querySelectorAll('[data-view]')) {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  updateCamera();
}

function clearPreset() {
  for (const button of document.querySelectorAll('[data-view]')) {
    button.classList.remove('active');
    button.setAttribute('aria-pressed', 'false');
  }
}

function selectClip(name) {
  selected = name;
  paused = false;
  $('#pause').textContent = '暂停动作';
  $('#pause').setAttribute('aria-pressed', 'false');
  $('#play-status').textContent = '播放中';
  renderer.domElement.dataset.paused = 'false';
  for (const button of document.querySelectorAll('[data-clip]')) {
    const active = button.dataset.clip === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  $('#clip-status').textContent = `${labels[name] || name} · ${name}`;
  // Selecting a new clip starts playback, including after an inspection pause.
  cat.update(0, elapsed, { action: selected, moving: selected === 'walk' });
  renderer.domElement.dataset.animation = cat.currentAnimation || selected;
}

function installInteraction() {
  host.addEventListener('pointerdown', event => {
    if (pointer || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    host.setPointerCapture(event.pointerId);
    host.focus({ preventScroll: true });
  });
  host.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    yaw -= (event.clientX - pointer.x) * .008;
    pitch = THREE.MathUtils.clamp(pitch + (event.clientY - pointer.y) * .006, -.2, 1.25);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    clearPreset();
    updateCamera();
  });
  const release = event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    pointer = null;
  };
  host.addEventListener('pointerup', release);
  host.addEventListener('pointercancel', release);
  host.addEventListener('lostpointercapture', () => { pointer = null; });
  host.addEventListener('wheel', event => {
    event.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom * Math.exp(-event.deltaY * .001), .7, 2.6);
    updateCamera();
  }, { passive: false });
  host.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', '+', '-', '='].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') { setView('quarter'); fitModel(); return; }
    if (event.key === 'ArrowLeft') yaw += .13;
    if (event.key === 'ArrowRight') yaw -= .13;
    if (event.key === 'ArrowUp') pitch += .09;
    if (event.key === 'ArrowDown') pitch -= .09;
    if (event.key === '+' || event.key === '=') zoom *= 1.1;
    if (event.key === '-') zoom /= 1.1;
    zoom = THREE.MathUtils.clamp(zoom, .7, 2.6);
    pitch = THREE.MathUtils.clamp(pitch, -.2, 1.25);
    clearPreset();
    updateCamera();
  });
  for (const button of document.querySelectorAll('[data-view]')) {
    button.addEventListener('click', () => setView(button.dataset.view));
  }
  $('#fit-view').addEventListener('click', fitModel);
  $('#pause').addEventListener('click', () => {
    paused = !paused;
    $('#pause').textContent = paused ? '继续动作' : '暂停动作';
    $('#pause').setAttribute('aria-pressed', String(paused));
    $('#play-status').textContent = paused ? '已暂停' : '播放中';
    renderer.domElement.dataset.paused = String(paused);
  });
  for (const button of document.querySelectorAll('[data-hat]')) {
    const id = button.dataset.hat;
    button.disabled = id !== 'none' && !cat.availableHats.includes(id);
    button.addEventListener('click', () => {
      const activeHat = cat.setHat(id);
      for (const choice of document.querySelectorAll('[data-hat]')) {
        const active = choice.dataset.hat === activeHat;
        choice.classList.toggle('active', active);
        choice.setAttribute('aria-pressed', String(active));
      }
      renderer.domElement.dataset.hat = activeHat;
      fitModel();
    });
  }
}

function frame(now) {
  const dt = Math.min(.1, Math.max(0, (now - (previousTime || now)) / 1000));
  previousTime = now;
  if (cat && !paused && !document.hidden) {
    elapsed += dt;
    cat.update(dt, elapsed, { action: selected, moving: selected === 'walk' });
    renderer.domElement.dataset.animation = cat.currentAnimation || selected;
  }
  renderer.render(scene, camera);
  frameId = requestAnimationFrame(frame);
}

async function init() {
  if (location.protocol === 'file:') throw new Error('请通过 http://127.0.0.1:8770/birman-review.html 打开，而不是直接双击 HTML。');
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#f0e8db');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', 'Birman 猫模型与动画');
  host.append(renderer.domElement);
  camera = new THREE.OrthographicCamera(-3, 3, 3, -3, .1, 40);
  scene.add(new THREE.HemisphereLight('#fffaf3', '#b4ada0', 1.3));
  const key = new THREE.DirectionalLight('#fff9ef', 2);
  key.position.set(-3, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .1, far: 20 });
  key.shadow.normalBias = .025;
  key.shadow.bias = -.00015;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#f4f7ff', .65);
  fill.position.set(4, 3, -2);
  scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#e5dccd', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.015;
  floor.receiveShadow = true;
  scene.add(floor);
  updateCamera();
  // Direct loader intentionally has no old-cat fallback in this acceptance page.
  cat = await loadBirmanCat();
  scene.add(cat.group);
  cat.setHat('none');
  const names = cat.group.userData.quality.clipNames;
  const ordered = [...Object.keys(labels).filter(name => names.includes(name)), ...names.filter(name => !Object.hasOwn(labels, name))];
  for (const name of ordered) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.clip = name;
    button.append(document.createTextNode(labels[name] || name));
    const code = document.createElement('small');
    code.textContent = name;
    button.append(code);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => selectClip(name));
    $('#clip-buttons').append(button);
  }
  renderer.domElement.dataset.character = 'birman';
  renderer.domElement.dataset.hat = 'none';
  renderer.domElement.dataset.paused = 'false';
  $('#clip-count').textContent = `${names.length} 个片段`;
  $('#asset-clips').textContent = `${names.length} 个骨骼动画 / 原始 idle ${cat.group.userData.quality.idleDuration ?? '—'} 秒`;
  $('#asset-status').textContent = cat.group.userData.quality.originalRig
    ? `原生 ${cat.group.userData.quality.sourceBoneCount} 骨骼 · 未使用旧绑定`
    : '非原生绑定资产 · 请检查载入文件';
  $('#pause').disabled = false;
  selectClip('idle');
  fitModel();
  installInteraction();
  observer = new ResizeObserver(updateCamera);
  observer.observe(host);
  $('#load-status').hidden = true;
  frameId = requestAnimationFrame(frame);
}

$('#reload').addEventListener('click', () => location.reload());
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  cancelAnimationFrame(frameId);
  observer?.disconnect();
  cat?.dispose();
  renderer?.dispose();
});
init().catch(error => {
  console.error('Birman acceptance viewer:', error);
  $('#load-status').hidden = true;
  $('#load-error').hidden = false;
  $('#error-detail').textContent = error.message || String(error);
  $('#asset-status').textContent = '加载失败 · 未使用旧猫回退';
  $('#clip-status').textContent = '尚未载入模型';
  $('#play-status').textContent = '未播放';
});
