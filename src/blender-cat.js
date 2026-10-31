import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { loadBirmanCat } from './birman-cat.js';

/**
 * Legacy runtime contract for assets/nuomi-blender-refined.glb.
 * Required: bones root/head/front_L/front_R/hind_L/hind_R;
 * FaceAndHatAnchor, Eye_L/Eye_R, Ear_L/Ear_R, Tail, HatAnchor,
 * and Hat_Beret/Hat_Leaf/Hat_Bunny. Coordinates are glTF Y-up.
 * Rest transforms are retained, including Blender's bone orientation.
 * The default loader prefers the new textured Birman asset. This retained
 * asset is a visibly reported recovery path, never a silent replacement.
 */
export async function loadBlenderCat(url) {
  // Explicit legacy URLs retain the previous public API for local diagnostics.
  if (url !== undefined) return loadLegacyBlenderCat(url);
  try {
    return await loadBirmanCat();
  } catch (cause) {
    console.warn('Birman 模型未能加载，已尝试恢复旧版猫咪。', cause);
    try {
      const cat = await loadLegacyBlenderCat();
      cat.group.userData.quality = {
        ...cat.group.userData.quality,
        source: 'Blender GLB fallback',
        fallback: true,
        fallbackReason: cause.message || 'Birman 模型或配饰加载失败',
      };
      return cat;
    } catch (legacyCause) {
      throw new Error('新猫和备用猫咪均加载失败，请检查模型资源与本地服务。', {
        cause: new AggregateError([cause, legacyCause]),
      });
    }
  }
}

export async function loadLegacyBlenderCat(url = new URL('../assets/nuomi-blender-refined.glb', import.meta.url)) {
  const loader = new GLTFLoader();
  let gltf;
  try {
    gltf = await loader.loadAsync(String(url));
  } catch (cause) {
    throw new Error('Blender 猫模型加载失败，请检查本地 GLB 文件和静态服务。', { cause });
  }
  return createBlenderCatController(gltf.scene, gltf.animations);
}

// Exported separately so the rig contract can be checked without a WebGL renderer.
export function createBlenderCatController(group, animations = []) {
  const requiredNames = ['root', 'head', 'front_L', 'front_R', 'hind_L', 'hind_R',
    'FaceAndHatAnchor', 'Eye_L', 'Eye_R', 'Ear_L', 'Ear_R', 'Tail', 'HatAnchor',
    'Hat_Beret', 'Hat_Leaf', 'Hat_Bunny'];
  const nodes = Object.fromEntries(requiredNames.map(name => [name, group.getObjectByName(name)]));
  const missing = requiredNames.filter(name => !nodes[name]);
  if (missing.length) throw new Error(`Blender 模型缺少约定节点：${missing.join(', ')}`);
  for (const name of ['root', 'head', 'front_L', 'front_R', 'hind_L', 'hind_R']) {
    if (!nodes[name].isBone) throw new Error(`Blender 模型节点 ${name} 必须是骨骼。`);
  }
  if (!group.getObjectByProperty('isSkinnedMesh', true)) {
    throw new Error('Blender 模型缺少已绑定的蒙皮网格，不能执行身体动作。');
  }

  const rest = new Map();
  for (const node of Object.values(nodes)) {
    rest.set(node, { position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() });
  }
  const groupScale = group.scale.clone();
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');
  const delta = new THREE.Quaternion();
  function rotate(node, x = 0, y = 0, z = 0) {
    delta.setFromEuler(euler.set(x, y, z));
    node.quaternion.copy(rest.get(node).quaternion).multiply(delta);
  }
  group.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.userData.cat = true;
    // Imported PBR materials, UVs and vertex colors remain intact.
    // No geometry/material recreation takes place when changing an outfit.
  });

  const hats = { beret: nodes.Hat_Beret, leaf: nodes.Hat_Leaf, bunny: nodes.Hat_Bunny };
  let currentHat = 'none';
  function setHat(id = 'none') {
    currentHat = Object.hasOwn(hats, id) ? id : 'none';
    for (const [hatId, node] of Object.entries(hats)) node.visible = hatId === currentHat;
    nodes.HatAnchor.userData.hat = currentHat;
  }
  const legs = [
    { node: nodes.front_L, side: -1, front: true },
    { node: nodes.front_R, side: 1, front: true },
    { node: nodes.hind_L, side: -1, front: false },
    { node: nodes.hind_R, side: 1, front: false },
  ];
  function update(dt, time, state = {}) {
    if (!Number.isFinite(dt) || !Number.isFinite(time)) return;
    dt = THREE.MathUtils.clamp(dt, 0, .1);
    const action = state.action || 'idle', moving = Boolean(state.moving);
    const sleeping = action === 'sleep', petting = action === 'pet';
    const headBone = nodes.head;
    rotate(headBone,
      action === 'feed' ? .30 : sleeping ? .15 : Math.sin(time * .65) * .018,
      Math.sin(time * .55) * .035,
      petting ? Math.sin(time * 4) * .065 : Math.sin(time * .8) * .012);
    headBone.position.copy(rest.get(headBone).position);
    headBone.position.y += moving ? Math.sin(time * 11) * .015 : Math.sin(time * 2) * .004;

    const phase = ((time % 4.4) + 4.4) % 4.4;
    const blink = phase > 4.16 ? Math.abs(phase - 4.28) / .12 : 1;
    const eyeOpening = sleeping ? .08 : petting ? .38 : Math.max(.09, blink);
    for (const node of [nodes.Eye_L, nodes.Eye_R]) {
      const base = rest.get(node).scale;
      node.scale.set(base.x, THREE.MathUtils.lerp(node.scale.y, base.y * eyeOpening, Math.min(1, dt * 25)), base.z);
    }
    rotate(nodes.Ear_L, 0, 0, petting ? .06 : Math.sin(time * .9) * .01);
    rotate(nodes.Ear_R, 0, 0, petting ? -.06 : Math.sin(time * .9) * .01);
    rotate(nodes.Tail, sleeping ? -.35 : Math.sin(time * 1.1) * .025, 0,
      Math.sin(time * (action === 'play' ? 5 : 1.5)) * (action === 'play' ? .20 : .09));
    for (const { node, side, front } of legs) {
      let swing = moving ? Math.sin(time * 10 + (side > 0 ? Math.PI : 0) + (front ? 0 : Math.PI)) * .24 : 0;
      if (action === 'play' && front && side === -1 && !moving) swing = -.37 + Math.sin(time * 6) * .16;
      if (petting && front && side === 1) swing = -.13;
      rotate(node, swing);
    }
    group.scale.y = THREE.MathUtils.lerp(group.scale.y, groupScale.y * (sleeping ? .90 : 1), Math.min(1, dt * 4));
  }

  setHat('none');
  group.userData.quality = { source: 'Blender GLB', version: 3, continuousSkin: true, rigged: true };
  return { group, head: nodes.FaceAndHatAnchor, setHat, update, animations };
}
