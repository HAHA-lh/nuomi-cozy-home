import * as THREE from '../vendor/three.module.js';
export function createRoom(){
 const group=new THREE.Group(),targets=[];
 const ramp=new THREE.DataTexture(new Uint8Array([123,166,202,232,250,255]),6,1,THREE.RedFormat);ramp.needsUpdate=true;ramp.minFilter=ramp.magFilter=THREE.NearestFilter;
 const material=(c)=>new THREE.MeshToonMaterial({color:c,gradientMap:ramp});
 const cream=material('#eae5d5'),wood=material('#b79b78'),woodLight=material('#d3bb95'),sage=material('#a0ad83'),fabric=material('#b2bd94'),rugMat=material('#d0d3ad'),pink=material('#d1a995'),dark=material('#687755'),white=material('#f5efdc');
 const roundedCache=new Map();
 // Shared, dimensionally exact rounded boxes. Analytic normals avoid the hard
 // striping and swollen extrusion corners of the original placeholder shapes.
 function rounded(w,h,d,r=.08){
  const key=[w,h,d,r].join(',');if(roundedCache.has(key))return roundedCache.get(key);
  const g=new THREE.BoxGeometry(1,1,1,7,7,7),p=g.attributes.position,n=g.attributes.normal;
  const half=[w/2,h/2,d/2],inner=half.map(v=>v-r),v=new THREE.Vector3(),q=new THREE.Vector3();
  const axis=(unit,h)=>{const i=Math.round((unit+.5)*7);return [-h,-h+r*.134,-h+r*.5,-h+r,h-r,h-r*.5,h-r*.134,h][i];};
  for(let i=0;i<p.count;i++){
   v.set(axis(p.getX(i),half[0]),axis(p.getY(i),half[1]),axis(p.getZ(i),half[2]));
   q.set(THREE.MathUtils.clamp(v.x,-inner[0],inner[0]),THREE.MathUtils.clamp(v.y,-inner[1],inner[1]),THREE.MathUtils.clamp(v.z,-inner[2],inner[2]));
   v.sub(q).normalize();n.setXYZ(i,v.x,v.y,v.z);v.multiplyScalar(r).add(q);p.setXYZ(i,v.x,v.y,v.z);
  }
  p.needsUpdate=true;n.needsUpdate=true;g.computeBoundingSphere();roundedCache.set(key,g);return g;
 }
 function add(geo,mat,pos,parent=group){const o=new THREE.Mesh(geo,mat);o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 function box(w,h,d,mat,pos,parent=group,r=.055){return add(rounded(w,h,d,Math.min(r,w/4,h/4,d/4)),mat,pos,parent);}
 const sphere=new THREE.SphereGeometry(1,32,20);
 function ell(x,y,z,mat,pos,parent=group){const o=add(sphere,mat,pos,parent);o.scale.set(x,y,z);return o;}
 function cyl(top,bottom,h,mat,pos,parent=group,n=40){return add(new THREE.CylinderGeometry(top,bottom,h,n),mat,pos,parent);}
 function target(id,label,obj,pos){targets.push({id,label,object:obj,position:new THREE.Vector3(...pos)});obj.traverse(m=>m.userData.interactive=id);}
 // Open dollhouse shell with intentionally beveled edges and broad painted surfaces.
 box(7.3,.20,6.7,wood,[0,-.12,0],group,.1);
 const floorMats=['#d7c4a3','#d1bc9a','#d9c7a8','#d3bd9c'].map(material);
 for(let i=0;i<12;i++)box(7.1,.045,.54,floorMats[i%4],[0,.002,-2.99+i*.54],group,.008);
 box(7.3,3.7,.16,cream,[0,1.74,-3.28]);const leftWall=box(.16,3.7,6.7,cream,[-3.56,1.74,0]);
 box(7.15,.15,.11,white,[0,.12,-3.15]);box(.11,.15,6.45,white,[-3.43,.12,0]);
 // Bright painted outdoor view, not a large downloaded image.
 const windowGroup=new THREE.Group();windowGroup.position.set(-1.55,2.13,-3.14);group.add(windowGroup);
 const sky=new THREE.MeshBasicMaterial({color:'#badbd7'});box(2.5,2.0,.06,sky,[0,0,0],windowGroup);
 const hill=ell(1.22,.40,.025,material('#aabe8d'),[0,-.72,.055],windowGroup);hill.castShadow=false;
 for(const x of [-1.27,0,1.27])box(.085,2.12,.13,white,[x,0,.11],windowGroup);
 for(const y of [-1.02,0,1.02])box(2.6,.085,.13,white,[0,y,.11],windowGroup);
 // A single continuous sheet per curtain, with connected folds and a draped hem.
 const curtainMat=material('#a5b18b');curtainMat.side=THREE.DoubleSide;
 for(const side of [-1,1]){
  const g=new THREE.PlaneGeometry(.60,2.22,30,26),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
   const u=(p.getX(i)+.30)/.60,t=(1.11-p.getY(i))/2.22;
   const drape=Math.sin(u*Math.PI*6),width=.88+.12*Math.sin(t*Math.PI*.8);
   p.setXYZ(i,p.getX(i)*width+side*.035*Math.sin(t*Math.PI),p.getY(i)-.035*(1-Math.cos(u*Math.PI*6))*t*t,.075*drape+.025*Math.sin(t*Math.PI));
  }
  g.computeVertexNormals();add(g,curtainMat,[side*1.56,-.06,.25],windowGroup);
  for(let i=0;i<4;i++){const ring=add(new THREE.TorusGeometry(.052,.012,8,16),wood,[side*1.56-.23+i*.15,1.105,.25],windowGroup);ring.rotation.y=Math.PI/2;}
 }
 box(3.35,.12,.17,wood,[0,1.17,.17],windowGroup);
 // Low window perch.
 const perch=new THREE.Group();perch.position.set(-1.62,0,-2.53);group.add(perch);
 box(2.35,.17,.73,woodLight,[0,.65,0],perch);box(2.25,.18,.67,fabric,[0,.80,0],perch);
 for(const x of [-.95,.95])box(.12,.62,.50,wood,[x,.30,0],perch);
 target('window','窗边晒太阳',perch,[-1.3,0,-1.6]);
 // Armchair, exposed tapered legs and soft cushions.
 const chair=new THREE.Group();chair.position.set(2.10,0,-1.85);chair.rotation.y=-.23;group.add(chair);
 for(const x of [-.49,.49])for(const z of [-.36,.36]){const leg=cyl(.06,.045,.36,wood,[x,.18,z],chair,20);leg.rotation.z=-x*.10;}
 box(1.35,.37,1.1,sage,[0,.58,0],chair,.17);box(1.28,1.15,.30,sage,[0,1.11,-.42],chair,.15);box(1.03,.18,.90,fabric,[0,.85,.02],chair,.08);
 for(const x of [-.61,.61])box(.25,.61,1.02,sage,[x,.92,0],chair,.10);
 const cushion=box(.59,.55,.15,white,[.12,1.12,-.19],chair,.12);cushion.rotation.z=.16;
 // Warm bookshelf at the back and a few individually colored books.
 const shelf=new THREE.Group();shelf.position.set(1.10,0,-3.0);group.add(shelf);
 for(const y of [.18,.94,1.7])box(1.25,.09,.45,woodLight,[0,y,0],shelf);
 for(const x of [-.58,.58])box(.09,1.7,.45,wood,[x,.85,0],shelf);
 const books=['#b8bb93','#d4aa8f','#e0d2af','#8faaa0'];for(let i=0;i<6;i++){const b=box(.12,.38+(i%3)*.07,.26,material(books[i%4]),[-.43+i*.15,.42+(i%3)*.035,.03],shelf,.007);b.rotation.z=(i===5?-.14:0);}
 for(let i=0;i<4;i++)box(.12,.45,.28,material(books[i]),[-.43+i*.15,1.20,0],shelf,.008);
 function plant(pos){const g=new THREE.Group();g.position.set(...pos);group.add(g);cyl(.19,.13,.31,white,[0,.15,0],g);cyl(.17,.17,.02,wood,[0,.31,0],g);for(let i=0;i<6;i++){const a=i*1.05;const leaf=ell(.11,.28,.04,i%2?sage:dark,[Math.cos(a)*.12,.52+(i%2)*.1,Math.sin(a)*.1],g);leaf.rotation.z=Math.cos(a)*-.7;leaf.rotation.x=Math.sin(a)*.5;}return g;}
 plant([1.14,1.74,-3]);plant([-2.8,.90,-2.7]);
 // Quiet framed botanical print.
 box(.64,.79,.065,wood,[2.65,2.48,-3.13]);box(.54,.69,.04,white,[2.65,2.48,-3.08]);const flower=ell(.13,.17,.013,pink,[2.65,2.57,-3.04]);flower.castShadow=false;box(.025,.31,.015,dark,[2.65,2.31,-3.03]);
 const rug=cyl(1,1,.035,rugMat,[0,.05,.20],group,128);rug.scale.set(2.05,1,1.65);
 const rugInner=cyl(1,1,.014,white,[0,.075,.20],group,128);rugInner.scale.set(1.81,1,1.41);const rugCenter=cyl(1,1,.014,rugMat,[0,.085,.20],group,128);rugCenter.scale.set(1.61,1,1.23);
 const stitchPoints=[];for(let i=0;i<112;i++){const a=i/112*Math.PI*2,b=a+.024;stitchPoints.push(new THREE.Vector3(Math.cos(a)*1.96,.072,.20+Math.sin(a)*1.56),new THREE.Vector3(Math.cos(b)*1.96,.072,.20+Math.sin(b)*1.56));}
 group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(stitchPoints),new THREE.LineBasicMaterial({color:'#eae7d1',transparent:true,opacity:.65})));
 // Box composed of independent walls; open interior is visible from the camera.
 const cardboard=material('#c3a274'),boxGroup=new THREE.Group();boxGroup.position.set(-2.25,0,.57);boxGroup.rotation.y=.16;group.add(boxGroup);
 box(1.05,.07,.95,cardboard,[0,.08,0],boxGroup);for(const x of [-.50,.50])box(.065,.63,.95,cardboard,[x,.38,0],boxGroup);for(const z of [-.45,.45])box(1.05,.63,.065,cardboard,[0,.38,z],boxGroup);
 for(const s of [-1,1]){const flap=box(.39,.045,.95,cardboard,[s*.67,.66,0],boxGroup);flap.rotation.z=-s*.35;}
 const boxBlanket=box(.76,.10,.72,fabric,[0,.20,0],boxGroup,.05);target('box','钻钻纸箱',boxGroup,[-1.85,0,1.5]);
 const bed=new THREE.Group();bed.position.set(2.20,0,.85);group.add(bed);
 const base=cyl(.69,.65,.17,sage,[0,.15,0],bed,72);base.scale.z=.85;const ring=add(new THREE.TorusGeometry(.56,.15,20,96),fabric,[0,.29,0],bed);ring.rotation.x=Math.PI/2;ring.scale.y=.85;const pad=ell(.53,.085,.445,white,[0,.22,0],bed);const piping=add(new THREE.TorusGeometry(.56,.009,6,96),white,[0,.437,0],bed);piping.rotation.x=Math.PI/2;piping.scale.y=.85;target('bed','窝里休息',bed,[1.65,0,.95]);
 const bowl=new THREE.Group();bowl.position.set(.27,0,-2.35);group.add(bowl);box(1.15,.06,.59,woodLight,[0,.07,0],bowl);
 for(const x of [-.27,.27]){cyl(.22,.19,.18,white,[x,.18,0],bowl);const food=cyl(.185,.185,.015,x<0?material('#8d7355'):material('#9ebeb9'),[x,.277,0],bowl);food.castShadow=false;if(x<0)for(let i=0;i<7;i++)ell(.033,.023,.03,wood,[x+Math.sin(i*2.4)*.12,.29,Math.cos(i*2.4)*.11],bowl);}
 target('bowl','吃点猫粮',bowl,[.2,0,-1.45]);
 const ball=new THREE.Group();ball.position.set(-.64,.20,1.91);group.add(ball);ell(.18,.18,.18,pink,[0,0,0],ball);const stripe=add(new THREE.TorusGeometry(.177,.016,10,48),white,[0,0,0],ball);stripe.rotation.x=.7;target('ball','追追小球',ball,[-.45,0,1.30]);
 // Extra arrangement changes are visible, while every interaction remains reachable.
 const extras={box:new THREE.Group(),bed:new THREE.Group(),perch:new THREE.Group()};for(const g of Object.values(extras))group.add(g);
 const extraBox=box(.70,.40,.62,cardboard,[-2.62,.22,1.72],extras.box);extraBox.rotation.y=-.20;box(.51,.055,.42,fabric,[-2.62,.45,1.72],extras.box);
 const extraBed=ell(.52,.13,.36,pink,[2.5,.17,1.84],extras.bed);extraBed.rotation.y=-.22;
 box(.87,.11,.65,woodLight,[-1.9,.28,-1.69],extras.perch);for(const x of [-2.20,-1.6])box(.07,.28,.52,wood,[x,.14,-1.69],extras.perch);
 function setTheme(id){const p={sage:['#a0ad83','#b2bd94','#d0d3ad','#a5b18b','#d1a995'],peach:['#cda895','#e0bfaa','#dbc2a9','#c7bda3','#b1ba94'],lavender:['#aaa7bb','#c1bbd0','#c6c4d2','#b4b7bd','#d1b099']}[id]||['#a0ad83','#b2bd94','#d0d3ad','#a5b18b','#d1a995'];[sage,fabric,rugMat,curtainMat,pink].forEach((m,i)=>m.color.set(p[i]));}
 function setFurniture(id){for(const [key,g] of Object.entries(extras))g.visible=key===id;}
 let playUntil=0;
 function play(time){playUntil=time+3;}
 function update(dt,time){if(time<playUntil){ball.position.x=-.64+Math.sin(time*3.5)*.40;ball.position.z=1.91+Math.cos(time*3)*.12;ball.rotation.x+=dt*4;}else{ball.position.x=THREE.MathUtils.lerp(ball.position.x,-.64,dt*5);ball.position.z=THREE.MathUtils.lerp(ball.position.z,1.91,dt*5);}}
 setFurniture('box');return {group,targets,setTheme,setFurniture,update,play,leftWall};
}
