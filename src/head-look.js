import * as THREE from '../vendor/three.module.js';

export const HEAD_LOOK_LIMIT=.45;
// Use the actual eye line: several imported helper bones have unrelated tracks.
export function createHeadLook(model,placement){
  const head=model.getObjectByName('SKN_head_06'),left=model.getObjectByName('SKN_L_eye_08'),right=model.getObjectByName('SKN_R_eye_021');
  const saved=new THREE.Quaternion(),parent=new THREE.Quaternion(),world=new THREE.Quaternion(),turn=new THREE.Quaternion();
  const a=new THREE.Vector3(),b=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  let overridden=false;
  return {
    available:Boolean(head&&left&&right),
    restore(){if(overridden){head.quaternion.copy(saved);overridden=false;}},
    apply(yaw,weight=1){
      if(!head||!left||!right||!Number.isFinite(yaw)||weight<=0)return;
      saved.copy(head.quaternion);placement.updateWorldMatrix(true,true);
      left.getWorldPosition(a);right.getWorldPosition(b);a.sub(b);
      const actual=Math.atan2(-a.z,a.x),desired=placement.rotation.y+THREE.MathUtils.clamp(yaw,-HEAD_LOOK_LIMIT,HEAD_LOOK_LIMIT);
      const delta=Math.atan2(Math.sin(desired-actual),Math.cos(desired-actual))*weight;
      head.parent.getWorldQuaternion(parent);head.getWorldQuaternion(world);
      turn.setFromAxisAngle(up,delta);
      head.quaternion.copy(parent.invert().multiply(turn).multiply(world));
      overridden=true;
    }
  };
}
