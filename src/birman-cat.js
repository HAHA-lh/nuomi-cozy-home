import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { createTailClearance } from './tail-clearance.js';

export const BIRMAN_ASSET_URL = new URL('../assets/nuomi-birman-native.glb', import.meta.url);
const HAT_DONOR_URL = new URL('../assets/nuomi-blender-refined.glb', import.meta.url);

// Gameplay state names remain independent from the Blender action names.
export const BIRMAN_ACTION_CLIPS = Object.freeze({
  idle: ['idle'],
  pet: ['happy', 'idle'],
  feed: ['eating', 'idle'],
  play: ['play_ball', 'play_wand', 'happy', 'idle'],
  sleep: ['lazy', 'idle'],
  angry: ['angry', 'idle'],
  scared: ['scared', 'idle'],
  sick: ['sick', 'idle'],
  happy: ['happy', 'idle'],
  eating: ['eating', 'idle'],
  lazy: ['lazy', 'idle'],
  play_wand: ['play_wand', 'play_ball', 'idle'],
  play_ball: ['play_ball', 'play_wand', 'idle'],
});

const clipName = name => String(name).split('|').at(-1).trim().toLowerCase().replace(/[ .-]+/g, '_');

export function resolveBirmanClip(state = {}, available = []) {
  const names = new Set(Array.from(available, clipName));
  const requested = state.moving ? ['walk', 'idle'] : (BIRMAN_ACTION_CLIPS[state.action] || BIRMAN_ACTION_CLIPS.idle);
  return requested.find(name => names.has(name)) || null;
}

/** Loads the textured source-derived asset without rebuilding its materials. */
export async function loadBirmanCat(url = BIRMAN_ASSET_URL) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(String(url));
  if (!['Hat_Beret', 'Hat_Leaf', 'Hat_Bunny'].every(name => gltf.scene.getObjectByName(name))) {
    const donor = await loader.loadAsync(String(HAT_DONOR_URL));
    attachBirmanHats(gltf.scene, donor.scene);
  }
  return createBirmanCatController(gltf.scene, gltf.animations);
}

/** Reuse the three existing accessories, never the previous cat body or rig. */
export function attachBirmanHats(model, donor) {
  const anchor = model.getObjectByName('HatAnchor');
  if (!anchor) throw new Error('Birman 猫模型缺少随头部运动的 HatAnchor。');
  for (const name of ['Hat_Beret', 'Hat_Leaf', 'Hat_Bunny']) {
    if (model.getObjectByName(name)) continue;
    const node = donor.getObjectByName(name);
    if (!node) throw new Error(`旧配饰资源缺少 ${name}。`);
    // add(), not attach(): the donor's local transform is relative to its hat seat.
    // The new Blender-authored seat defines the fit and scales all hats together.
    anchor.add(node);
  }
  const retainedGeometry = new Set(), retainedMaterials = new Set(), retainedTextures = new Set();
  const materials = node => Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
  model.traverse(node => {
    if (node.geometry) retainedGeometry.add(node.geometry);
    for (const material of materials(node)) {
      retainedMaterials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) retainedTextures.add(value);
    }
  });
  const geometry = new Set(), materialsToDispose = new Set(), textures = new Set();
  donor.traverse(node => {
    if (node.geometry && !retainedGeometry.has(node.geometry)) geometry.add(node.geometry);
    for (const material of materials(node)) {
      if (!retainedMaterials.has(material)) materialsToDispose.add(material);
      for (const value of Object.values(material)) if (value?.isTexture && !retainedTextures.has(value)) textures.add(value);
    }
  });
  geometry.forEach(value => value.dispose());
  materialsToDispose.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
  donor.clear();
}

/**
 * Y-up, +Z forward, grounded, in-place clips. The app owns placement/heading;
 * AnimationMixer owns the imported rig and morphs. An outer group prevents
 * clip tracks from overwriting app movement or wardrobe camera placement.
 */
export function createBirmanCatController(model, animations = []) {
  if (!model?.isObject3D) throw new Error('Birman 猫模型场景无效。');
  if (!model.getObjectByProperty('isSkinnedMesh', true)) {
    throw new Error('Birman 猫模型缺少蒙皮绑定。');
  }
  const clips = new Map();
  for (const clip of animations) {
    if (clip.duration > 0 && clip.tracks.length) clips.set(clipName(clip.name), clip);
  }
  if (!clips.has('idle')) throw new Error('Birman 猫模型缺少有效的 idle 动画。');

  const group = new THREE.Group();
  group.name = 'Nuomi_Birman_Runtime';
  group.add(model);
  const tailClearance=createTailClearance(model,animations);
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map();
  const hats = Object.fromEntries(['beret', 'leaf', 'bunny'].map(id => [id,
    model.getObjectByName(`Hat_${id[0].toUpperCase()}${id.slice(1)}`)]));
  const hatAnchor = model.getObjectByName('HatAnchor');
  const head = model.getObjectByName('FaceAndHatAnchor') || hatAnchor || model.getObjectByName('head') || model;

  model.traverse(node => {
    if (!node.isMesh) return;
    node.userData.cat = true;
    const outline = node.name.startsWith('outlines_');
    // An inverted hull is only a visible contour, not a second opaque shell
    // for the shadow map. Otherwise it puts the entire textured body in shade.
    node.castShadow = !outline;
    node.receiveShadow = !outline;
    // The character contains alpha-cutout fur cards and baked color layers.
    // Keep imported maps, alpha modes, side flags, roughness and color spaces.
    // Do not turn every material into MeshToonMaterial or force it opaque.
    if (node.isSkinnedMesh) node.frustumCulled = false;
  });

  let current = null;
  let disposed = false;
  let currentHat = 'none';
  const fadingOut = new Map();
  function selectClip(name) {
    if (!name || current?.name === name) return;
    const clip = clips.get(name);
    let next = actions.get(name);
    if (!next) {
      next = mixer.clipAction(clip);
      next.setLoop(THREE.LoopRepeat, Infinity);
      actions.set(name, next);
    }
    // Cancel any pending stop when rapidly returning to a recently faded clip.
    fadingOut.delete(next);
    next.stopFading();
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (current) {
      current.action.stopFading();
      current.action.fadeOut(.24);
      fadingOut.set(current.action, .24);
      next.fadeIn(.24);
    }
    current = { name, action: next };
    group.userData.animation = name;
  }

  function setHat(id = 'none') {
    currentHat = Object.hasOwn(hats, id) && hats[id] ? id : 'none';
    for (const [hatId, node] of Object.entries(hats)) if (node) node.visible = hatId === currentHat;
    if (hatAnchor) hatAnchor.userData.hat = currentHat;
    group.userData.hat = currentHat;
    return currentHat;
  }

  function update(dt, time, state = {}) {
    if (disposed || !Number.isFinite(dt) || !Number.isFinite(time) || dt < 0) return;
    dt = THREE.MathUtils.clamp(dt, 0, .1);
    selectClip(resolveBirmanClip(state, clips.keys()));
    if (current?.name === 'walk') current.action.setEffectiveTimeScale((state.reverse ? -1 : 1)*(state.strideRate ?? 1));
    // Restore mixer-owned values first: constant animation tracks may skip
    // writing identical values and must not accumulate our procedural override.
    tailClearance.restore();
    mixer.update(dt);
    tailClearance.apply(state.tailClearance??0);
    for (const [action, remaining] of fadingOut) {
      if (remaining <= dt) {
        if (action !== current?.action) action.stop();
        fadingOut.delete(action);
      } else fadingOut.set(action, remaining - dt);
    }
  }

  function dispose() {
    disposed = true;
    fadingOut.clear();
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
  }

  setHat('none');
  selectClip('idle');
  let nativeRig;
  model.traverse(node => { nativeRig ||= node.userData.nativeRig; });
  group.userData.quality = {
    source: 'Maya the Birman Cat / Blender MCP',
    version: nativeRig ? 2 : 1,
    rigged: true,
    importedMaterials: true,
    originalRig: Boolean(nativeRig),
    sourceBoneCount: nativeRig?.sourceBoneCount,
    idleSource: nativeRig?.sourceAnimation,
    idleDuration: nativeRig?.sourceDuration,
    clipNames: [...clips.keys()],
  };
  return {
    group, model, head, setHat, update, dispose, mixer, animations,
    get currentAnimation() { return current?.name || null; },
    get currentHat() { return currentHat; },
    availableHats: Object.entries(hats).filter(([, node]) => node).map(([id]) => id),
  };
}
