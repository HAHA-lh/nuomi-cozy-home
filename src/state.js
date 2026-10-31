export const STORAGE_KEY = 'nuomi-cozy-prototype-v1';
const hats=['none','beret','leaf','bunny'], themes=['sage','peach','lavender'], furniture=['box','bed','perch'], seasons=['spring','summer','autumn','winter'];
export function createDefaultState(){return {version:1,hat:'none',theme:'sage',furniture:'box',season:'spring',night:false,affection:20,fullness:70,cleanliness:85,interactions:0,muted:true,photos:[]};}
const clamp=(v,d)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(100,Math.round(v))):d;
export function sanitizeState(input){
  const d=createDefaultState(); if(!input||typeof input!=='object'||Array.isArray(input))return d;
  for(const [k,values] of [['hat',hats],['theme',themes],['furniture',furniture],['season',seasons]])if(values.includes(input[k]))d[k]=input[k];
  for(const k of ['affection','fullness','cleanliness'])d[k]=clamp(input[k],d[k]);
  d.interactions=Number.isSafeInteger(input.interactions)?Math.max(0,Math.min(999999,input.interactions)):0;
  d.muted=typeof input.muted==='boolean'?input.muted:true;
  d.night=typeof input.night==='boolean'?input.night:false;
  if(Array.isArray(input.photos))d.photos=input.photos.filter(p=>p&&typeof p.id==='string'&&p.id.length<100&&typeof p.createdAt==='number'&&Number.isFinite(p.createdAt)&&typeof p.url==='string'&&/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(p.url)&&p.url.length<1400000).slice(-4).map(p=>({id:p.id,createdAt:p.createdAt,url:p.url}));
  return d;
}
export function loadState(storage){try{return sanitizeState(JSON.parse(storage.getItem(STORAGE_KEY)));}catch{return createDefaultState();}}
export function saveState(storage,state){try{storage.setItem(STORAGE_KEY,JSON.stringify(sanitizeState(state)));return true;}catch{return false;}}
export function applyAction(state,action){const s=sanitizeState(state);switch(action?.type){case 'pet':s.affection+=3;s.interactions++;break;case 'play':s.affection+=5;s.interactions++;break;case 'feed':s.fullness+=20;s.affection+=2;s.interactions++;break;case 'clean':s.cleanliness=100;s.interactions++;break;case 'hat':if(hats.includes(action.value))s.hat=action.value;break;case 'theme':if(themes.includes(action.value))s.theme=action.value;break;case 'furniture':if(furniture.includes(action.value))s.furniture=action.value;break;case 'season':if(seasons.includes(action.value))s.season=action.value;break;case 'night':s.night=Boolean(action.value);break;case 'mute':s.muted=Boolean(action.value);break;case 'photo':s.photos.push(action.value);break;}return sanitizeState(s);}
