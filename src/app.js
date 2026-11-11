import * as THREE from '../vendor/three.module.js';
import { advanceCatPose, safeCatFacing } from './cat-navigation.js';
import { loadBlenderCat } from './blender-cat.js';
import { loadImportedRoom, COZY_ROOM_VIEW } from './imported-room.js';
import { loadState, saveState, applyAction } from './state.js';
import { ROOM_CAT_SCALE } from './room-cat-size.js';
import { loadRoomSeasons } from './room-seasons.js';
import { addRoomContactShadows } from './room-contact-shadows.js';
import { createSceneGestures, adjustSceneCamera } from './scene-gestures.js';
import { connectStudioTuning } from './studio-tuning.js';

const $=s=>document.querySelector(s), icon=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
let storage;try{storage=window.localStorage;}catch{storage={getItem(){return null;},setItem(){throw Error('Storage unavailable');}};}
let state=loadState(storage),tab='care',renderer,scene,camera,cat,room,seasons;
let action='idle',actionEnd=0,pendingAction=null,time=0,lastStamp=0,night=state.night;
let azimuth=COZY_ROOM_VIEW.azimuth,elevation=COZY_ROOM_VIEW.elevation,viewHeight=COZY_ROOM_VIEW.height,targetView=COZY_ROOM_VIEW.height,wardrobeFacing=.22;
const focus=new THREE.Vector3(...COZY_ROOM_VIEW.focus),desiredFocus=focus.clone();let walking=false,route=[];
let catScale=ROOM_CAT_SCALE;
let tailClearance=1;
let roomViewHeight=COZY_ROOM_VIEW.height, portraitViewHeight=3.8, pace=1;
function applyStudioValue(id,value) {
  if (id==='cat.pace') pace=value;
  if (id==='camera.room') {
    roomViewHeight=value;
    if(tab!=='wardrobe') targetView=value;
  }
  if (id==='camera.portrait') {
    portraitViewHeight=value;
    if(tab==='wardrobe') targetView=value;
  }
}
const presentation=()=>({wardrobeFocusHeight:1.25*catScale,bubbleHeight:2.65*catScale,walkSpeed:1.25*catScale*pace});
const themes=[['sage','鼠尾草','#a0ad83','清新 · 松弛'],['peach','奶油桃','#cda895','温暖 · 柔软'],['lavender','雾紫色','#aaa7bb','安静 · 治愈']];
const hatNames={none:'原本的软绒绒',beret:'奶油贝雷帽',leaf:'头顶小嫩芽',bunny:'软软兔耳帽'};
const decorNames={box:'软椅陪伴角',bed:'沙发休息角',perch:'窗边日光角'};
let toastTimeout,bubbleTimeout,audioContext;
const reducedLightMotion=window.matchMedia('(prefers-reduced-motion: reduce)');

function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('#toast').classList.remove('show'),2800);}
function bubble(text){$('#cat-bubble').textContent=text;$('#cat-bubble').classList.add('show');clearTimeout(bubbleTimeout);bubbleTimeout=setTimeout(()=>$('#cat-bubble').classList.remove('show'),2400);}
function persist(){const ok=saveState(storage,state);$('#save-label').textContent=ok?'进度已保存在这台设备':'当前仅临时保存，浏览器存储不可用';$('#save-dot').style.background=ok?'#9bad87':'#ca9a6f';return ok;}
function commit(a){state=applyAction(state,a);const saved=persist();renderStats();return saved;}
function sound(high=false){if(state.muted)return;try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume().catch(()=>{});const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.setValueAtTime(high?620:430,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(high?830:580,audioContext.currentTime+.10);g.gain.setValueAtTime(.045,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.18);o.connect(g).connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.19);}catch{}}
function renderStats(){for(const k of ['affection','fullness','cleanliness']){$(`#${k}-value`).textContent=state[k];$(`#${k}-meter`).style.width=state[k]+'%';}$('#album-count').textContent=state.photos.length;$('#album-count').hidden=!state.photos.length;$('#cat-mood').textContent=state.affection>=65?'听见你的声音，就想靠近一点。':'把普通的一天，过得软乎乎。';}
function syncSeasonControls(){
 document.querySelectorAll('[data-season]').forEach(b=>{const selected=Boolean(seasons)&&b.dataset.season===state.season;b.disabled=!seasons;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 const current=seasons?.config.seasons[state.season];
 $('#season-description').textContent=current?.description||'四季素材暂未就绪，小屋仍可正常玩耍。';
 $('#light-label').textContent=(current?.label||'奶油小屋')+' · '+(night?'暮色暖灯':'日间光线');
 $('#light-button').innerHTML=icon(night?'moon':'sun');$('#light-button').title=$('#light-button').ariaLabel=night?'切换日间光线':'切换暮色暖灯';
 if(renderer){renderer.domElement.dataset.season=seasons?state.season:'unavailable';renderer.domElement.dataset.timeOfDay=night?'dusk':'day';}
}
function refreshRoomReflection(){
 const hidden=[marker,particleGroup].filter(Boolean),visible=hidden.map(o=>o.visible);hidden.forEach(o=>o.visible=false);
 try{room.prepareReflection(renderer,scene,cat.group);}catch(error){console.warn('Room reflection refresh failed',error);}finally{hidden.forEach((o,i)=>o.visible=visible[i]);}
}
function setDusk(value,instant=false){
 night=Boolean(value);
 if(seasons)seasons.setNight(night,instant);
 else{keyLight.color.set(night?'#ffc991':'#fff0d6');keyLight.intensity=night?1:1.55;hemi.intensity=night?.85:1.65;fillLight.color.set(night?'#b1b9ed':'#d4e7ed');scene.background.set(night?'#c7c7bc':'#e8e5dc');refreshRoomReflection();}
 syncSeasonControls();
}
function hatSVG(id){
 const start='<svg viewBox="0 0 100 80" aria-hidden="true" style="stroke:none">';
 const shapes={none:'<path d="M24 31 23 9 40 24Q51 20 62 24L78 9 77 36C94 74 9 77 24 31" fill="#e2dfd1"/><path d="m27 17 10 13-10 3m47-16-10 13 10 3" fill="#cfaaa0"/><ellipse cx="38" cy="45" rx="5" ry="7" fill="#71835d"/><ellipse cx="64" cy="45" rx="5" ry="7" fill="#71835d"/><path d="m47 56 4 5 4-5" fill="#bb8d85"/>',beret:'<ellipse cx="51" cy="57" rx="29" ry="7" fill="#aa8e60"/><path d="M14 49C13 16 76 7 88 41 99 63 24 69 14 49" fill="#d9bc83"/><rect x="48" y="14" width="6" height="12" rx="3" fill="#b49664"/>',leaf:'<path d="M50 65 48 31" fill="none" stroke="#798c57" stroke-width="5"/><path d="M48 40C18 42 19 18 23 18c20-4 29 10 25 22" fill="#9eaf73"/><path d="M49 32C48 12 73 9 79 14 75 34 60 40 49 32" fill="#7d995e"/>',bunny:'<ellipse cx="51" cy="60" rx="33" ry="10" fill="#ddd3b8"/><ellipse cx="37" cy="33" rx="12" ry="29" transform="rotate(-12 37 33)" fill="#ece4ce"/><ellipse cx="66" cy="33" rx="12" ry="29" transform="rotate(12 66 33)" fill="#ece4ce"/><ellipse cx="37" cy="31" rx="5" ry="20" transform="rotate(-12 37 31)" fill="#d8aaa2"/><ellipse cx="66" cy="31" rx="5" ry="20" transform="rotate(12 66 31)" fill="#d8aaa2"/>'};return start+shapes[id]+'</svg>';
}
function renderPanel(){
 let html='';
 if(tab==='care')html=`<div class="panel-heading"><h3>陪它一小会儿</h3><span>JUST YOU & ME</span></div><p class="panel-description">不用赶时间，今天也有小小的快乐。</p><div class="care-grid"><button class="care-button" data-care="pet">${icon('heart')}摸摸脑袋<small>亲密 +3</small></button><button class="care-button" data-care="feed">${icon('bowl')}开饭时间<small>饱腹 +20</small></button><button class="care-button" data-care="play">${icon('ball')}一起玩球<small>亲密 +5</small></button><button class="care-button" data-care="clean">${icon('spark')}打扫小屋<small>清洁恢复</small></button></div><div class="story-card"><span class="eyebrow">TODAY’S LITTLE MEMORY</span><p>${state.interactions>0?`今天已经收获 ${state.interactions} 次小小的陪伴。<br>糯米把这些温柔，都记住了。`:'它已经选好了晒太阳的位置。<br>你呢，要不要坐下来陪一会儿？'}</p><small>试试直接点击场景里的猫或小球。</small></div>`;
 if(tab==='wardrobe')html=`<div class="panel-heading"><h3>今天，戴哪一顶？</h3><span>04 / FREE TO TRY</span></div><p class="panel-description">独立 3D 配饰，换装时动作会继续。</p><div class="hat-grid">${Object.entries(hatNames).map(([id,name])=>`<button class="hat-card ${state.hat===id?'selected':''}" data-hat="${id}" aria-pressed="${state.hat===id}"><span class="hat-illustration">${hatSVG(id)}</span>${state.hat===id?`<svg class="hat-check"><use href="#i-check"/></svg>`:''}<strong>${name}</strong><small>${id==='none'?'不戴帽子':'免费试戴'}</small></button>`).join('')}</div><p class="feature-note">双指拖动旋转，双指开合缩放。<br>这版先验证头部配饰；全身毛衣尚未开放。</p>`;
 if(tab==='decorate')html=`<div class="panel-heading"><h3>把日子布置成喜欢的样子</h3></div><p class="panel-description">配色、软装和角落，点击就能换。</p><span class="section-label">小屋配色</span><div class="theme-row">${themes.map(([id,n,c,sub])=>`<button class="theme-button ${state.theme===id?'selected':''}" data-theme="${id}" aria-pressed="${state.theme===id}"><span class="swatch" style="background:${c}"></span>${n}<small>${sub}</small></button>`).join('')}</div><span class="section-label">添一个喜欢的角落</span>${[['box','▱','纸箱探险角','多一只小纸箱，藏点小心思'],['bed','☁','柔软午睡角','加一只软垫，留住午后'],['perch','☀','窗边日光角','摆好小台阶，阳光就在眼前']].map(([id,em,n,s])=>`<button class="furniture-button ${state.furniture===id?'selected':''}" data-furniture="${id}" aria-pressed="${state.furniture===id}"><span class="item-emoji">${em}</span><span class="item-text"><strong>${n}</strong><small>${s}</small></span>${state.furniture===id?`<svg class="selection-check"><use href="#i-check"/></svg>`:''}</button>`).join('')}`;
 if(tab==='album')html=`<div class="panel-heading"><h3>把这一刻留下来</h3><span>${String(state.photos.length).padStart(2,'0')} / 04</span></div><p class="panel-description">拍下当前 3D 画面，最近 4 张保存在本机。</p><button class="primary-button" id="capture-button">${icon('camera')}拍一张糯米</button>${state.photos.length?`<div class="album-grid">${state.photos.map((p,i)=>`<button class="photo-thumb" data-photo="${i}" aria-label="打开第 ${i+1} 张照片"><img src="${p.url}" alt="糯米的小屋照片 ${i+1}"><small>${new Date(p.createdAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></button>`).join('')}</div>`:`<div class="empty-album">${icon('camera')}<br>相册还是空的。<br>第一张照片，就从今天开始。</div>`}<p class="feature-note">照片来自实时场景，不是预设图片。<br>点击缩略图可放大或下载。</p>`;
 if(tab==='decorate'&&room?.imported)html=`<div class="panel-heading"><h3>在新的小屋里，陪它一会儿</h3></div><p class="panel-description">保留原场景的奶油色布置；点击下方，选择陪伴位置。</p><span class="section-label">互动小物配色</span><div class="theme-row">${themes.map(([id,n,c])=>`<button class="theme-button ${state.theme===id?'selected':''}" data-theme="${id}" aria-pressed="${state.theme===id}"><span class="swatch" style="background:${c}"></span>${n}<small>食碗 · 小球</small></button>`).join('')}</div><span class="section-label">想在哪里陪它？</span>${[['box','☁','软椅陪伴角','去软椅旁边转一转'],['bed','♡','沙发休息角','在沙发旁安静打个盹'],['perch','☀','窗边日光角','走到窗边看看阳光']].map(([id,em,n,s])=>`<button class="furniture-button ${state.furniture===id?'selected':''}" data-furniture="${id}" aria-pressed="${state.furniture===id}"><span class="item-emoji">${em}</span><span class="item-text"><strong>${n}</strong><small>${s}</small></span></button>`).join('')}<p class="feature-note">沙发、茶几和坐垫有避让区域。<br>猫咪会沿可走动的空地前往目标。</p>`;
 $('#panel').innerHTML=html;
}
function resetRoomView(){azimuth=COZY_ROOM_VIEW.azimuth;elevation=COZY_ROOM_VIEW.elevation;targetView=roomViewHeight;desiredFocus.set(...COZY_ROOM_VIEW.focus);}
function selectTab(id){tab=id;document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===id);b.setAttribute('aria-current',b.dataset.tab===id?'page':'false');});if(id==='wardrobe'){targetView=portraitViewHeight;desiredFocus.copy(cat.group.position).add(new THREE.Vector3(0,presentation().wardrobeFocusHeight,0));azimuth=.22;elevation=.23;}else resetRoomView();renderPanel();sound();}
function startAction(id,duration=3){action=id;actionEnd=time+duration;walking=false;route=[];pendingAction=null;if(marker)marker.visible=false;if(id==='play')room.play(time);}
function moveTo(pos,next='idle'){const navigate=pos.yaw===undefined&&room.navigation.pathNear?room.navigation.pathNear:room.navigation.path;const nextRoute=navigate({...cat.group.position,yaw:cat.group.rotation.y},pos);if(!nextRoute.length){toast('这里暂时走不过去，换一块空地试试。');return false;}route=nextRoute;const end=route.at(-1);walking=true;pendingAction=next;action='idle';actionEnd=0;marker.position.set(end.x,room.surfaceHeight(end.x,end.z)+.035,end.z);marker.visible=true;return true;}
const lastCareAt=new Map();
function care(type){const now=performance.now();if(now-(lastCareAt.get(type)??-Infinity)<400)return;lastCareAt.set(type,now);
 if(type==='feed'&&!moveTo(room.targets.find(t=>t.id==='bowl').position,'feed'))return;
 if(type==='play'&&!moveTo(room.targets.find(t=>t.id==='ball').position,'play'))return;
 commit({type});sound(true);
 if(type==='pet'){startAction('pet');bubble('呼噜呼噜…再摸一下嘛。');particles(cat.group.position,'#c8a0a1');}
 if(type==='feed'){bubble('开饭啦，我来啦！');}
 if(type==='play'){bubble('这颗球，归我啦！');}
 if(type==='clean'){startAction('idle',1);bubble('小屋又变得干干净净啦。');particles(new THREE.Vector3(0,0,0),'#f5e8a9');toast('清洁已恢复 · 小屋焕然一新');}
 if(tab==='care')renderPanel();
}
let keyLight,fillLight,hemi,marker,particleGroup,particlePool=[];
function particles(pos,color){for(let i=0;i<particlePool.length;i++){const p=particlePool[i];p.visible=true;p.position.copy(pos).add(new THREE.Vector3((Math.random()-.5)*1.4,1.4+Math.random()*.8,(Math.random()-.5)*.8).multiplyScalar(catScale));p.material.color.set(color);p.userData={until:time+1.1+Math.random(),speed:.3+Math.random()*.4};}}
async function init(){
 await connectStudioTuning(applyStudioValue);
 try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});}catch(e){fail('浏览器暂不支持 WebGL 2，请开启硬件加速后重试。');return;}
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.98;
 $('#scene').appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','实时 3D 猫咪小屋');renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fail('图形上下文已暂停，点击重新加载恢复；已有进度不会丢失。');});
 scene=new THREE.Scene();scene.background=new THREE.Color('#e5e4d5');camera=new THREE.OrthographicCamera(-5,5,4,-4,.1,80);
 hemi=new THREE.HemisphereLight('#fff6e6','#a3ac93',.95);scene.add(hemi);keyLight=new THREE.DirectionalLight('#fff0d6',2.0);keyLight.position.set(-3,7,5);keyLight.castShadow=true;keyLight.shadow.mapSize.set(1024,1024);Object.assign(keyLight.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.1,far:30});keyLight.shadow.normalBias=.025;keyLight.shadow.bias=-.00015;keyLight.shadow.radius=4;keyLight.shadow.blurSamples=8;keyLight.target.position.set(0,1,0);scene.add(keyLight,keyLight.target);fillLight=new THREE.DirectionalLight('#d4e7ed',.35);fillLight.position.set(4,4,1);scene.add(fillLight);
 [room,cat]=await Promise.all([loadImportedRoom(),loadBlenderCat()]);scene.add(room.group);catScale=room.catScale;cat.group.scale.setScalar(catScale);cat.group.position.copy(room.spawn);cat.group.rotation.y=room.spawn.yaw;scene.add(cat.group);room.setTheme(state.theme);room.setFurniture(state.furniture);cat.setHat(state.hat);
 addRoomContactShadows(room);
 keyLight.shadow.radius=6;
 scene.background.set('#e8e5dc');hemi.intensity=1.65;keyLight.intensity=1.55;keyLight.position.set(-3,8,5);keyLight.shadow.normalBias=.025;fillLight.intensity=.8;
 try{seasons=await loadRoomSeasons({room,scene,renderer,lights:{hemi,key:keyLight,fill:fillLight},onSettled:refreshRoomReflection});seasons.initialize(state.season,night);}catch(error){console.warn('Season assets unavailable',error);setDusk(night,true);toast('四季装饰暂未加载，小屋和猫咪仍可正常互动。');}
 syncSeasonControls();
 renderer.domElement.dataset.room='cozy-room-final';renderer.domElement.dataset.roomMeshes=String(room.batching.after);renderer.domElement.dataset.catScale=String(catScale);
 marker=new THREE.Mesh(new THREE.RingGeometry(.16,.19,36),new THREE.MeshBasicMaterial({color:'#8b9c70',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.visible=false;scene.add(marker);
 particleGroup=new THREE.Group();scene.add(particleGroup);const pg=new THREE.SphereGeometry(.035,6,4);for(let i=0;i<15;i++){const p=new THREE.Mesh(pg,new THREE.MeshBasicMaterial({color:'#dfbc92',transparent:true}));p.visible=false;particleGroup.add(p);particlePool.push(p);}
 const resize=()=>{const el=$('#scene');renderer.setSize(el.clientWidth,el.clientHeight,false);updateCamera(1);};new ResizeObserver(resize).observe($('#scene'));resize();
 setupPointer();renderStats();renderPanel();syncSound();$('#loading').hidden=true;
 if(cat.group.userData.quality?.fallback)toast('新猫加载失败，暂时显示旧模型。请重新加载检查。');
 renderer.domElement.dataset.character=cat.group.userData.quality?.fallback?'legacy-fallback':'birman';
 requestAnimationFrame(frame);
}
function fail(message){$('#loading').hidden=true;$('#error-detail').textContent=message;$('#render-error').hidden=false;}
function updateCamera(dt){viewHeight=THREE.MathUtils.lerp(viewHeight,targetView,Math.min(1,dt*5));focus.lerp(desiredFocus,Math.min(1,dt*5));const el=$('#scene'),aspect=el.clientWidth/Math.max(1,el.clientHeight);const fittedHeight=viewHeight/Math.min(1,aspect/1.15);camera.left=-fittedHeight*aspect/2;camera.right=fittedHeight*aspect/2;camera.top=fittedHeight/2;camera.bottom=-fittedHeight/2;camera.updateProjectionMatrix();const distance=12;camera.position.set(focus.x+Math.sin(azimuth)*Math.cos(elevation)*distance,focus.y+Math.sin(elevation)*distance,focus.z+Math.cos(azimuth)*Math.cos(elevation)*distance);camera.lookAt(focus);}
const bubblePoint=new THREE.Vector3();let accumulator=0;
function frame(stamp){requestAnimationFrame(frame);if(document.hidden){lastStamp=stamp;return;}const delta=lastStamp?Math.min((stamp-lastStamp)/1000,.1):.016;lastStamp=stamp;accumulator+=delta;if(accumulator<1/30)return;const dt=Math.min(accumulator,.07);accumulator%=1/30;time+=dt;
 let locomoting=false,strideRate=1;
 const pose={x:cat.group.position.x,z:cat.group.position.z,yaw:cat.group.rotation.y};
 const facing=action==='pet'?azimuth:tab==='wardrobe'&&action==='idle'?wardrobeFacing:null;
 const wantsTurn=facing!==null&&Math.abs(Math.atan2(Math.sin(facing-pose.yaw),Math.cos(facing-pose.yaw)))>.01;
 const liftTail=walking||wantsTurn||!room.canRelaxTail?.(pose);
 tailClearance=THREE.MathUtils.clamp(tailClearance+(liftTail?1:-1)*dt/.3,0,1);
 // Lift before leaving the safe standing pose; relax only where the entire
 // source idle swing and the transition fit. This frees floor beside tables.
 if(walking&&tailClearance>=1){const result=advanceCatPose({...cat.group.position,yaw:cat.group.rotation.y},route[0],room.navigation,dt,presentation().walkSpeed,route.length===1 || (route[1] && Math.hypot(route[0].x-route[1].x,route[0].z-route[1].z)<1e-6));
  const travel=Math.hypot(result.pose.x-cat.group.position.x,result.pose.z-cat.group.position.z);
  strideRate=travel>1e-6?Math.max(.32,Math.min(1.6,travel/(Math.max(.001,dt)*1.25*catScale))):.48;
  cat.group.position.x=result.pose.x;cat.group.position.z=result.pose.z;cat.group.rotation.y=result.pose.yaw;locomoting=result.moving;
  if(result.blocked){startAction('idle');toast('前面空间太窄，换一块空地试试。');}
  else if(result.arrived){route.shift();if(!route.length){walking=false;marker.visible=false;const next=pendingAction||'idle';startAction(next,next==='sleep'?10:3);if(next==='feed')bubble('咔嚓咔嚓，真香。');}}
 }
 else if(!walking&&tailClearance>=1&&action==='feed'){const bowl=room.targets.find(t=>t.id==='bowl').object.position;const desired=Math.atan2(bowl.x-cat.group.position.x,bowl.z-cat.group.position.z);safeCatFacing(cat.group,desired,room.navigation,dt*4);}else if(!walking&&tailClearance>=1&&action==='pet'){safeCatFacing(cat.group,azimuth,room.navigation,dt*4);}
 if(actionEnd&&time>actionEnd){action='idle';actionEnd=0;}
 // Keep the entry pose fixed while orbiting: dragging must reveal the real side/back,
 // rather than having the cat continuously turn to face the camera.
 if(tab==='wardrobe'&&!walking&&action==='idle'&&tailClearance>=1)safeCatFacing(cat.group,wardrobeFacing,room.navigation,dt*4);
 cat.group.position.y=THREE.MathUtils.lerp(cat.group.position.y,room.surfaceHeight(cat.group.position.x,cat.group.position.z),Math.min(1,dt*10));
 if(tab==='wardrobe')desiredFocus.copy(cat.group.position).add(new THREE.Vector3(0,presentation().wardrobeFocusHeight,0));
 cat.update(dt,time,{action,moving:locomoting,strideRate,tailClearance});renderer.domElement.dataset.animation=cat.currentAnimation||action;room.update(dt,time);room.updateVisibility(azimuth);seasons?.update(dt);seasons?.animate(time,reducedLightMotion.matches);updateCamera(dt);
 particlePool.forEach(p=>{if(!p.visible)return;p.position.y+=dt*p.userData.speed;p.material.opacity=Math.min(1,Math.max(0,(p.userData.until-time)*1.4));if(time>p.userData.until)p.visible=false;});
 bubblePoint.copy(cat.group.position).add(new THREE.Vector3(0,presentation().bubbleHeight,0)).project(camera);const r=$('#scene').getBoundingClientRect();$('#cat-bubble').style.left=((bubblePoint.x+1)*.5*r.width)+'px';$('#cat-bubble').style.top=((-bubblePoint.y+1)*.5*r.height)+'px';renderer.render(scene,camera);
}
function setupPointer(){
 const canvas=renderer.domElement,ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),point=new THREE.Vector3(),touches=new Map();let mouse=null;
 function change(delta){const next=adjustSceneCamera({azimuth,elevation,zoom:targetView},delta);azimuth=next.azimuth;elevation=next.elevation;targetView=next.zoom;}
 function tap({x,y}){const rect=canvas.getBoundingClientRect();ndc.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);ray.setFromCamera(ndc,camera);const catHit=ray.intersectObject(cat.group,true)[0];const furnitureHit=ray.intersectObjects(room.targets.map(t=>t.object),true)[0];if(catHit&&(!furnitureHit||catHit.distance<furnitureHit.distance)){care('pet');return;}if(furnitureHit){let o=furnitureHit.object;while(o&&!o.userData.interactive)o=o.parent;const id=o?.userData.interactive,target=room.targets.find(t=>t.id===id);if(id==='bowl')care('feed');else if(id==='ball')care('play');else if(target&&moveTo(target.position,id==='bed'?'sleep':'pet')){bubble(id==='box'?'去软椅旁边陪你。':id==='window'?'这个位置，阳光刚刚好。':'这里好软，想休息一会儿。');sound();}return;}if(ray.ray.intersectPlane(plane,point)&&Math.abs(point.x)<3.3&&point.z>-3&&point.z<3.2&&moveTo(point)){bubble('好呀，去那边看看。');sound();}}
 const gestures=createSceneGestures({isScenePoint:p=>p.scene,onChange:change,onTap:p=>{if(p.scene)tap(p);}}),position=e=>({id:e.pointerId,x:e.clientX,y:e.clientY});
 const cancel=()=>{touches.clear();mouse=null;gestures.cancel();};
 // Observe every touch origin, including DOM controls. A mixed UI/scene
 // gesture must never turn into a pet tap when either finger lifts first.
 window.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch')return;
  mouse=null;touches.set(e.pointerId,{...position(e),scene:e.target===canvas});gestures.start([...touches.values()]);
  if(e.target===canvas)canvas.setPointerCapture(e.pointerId);
 },true);
 window.addEventListener('pointermove',e=>{
  if(e.pointerType!=='touch'||!touches.has(e.pointerId))return;
  touches.set(e.pointerId,{...touches.get(e.pointerId),...position(e)});gestures.move([...touches.values()]);
 },true);
 window.addEventListener('pointerup',e=>{
  if(e.pointerType!=='touch'||!touches.has(e.pointerId))return;
  touches.delete(e.pointerId);gestures.end([...touches.values()],[position(e)]);
  if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
 },true);
 window.addEventListener('pointercancel',cancel,true);
 canvas.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch')return;
  if(e.button===0&&!touches.size)mouse={...position(e),startX:e.clientX,startY:e.clientY,moved:false};else return;
  canvas.setPointerCapture(e.pointerId);
 });
 canvas.addEventListener('pointermove',e=>{
  if(e.pointerType==='touch')return;
  if(!mouse||mouse.id!==e.pointerId)return;if(Math.hypot(e.clientX-mouse.startX,e.clientY-mouse.startY)>6)mouse.moved=true;
  if(mouse.moved)change({dx:e.clientX-mouse.x,dy:e.clientY-mouse.y,zoomRatio:1});mouse.x=e.clientX;mouse.y=e.clientY;
 });
 canvas.addEventListener('pointerup',e=>{
  if(e.pointerType==='touch')return;
  if(mouse?.id===e.pointerId){const click=!mouse.moved&&Math.hypot(e.clientX-mouse.startX,e.clientY-mouse.startY)<=6;mouse=null;if(click)tap(position(e));}
  if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
 });
 canvas.addEventListener('lostpointercapture',e=>{if(touches.has(e.pointerId)||mouse?.id===e.pointerId)cancel();});
 window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
 canvas.addEventListener('wheel',e=>{e.preventDefault();const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);targetView=THREE.MathUtils.clamp(targetView+dy*.005,3,11);},{passive:false});
}
function syncSound(){const b=$('#sound-button');b.innerHTML=icon(state.muted?'mute':'volume');b.title=b.ariaLabel=state.muted?'开启音效':'关闭音效';}
function capturePhoto(){
 if(!renderer||!scene){toast('小屋还没有准备好，请稍后再试。');return;}
 try{const markerWasVisible=marker.visible;marker.visible=false;renderer.render(scene,camera);const source=renderer.domElement,scale=Math.min(1,1000/source.width),out=document.createElement('canvas');out.width=Math.round(source.width*scale);out.height=Math.round(source.height*scale)+56;const ctx=out.getContext('2d');ctx.drawImage(source,0,0,out.width,out.height-56);marker.visible=markerWasVisible;ctx.fillStyle='#faf8ed';ctx.fillRect(0,out.height-56,out.width,56);ctx.fillStyle='#71815f';ctx.font='16px "Microsoft YaHei", sans-serif';ctx.fillText('糯米的小屋 · 一点小小的陪伴',20,out.height-24);const createdAt=Date.now(),url=out.toDataURL('image/jpeg',.85);const saved=commit({type:'photo',value:{id:'photo-'+createdAt,createdAt,url}});renderPanel();sound(true);toast(saved?'拍好啦！照片已放入相册。':'照片仅临时保留，请立即打开照片下载。');}catch{toast('照片保存失败，请检查浏览器存储空间。');}
}
document.querySelector('.bottom-nav').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b&&cat)selectTab(b.dataset.tab);});
$('#panel').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!cat)return;if(b.dataset.care){care(b.dataset.care);return;}if(b.dataset.hat){const id=b.dataset.hat;cat.setHat(id);commit({type:'hat',value:id});renderPanel();bubble(id==='none'?'不戴帽子，也很可爱。':'今天的我，有点不一样。');sound();return;}if(b.dataset.theme){room.setTheme(b.dataset.theme);commit({type:'theme',value:b.dataset.theme});renderPanel();toast('食碗和小球换上了 '+themes.find(t=>t[0]===state.theme)[1]+' 配色');sound();return;}if(b.dataset.furniture){room.setFurniture(b.dataset.furniture);commit({type:'furniture',value:b.dataset.furniture});const corner=room.getDecorTarget(state.furniture);const reached=corner&&moveTo(corner.position,state.furniture==='bed'?'sleep':'pet');renderPanel();if(reached)toast('去'+decorNames[state.furniture]+'陪一会儿。');sound();return;}if(b.id==='capture-button'){capturePhoto();return;}if(b.dataset.photo!==undefined){const p=state.photos[Number(b.dataset.photo)];if(p){$('#photo-large').src=p.url;$('#photo-download').href=p.url;$('#photo-download').download=`nuomi-${p.id}.jpg`;$('#photo-dialog').showModal();}}});
$('#sound-button').addEventListener('click',()=>{commit({type:'mute',value:!state.muted});syncSound();sound();toast(state.muted?'音效已关闭':'音效已开启');});
$('#help-button').addEventListener('click',()=>$('#help-dialog').showModal());$('#close-help').onclick=$('#start-playing').onclick=()=>$('#help-dialog').close();$('#close-photo').onclick=()=>$('#photo-dialog').close();
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#reset-camera').onclick=()=>{resetRoomView();toast('回到小屋的默认视角');};$('#zoom-in').onclick=()=>{targetView=Math.max(3,targetView-.7);};$('#zoom-out').onclick=()=>{targetView=Math.min(11,targetView+.7);};
$('#light-button').onclick=()=>{if(!room)return;setDusk(!night);commit({type:'night',value:night});sound();};
$('#season-controls').addEventListener('click',event=>{const button=event.target.closest('[data-season]');if(!button||!seasons)return;const id=button.dataset.season;if(id===state.season)return;seasons.setSeason(id);commit({type:'season',value:id});syncSeasonControls();toast(seasons.config.seasons[id].label+'，陪糯米一起慢慢过。');sound();});
init().catch(error=>{console.error(error);fail('场景加载失败：'+error.message);});
