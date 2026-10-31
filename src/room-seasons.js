import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { COZY_ROOM_SCALE, batchRoomGeometry } from './imported-room.js';
import { sampleSeasonLightMotion } from './season-light-motion.js';

export const SEASON_IDS=Object.freeze(['spring','summer','autumn','winter']);
const CONFIG_URL=new URL('../assets/seasons/seasons.json',import.meta.url);
const PROPS_URL=new URL('../assets/seasons/season-props.glb',import.meta.url);
let assetsPromise;

export function validateSeasonConfig(config){
  if(config?.version!==1||!SEASON_IDS.includes(config.default))throw Error('四季配置版本不匹配');
  for(const id of SEASON_IDS){
    const s=config.seasons?.[id];
    if(!s||typeof s.label!=='string'||!/^#[\da-f]{6}$/i.test(s.background)||!s.hemi||!s.key||!s.fill||!s.palette)throw Error('四季配置不完整：'+id);
    for(const value of [s.exposure,s.hemi.intensity,s.key.intensity,s.fill.intensity,s.lampIntensity])if(!Number.isFinite(value)||value<0)throw Error('四季灯光参数无效：'+id);
    if(!Array.isArray(s.key.position)||s.key.position.length!==3||!s.key.position.every(Number.isFinite))throw Error('四季灯光位置无效：'+id);
    for(const color of [s.hemi.sky,s.hemi.ground,s.key.color,s.fill.color,...Object.values(s.palette)])if(!/^#[\da-f]{6}$/i.test(color))throw Error('四季颜色无效：'+id);
  }
  return config;
}

// Dusk is an overlay on the selected season. Returning to day restores that
// season's authored light, including its sun position and exposure.
export function seasonLighting(season,night=false){
  const mix=(a,b,t)=>new THREE.Color(a).lerp(new THREE.Color(b),t);
  return {
    background:mix(season.background,'#586477',night?.58:0),
    sky:mix(season.hemi.sky,'#a3b2db',night?.6:0),
    ground:new THREE.Color(season.hemi.ground),
    hemi:season.hemi.intensity*(night?.48:1),
    keyColor:mix(season.key.color,'#ffc98e',night?.7:0),
    key:season.key.intensity*(night?.42:1),
    position:new THREE.Vector3(...season.key.position),
    fillColor:mix(season.fill.color,'#929fdc',night?.6:0),
    fill:season.fill.intensity*(night?.6:1),
    exposure:season.exposure*(night?.94:1),
    lamp:night?Math.max(1.5,season.lampIntensity):season.lampIntensity,
  };
}

export function createRoomSeasons({config,props,room,scene,renderer,lights,onSettled=()=>{}}){
  validateSeasonConfig(config);
  const groups=Object.fromEntries(SEASON_IDS.map(id=>[id,props.getObjectByName(id)]));
  if(SEASON_IDS.some(id=>!groups[id]))throw Error('四季模型缺少季节分组');
  const batching=batchRoomGeometry(props);
  props.name='Seasonal_Props';props.scale.setScalar(COZY_ROOM_SCALE);props.position.y=-.2*COZY_ROOM_SCALE;
  props.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  room.group.add(props);

  // Clone only source-room materials; the cat, hats and gameplay accents are
  // deliberately outside this traversal. Shared materials remain shared here.
  const clones=new Map(),materials=[];
  room.model.traverse(o=>{
    if(!o.isMesh)return;
    const clone=m=>{if(!clones.has(m)){const c=m.clone();clones.set(m,c);if(c.color)materials.push({material:c,base:c.color.clone()});}return clones.get(m);};
    o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);
  });
  const lamps=new THREE.Group();lamps.name='Seasonal_Warm_Lamps';room.group.add(lamps);
  for(const id of ['D01','D05']){
    const component=room.components[id];if(!component)continue;
    const lamp=new THREE.PointLight('#ffd6a0',0,5,2),box=new THREE.Box3().setFromObject(component);
    box.getCenter(lamp.position);lamp.position.y=box.max.y-.16;lamps.add(lamp);
  }
  let current=config.default,isNight=false,elapsed=.6,start=null,target=null,settlePending=false,motionBase=null;
  const read=()=>({background:scene.background.clone(),sky:lights.hemi.color.clone(),ground:lights.hemi.groundColor.clone(),hemi:lights.hemi.intensity,keyColor:lights.key.color.clone(),key:motionBase?.key??lights.key.intensity,position:motionBase?.position.clone()??lights.key.position.clone(),fillColor:lights.fill.color.clone(),fill:motionBase?.fill??lights.fill.intensity,exposure:renderer.toneMappingExposure,lamp:lamps.children[0]?.intensity||0});
  function apply(t){
    for(const [object,property,name] of [[scene,'background','background'],[lights.hemi,'color','sky'],[lights.hemi,'groundColor','ground'],[lights.key,'color','keyColor'],[lights.fill,'color','fillColor']])object[property].copy(start[name]).lerp(target[name],t);
    for(const [object,property,name] of [[lights.hemi,'intensity','hemi'],[lights.key,'intensity','key'],[lights.fill,'intensity','fill'],[renderer,'toneMappingExposure','exposure']])object[property]=THREE.MathUtils.lerp(start[name],target[name],t);
    lights.key.position.copy(start.position).lerp(target.position,t);
    lamps.children.forEach(lamp=>lamp.intensity=THREE.MathUtils.lerp(start.lamp,target.lamp,t));
    motionBase={key:lights.key.intensity,fill:lights.fill.intensity,position:lights.key.position.clone()};
  }
  function set(id,night=isNight,instant=false){
    if(!SEASON_IDS.includes(id))return false;
    current=id;isNight=Boolean(night);
    for(const sid of SEASON_IDS)groups[sid].visible=sid===id;
    const season=config.seasons[id];
    // The reference Blender renders feed these two textile maps directly into
    // Base Color. Tinting them again multiplies both the motif and white thread,
    // making the game noticeably darker than the reference.
    for(const {material,base} of materials){material.color.copy(base);if(!material.map&&season.palette[material.name])material.color.set(season.palette[material.name]);}
    start=read();target=seasonLighting(season,isNight);elapsed=instant?.6:0;settlePending=true;
    if(instant){apply(1);settlePending=false;onSettled();}
    return true;
  }
  return {
    config,props,groups,batching,lamps,
    get current(){return current;},get night(){return isNight;},
    setSeason(id,instant=false){return set(id,isNight,instant);},
    setNight(value,instant=false){return set(current,value,instant);},
    initialize(id,night){return set(SEASON_IDS.includes(id)?id:config.default,night,true);},
    animate(seconds,reducedMotion=false){
      if(!motionBase)return;
      const m=sampleSeasonLightMotion(seconds,{night:isNight,reducedMotion});
      lights.key.intensity=motionBase.key*m.keyFactor;lights.fill.intensity=motionBase.fill*m.fillFactor;
      lights.key.position.copy(motionBase.position);lights.key.position.x+=m.offsetX;lights.key.position.z+=m.offsetZ;
    },
    update(dt){if(!settlePending)return;elapsed=Math.min(.6,elapsed+Math.max(0,dt));const t=elapsed/.6;apply(t*t*(3-2*t));if(elapsed>=.6){settlePending=false;onSettled();}},
  };
}

export async function loadRoomSeasons(options){
  if(!assetsPromise){
    assetsPromise=Promise.all([
      fetch(CONFIG_URL,{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error('四季配置暂时无法读取');return r.json();}),
      new GLTFLoader().loadAsync(String(PROPS_URL)),
    ]);
    assetsPromise.catch(()=>{assetsPromise=null;});
  }
  let timer;
  try{
    const [config,gltf]=await Promise.race([assetsPromise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('四季素材加载超时')),15000);})]);
    return createRoomSeasons({...options,config,props:gltf.scene.clone(true)});
  }finally{clearTimeout(timer);}
}
