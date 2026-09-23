/**
 * Rebuild the presentation model from Alberto's original STEP files.
 * npm install --prefix /tmp/proxima-cad-converter occt-import-js meshoptimizer @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions
 * node front/scripts/build-cad-model.mjs
 *
 * Dependencies/cache stay outside the application. Original STEP files are never modified.
 * Assembly positions are derived from the mating CAD surfaces and checked against photos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const deps = process.env.PROXIMA_CAD_DEPS || '/tmp/proxima-cad-converter';
const require = createRequire(path.join(deps, 'package.json'));
const { MeshoptSimplifier, MeshoptEncoder } = await import(path.join(deps, 'node_modules/meshoptimizer/index.js'));
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready]);
const S = 0.02;
const sources = {
 diffuser: 'alberto/Proxima-20260923T183548Z-1-001/Proxima/Proxima Diffusore.step',
 shell: 'alberto/Proxima-20260923T183548Z-1-001/Proxima/Proxima Anello 1.step',
 base: 'alberto/Proxima-20260923T183548Z-1-001/Proxima/Proxima Anello 2.step',
 led_board: 'alberto/PCBs-20260923T183545Z-1-001/PCBs/Heavy/PROXIMA_PCBOrizontalHeavy.step',
 control_board: 'alberto/PCBs-20260923T183545Z-1-001/PCBs/Light/PROXIMA_PCBOrizontalLight.step',
};
async function readStep(file) {
 const cache = path.join(deps, path.basename(file) + '.json');
 if (fs.existsSync(cache)) { const data = JSON.parse(fs.readFileSync(cache)); if(data.meshes.some(m=>m.index.array.length)) return data; }
 const occt = await require('occt-import-js')();
 const result = occt.ReadStepFile(fs.readFileSync(path.join(root,file)), { linearUnit:'millimeter', linearDeflectionType:'absolute_value', linearDeflection:0.12, angularDeflection:0.35 });
 if(!result.success || !result.meshes.some(m=>m.index.array.length)) throw Error('STEP conversion failed: '+file);
 fs.writeFileSync(cache,JSON.stringify(result)); return result;
}
const gltf={asset:{version:'2.0',generator:'PROXIMA Alberto STEP conversion (OpenCascade)'},scene:0,scenes:[{name:'Proxima',nodes:[0]}],nodes:[{name:'Proxima_CAD',children:[]}],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[]};
const materialIds={};
function material(name,color,metalness=0,roughness=0.55,extra={}) {materialIds[name]=gltf.materials.length;gltf.materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...color,1],metallicFactor:metalness,roughnessFactor:roughness},...extra});}
material('diffuser_frosted',[0.86,0.84,0.79],0,0.48,{doubleSided:true});
material('graphite_shell',[0.026,0.032,0.045],0.18,0.48);
material('graphite_base',[0.022,0.027,0.039],0.10,0.54);
material('pcb_soldermask',[0.012,0.023,0.033],0.13,0.56);
material('led_ceramic',[0.84,0.85,0.79],0.04,0.40);
material('led_phosphor',[0.88,0.63,0.22],0.05,0.42,{emissiveFactor:[0.10,0.065,0.015]});
material('tin',[0.51,0.57,0.63],0.82,0.30);
material('silicon',[0.025,0.031,0.036],0.12,0.50);
material('copper',[0.13,0.22,0.22],0.48,0.48);
material('wireless_shield',[0.49,0.53,0.58],0.76,0.32);
material('ceramic',[0.18,0.13,0.078],0,0.6);
let byteLength=0;const chunks=[];
function accessor(array,componentType,type,target,min,max) {
 const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);const pad=(4-bytes.length%4)%4;
 const view=gltf.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:bytes.length,target})-1;
 chunks.push(bytes,Buffer.alloc(pad));byteLength+=bytes.length+pad;
 const a={bufferView:view,componentType,count:array.length/(type==='VEC3'?3:1),type};if(min)a.min=min;if(max)a.max=max;
 return gltf.accessors.push(a)-1;
}
const metadata={scale:S,units:'50 mm per scene unit',overallBounds:{min:[-1.241,0,-1.241],max:[1.241,3.8,1.241]},parts:{},anchors:{},notes:[
 'Diffuser and shell geometry comes directly from STEP; the diffuser is a hollow open-ended tube.',
 'All part node pivots are the assembled ground origin. Each part can be translated directly along Y.',
 'CAD physical parts map [x,y,z] mm to [x*0.02,(z+7)*0.02,-y*0.02].',
 'LED ring is centered from the PCB CAD origin [150,-100] and rotated 180 degrees in-plane to align its connector with the control board.',
 'LED substrate underside is mounted at original CAD z49.2, matching the Anello 2 seating recess.',
 'Control board is upright at back, with central slot straddling the LED ring; components face rear (-Z).',
 'PCB STEP filenames are inconsistent: Heavy Orizontal is annular; Light Orizontal is rectangular.',
 'Source USB-C CAD mesh is detached from its PCB. Its original geometry is translated back onto the PCB footprint at x125,y-129.2; no port geometry is invented.',
 'Material colors are matched to product photos. Original STEP PCB green and generic copper package colors are not the built product colors.',
]};
const cadTransform=([x,y,z])=>[x*S,(z+7)*S,-y*S];
const cadNormal=([x,y,z])=>[x,z,-y];
const ledTransform=([x,y,z])=>[-(x-150)*S,(z+49.2+7)*S,(y+100)*S];
const ledNormal=([x,y,z])=>[-x,z,y];
// Native Y runs from the USB-C/button edge (-100) to the ESP32/board-connector edge (-137).
// Mounted upright, the ESP32 + LED-ring connector sit low in the housing and USB-C/button sit
// high (verified against Alberto's board photos) -- so native Y must be flipped, not mapped 1:1.
const controlTransform=([x,y,z])=>[-(x-125)*S,(-60.5-y)*S,-(55.3+z)*S];
const controlNormal=([x,y,z])=>[-x,-y,-z];
function bounds(positions) {const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<positions.length;i+=3)for(let j=0;j<3;j++){min[j]=Math.min(min[j],positions[i+j]);max[j]=Math.max(max[j],positions[i+j]);}return {min,max};}
function center(b){return b.min.map((v,i)=>(v+b.max[i])/2);}
function flattenNodes(node,out=[]) { if(node.meshes.length)out.push(node);for(const c of node.children)flattenNodes(c,out);return out; }
const count={inputTriangles:0,outputTriangles:0};
for(const [part,file] of Object.entries(sources)) {
 const data=await readStep(file);
 const groupId=gltf.nodes.push({name:part,children:[],extras:{source:file}})-1;gltf.nodes[0].children.push(groupId);
 const groups=new Map();
 const transform=part==='led_board'?ledTransform:part==='control_board'?controlTransform:cadTransform;
 const normalTransform=part==='led_board'?ledNormal:part==='control_board'?controlNormal:cadNormal;
 for(const node of flattenNodes(data.root)) for(const mi of node.meshes) {
  const mesh=data.meshes[mi];if(!mesh.index.array.length)continue;
  let semantic=part,mat=part==='diffuser'?'diffuser_frosted':part==='shell'?'graphite_shell':'graphite_base';
  const name=node.name;
  if(part==='led_board'||part==='control_board') {
   semantic=part==='led_board'?'ring_passives':'controller_components';mat='silicon';
   if(/PCB$/.test(name)){semantic=part==='led_board'?'ring_substrate':'control_substrate';mat='pcb_soldermask';}
   else if(/_copper$/.test(name)){semantic='ring_tracks';mat='copper';}
   else if(/_pad$|_via$/.test(name)){semantic='ring_contacts';mat='tin';}
   else if(/ESP32/.test(name)){semantic='wireless_module';mat='wireless_shield';}
   else if(/USB-TYPE/.test(name)){semantic='usb_c';mat=mi===47||mi===49?'silicon':'tin';}
   else if(/FPC-SMD/.test(name)){semantic=part==='led_board'?'ring_connector':'board_connector';mat=node.meshes.indexOf(mi)>11?'silicon':'tin';}
   else if(/VEML7700/.test(name)){semantic='ambient_sensor';mat='silicon';}
   else if(/LED/.test(name)){semantic=part==='led_board'?'led_packages':'indicator_led';mat='led_ceramic';}
   else if(/^C_/.test(name)){mat='ceramic';}
   else if(node.meshes.length>1&&node.meshes.indexOf(mi)>0){mat='tin';}
  }
  const key=semantic+'|'+mat;
  if(!groups.has(key))groups.set(key,{semantic,mat,positions:[],normals:[],indices:[],sources:new Set()});
  const g=groups.get(key);const p=mesh.attributes.position.array,n=mesh.attributes.normal?.array;const offset=g.positions.length/3;g.sources.add(name);
  for(let i=0;i<p.length;i+=3) {
   let pt=p.slice(i,i+3);
   // A detached STEP-library USB model has a global-origin placement error.
   if(semantic==='usb_c')pt=[pt[0]-61.4,pt[1]-2,pt[2]+46.2];
   g.positions.push(...transform(pt));g.normals.push(...normalTransform(n?n.slice(i,i+3):[0,0,1]));
  }
  for(const i of mesh.index.array)g.indices.push(i+offset);
 }
 const partPositions=[];const semanticIds=new Map();
 for(const g of groups.values()) {
  if(!semanticIds.has(g.semantic)) {
   const id=gltf.nodes.push({name:g.semantic===part?part+'_geometry':g.semantic,children:[],extras:{componentNames:[]}})-1;gltf.nodes[groupId].children.push(id);semanticIds.set(g.semantic,id);
  }
  const id=semanticIds.get(g.semantic);gltf.nodes[id].extras.componentNames.push(...g.sources);
  count.inputTriangles+=g.indices.length/3;
  let positions=new Float32Array(g.positions),normals=new Float32Array(g.normals),indices=new Uint32Array(g.indices);
  // Keep errors below 0.025 mm; retain every package and all material boundaries.
  if(indices.length>3000&&part!=='diffuser'&&part!=='shell'&&part!=='base') {
   [indices]=MeshoptSimplifier.simplify(indices,positions,3,Math.floor(indices.length*0.38/3)*3,0.0005,['ErrorAbsolute']);
  }
  const [remap,vertexCount]=MeshoptSimplifier.compactMesh(indices);
  const newPositions=new Float32Array(vertexCount*3),newNormals=new Float32Array(vertexCount*3);
  for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff){newPositions.set(positions.subarray(i*3,i*3+3),remap[i]*3);newNormals.set(normals.subarray(i*3,i*3+3),remap[i]*3);}
  positions=newPositions;normals=newNormals;
  const b=bounds(positions);for(const p of positions)partPositions.push(p);
  if(!metadata.anchors[g.semantic])metadata.anchors[g.semantic]={position:center(b),bounds:b};
  else {const old=metadata.anchors[g.semantic].bounds;for(let j=0;j<3;j++){old.min[j]=Math.min(old.min[j],b.min[j]);old.max[j]=Math.max(old.max[j],b.max[j]);}metadata.anchors[g.semantic].position=center(old);}
  const primitive={attributes:{POSITION:accessor(positions,5126,'VEC3',34962,b.min,b.max),NORMAL:accessor(normals,5126,'VEC3',34962)},indices:accessor(vertexCount<=65535?new Uint16Array(indices):indices,vertexCount<=65535?5123:5125,'SCALAR',34963),material:materialIds[g.mat]};
  const meshId=gltf.meshes.push({name:g.semantic+'_'+g.mat,primitives:[primitive]})-1;
  const leaf=gltf.nodes.push({name:g.semantic+'_'+g.mat,mesh:meshId})-1;gltf.nodes[id].children.push(leaf);count.outputTriangles+=indices.length/3;
 }
 metadata.parts[part]={source:file,bounds:bounds(partPositions),pivot:[0,0,0]};
 console.log(part, metadata.parts[part].bounds);
}
metadata.anchors.led_ring={position:[0,1.154,0.92]};
metadata.anchors.led_package={position:[0.00,1.169,-1.01]};
metadata.anchors.diffuser={position:[0,2.70,0.93]};
metadata.anchors.shell={position:[0.90,1.17,0.65]};
metadata.geometry=count;
gltf.nodes[0].extras={source:'Alberto original STEP files',normalization:metadata.units};
gltf.buffers=[{byteLength}];
const json=Buffer.from(JSON.stringify(gltf));const jsonPadded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);const bin=Buffer.concat(chunks);
const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jsonPadded.length+8+bin.length,8);
const jh=Buffer.alloc(8);jh.writeUInt32LE(jsonPadded.length,0);jh.writeUInt32LE(0x4e4f534a,4);
const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
const out=path.join(root,'front/public/models');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'proxima-cad.glb'),Buffer.concat([header,jh,jsonPadded,bh,bin]));
fs.writeFileSync(path.join(out,'proxima-cad.json'),JSON.stringify(metadata,null,2)+'\n');
console.log('Wrote proxima-cad.glb',fs.statSync(path.join(out,'proxima-cad.glb')).size,'bytes',count);

// Meshopt uses the decoder already bundled with drei useGLTF; no CDN request.
const { NodeIO } = await import(path.join(deps, 'node_modules/@gltf-transform/core/dist/index.js'));
const { ALL_EXTENSIONS } = await import(path.join(deps, 'node_modules/@gltf-transform/extensions/dist/index.js'));
const { meshopt } = await import(path.join(deps, 'node_modules/@gltf-transform/functions/dist/index.js'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const modelPath = path.join(out, 'proxima-cad.glb');
const document = await io.read(modelPath);
await document.transform(meshopt({encoder:MeshoptEncoder,level:'medium',quantizePosition:16,quantizeNormal:12}));
await io.write(modelPath,document);
metadata.geometry.compressedBytes = fs.statSync(modelPath).size;
metadata.geometry.compression = 'EXT_meshopt_compression; KHR_mesh_quantization (16-bit positions, 12-bit normals)';
fs.writeFileSync(path.join(out,'proxima-cad.json'),JSON.stringify(metadata,null,2)+'\n');
console.log('Compressed model',metadata.geometry.compressedBytes,'bytes');
