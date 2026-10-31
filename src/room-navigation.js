// Floor-only navigation. Furniture bounds are expanded by the cat's footprint.
export function createRoomNavigation(bounds, obstacles, radius = .22, step = .12) {
  const minX=bounds.minX+radius,maxX=bounds.maxX-radius,minZ=bounds.minZ+radius,maxZ=bounds.maxZ-radius;
  const boxes=obstacles.map(b=>({minX:b.minX-radius,maxX:b.maxX+radius,minZ:b.minZ-radius,maxZ:b.maxZ+radius}));
  const free=(p)=>p.x>=minX&&p.x<=maxX&&p.z>=minZ&&p.z<=maxZ&&!boxes.some(b=>p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ);
  const cols=Math.ceil((maxX-minX)/step)+1,rows=Math.ceil((maxZ-minZ)/step)+1;
  const nodes=[];
  for(let z=0;z<rows;z++)for(let x=0;x<cols;x++)nodes.push({x:Math.min(maxX,minX+x*step),z:Math.min(maxZ,minZ+z*step)});
  const allowed=nodes.map(free),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const nearest=p=>nodes.reduce((best,n,i)=>allowed[i]&&(best<0||distance(p,n)<distance(p,nodes[best]))?i:best,-1);
  const clear=(a,b)=>{const count=Math.ceil(distance(a,b)/(step*.4));for(let i=0;i<=count;i++){const t=count?i/count:0;if(!free({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}))return false;}return true;};
  function path(from,to) {
    const start=nearest(from),end=nearest(to);if(start<0||end<0)return [];
    const open=new Set([start]),closed=new Set(),cost=new Map([[start,0]]),parent=new Map();
    while(open.size){
      let current=-1,best=Infinity;for(const i of open){const score=cost.get(i)+distance(nodes[i],nodes[end]);if(score<best){current=i;best=score;}}
      if(current===end){const chain=[];for(let i=end;i!==undefined;i=parent.get(i))chain.push(nodes[i]);chain.reverse();
        const route=[free(from)?{x:from.x,z:from.z}:nodes[start],...chain];if(free(to)&&clear(nodes[end],to))route.push({x:to.x,z:to.z});
        const result=[];let i=0;while(i<route.length-1){let j=route.length-1;while(j>i+1&&!clear(route[i],route[j]))j--;result.push({...route[j],y:0});i=j;}return result;
      }
      open.delete(current);closed.add(current);
      const cx=current%cols,cz=Math.floor(current/cols);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dz)continue;const x=cx+dx,z=cz+dz;if(x<0||z<0||x>=cols||z>=rows)continue;
        const next=z*cols+x;if(closed.has(next)||!allowed[next]||!clear(nodes[current],nodes[next]))continue;
        const candidate=cost.get(current)+distance(nodes[current],nodes[next]);if(candidate<(cost.get(next)??Infinity)){cost.set(next,candidate);parent.set(next,current);open.add(next);}
      }
    }
    return [];
  }
  return {path,isWalkable:free,segmentClear:clear,clamp(p){const n=nearest(p);return n<0?null:{...nodes[n],y:0};},bounds,radius};
}
