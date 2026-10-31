import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { createRoomNavigation } from './room-navigation.js';

export const COZY_ROOM_URL=new URL('../assets/cozy-room-final.glb',import.meta.url);
export const COZY_ROOM_SCALE=1.7;
export const COZY_ROOM_CAT_SCALE=.50;
export const COZY_ROOM_VIEW=Object.freeze({azimuth:.68,elevation:.58,height:9.8,focus:[-.38,1.8,0]});

// Merge only compatible opaque primitives within each reusable furniture group.
// Original materials, UVs, normals and separate interactive groups are retained.
export function batchRoomGeometry(root){
  root.updateMatrixWorld(true);let before=0,after=0;
  for(const component of [...root.children]){
    const buckets=new Map();const inverse=component.matrixWorld.clone().invert();
    component.traverse(node=>{
      if(!node.isMesh)return;before++;
      if(node.isSkinnedMesh||Array.isArray(node.material)||node.material.transparent||node.geometry.morphAttributes.position?.length)return;
      const attrs=Object.keys(node.geometry.attributes).sort();
      const key=node.material.uuid+'|'+attrs.map(k=>k+':'+node.geometry.attributes[k].itemSize).join(',');
      if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(node);
    });
    for(const meshes of buckets.values()){
      if(meshes.length<2)continue;
      const geometries=meshes.map(m=>{const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(inverse.clone().multiply(m.matrixWorld));return g;});
      const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!geometry)continue;
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const merged=new THREE.Mesh(geometry,meshes[0].material);merged.name=component.name+' / '+meshes[0].material.name;
      component.add(merged);for(const mesh of meshes)mesh.removeFromParent();
    }
    component.traverse(n=>{if(n.isMesh)after++;});
  }
  root.userData.batching={before,after};return root.userData.batching;
}

export function createImportedRoom(model){
  const group=new THREE.Group();group.name='CozyRoom_Final_Integration';
  const components=Object.fromEntries(model.children.map(o=>[o.name.slice(0,3),o]));
  const batching=batchRoomGeometry(model);
  model.scale.setScalar(COZY_ROOM_SCALE);model.position.y=-.2*COZY_ROOM_SCALE;group.add(model);
  group.updateMatrixWorld(true);
  model.traverse(o=>{if(o.isMesh){o.castShadow=!/curtain/i.test(o.name);o.receiveShadow=true;}});
  const bounds={minX:-2.03*COZY_ROOM_SCALE,maxX:2.03*COZY_ROOM_SCALE,minZ:-1.68*COZY_ROOM_SCALE,maxZ:1.77*COZY_ROOM_SCALE};
  const obstacles=['F01','F02','F03','F04','F05','F06'].map(id=>{
    const b=new THREE.Box3().setFromObject(components[id]);return {minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z};
  });
  // Plant canopies are not solid walls: their pot footprints block the floor.
  for(const [x,z,r] of [[-1.52,.87,.22],[-1.46,-.87,.19],[-1.15,-1.17,.20]])obstacles.push({minX:(x-r)*1.7,maxX:(x+r)*1.7,minZ:(z-r)*1.7,maxZ:(z+r)*1.7});
  // Native walk skin at display scale .5 has approximately .295 half-width.
  const navigation=createRoomNavigation(bounds,obstacles,.31,.10),targets=[];
  const vec=p=>new THREE.Vector3(p.x,0,p.z);
  function target(id,label,object,x,z){const safe=navigation.clamp({x,z});if(!safe)throw Error('房间缺少可走动区域');targets.push({id,label,object,position:vec(safe)});object.traverse(o=>o.userData.interactive=id);}
  target('bed','沙发旁休息',components.F01,1.48,-.42);
  target('window','窗边晒太阳',components.A04,-2.66,-.4);
  target('box','软椅旁陪伴',components.F02,2.95,2.28);
  const white=new THREE.MeshStandardMaterial({color:'#f5efdc',roughness:.65});
  const accent=new THREE.MeshStandardMaterial({color:'#abc587',roughness:.75});
  const food=new THREE.MeshStandardMaterial({color:'#8a6545',roughness:1});
  function add(parent,geometry,material,x,y,z){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
  const bowl=new THREE.Group();bowl.name='Gameplay_FoodBowl';bowl.position.set(-2.40,.045,2.59);group.add(bowl);
  add(bowl,new THREE.CylinderGeometry(.24,.21,.07,36),accent,0,0,0);
  add(bowl,new THREE.TorusGeometry(.18,.045,12,40),white,0,.07,0).rotation.x=Math.PI/2;
  add(bowl,new THREE.CylinderGeometry(.16,.16,.03,32),food,0,.045,0);
  target('bowl','吃点猫粮',bowl,-1.93,2.48);
  const ball=new THREE.Group();ball.name='Gameplay_Ball';ball.position.set(1.02,.11,2.87);group.add(ball);
  add(ball,new THREE.SphereGeometry(.11,24,16),accent,0,0,0);
  const stripe=add(ball,new THREE.TorusGeometry(.109,.009,8,32),white,0,0,0);stripe.rotation.x=.7;
  target('ball','追追小球',ball,1.2,2.75);
  const restBall=ball.position.clone();let playUntil=0;
  const station=new THREE.Mesh(new THREE.RingGeometry(.24,.27,40),new THREE.MeshBasicMaterial({color:'#bbc790',transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide}));
  station.rotation.x=-Math.PI/2;station.position.y=.025;station.visible=false;group.add(station);
  const corners={box:'box',bed:'bed',perch:'window'};
  const spawn=vec(navigation.clamp({x:-1.17,z:2.38}));
  let reflectionProbe,reflectionCamera;
  return {group,model,targets,components,navigation,spawn,catScale:COZY_ROOM_CAT_SCALE,view:COZY_ROOM_VIEW,
    imported:true,batching,
    prepareReflection(renderer,scene,cat){
      // A static room reflection probe supplies the original metallic mirror
      // with its missing environment. It intentionally excludes the animated
      // cat: no frozen duplicate cat, and no six extra renders each frame.
      const mirror=components.F06,probe=reflectionProbe??=new THREE.WebGLCubeRenderTarget(256,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
      const camera=reflectionCamera??=new THREE.CubeCamera(.05,30,probe);new THREE.Box3().setFromObject(mirror).getCenter(camera.position);camera.position.z+=.16;
      const wasVisible=cat.visible,mirrorWasVisible=mirror.visible,cutaway=['A03','A04'].map(id=>components[id]),cutawayVisibility=cutaway.map(o=>o.visible);mirror.visible=false;cat.visible=false;cutaway.forEach(o=>o.visible=true);
      try{camera.update(renderer,scene);}finally{mirror.visible=mirrorWasVisible;cat.visible=wasVisible;cutaway.forEach((o,i)=>o.visible=cutawayVisibility[i]);}
      mirror.traverse(o=>{if(o.isMesh&&o.material.metalness>.5){o.material.envMap=probe.texture;o.material.envMapIntensity=1;o.material.needsUpdate=true;}});
    },
    setTheme(id){accent.color.set({sage:'#abc587',peach:'#dfb69d',lavender:'#b8accf'}[id]||'#abc587');},
    setFurniture(id){const t=targets.find(t=>t.id===corners[id]);if(t){station.position.set(t.position.x,.025,t.position.z);station.visible=true;}},
    getDecorTarget(id){return targets.find(t=>t.id===corners[id]);},
    surfaceHeight(x,z){return x>=-1.38*1.7&&x<=1.18*1.7&&z>=-.53*1.7&&z<=1.17*1.7?.068:0;},
    updateVisibility(yaw){for(const id of ['A03','A04'])components[id].visible=yaw>-.05;},
    play(time){playUntil=time+3;},
    update(dt,time){if(time<playUntil){ball.position.x=restBall.x+Math.sin(time*4)*.10;ball.rotation.x+=dt*4;}else ball.position.lerp(restBall,Math.min(1,dt*6));},
  };
}

export async function loadImportedRoom(){const gltf=await new GLTFLoader().loadAsync(String(COZY_ROOM_URL));return createImportedRoom(gltf.scene);}
