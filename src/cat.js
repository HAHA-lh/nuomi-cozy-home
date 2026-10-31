import * as THREE from '../vendor/three.module.js';
import {surface} from './generated/cat-surface.js';

const smooth=(a,b,v)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
function decode(text,Type){const raw=atob(text),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Type(bytes.buffer);}

export function createCat(){
 const group=new THREE.Group();group.name='Nuomi_Surface_v2';
 const ramp=new THREE.DataTexture(new Uint8Array([132,158,182,201,218,231,243,255]),8,1,THREE.RedFormat);ramp.needsUpdate=true;ramp.minFilter=ramp.magFilter=THREE.LinearFilter;
 const toon=color=>new THREE.MeshToonMaterial({color,gradientMap:ramp});
 const white=toon('#f1f4ef'),pink=toon('#d4949b'),silver=toon('#a2b2ae'),lip=toon('#766267');
 const eyeDark=new THREE.MeshStandardMaterial({color:'#263d36',roughness:.42});
 const eyeGreen=new THREE.MeshStandardMaterial({color:'#7da675',roughness:.29,metalness:0});
 const pupil=new THREE.MeshStandardMaterial({color:'#102d27',roughness:.15});
 const glint=new THREE.MeshBasicMaterial({color:'#fffef4'});
 const sphere=new THREE.SphereGeometry(1,40,30);
 const add=(geo,material,pos,scale,parent=group)=>{const o=new THREE.Mesh(geo,material);o.position.set(...pos);if(scale)o.scale.set(...scale);o.castShadow=true;o.receiveShadow=false;parent.add(o);return o;};
 const ell=(m,p,s,parent)=>add(sphere,m,p,s,parent);
 const tube=(points,r,m,parent)=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,8,false),m,[0,0,0],null,parent);

 // One continuous skin, not separate intersecting spheres. Skeleton deforms it on the GPU.
 const geometry=new THREE.BufferGeometry(),p=decode(surface.position,Int16Array),n=decode(surface.normal,Int8Array);
 const position=Float32Array.from(p,v=>v/10000),normal=Float32Array.from(n,v=>v/127);
 geometry.setAttribute('position',new THREE.BufferAttribute(position,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normal,3));geometry.setIndex(new THREE.BufferAttribute(decode(surface.index,Uint32Array),1));
 const bones=[];function bone(name,pos){const b=new THREE.Bone();b.name=name;b.position.set(...pos);bones.push(b);return b;}
 const root=bone('root',[0,0,0]),headBone=bone('head',[0,1.69,.43]);root.add(headBone);
 const legBones=[];for(const front of [true,false])for(const side of [-1,1]){const b=bone((front?'front':'hind')+(side<0?'_L':'_R'),[side*(front?.285:.31),front?.92:.79,front?.43:-.67]);root.add(b);legBones.push({b,front,side,index:bones.length-1});}
 const weights=[],skinIndices=[],colors=[];
 const ivory=new THREE.Color('#ecf0e9'),shade=new THREE.Color('#adbdb8');
 for(let i=0;i<position.length;i+=3){const x=position[i],y=position[i+1],z=position[i+2];
  const hw=smooth(1.35,1.81,y)*smooth(-.55,.34,z);
  const leg=legBones.reduce((a,b)=>Math.hypot(x-b.b.position.x,z-b.b.position.z)<Math.hypot(x-a.b.position.x,z-a.b.position.z)?b:a);
  const lw=(1-smooth(.54,1.08,y))*(1-hw);
  weights.push(1-hw-lw,hw,lw,0);skinIndices.push(0,1,leg.index,0);
  const crown=smooth(2.10,2.40,y);const back=smooth(1.15,1.43,y)*(1-smooth(-.2,.48,z))*.32;
  const stripes=[-.24,0,.24].reduce((s,c)=>s+Math.exp(-Math.pow((x-c)/.040,2)),0)*smooth(2.08,2.30,y)*smooth(.72,.96,z)*.23;
  const c=ivory.clone().lerp(shade,Math.min(.55,crown*.24+back+stripes));colors.push(c.r,c.g,c.b);
 }
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const skinMat=toon('#ffffff');skinMat.vertexColors=true;const skin=new THREE.SkinnedMesh(geometry,skinMat);skin.name='ContinuousCatSkin';skin.add(root);group.add(skin);skin.bind(new THREE.Skeleton(bones));skin.castShadow=true;skin.receiveShadow=false;skin.frustumCulled=false;
 const head=new THREE.Group();head.name='FaceAndHatAnchor';head.position.set(0,.30,.14);headBone.add(head);

 // Curved eyelids and convex eyes embedded into the head; no thick eyebrow pieces.
 const eyes=[];for(const side of [-1,1]){
  const e=new THREE.Group();e.position.set(side*.25,.025,.382);e.rotation.y=side*.15;head.add(e);eyes.push(e);
  ell(eyeDark,[0,0,0],[.192,.208,.096],e);ell(eyeGreen,[0,-.002,.035],[.176,.192,.083],e);
  ell(pupil,[-side*.008,-.002,.105],[.088,.145,.022],e);
  ell(glint,[-.046,.078,.119],[.024,.030,.009],e);ell(glint,[.042,-.060,.123],[.008,.010,.005],e);
  tube([[-.181,.045,.025],[-.13,.154,.044],[0,.202,.036],[.135,.142,.015]],.0095,white,e);
 }
 const ns=new THREE.Shape();ns.moveTo(-.068,0);ns.bezierCurveTo(-.04,.021,.04,.021,.068,0);ns.quadraticCurveTo(.039,-.039,0,-.055);ns.quadraticCurveTo(-.039,-.039,-.068,0);
 const noseMat=new THREE.MeshStandardMaterial({color:'#c78188',roughness:.39});add(new THREE.ExtrudeGeometry(ns,{depth:.023,bevelEnabled:true,bevelSize:.008,bevelThickness:.009,bevelSegments:4,curveSegments:16}),noseMat,[0,-.205,.521],null,head);
 tube([[0,-.257,.542],[0,-.291,.536],[-.038,-.312,.518],[-.072,-.307,.497]],.0045,lip,head);
 tube([[0,-.291,.536],[.038,-.312,.518],[.072,-.307,.497]],.0045,lip,head);
 const whiskerMat=new THREE.MeshBasicMaterial({color:'#858f87',transparent:true,opacity:.72});
 for(const s of [-1,1])for(let j=0;j<3;j++)tube([[s*.16,-.245-j*.022,.496],[s*.40,-.22-j*.045,.52],[s*(.66-j*.02),-.17-j*.075,.40]],.0022,whiskerMat,head);
 const freckles=toon('#b5b5a9');for(const s of [-1,1])for(let j=0;j<3;j++)ell(freckles,[s*(.13+j*.044),-.24+(j%2)*.025,.509-j*.012],[.007,.007,.004],head);

 // Rounded, thick ear shells. Their roots sink into the skull instead of sitting on it.
 const ears=[];for(const side of [-1,1]){
  const ear=new THREE.Group();ear.position.set(side*.385,.31,-.07);ear.rotation.z=-side*.18;ear.rotation.y=side*.16;head.add(ear);ears.push(ear);
  const outline=new THREE.Shape();outline.moveTo(-.175,-.04);outline.bezierCurveTo(-.18,.10,-.09,.34,-.015,.405);outline.quadraticCurveTo(.018,.433,.05,.385);outline.bezierCurveTo(.13,.23,.19,.075,.18,-.04);outline.quadraticCurveTo(0,-.10,-.175,-.04);
  const shell=new THREE.ExtrudeGeometry(outline,{depth:.065,bevelEnabled:true,bevelThickness:.035,bevelSize:.024,bevelSegments:5,curveSegments:24});add(shell,white,[0,0,0],null,ear);
  const inner=new THREE.Shape();inner.moveTo(-.115,.02);inner.bezierCurveTo(-.12,.10,-.04,.29,.006,.34);inner.quadraticCurveTo(.11,.20,.12,.02);inner.quadraticCurveTo(.015,.085,-.115,.02);
  add(new THREE.ExtrudeGeometry(inner,{depth:.008,bevelEnabled:true,bevelThickness:.008,bevelSize:.009,bevelSegments:3,curveSegments:24}),pink,[0,0,.094],null,ear);
  tube([[-.11,.015,.111],[-.06,.06,.115],[.0,.035,.12]],.012,white,ear);
 }
 // A single tapered, capped tail, with silver vertex tint at its tip.
 const tail=new THREE.Group();tail.position.set(0,1.11,-.93);group.add(tail);
 const curve=new THREE.CatmullRomCurve3([[0,0,.05],[.06,.12,-.24],[.25,.51,-.40],[.27,.94,-.29],[.16,1.12,-.10]].map(v=>new THREE.Vector3(...v)));
 const tg=new THREE.TubeGeometry(curve,64,.12,16,false),tp=tg.attributes.position,tc=[];
 for(let i=0;i<tp.count;i++){const t=Math.floor(i/17)/64,c=curve.getPointAt(t),v=new THREE.Vector3().fromBufferAttribute(tp,i).sub(c);const taper=t>.86?Math.sqrt(Math.max(.0001,1-Math.pow((t-.86)/.14,2))):1-.28*t;v.multiplyScalar(taper).add(c);tp.setXYZ(i,v.x,v.y,v.z);const col=ivory.clone().lerp(shade,smooth(.60,.96,t)*.75);tc.push(col.r,col.g,col.b);}
 tg.computeVertexNormals();tg.setAttribute('color',new THREE.Float32BufferAttribute(tc,3));const tm=toon('#ffffff');tm.vertexColors=true;add(tg,tm,[0,0,0],null,tail);

 const hats=new THREE.Group();hats.position.set(0,.39,.015);head.add(hats);
 const shared=new Set([white,pink,silver,lip,eyeDark,eyeGreen,pupil,glint,noseMat,whiskerMat,freckles,skinMat,tm]);
 function setHat(id){if(hats.userData.hat===id)return;const gs=new Set(),ms=new Set();for(const o of [...hats.children]){o.traverse(n=>{if(n.isMesh){if(n.geometry!==sphere)gs.add(n.geometry);if(!shared.has(n.material))ms.add(n.material);}});hats.remove(o);}gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());hats.userData.hat=id;
  if(id==='beret'){const g=new THREE.Group();g.rotation.z=-.17;g.position.set(.075,.025,.025);hats.add(g);const fabric=toon('#d9bc86');ell(fabric,[0,.07,0],[.435,.155,.335],g);const rim=add(new THREE.TorusGeometry(.29,.023,16,64),toon('#b59b71'),[0,-.014,0],null,g);rim.rotation.x=Math.PI/2;add(new THREE.CapsuleGeometry(.018,.055,5,12),toon('#b59b71'),[.025,.25,0],null,g);}
  if(id==='leaf'){const stem=add(new THREE.CylinderGeometry(.014,.02,.22,12),toon('#6b9059'),[0,.16,0],null,hats);stem.rotation.z=-.15;for(const s of [-1,1]){const l=ell(toon(s<0?'#8ba96f':'#73915a'),[s*.095,.29+(s>0?.055:0),0],[.14,.038,.075],hats);l.rotation.z=s*.5;}}
  if(id==='bunny'){const cream=toon('#eee6d7');ell(cream,[0,.018,.03],[.40,.105,.30],hats);for(const s of [-1,1]){const e=new THREE.Group();e.position.set(s*.16,.06,.015);e.rotation.z=-s*.13;hats.add(e);ell(cream,[0,.25,0],[.09,.285,.07],e);ell(pink,[0,.27,.06],[.045,.19,.014],e);}}
 }
 function update(dt,time,state={}){
  const moving=!!state.moving,action=state.action||'idle',sleep=action==='sleep',pet=action==='pet';
  headBone.rotation.set(action==='feed'?.30:sleep?.15:Math.sin(time*.65)*.018,Math.sin(time*.55)*.035,pet?Math.sin(time*4)*.065:Math.sin(time*.8)*.012);
  headBone.position.y=1.69+(moving?Math.sin(time*11)*.015:Math.sin(time*2)*.004);
  const phase=time%4.4,blink=phase>4.16?Math.abs(phase-4.28)/.12:1,scale=sleep?.08:pet?.38:Math.max(.09,blink);
  eyes.forEach(e=>e.scale.y=THREE.MathUtils.lerp(e.scale.y,scale,Math.min(1,dt*25)));
  ears.forEach((e,i)=>e.rotation.z=(i?-.18:.18)+(pet?(i?-.06:.06):Math.sin(time*.9)*.01));
  tail.rotation.z=Math.sin(time*(action==='play'?5:1.5))*(action==='play'?.20:.09);tail.rotation.x=sleep?-.45:Math.sin(time*1.1)*.025;
  for(const l of legBones){const swing=moving?Math.sin(time*10+(l.side>0?Math.PI:0)+(l.front?0:Math.PI))*.24:0;l.b.rotation.x=swing;if(action==='play'&&l.front&&l.side===-1&&!moving)l.b.rotation.x=-.37+Math.sin(time*6)*.16;if(pet&&l.front&&l.side===1)l.b.rotation.x=-.13;}
  group.scale.y=THREE.MathUtils.lerp(group.scale.y,sleep?.76:1,Math.min(1,dt*4));
 }
 group.traverse(o=>{if(o.isMesh)o.userData.cat=true;});
 group.userData.quality={version:2,continuousSkin:true,triangles:surface.triangles,vertices:surface.vertices};
 return {group,head,setHat,update,skin};
}
