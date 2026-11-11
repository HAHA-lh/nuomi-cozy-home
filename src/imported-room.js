import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { createCatNavigation } from './cat-navigation.js';
import { BIRMAN_FOOTPRINT, createCatCollision } from './cat-collision.js';
import { BIRMAN_CLEARANCE_LAYERS, BIRMAN_RELAXED_LAYERS } from './birman-clearance.js';

export const COZY_ROOM_URL=new URL('../assets/cozy-room-final.glb',import.meta.url);
export const COZY_ROOM_SCALE=1.7;
export const COZY_ROOM_CAT_SCALE=.50;
export const COZY_ROOM_VIEW=Object.freeze({azimuth:.68,elevation:.58,height:9.8,focus:[-.38,1.8,0]});
// Align the supplied table's XZ bounds centre with the blue rug (T01).
// Keep this shared offset for its vase and all seasonal tabletop props.
export const TABLE_SHIFT = Object.freeze({x:.187589309,z:-.024628429});
const BOWL = {x:-2.26,z:2.60};
const BALL = {x:1.85,z:2.76,travel:.10};

function arrangeFurniture(components) {
  const groups = [
    [['F02','T07'],.85,-.45], // chair and its cushion
    [['F03'],2.61,.32],       // round pouf
    [['T08'],4.66,-2.00],     // window cushion beside the reading chair
    [['F04','P04'],TABLE_SHIFT.x,TABLE_SHIFT.z],
    [['D05','O03','O05'],-.35,-.25], // keep the reading lamp clear of the window approach
  ];
  for (const [ids,x,z] of groups) {
    for (const id of ids) {
      components[id].position.x+=x/COZY_ROOM_SCALE;
      components[id].position.z+=z/COZY_ROOM_SCALE;
    }
  }
}

function propFootprint(id,position,radius,travel,top) {
  // Circumscribe the complete swept capsule, including both ball extremes.
  const r=radius/Math.cos(Math.PI/24), polygon=[];
  for(let i=0;i<=24;i++) {
    const theta=(i/12-.5)*Math.PI;
    const offset=i<=12?travel:-travel;
    polygon.push({x:position.x+offset+Math.cos(theta)*r,z:position.z+Math.sin(theta)*r});
    if(i===12) polygon.push({x:position.x-travel,z:position.z+r});
  }
  return {id,polygon,minX:position.x-r-travel,maxX:position.x+r+travel,minZ:position.z-r,maxZ:position.z+r,maxY:top};
}

// Use the actual curved furniture outlines, not square bounds around round
// cushions. Only geometry at cat height can obstruct floor movement.
export function roomFootprint(object){
  object.updateWorldMatrix(true,true);
  const points=[], ceiling=1.38, box=new THREE.Box3().setFromObject(object);
  object.traverse(o=>{
    if(!o.isMesh)return;
    const geometry=o.geometry, attr=geometry.attributes.position, indices=geometry.index;
    const vertices=Array.from({length:attr.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(o.matrixWorld));
    for(const v of vertices) if(v.y<=ceiling) points.push({x:v.x,z:v.z});
    // Clip crossing edges too: a tall, slanted surface can cross the cat's
    // height even if none of its upper vertices is inside the slab.
    for(let i=0;i<(indices?.count??attr.count);i+=3) for(let j=0;j<3;j++){
      const u=i+j,v=i+(j+1)%3;
      const a=vertices[indices?indices.getX(u):u], b=vertices[indices?indices.getX(v):v];
      if(a.y<=ceiling && b.y>ceiling || b.y<=ceiling && a.y>ceiling){
        const t=(ceiling-a.y)/(b.y-a.y);
        points.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
      }
    }
  });
  if(points.length<3)return null;
  points.sort((a,b)=>a.x-b.x||a.z-b.z);
  const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x),half=items=>{const h=[];for(const pt of items){while(h.length>=2&&cross(h.at(-2),h.at(-1),pt)<=0)h.pop();h.push(pt);}return h;};
  const lower=half(points),upper=half([...points].reverse());lower.pop();upper.pop();const polygon=[...lower,...upper];
  return {id:object.name.slice(0,3),polygon,minY:box.min.y,maxY:box.max.y,minX:Math.min(...polygon.map(p=>p.x)),maxX:Math.max(...polygon.map(p=>p.x)),minZ:Math.min(...polygon.map(p=>p.z)),maxZ:Math.max(...polygon.map(p=>p.z))};
}

function slicedRoomFootprint(object) {
  const footprint=roomFootprint(object);
  if(!footprint)return null;
  const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  const half=items=>{const hull=[];for(const p of items){while(hull.length>1&&cross(hull.at(-2),hull.at(-1),p)<=0)hull.pop();hull.push(p);}return hull;};
  footprint.parts=[];
  object.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const geometry=mesh.geometry,attr=geometry.attributes.position,index=geometry.index;
    const vertices=Array.from({length:attr.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld));
    for(const {minY,maxY} of BIRMAN_CLEARANCE_LAYERS){
      const points=vertices.filter(v=>v.y>=minY&&v.y<=maxY).map(v=>({x:v.x,z:v.z}));
      for(let i=0;i<(index?.count??attr.count);i+=3)for(let j=0;j<3;j++){
        const a=vertices[index?index.getX(i+j):i+j],b=vertices[index?index.getX(i+(j+1)%3):i+(j+1)%3];
        for(const y of [minY,maxY])if(a.y<y&&b.y>y||b.y<y&&a.y>y){
          const t=(y-a.y)/(b.y-a.y);points.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
        }
      }
      if(points.length<3)continue;
      points.sort((a,b)=>a.x-b.x||a.z-b.z);
      const lower=half(points),upper=half([...points].reverse());lower.pop();upper.pop();
      const polygon=[...lower,...upper];if(polygon.length<3)continue;
      footprint.parts.push({id:footprint.id,minY,maxY,polygon,minX:Math.min(...polygon.map(p=>p.x)),maxX:Math.max(...polygon.map(p=>p.x)),minZ:Math.min(...polygon.map(p=>p.z)),maxZ:Math.max(...polygon.map(p=>p.z))});
    }
  });
  return footprint;
}

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
  arrangeFurniture(components);
  model.scale.setScalar(COZY_ROOM_SCALE);model.position.y=-.2*COZY_ROOM_SCALE;group.add(model);
  group.updateMatrixWorld(true);
  model.traverse(o=>{if(o.isMesh){o.castShadow=!/curtain/i.test(o.name);o.receiveShadow=true;}});
  const bounds={minX:-3.253,maxX:3.65,minZ:-2.89,maxZ:3.15};
  const obstacles=Object.entries(components).filter(([id,o])=>{
    if (!/^[FPDO]\d\d$/.test(id) && id!=='T08') return false;
    const b=new THREE.Box3().setFromObject(o);
    return b.min.y<1.38 && b.max.y>.025;
  }).map(([,o])=>slicedRoomFootprint(o)).filter(Boolean);
  // Take collision pieces before render batching merges separate table legs.
  const batching=batchRoomGeometry(model);
  obstacles.push(propFootprint('bowl',BOWL,.25,0,.17),propFootprint('ball',BALL,.12,BALL.travel,.24));
  const profile=layers=>({full:layers.flatMap(layer=>layer.parts.flat()),layers});
  const navigation=createCatNavigation(bounds,obstacles,.12,profile(BIRMAN_CLEARANCE_LAYERS)),targets=[];
  const relaxedClearance=createCatCollision(bounds,obstacles,profile(BIRMAN_RELAXED_LAYERS));
  const vec=p=>Object.assign(new THREE.Vector3(p.x,0,p.z),{yaw:p.yaw});
  function target(id,label,object,x,z,yaw){
    const position=vec({x,z,yaw:yaw??Math.atan2(object.position.x-x,object.position.z-z)});
    targets.push({id,label,object,position});
    object.traverse(o=>o.userData.interactive=id);
  }
  target('bed','沙发旁休息',components.F01,1.067,-.01,Math.PI);
  target('window','窗边晒太阳',components.A04,-1.57,1.55,3.8956);
  target('box','软椅旁陪伴',components.F02,1.067,1.43,Math.PI/2);
  const white=new THREE.MeshStandardMaterial({color:'#f5efdc',roughness:.65});
  const accent=new THREE.MeshStandardMaterial({color:'#abc587',roughness:.75});
  const food=new THREE.MeshStandardMaterial({color:'#8a6545',roughness:1});
  function add(parent,geometry,material,x,y,z){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
  const bowl=new THREE.Group();bowl.name='Gameplay_FoodBowl';bowl.position.set(BOWL.x,.045,BOWL.z);group.add(bowl);
  add(bowl,new THREE.CylinderGeometry(.24,.21,.07,36),accent,0,0,0);
  add(bowl,new THREE.TorusGeometry(.18,.045,12,40),white,0,.07,0).rotation.x=Math.PI/2;
  add(bowl,new THREE.CylinderGeometry(.16,.16,.03,32),food,0,.045,0);
  target('bowl','吃点猫粮',bowl,-1.213,2.27);
  const ball=new THREE.Group();ball.name='Gameplay_Ball';ball.position.set(BALL.x,.12,BALL.z);group.add(ball);
  add(ball,new THREE.SphereGeometry(.11,24,16),accent,0,0,0);
  const stripe=add(ball,new THREE.TorusGeometry(.109,.009,8,32),white,0,0,0);stripe.rotation.x=.7;
  target('ball','追追小球',ball,.81,2.33);
  const restBall=ball.position.clone();let playUntil=0;
  const station=new THREE.Mesh(new THREE.RingGeometry(.24,.27,40),new THREE.MeshBasicMaterial({color:'#bbc790',transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide}));
  station.rotation.x=-Math.PI/2;station.position.y=.025;station.visible=false;group.add(station);
  const corners={box:'box',bed:'bed',perch:'window'};
  const spawn=vec({x:.50,z:1.95,yaw:COZY_ROOM_VIEW.azimuth});
  let reflectionProbe,reflectionCamera;
  return {group,model,targets,components,navigation,spawn,catScale:COZY_ROOM_CAT_SCALE,view:COZY_ROOM_VIEW,
    canRelaxTail:pose=>relaxedClearance.isPoseClear(pose),
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
    update(dt,time){if(time<playUntil){ball.position.x=restBall.x+Math.sin(time*4)*BALL.travel;ball.rotation.x+=dt*4;}else ball.position.lerp(restBall,Math.min(1,dt*6));},
  };
}

export async function loadImportedRoom(){const gltf=await new GLTFLoader().loadAsync(String(COZY_ROOM_URL));return createImportedRoom(gltf.scene);}
