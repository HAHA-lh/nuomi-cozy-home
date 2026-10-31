// Logical screen pixels in both browser PointerEvents and WeChat TouchEvents.
// Keep camera changes separate from taps so a pinch can never feed/pet the cat.
export function createSceneGestures({isScenePoint=()=>true,onChange=()=>{},onTap=()=>{}}={}){
 const active=new Map();let pair=null,tapBlocked=false;
 function update(points,add=false){
  const ids=new Set(points.map(p=>p.id));
  for(const id of active.keys())if(!ids.has(id))active.delete(id);
  for(const p of points){
   if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
   let record=active.get(p.id);
   if(!record&&add){record={...p,startX:p.x,startY:p.y,scene:!!isScenePoint(p),moved:false};active.set(p.id,record);}
   if(record){record.x=p.x;record.y=p.y;if(Math.hypot(p.x-record.startX,p.y-record.startY)>6)record.moved=true;}
  }
  if(points.length>1)tapBlocked=true;
 }
 function sample(){
  if(active.size!==2)return null;
  const [a,b]=[...active.values()];if(!a.scene||!b.scene)return null;
  return {ids:[a.id,b.id],x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};
 }
 function samePair(a,b){return a&&b&&a.ids[0]===b.ids[0]&&a.ids[1]===b.ids[1];}
 function start(points){update(points,true);pair=sample();}
 function move(points){
  update(points);const next=sample();
  if(samePair(pair,next)){
   const dx=next.x-pair.x,dy=next.y-pair.y;
   // Fingers nearly overlapping have no reliable scale direction.
   const zoomRatio=pair.distance>=8&&next.distance>=8?pair.distance/next.distance:1;
   if(dx||dy||zoomRatio!==1)onChange({dx,dy,zoomRatio});
  }
  pair=next;
 }
 function end(remaining,changed=[]){
  let tap;
  if(!tapBlocked&&active.size===1&&remaining.length===0){
   const record=[...active.values()][0],p=changed.find(p=>p.id===record.id);
   if(p&&!record.moved&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.hypot(p.x-record.startX,p.y-record.startY)<=6)tap={id:p.id,x:p.x,y:p.y,startX:record.startX,startY:record.startY,scene:record.scene};
  }
  update(remaining);pair=sample();
  if(!active.size){pair=null;tapBlocked=false;}
  if(tap)onTap(tap);
 }
 function cancel(){active.clear();pair=null;tapBlocked=false;}
 return {start,move,end,cancel};
}

export function adjustSceneCamera({azimuth,elevation,zoom},{dx,dy,zoomRatio}){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 return {azimuth:clamp(azimuth-dx*.005,-.9,1.1),elevation:clamp(elevation+dy*.003,.15,.8),zoom:clamp(zoom*zoomRatio,3,11)};
}
