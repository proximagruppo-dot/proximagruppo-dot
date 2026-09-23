# Alberto CAD model

`public/models/proxima-cad.glb` is built from the supplied STEP geometry, including the hollow diffuser, both mechanically mating rings, actual LED packages, board cutouts, populated control PCB, and copper/pad/via geometry on the LED board. No primitive replacement lamp or fabricated PCB is used.

The compressed GLB is **2,093,700 bytes**, **22 meshes**, and **229,343 triangles**. It has no texture or external file dependencies. The `EXT_meshopt_compression` and `KHR_mesh_quantization` decoders are supported by the `useGLTF` configuration already included in `@react-three/drei`. A plain `GLTFLoader` must receive Three.js's bundled `MeshoptDecoder`.

## Rebuilding

From the repository root, install the conversion-only tools outside the application:

```sh
npm install --prefix /tmp/proxima-cad-converter occt-import-js@0.0.23 meshoptimizer@1.2.0 @gltf-transform/core@4.5.0 @gltf-transform/extensions@4.5.0 @gltf-transform/functions@4.5.0
node front/scripts/build-cad-model.mjs
```

Set `PROXIMA_CAD_DEPS` to use another dependency/cache directory. STEP triangulations are cached there as `<original filename>.json`. Remove the corresponding cached JSON after changing a source STEP. Original CAD files remain untouched. The first conversion takes longer than rebuilding from the cache.

The build uses 0.12 mm linear / 0.35 radian angular OpenCascade tessellation, simplifies electronics with at most 0.025 mm absolute geometric error, then applies meshopt compression with 16-bit positions and 12-bit normals. Structural shell/diffuser/base meshes are not simplified. No conversion tools are needed to run the website.

## Animation API

The five independently movable groups are direct children of `Proxima_CAD`. All five pivots are the assembled ground origin `[0, 0, 0]`, with identity rotation and scale. Translate the named group along Y to separate a part. Do not recenter individual meshes: their vertices/leaf transforms already encode the assembly.

| Group | Shape | Assembled Y bounds |
|---|---|---|
| `diffuser` | Hollow white tube, open at both ends | 0–3.8 |
| `shell` | Anello 1 outer black housing | 0.736–1.580 |
| `base` | Anello 2 lower inner ring | 0.740–1.259 |
| `led_board` | Annular populated PCB | 1.123–1.176 |
| `control_board` | Upright rectangular populated PCB | 0.790–1.530 |

One scene unit is 50 mm. For the physical housing parts, original CAD `[x,y,z]` becomes `[x*0.02,(z+7)*0.02,-y*0.02]`. The assembled housing diameter is 2.482 units /124.1 mm and height is 3.8 units /190 mm. The USB-C port projects slightly beyond the housing.

The control PCB sits at the back (`z≈-1.106`) and its ESP32/USB components face the back (`-Z`). View the assembly from the rear for a clear electronics reveal. The horizontal LED board passes through the actual slot in the upright PCB. Its seat is aligned to the Anello 2 CAD recess at original z49.2 mm.

Semantic child groups are also available through `getObjectByName`:

| Group | Center in assembled scene coordinates |
|---|---|
| `wireless_module` | `[-0.336, 1.366, -1.162]` |
| `usb_c` | `[0.000, 0.946, -1.178]` |
| `board_connector` | `[-0.005, 1.452, -1.138]` |
| `ambient_sensor` | `[-0.001, 1.434, -1.104]` |
| `ring_connector` | `[-0.006, 1.156, -1.107]` |
| `led_packages` | All actual LED packages around the annulus |

`public/models/proxima-cad.json` contains precise per-part bounds, annotation anchors, source paths, and conversion notes. Component names from the PCB CAD are retained as extras on the semantic groups. Additional groups include `ring_substrate`, `ring_tracks`, `ring_contacts`, `ring_passives`, `control_substrate`, `controller_components`, and `indicator_led`.

## Source-specific decisions

- The PCB filenames are inconsistent: `Heavy/PROXIMA_PCBOrizontalHeavy.step` is annular, while `Light/PROXIMA_PCBOrizontalLight.step` is rectangular. The geometry determines the role, not the filename.
- The main ring and diffuser CAD files share assembly coordinates. PCB files have independent PCB-editor origins; their assembly placement is inferred from the matching seats, PCB slot, connector locations, and supplied product photos.
- The USB-C package is detached in the source PCB export. Its original geometry is translated onto the visible PCB mounting footprint. This correction is explicit in the conversion script.
- Real-product photos show black PCBs and graphite printed housings. Materials use these colors instead of the STEP export's generic green PCB/copper package colors. Materials have no vertex colors; normal material overrides work.
- The heavier rectangular PCB export was inspected but produced empty triangulations in OpenCascade. Its populated light export provides the valid detailed component geometry used here.

## Verification

The final compressed asset was loaded with the application's installed Three.js `GLTFLoader` and bundled `MeshoptDecoder`. All five part groups and semantic anchors survived compression, all part pivots/scales remained unchanged, all 22 meshes have indexed positions, and all normal vectors are finite and within 2% of unit length.
