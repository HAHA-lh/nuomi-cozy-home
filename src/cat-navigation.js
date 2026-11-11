import { createCatCollision } from './cat-collision.js';

const TURN = Math.PI / 4;
const HEADINGS = Array.from({length:8}, (_, i) => ({
  yaw:i*TURN, dx:Math.round(Math.sin(i*TURN)), dz:Math.round(Math.cos(i*TURN)),
}));
const angle = (a,b) => Math.atan2(Math.sin(b-a), Math.cos(b-a));
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const pose = p => ({x:p.x,z:p.z,yaw:p.yaw ?? 0,y:0});

class Frontier {
  items = [];
  push(id, cost) {
    const items = this.items;
    let i = items.length;
    items.push({id,cost});
    while (i > 0) {
      const parent = (i-1) >> 1;
      if (items[parent].cost <= cost) break;
      items[i] = items[parent];
      i = parent;
    }
    items[i] = {id,cost};
  }
  pop() {
    const items = this.items, top = items[0], last = items.pop();
    if (!items.length) return top.id;
    let i=0;
    while (2*i+1 < items.length) {
      let child = 2*i+1;
      if (child+1 < items.length && items[child+1].cost < items[child].cost) child++;
      if (last.cost <= items[child].cost) break;
      items[i] = items[child];
      i = child;
    }
    items[i] = last;
    return top.id;
  }
}

export function createCatNavigation(bounds, obstacles, step=.16, footprint) {
  const collision = createCatCollision(bounds, obstacles, footprint);
  const cols = Math.floor((bounds.maxX-bounds.minX)/step)+1;
  const rows = Math.floor((bounds.maxZ-bounds.minZ)/step)+1;
  const nodes = Array.from({length:cols*rows*8}, (_, i) => {
    const cell=Math.floor(i/8);
    return {x:bounds.minX+(cell%cols)*step,z:bounds.minZ+Math.floor(cell/cols)*step,yaw:HEADINGS[i%8].yaw,y:0};
  });
  const free = nodes.map(collision.isPoseClear);
  const edgeCache = new Map();

  function connector(a,b,backwards=false) {
    const length = distance(a,b);
    const yaw = length < 1e-7 ? a.yaw : Math.atan2(b.x-a.x,b.z-a.z)+(backwards?Math.PI:0);
    const turned = {...a,yaw}, end = {...pose(b),yaw};
    const route = [];
    if (Math.abs(angle(a.yaw,yaw))>1e-6) {
      if (!collision.sweepClear(a,turned)) return null;
      route.push(turned);
    }
    if (length>1e-7) {
      if (!collision.sweepClear(turned,end)) return null;
      route.push(end);
    }
    if (b.yaw!==undefined && Math.abs(angle(yaw,b.yaw))>1e-6) {
      if (!collision.sweepClear(end,b)) return null;
      route.push(pose(b));
    }
    return route.length ? route : [end];
  }
  function connect(a,b,shortReverse=true) {
    const front = connector(a,b);
    if (front || !shortReverse || distance(a,b)>.65) return front;
    const back=connector(a,b,true);
    if (back || distance(a,b)>.42) return back;
    // Replanning halfway through a sideways step must also be able to leave it.
    const end={...pose(b),yaw:a.yaw};
    if (!collision.sweepClear(a,end)) return null;
    if (b.yaw===undefined || Math.abs(angle(a.yaw,b.yaw))<1e-6) return [end];
    return collision.sweepClear(end,b) ? [end,pose(b)] : null;
  }
  function nearby(p) {
    const cx=Math.round((p.x-bounds.minX)/step), cz=Math.round((p.z-bounds.minZ)/step);
    const result=[];
    for (let z=Math.max(0,cz-3); z<=Math.min(rows-1,cz+3); z++) {
      for (let x=Math.max(0,cx-3); x<=Math.min(cols-1,cx+3); x++) {
        if (Math.hypot(bounds.minX+x*step-p.x,bounds.minZ+z*step-p.z)>=step*2.5) continue;
        for (let h=0;h<8;h++) {
          const id=(z*cols+x)*8+h;
          if (free[id]) result.push(id);
        }
      }
    }
    return result;
  }
  function edges(i) {
    if (edgeCache.has(i)) return edgeCache.get(i);
    const cell=Math.floor(i/8), x=cell%cols, z=Math.floor(cell/cols), h=i%8;
    const candidates=[
      [cell*8+(h+1)%8,.23*TURN], [cell*8+(h+7)%8,.23*TURN],
    ];
    for (let travelHeading=0;travelHeading<8;travelHeading++) {
      const {dx,dz}=HEADINGS[travelHeading];
      const nx=x+dx, nz=z+dz;
      if (nx>=0 && nx<cols && nz>=0 && nz<rows) {
        const deviation=Math.abs(angle(HEADINGS[h].yaw,HEADINGS[travelHeading].yaw));
        // A lateral step lets the cat line up for a turn in a narrow passage.
        candidates.push([(nz*cols+nx)*8+h,step*Math.hypot(dx,dz)*(1+1.4*deviation)]);
      }
    }
    const valid=candidates.filter(([j])=>free[j] && collision.sweepClear(nodes[i],nodes[j]));
    edgeCache.set(i,valid);
    return valid;
  }
  function simplify(start,route) {
    const result=[];
    for (const point of route) {
      const b=result.at(-1) ?? start, a=result.at(-2) ?? start;
      if (distance(b,point)<1e-7 && Math.abs(angle(b.yaw,point.yaw))<1e-7) continue;
      if (result.length && Math.abs(angle(a.yaw,b.yaw))<1e-7 && Math.abs(angle(b.yaw,point.yaw))<1e-7 &&
          distance(a,b)+distance(b,point)-distance(a,point)<1e-7 && collision.sweepClear(a,point)) result.pop();
      result.push(point);
    }
    // Remove grid zigzags only when the complete turn/move/arrival sequence is
    // clear. Keep necessary reverse/side steps in the narrow table passages.
    if(!result.length)return [pose(start)];
    const smooth=[];let previous=start,cursor=0;
    while(cursor<result.length){
      let chosen=null,last=cursor;
      for(let j=result.length-1;j>=cursor;j--){
        const candidate=connect(previous,result[j]);
        if(candidate){chosen=candidate;last=j;break;}
      }
      chosen??=[result[cursor]];
      smooth.push(...chosen);previous=smooth.at(-1);cursor=last+1;
    }
    return smooth;
  }
  function path(from,to) {
    const first=pose(from);
    if (!collision.isPoseClear(first) || !isWalkable(to)) return [];
    const direct=connect(first,to);
    if (direct) return direct;
    const costs=new Map(), parent=new Map(), initial=new Map(), visited=new Set(), frontier=new Frontier();
    for (const i of nearby(first)) {
      const route=connect(first,nodes[i]);
      if (!route) continue;
      const cost=route.reduce((n,p,j)=>{
        const prev=j?route[j-1]:first;
        return n+distance(prev,p)+.23*Math.abs(angle(prev.yaw,p.yaw));
      },0);
      costs.set(i,cost);
      initial.set(i,route);
      frontier.push(i,cost+distance(nodes[i],to));
    }
    while (frontier.items.length) {
      const i=frontier.pop();
      if (visited.has(i)) continue;
      visited.add(i);
      const a=nodes[i];
      if (distance(a,to)<step*2.5) {
        const last=connect(a,to);
        if (last) {
          const middle=[];
          let k=i;
          while (parent.has(k)) {middle.push(nodes[k]); k=parent.get(k);}
          return simplify(first,[...initial.get(k),...middle.reverse(),...last]);
        }
      }
      for (const [j,weight] of edges(i)) {
        if (visited.has(j)) continue;
        const cost=costs.get(i)+weight;
        if (cost >= (costs.get(j) ?? Infinity)) continue;
        costs.set(j,cost);
        parent.set(j,i);
        frontier.push(j,cost+distance(nodes[j],to));
      }
    }
    return [];
  }
  function clamp(p) {
    let best=null, score=Infinity;
    for (let i=0;i<nodes.length;i++) {
      if (!free[i]) continue;
      const node=nodes[i], d=distance(node,p)+(p.yaw===undefined?0:.2*Math.abs(angle(p.yaw,node.yaw)));
      if (d<score) {best=node; score=d;}
    }
    return best && {...best};
  }
  function pathNear(from,to,maxDistance=.42) {
    const exact=path(from,to);
    if(exact.length)return exact;
    // A tap just beside a leg may not leave room for the cat's centre. Pick a
    // nearby reachable stance, never teleport or route through the furniture.
    const candidates=nodes.filter((p,i)=>free[i]&&distance(p,to)<=maxDistance)
      .sort((a,b)=>distance(a,to)-distance(b,to)+.015*(distance(a,from)-distance(b,from)));
    for(const candidate of candidates){const route=path(from,candidate);if(route.length)return route;}
    return [];
  }
  function isWalkable(p) {
    return p.yaw!==undefined ? collision.isPoseClear(p) : HEADINGS.some(({yaw})=>collision.isPoseClear({...p,yaw}));
  }
  function segmentClear(a,b) {
    const heading=distance(a,b)>1e-7?Math.atan2(b.x-a.x,b.z-a.z):b.yaw ?? a.yaw ?? 0;
    return collision.sweepClear({...a,yaw:a.yaw??heading},{...b,yaw:b.yaw??heading});
  }
  return {bounds,radius:.32,obstacles,path,pathNear,clamp,isWalkable,segmentClear,...collision};
}

export function advanceCatPose(from,target,navigation,dt,speed,settle=false) {
  const next=pose(from), delta=angle(from.yaw,target.yaw??from.yaw);
  if (Math.abs(delta)>1e-6) {
    const turnRate=Math.min(3.4,Math.max(.55,Math.sqrt(12*Math.abs(delta))));
    next.yaw+=Math.sign(delta)*Math.min(Math.abs(delta),dt*turnRate);
  } else {
    const length=distance(from,target);
    if (length>1e-7) {
      const approach=settle ? Math.min(speed,Math.max(.15,Math.sqrt(1.8*length))) : speed;
      const fraction=Math.min(1,dt*approach/length);
      next.x+=(target.x-from.x)*fraction;
      next.z+=(target.z-from.z)*fraction;
    }
  }
  if (!navigation.sweepClear(from,next)) return {pose:from,blocked:true,arrived:false,moving:false};
  const arrived=distance(next,target)<1e-7 && Math.abs(angle(next.yaw,target.yaw??next.yaw))<1e-6;
  const turning=Math.abs(angle(from.yaw,next.yaw))>1e-7;
  const forward=(next.x-from.x)*Math.sin(next.yaw)+(next.z-from.z)*Math.cos(next.yaw);
  return {pose:next,blocked:false,arrived,moving:turning||distance(from,next)>1e-7,reverse:forward < -1e-7};
}

export function safeCatFacing(group,heading,navigation,fraction) {
  const from={x:group.position.x,z:group.position.z,yaw:group.rotation.y};
  const to={...from,yaw:from.yaw+angle(from.yaw,heading)*Math.min(1,fraction)};
  if (navigation.sweepClear(from,to)) group.rotation.y=to.yaw;
}
