// Native-space (CAD, meters, Z-up) centers and explode targets for every
// named node in /public/models/proxima-lamp.glb, plus the callout content
// that narrates the reveal. Centers are read off the part bounding boxes in
// CAD/PROXIMA_Lamp_CAD_v1_package (see proxima_lamp_parameters_v1.json).
//
// PCB component copy is a placeholder — the exact function of each part
// (inductors, antenna tab, etc.) needs confirming with the hardware/design
// team before this ships. Flagged inline below.

export type Vec3 = [number, number, number];

export interface PartLayout {
  /** native-space center of the part's bounding box */
  center: Vec3;
  /** native-space explode translation applied at t=1 */
  offset: Vec3;
  /** [start, end] of overall scroll progress across which this part explodes */
  range: [number, number];
  /** opacity at t=1, 1 = unchanged */
  fadeTo?: number;
}

export const PARTS: Record<string, PartLayout> = {
  // shell — the housing detaches first, the diffuser lifts later (top reveal)
  BlackOuterHousing: { center: [0, 0, 0.043], offset: [0.01, 0, -0.09], range: [0.28, 0.44], fadeTo: 0 },
  WhiteDiffuser: { center: [0, 0, 0.095], offset: [0, 0, 0.1], range: [0.48, 0.6], fadeTo: 0.1 },

  // core stack — staggered within 0.62-1.0 so parts read as a sequence.
  // The eight small components fan out radially (distinct XY directions,
  // not just stacked in Z) so their callout boxes have room to breathe.
  ElectronicsSupport: { center: [0, 0, 0.0315], offset: [0, 0, -0.035], range: [0.6, 0.85] },
  LEDRingPCB: { center: [0, 0, 0.0378], offset: [0, 0, 0.045], range: [0.62, 0.87] },
  LEDs: { center: [0, 0, 0.0392], offset: [0, 0, 0.055], range: [0.62, 0.87] },
  ProximaBrainPCB: { center: [0, 0.044, 0.052], offset: [0, 0.03, 0.1], range: [0.64, 0.89] },
  ESP32Module: { center: [0.017, 0.0417, 0.045], offset: [0.1, 0.05, 0.11], range: [0.67, 0.92] },
  FPCConnector: { center: [-0.016, 0.042, 0.0575], offset: [-0.05, 0.09, 0.15], range: [0.7, 0.95] },
  PushButton: { center: [-0.018, 0.042, 0.042], offset: [-0.12, 0.04, 0.09], range: [0.68, 0.93] },
  USBCPort: { center: [0, 0.048, 0.058], offset: [0.03, 0.13, 0.13], range: [0.71, 0.96] },
  AntennaTab: { center: [0.031, 0.043, 0.0425], offset: [0.14, -0.04, 0.08], range: [0.69, 0.94] },
  InductorLeft: { center: [-0.022, -0.06, 0.042], offset: [-0.09, -0.11, 0.05], range: [0.72, 0.97] },
  InductorRight: { center: [0.022, -0.06, 0.042], offset: [0.03, -0.14, 0.065], range: [0.72, 0.97] },
  BrandPlaque: { center: [0, -0.049, 0.0415], offset: [-0.14, -0.07, 0.03], range: [0.73, 0.98] },
};

export type Side = 'left' | 'right';

export interface Callout {
  id: string;
  /** part to anchor to; position follows that part's live (exploding) center */
  anchor: keyof typeof PARTS | Vec3;
  range: [number, number];
  side: Side;
  title: string;
  body: string;
}

// The three narrative beats, in scroll order.
export const STORY_CALLOUTS: Callout[] = [
  {
    id: 'body-material',
    anchor: 'WhiteDiffuser',
    range: [0.18, 0.32],
    side: 'right',
    title: '3D-printed body',
    body: 'The white shell is printed in a transparent filament, not molded — a prototyping choice, not the final production process.',
  },
  {
    id: 'housing-detach',
    anchor: 'BlackOuterHousing',
    range: [0.3, 0.46],
    side: 'left',
    title: 'Fully removable',
    body: 'The black band isn’t bonded to the shell — it lifts straight off.',
  },
  {
    id: 'two-pcbs',
    anchor: [0, 0.02, 0.045],
    range: [0.5, 0.62],
    side: 'right',
    title: 'Two boards inside',
    body: 'An LED ring board and the main Brain board, stacked — not one combined PCB.',
  },
];

// Eight placeholder component callouts — copy TBD with the hardware team.
// A guided tour, not an infographic: parts stay exploded once they've moved,
// but only one or two callouts are in focus at a time as you keep scrolling
// (otherwise eight boxes over a fist-sized part cluster is unreadable).
export const COMPONENT_CALLOUTS: Callout[] = [
  { id: 'support', anchor: 'ElectronicsSupport', range: [0.64, 0.715], side: 'right', title: 'Support plate', body: 'Holds the stack square inside the shell.' },
  { id: 'led-ring', anchor: 'LEDRingPCB', range: [0.685, 0.76], side: 'left', title: 'LED ring board', body: '36 individually-driven LEDs.' },
  { id: 'esp32', anchor: 'ESP32Module', range: [0.73, 0.805], side: 'right', title: 'ESP32 module', body: 'Runs sleep detection on-device.' },
  { id: 'button', anchor: 'PushButton', range: [0.775, 0.85], side: 'left', title: 'Push button', body: 'Manual override, no app required.' },
  { id: 'usbc', anchor: 'USBCPort', range: [0.82, 0.895], side: 'right', title: 'USB-C port', body: 'Power in — no proprietary cable.' },
  { id: 'antenna', anchor: 'AntennaTab', range: [0.865, 0.94], side: 'right', title: 'BLE antenna', body: 'Pairs with the phone and the watch.' },
  { id: 'inductors', anchor: 'InductorLeft', range: [0.91, 0.985], side: 'left', title: 'Power inductors', body: 'Regulate power to the LED driver.' },
  { id: 'plaque', anchor: 'BrandPlaque', range: [0.955, 1], side: 'left', title: 'Brand plaque', body: 'The PROXIMA mark.' },
];

export const ALL_CALLOUTS = [...STORY_CALLOUTS, ...COMPONENT_CALLOUTS];

// overall recenter pivot (see WhiteDiffuser, the tallest/most symmetric part)
export const NATIVE_CENTER: Vec3 = [0, 0, 0.095];

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Keyframe {
  at: number;
  value: number;
}

/** Piecewise-linear interpolation across sparse keyframes, eased per-segment. */
export function interpKeyframes(frames: Keyframe[], p: number): number {
  if (p <= frames[0].at) return frames[0].value;
  const last = frames[frames.length - 1];
  if (p >= last.at) return last.value;
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (p >= a.at && p <= b.at) {
      const localT = (p - a.at) / (b.at - a.at || 1);
      return a.value + (b.value - a.value) * ease(localT);
    }
  }
  return last.value;
}

// camera keyframes: dolly in on approach, rise toward a top-down angle for
// the "two boards" reveal, then pull back to fit the full exploded stack.
export const CAMERA_Y: Keyframe[] = [
  { at: 0, value: 0.9 },
  { at: 0.18, value: 0.55 },
  { at: 0.48, value: 0.7 },
  { at: 0.62, value: 2.0 },
  { at: 1, value: 1.7 },
];
export const CAMERA_Z: Keyframe[] = [
  { at: 0, value: 7.5 },
  { at: 0.18, value: 4.0 },
  { at: 0.48, value: 3.7 },
  { at: 0.62, value: 3.0 },
  { at: 1, value: 6.2 },
];
export const CAMERA_FOV: Keyframe[] = [
  { at: 0, value: 24 },
  { at: 0.18, value: 28 },
  { at: 0.62, value: 30 },
  { at: 1, value: 34 },
];
// model turntable rotation (radians), purely a function of scroll progress —
// no idle/auto spin. The base -90deg X rotation (Z-up -> Y-up) is separate.
export const ROT_Y: Keyframe[] = [
  { at: 0, value: 0 },
  { at: 0.18, value: Math.PI * 0.55 },
  { at: 0.48, value: Math.PI * 0.55 },
  { at: 0.62, value: Math.PI * 0.85 },
  { at: 1, value: Math.PI * 1.05 },
];
