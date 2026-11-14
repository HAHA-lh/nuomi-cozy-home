// Shared by browser and WeChat: acknowledge the click with the head, then
// prepare the standing pose, turn the body, and finally allow translation.
export function createCatIntent(){
  let elapsed=Infinity,point=null;
  return {
    begin(target){point={x:target.x,z:target.z};elapsed=0;},
    cancel(){point=null;elapsed=Infinity;},
    update(dt,pose){
      elapsed+=Math.max(0,dt);
      const angle=point?Math.atan2(point.x-pose.x,point.z-pose.z):pose.yaw;
      const yaw=Math.atan2(Math.sin(angle-pose.yaw),Math.cos(angle-pose.yaw));
      const look=elapsed<.60,prepare=elapsed>=.60&&elapsed<.88;
      return {hold:elapsed<.88,prepare,lookYaw:look?Math.max(-.45,Math.min(.45,yaw)):undefined,
        lookWeight:Math.max(0,Math.min(1,elapsed/.20,(.60-elapsed)/.18)),phase:look?'look':prepare?'prepare':'travel'};
    }
  };
}
