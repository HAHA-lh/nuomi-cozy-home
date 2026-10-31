// Room-only presentation size. The authored GLB and standalone review viewer
// stay at native scale; placing the scale on the outer group also fits hats.
export const ROOM_CAT_SCALE = .75;
export const ROOM_CAT_PRESENTATION = Object.freeze({
  wardrobeFocusHeight: 1.25 * ROOM_CAT_SCALE,
  bubbleHeight: 2.65 * ROOM_CAT_SCALE,
  // Match world travel to the scaled stride without speeding up the animation.
  walkSpeed: 1.25 * ROOM_CAT_SCALE,
});

export function applyRoomCatScale(group) {
  group.scale.setScalar(ROOM_CAT_SCALE);
  return group;
}
