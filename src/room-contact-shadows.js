import * as THREE from '../vendor/three.module.js';

// A small, static contact layer keeps the furniture grounded under soft light.
// One shared texture and one mesh; it does not add a render pass or shadow map.
export function addRoomContactShadows(room){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(64,64,4,64,64,64);
  g.addColorStop(0,'rgba(65,50,35,0.22)');g.addColorStop(.45,'rgba(65,50,35,0.14)');g.addColorStop(.76,'rgba(65,50,35,0.05)');g.addColorStop(1,'rgba(65,50,35,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,toneMapped:true});
  const positions=[],uv=[],indices=[];
  function patch(x,z,rx,rz){
    const y=room.surfaceHeight(x,z)+.008,offset=positions.length/3;
    positions.push(x-rx,y,z-rz,x-rx,y,z+rz,x+rx,y,z+rz,x+rx,y,z-rz);
    uv.push(0,0,0,1,1,1,1,0);indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
  }
  for(const id of ['F01','F02','F03','F04','F05']){
    const component=room.components[id];if(!component)continue;
    const b=new THREE.Box3().setFromObject(component),c=b.getCenter(new THREE.Vector3()),s=b.getSize(new THREE.Vector3());
    patch(c.x,c.z,s.x*.55,s.z*.55);
  }
  for(const [x,z,r] of [[-1.52,.87,.22],[-1.46,-.87,.19],[-1.15,-1.17,.20]])patch(x*1.7,z*1.7,r*2.1,r*2.1);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Soft furniture contact shadows';mesh.renderOrder=1;room.group.add(mesh);
  return mesh;
}
