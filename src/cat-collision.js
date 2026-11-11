// Local +Z points towards the cat's nose. All measurements are in room units.
const DEFAULT_FOOTPRINT = [
  [-.32, -.58], [.32, -.58], [.32, .60], [.22, .75], [-.22, .75], [-.32, .60],
];
// XZ support hulls of the native skinned Birman at its game scale of 0.50.
// Baked from all ten clips, outlines, whiskers and hats (241 poses per clip).
// The low hull clips triangles at y=.31, above the bowl and the rolling ball.
export const BIRMAN_FOOTPRINT = {
  full: [[.842,-.559],[.310,.725],[.212,.824],[.180,.837],[-.180,.837],[-.212,.824],[-.358,.677],[-.824,-.447],[-.824,-.688],[-.719,-.940],[-.493,-1.167],[-.081,-1.337],[.254,-1.337],[.537,-1.220],[.750,-1.007],[.842,-.785]],
  low: [[.842,-.608],[.419,.413],[.184,.649],[.063,.698],[-.063,.698],[-.184,.649],[-.502,.331],[-.824,-.447],[-.824,-.688],[-.719,-.940],[-.493,-1.167],[-.081,-1.337],[.254,-1.337],[.537,-1.220],[.750,-1.007],[.842,-.785]],
};
const TAU = 2 * Math.PI;
const BINS = 96;
const STEP = TAU / BINS;
const NORMALS = Array.from({length: 32}, (_, i) => {
  const angle = i * TAU / 32;
  return [Math.cos(angle), Math.sin(angle)];
});

function rectangle(box) {
  return [[box.minX, box.minZ], [box.maxX, box.minZ], [box.maxX, box.maxZ], [box.minX, box.maxZ]];
}

function support(points, nx, nz) {
  let result = -Infinity;
  for (const [x,z] of points) result = Math.max(result, x * nx + z * nz);
  return result;
}

// Test the entire line against a convex obstacle expanded by the cat shape.
// Enter/leave parameters prevent skipping thin objects, even on a dropped frame.
function intersects(from, to, planes, padding) {
  let enter = 0, leave = 1;
  for (let i = 0; i < NORMALS.length; i++) {
    const [nx,nz] = NORMALS[i];
    const start = nx * from.x + nz * from.z;
    const end = nx * to.x + nz * to.z;
    const limit = planes[i] + padding;
    if (start > limit && end > limit) return false;
    if (start > limit) enter = Math.max(enter, (start-limit)/(start-end));
    if (end > limit) leave = Math.min(leave, (limit-start)/(end-start));
    if (enter > leave) return false;
  }
  return true;
}

export function createCatCollision(bounds, obstacles, profile = DEFAULT_FOOTPRINT) {
  const footprint = profile.full ?? profile;
  const radius = Math.max(...footprint.map(([x,z]) => Math.hypot(x,z)));
  // Keep separate convex pieces and vertical slabs. Projecting a whole table
  // and a whole swinging tail to the floor falsely seals otherwise clear space.
  const solids = obstacles.flatMap(box => profile.layers && box.parts?.length ? box.parts : [box]).map(box => {
    const vertices = box.polygon?.map(p => [p.x,p.z]) ?? rectangle(box);
    return {box, limits: NORMALS.map(([x,z]) => support(vertices,x,z))};
  });
  const orientations = new Map();
  function atHeading(bin) {
    const id = ((bin % BINS) + BINS) % BINS;
    if (orientations.has(id)) return orientations.get(id);
    const c = Math.cos(id * STEP), s = Math.sin(id * STEP);
    function project(shape) {
      const points = shape.map(([x,z]) => [c*x+s*z, -s*x+c*z]);
      return NORMALS.map(([nx,nz]) => support(points,-nx,-nz));
    }
    const margins = project(footprint);
    const lowMargins = profile.low ? project(profile.low) : margins;
    const layerMargins = profile.layers?.map(layer=>({...layer,parts:layer.parts.map(project)}));
    const heading = {
      left: margins[0], right: margins[16], back: margins[8], front: margins[24],
      planes: solids.map(({box,limits}) => {
        const parts = layerMargins
          ? layerMargins.filter(layer=>layer.minY<(box.maxY??Infinity)-1e-6 && layer.maxY>(box.minY??-Infinity)+1e-6).flatMap(layer=>layer.parts)
          : [box.maxY <= .31 ? lowMargins : margins];
        return parts.map(expansion=>limits.map((limit,i)=>limit+expansion[i]));
      }),
    };
    orientations.set(id,heading);
    return heading;
  }
  const padding = .003 + radius * STEP / 2;
  function clear(from, to, bin) {
    const shape = atHeading(bin);
    const minX = Math.min(from.x,to.x)-shape.left-padding, maxX = Math.max(from.x,to.x)+shape.right+padding;
    const minZ = Math.min(from.z,to.z)-shape.back-padding, maxZ = Math.max(from.z,to.z)+shape.front+padding;
    if (minX < bounds.minX || maxX > bounds.maxX || minZ < bounds.minZ || maxZ > bounds.maxZ) return false;
    for (let i=0; i<solids.length; i++) {
      const {box} = solids[i];
      if (minX > box.maxX || maxX < box.minX || minZ > box.maxZ || maxZ < box.minZ) continue;
      for(const planes of shape.planes[i]) if (intersects(from,to,planes,padding)) return false;
    }
    return true;
  }
  function isPoseClear(p) {return clear(p,p,Math.round((p.yaw ?? 0)/STEP));}
  function sweepClear(a,b) {
    const start = a.yaw ?? 0, end = b.yaw ?? start;
    const delta = Math.atan2(Math.sin(end-start), Math.cos(end-start));
    const first = Math.round(start/STEP), last = Math.round((start+delta)/STEP);
    if (first === last) return clear(a,b,first);
    // Fixed angular bins ensure any partial runtime step fits whenever the
    // corresponding planned sweep fits, independently of the frame rate.
    const sign=Math.sign(last-first);
    let previous = a;
    for (let bin=first; bin!==last; bin+=sign) {
      const t = Math.max(0,Math.min(1,((bin+sign*.5)*STEP-start)/delta));
      const next = {x:a.x+(b.x-a.x)*t, z:a.z+(b.z-a.z)*t};
      if (!clear(previous,next,bin)) return false;
      previous = next;
    }
    return clear(previous,b,last);
  }
  return {isPoseClear,sweepClear};
}
