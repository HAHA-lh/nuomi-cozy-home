import * as THREE from '../vendor/three.module.js';

// Reuse the source rig's raised walking tail. Only the tail is adjusted for
// furniture clearance; the source clips, skin weights and body motion stay intact.
export function createTailClearance(model, animations) {
  const bones=[];model.traverse(node=>{if(node.isBone&&/^SKN_tail_/.test(node.name))bones.push(node);});
  const walk=animations.find(clip=>clip.name==='walk');
  if(!walk || !bones.length)return {apply(){},restore(){},available:false};
  const sampler=new THREE.AnimationMixer(model);
  sampler.clipAction(walk).play();sampler.setTime(walk.duration*.25);
  model.updateWorldMatrix(true,true);
  const modelInverse=model.getWorldQuaternion(new THREE.Quaternion()).invert();
  const raised=bones.map(bone=>({position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone(),
    root:!/^SKN_tail_/.test(bone.parent.name),modelQuaternion:modelInverse.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()))}));
  // Bring the tail upward while manoeuvring so forward-only turns do not need
  // the large footprint of a tail held straight behind the body.
  const tuck=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.65);
  for(const pose of raised)if(pose.root)pose.modelQuaternion.premultiply(tuck);
  sampler.stopAllAction();sampler.uncacheRoot(model);
  const animated=bones.map(bone=>({position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()}));
  let overridden=false;
  const parentRotation=new THREE.Quaternion(),modelRotation=new THREE.Quaternion(),targetRotation=new THREE.Quaternion();
  return {
    available:true,
    restore(){
      if(!overridden)return;
      for(let i=0;i<bones.length;i++){
        bones[i].position.copy(animated[i].position);
        bones[i].quaternion.copy(animated[i].quaternion);
        bones[i].scale.copy(animated[i].scale);
      }
      overridden=false;
    },
    apply(amount){
      if(amount<=0)return;
      for(let i=0;i<bones.length;i++){
        animated[i].position.copy(bones[i].position);
        animated[i].quaternion.copy(bones[i].quaternion);
        animated[i].scale.copy(bones[i].scale);
        if(raised[i].root){
          // Idle and walk rotate the pelvis differently. Match model-space
          // orientation while retaining the animated root attachment point.
          bones[i].parent.updateWorldMatrix(true,false);
          bones[i].parent.getWorldQuaternion(parentRotation);
          model.getWorldQuaternion(modelRotation);
          targetRotation.copy(parentRotation).invert().multiply(modelRotation).multiply(raised[i].modelQuaternion);
          bones[i].quaternion.slerp(targetRotation,amount);
        }else{
          bones[i].position.lerp(raised[i].position,amount);
          bones[i].quaternion.slerp(raised[i].quaternion,amount);
        }
        bones[i].scale.lerp(raised[i].scale,amount);
      }
      overridden=true;
    },
  };
}
