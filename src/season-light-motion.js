const TAU=Math.PI*2;

/**
 * Subtle daylight drift, sampled from elapsed seconds rather than accumulated
 * frame changes. Apply these values to the authored lighting baseline each
 * frame; multiplying the previous frame would compound the change.
 */
export function sampleSeasonLightMotion(seconds,{night=false,reducedMotion=false}={}){
  if(reducedMotion||!Number.isFinite(seconds)||seconds<0){
    return {keyFactor:1,fillFactor:1,offsetX:0,offsetZ:0};
  }
  // Reduce before multiplying so very large finite timestamps stay finite.
  const wave=period=>Math.sin(((seconds%period)/period)*TAU);
  const strength=night?.5:1;
  return {
    keyFactor:1+strength*(.018*wave(64)+.006*wave(80)),
    fillFactor:1+strength*.012*wave(72),
    offsetX:strength*.045*wave(72),
    offsetZ:strength*.032*wave(56),
  };
}
