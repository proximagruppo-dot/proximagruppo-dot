export const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function smooth(start: number, end: number, value: number) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

export function track(progress: number, keys: [number, number][]) {
  for (let i = 1; i < keys.length; i++) {
    if (progress <= keys[i][0]) {
      const [start, from] = keys[i - 1];
      const [end, to] = keys[i];
      return from + (to - from) * smooth(start, end, progress);
    }
  }
  return keys[keys.length - 1][1];
}

export const CHAPTERS = [
  { label: 'Connected', at: 0, start: 0, eyebrow: 'ONE CONNECTED NIGHT', title: 'In tune with your night.', body: 'Your smart watch senses sleep. Your lamp responds. Meet PROXIMA.' },
  { label: 'The object', at: 0.24, start: 0.15, eyebrow: 'THOUGHTFUL, INSIDE AND OUT', title: 'A quiet presence.', body: 'A soft white diffuser. A dark ring of electronics. One considered object.' },
  { label: 'Modular', at: 0.43, start: 0.34, eyebrow: 'DESIGNED TO COME APART', title: 'Two parts, cleanly split.', body: 'The diffuser lifts out of the ring, separating the light from the electronics beneath it.' },
  { label: 'Inside', at: 0.64, start: 0.53, eyebrow: 'MEET THE HARDWARE', title: 'Two boards. One purpose.', body: 'Open the housing. Get closer to the two custom boards at its heart.' },
  // start is intentionally later than the reassembly animation's own window (LampModel.tsx's
  // `lift` keyframes run 0.90->0.965) so the heading/CTA only appear once the housing has
  // actually settled back into place -- otherwise "Together" shows while the lamp is still
  // visibly in pieces mid-air, and the CTA text lands right on top of the moving model.
  { label: 'Together', at: 1, start: 0.96, eyebrow: 'EVERY PART, IN HARMONY', title: 'Back to a better night.', body: 'From the smallest component to the light in your room. This is PROXIMA.' },
] as const;

// Progress at which LampModel.tsx's reassembly animation begins (the `lift` keyframe track
// starts collapsing the explode offset back toward 0 here) and where it finishes. The
// component-tour UI -- the info panel in HeroExperience.tsx and the 3D hotspot in
// LampModel.tsx -- must stop advertising a specific disassembled PCB part once progress
// crosses REASSEMBLY_START, even though the chapter itself ("Inside") doesn't end until
// much later (CHAPTERS[4].start). Without this, the panel/hotspot keep naming a specific
// exploded component (e.g. "Board connection") for the entire REASSEMBLY_START->CHAPTERS[4]
// window while the model is visibly reassembling or already reassembled underneath them --
// a direct, visible contradiction between text and model state.
export const REASSEMBLY_START = 0.90;
export const REASSEMBLY_END = 0.965;

export const COMPONENTS = [
  { id: 'ring', label: 'LED ring', title: 'Light, all the way around.', body: 'The annular PCB follows the diffuser’s profile, placing the light sources around its circumference.', at: 0.625 },
  { id: 'leds', label: 'LED packages', title: 'Many points. One soft glow.', body: 'Surface-mounted LEDs sit around the custom ring, directing light into the white diffuser.', at: 0.675 },
  { id: 'controller', label: 'Control board', title: 'The other half of the story.', body: 'A separate vertical PCB brings the control electronics into the narrow space inside the housing.', at: 0.725 },
  { id: 'module', label: 'Wireless module', title: 'Talking to your phone.', body: 'The radio on the control board is what lets the app find the lamp, pair with it, and send it every command — from a brightness change to switching mode.', at: 0.775 },
  { id: 'usb', label: 'USB-C', title: 'A familiar connection.', body: 'The USB-C connector aligns with the opening in the black housing for access from outside.', at: 0.825 },
  { id: 'connector', label: 'Board connection', title: 'Two boards, working together.', body: 'The board connector links the upright control electronics to the horizontal LED assembly.', at: 0.875 },
] as const;

export function chapterAt(progress: number) {
  return CHAPTERS.reduce((stage, chapter, index) => progress >= chapter.start ? index : stage, 0);
}

export function componentAt(progress: number) {
  return COMPONENTS.reduce((stage, part, index) => progress >= part.at - 0.024 ? index : stage, 0);
}
