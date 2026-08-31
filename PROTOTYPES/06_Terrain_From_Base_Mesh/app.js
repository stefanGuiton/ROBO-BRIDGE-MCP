import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  EMPTY_LAYER, compileHeightGrid, applyHeightAO, countSideWalls,
  sideWallQuad, createCellBinary, parseCellBinary, sha256Hex
} from './terrain-core.js';
import { registerTerrainTuningTools } from './terrain-webmcp.js';

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0xf0efed, 1);
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0efed);
const camera = new THREE.PerspectiveCamera(45, viewport.clientWidth/viewport.clientHeight, 0.001, 1000);
camera.position.set(2.4,1.8,2.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0,0.3,0);

const ambient = new THREE.AmbientLight(0xffffff, 0.82); scene.add(ambient);
const skyFill = new THREE.HemisphereLight(0xffffff, 0x70756d, 1.32); scene.add(skyFill);
const sun = new THREE.DirectionalLight(0xfff4e6, 1.2); sun.castShadow = true; scene.add(sun); scene.add(sun.target);
sun.shadow.mapSize.set(1024,1024); sun.shadow.bias = -0.00008; sun.shadow.normalBias = 0.002;
const gridHelper = new THREE.GridHelper(4,40,0x69747d,0xb6bdc3); gridHelper.position.y=0.055; scene.add(gridHelper);
gridHelper.visible = $('gridVisible').checked;

const sourceRoot = new THREE.Group(); scene.add(sourceRoot);
const compiledRoot = new THREE.Group(); scene.add(compiledRoot);
let shadowProxy = null;
let source = null;
let compiled = null;
let displayColors = null;
let compileCancelled = false;
let sourceBuffer = null;
let sourceSha = '';
let ambientSampler = null, aoSampler = null;
let chunkObjects = [];
let currentObjectUrl = null;
let visibleChunkSet = new Set();
let renderedTerrainCalls = 0;
let tuningRevision = 0;

const loader = new GLTFLoader();

function setStatus(message, error=false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function numberValue(id, fallback){ const v=Number($(id).value); return Number.isFinite(v)?v:fallback; }
function clearGroup(group){ while(group.children.length){ const o=group.children[group.children.length-1]; group.remove(o); o.traverse?.(x=>{ x.geometry?.dispose?.(); if(x.material){ const ms=Array.isArray(x.material)?x.material:[x.material]; ms.forEach(m=>m.dispose?.()); } }); } }

async function imageToSampler(image, flipY = false) {
  if (!image) return null;
  const w=image.width, h=image.height; if(!w||!h) throw new Error('Texture image is not ready.');
  const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(flipY){ctx.translate(0,h);ctx.scale(1,-1);}
  ctx.drawImage(image,0,0,w,h);
  return { data:ctx.getImageData(0,0,w,h).data, width:w, height:h };
}

async function fileToSampler(file) {
  if(!file) return null;
  const bitmap=await createImageBitmap(file); return imageToSampler(bitmap);
}

function extractSource(gltf, scale=1) {
  gltf.scene.updateMatrixWorld(true);
  let mesh=null; gltf.scene.traverse(o=>{ if(!mesh && o.isMesh && o.geometry?.attributes?.position) mesh=o; });
  if(!mesh) throw new Error('The GLB has no supported mesh.');
  const g=mesh.geometry; const p=g.attributes.position; const uv=g.attributes.uv;
  if(!uv) throw new Error('The source mesh has no UV0 data.');
  const positions=new Float32Array(p.count*3); const v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).multiplyScalar(scale); positions[i*3]=v.x; positions[i*3+1]=v.y; positions[i*3+2]=v.z; }
  let indices=null;
  if(g.index) indices=new Uint32Array(g.index.array);
  else { indices=new Uint32Array(p.count); for(let i=0;i<p.count;i++) indices[i]=i; }
  const uvs=new Float32Array(uv.array);
  const box=new THREE.Box3(); for(let i=0;i<p.count;i++) box.expandByPoint(v.set(positions[i*3],positions[i*3+1],positions[i*3+2]));
  let material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
  if(!material?.map?.image) throw new Error('The source material has no readable base-colour texture.');
  material.map.updateMatrix?.();
  const m=material.map.matrix?.elements ? [...material.map.matrix.elements] : null;
  return {
    positions, indices, uvs,
    bounds:{minX:box.min.x,minY:box.min.y,minZ:box.min.z,maxX:box.max.x,maxY:box.max.y,maxZ:box.max.z},
    baseTexture:material.map, textureMatrix:m, mesh, gltf, scale,
    sourceTriangles:indices.length/3, sourceVertices:p.count,
  };
}

async function loadBuffer(buffer, label='terrain.glb') {
  setStatus(`Loading ${label}…`);
  sourceBuffer=buffer.slice(0); sourceSha=await sha256Hex(sourceBuffer);
  const gltf=await loader.parseAsync(buffer,'');
  clearGroup(sourceRoot); sourceRoot.add(gltf.scene); sourceRoot.scale.setScalar(numberValue('worldScale',1)); sourceRoot.visible=$('sourceVisible').checked;
  const extracted=extractSource(gltf, numberValue('worldScale',1));
  extracted.baseImage=await imageToSampler(extracted.baseTexture.image,true);
  source=extracted;
  $('sourceTriangles').textContent=source.sourceTriangles.toLocaleString();
  $('sourceVertices').textContent=source.sourceVertices.toLocaleString();
  $('sourceSize').textContent=`${(buffer.byteLength/1048576).toFixed(2)} MB`;
  $('sourceHash').textContent=sourceSha.slice(0,12)+'…';
  fitCamera(source.bounds);
  setStatus(`Loaded ${label}. Ready to compile.`);
  await compileTerrain();
}

function fitCamera(bounds) {
  const cx=(bounds.minX+bounds.maxX)/2, cy=(bounds.minY+bounds.maxY)/2, cz=(bounds.minZ+bounds.maxZ)/2;
  const ex=bounds.maxX-bounds.minX, ey=bounds.maxY-bounds.minY, ez=bounds.maxZ-bounds.minZ; const s=Math.max(ex,ez,ey*2);
  controls.target.set(cx,cy,cz); camera.position.set(cx+s*0.95,cy+s*0.9,cz+s*1.15); camera.near=Math.max(0.001,s/1000); camera.far=s*30+10; camera.updateProjectionMatrix(); controls.update();
}

function makeSeamTexture() {
  const c=document.createElement('canvas'); c.width=64;c.height=64; const x=c.getContext('2d');
  x.fillStyle='#ffffff';x.fillRect(0,0,64,64); x.strokeStyle='#e1dfdb';x.lineWidth=1; x.strokeRect(0.5,0.5,63,63);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping; t.magFilter=THREE.LinearFilter; t.minFilter=THREE.LinearMipmapLinearFilter; return t;
}
const seamTexture=makeSeamTexture();

function colorAt(gridColors,i,darken=1){ const c=new THREE.Color(); c.setRGB(gridColors[i*3]/255*darken,gridColors[i*3+1]/255*darken,gridColors[i*3+2]/255*darken,THREE.SRGBColorSpace); return c; }

function buildSideGeometry(grid, colors, r0,r1,c0,c1) {
  const pos=[], nor=[], col=[], uv=[], ind=[]; let vi=0; const {heights,cols,rows,originX,originZ,baseY,blockWidth:bw,blockHeight:bh}=grid;
  const pushQuad=(a,b,c,d,n,color,uvs)=>{ const vs=[a,b,c,d]; for(const q of vs){pos.push(...q);nor.push(...n);col.push(color.r,color.g,color.b); } uv.push(...uvs); ind.push(vi,vi+1,vi+2,vi,vi+2,vi+3); vi+=4; };
  for(let r=r0;r<r1;r++) for(let c=c0;c<c1;c++) {
    const idx=r*cols+c, cur=heights[idx]; if(cur===EMPTY_LAYER) continue;
    const x0=originX+c*bw,x1=x0+bw,z0=originZ+r*bw,z1=z0+bw,y=baseY+cur*bh; const color=colorAt(colors,idx,numberValue('sideBrightness',0.92));
    const checks=[[-1,0,'N'],[1,0,'S'],[0,-1,'W'],[0,1,'E']];
    for(const [dr,dc,side] of checks){ const rr=r+dr,cc=c+dc; const nb=(rr<0||rr>=rows||cc<0||cc>=cols)?EMPTY_LAYER:heights[rr*cols+cc]; if(nb!==EMPTY_LAYER && cur<=nb) continue; const low=nb===EMPTY_LAYER?baseY:baseY+nb*bh; if(y<=low) continue; const vSpan=(y-low)/bh;
      const wall = sideWallQuad(side, x0, x1, z0, z1, low, y);
      pushQuad(wall.vertices[0],wall.vertices[1],wall.vertices[2],wall.vertices[3],wall.normal,color,[0,0,1,0,1,vSpan,0,vSpan]);
    }
  }
  if(!pos.length) return null;
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ind);g.computeBoundingBox();g.computeBoundingSphere();return g;
}

function buildShadowProxy(grid,maxQuads=25000) {
  const {rows,cols,heights,originX,originZ,baseY,blockWidth:bw,blockHeight:bh}=grid;
  const stride=Math.max(1,Math.ceil(Math.sqrt(grid.occupied/maxQuads)));
  const offset=Math.min(bw,bh)*0.04;
  const pos=[],ind=[];
  const addQuad=(r0,r1,c0,c1,layer)=>{const i=pos.length/3,x0=originX+c0*bw,x1=originX+c1*bw,z0=originZ+r0*bw,z1=originZ+r1*bw,y=baseY+layer*bh-offset;pos.push(x0,y,z0,x0,y,z1,x1,y,z1,x1,y,z0);ind.push(i,i+1,i+2,i,i+2,i+3);};
  for(let r0=0;r0<rows;r0+=stride) for(let c0=0;c0<cols;c0+=stride){
    const r1=Math.min(rows,r0+stride),c1=Math.min(cols,c0+stride); let minLayer=Infinity,occupied=0;
    for(let r=r0;r<r1;r++) for(let c=c0;c<c1;c++){const h=heights[r*cols+c];if(h!==EMPTY_LAYER){minLayer=Math.min(minLayer,h);occupied++;}}
    if(!occupied)continue;
    const groupCells=(r1-r0)*(c1-c0);
    if(occupied===groupCells)addQuad(r0,r1,c0,c1,minLayer);
    else for(let r=r0;r<r1;r++) for(let c=c0;c<c1;c++){const h=heights[r*cols+c];if(h!==EMPTY_LAYER)addQuad(r,r+1,c,c+1,h);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ind);g.computeBoundingBox();g.computeBoundingSphere();
  const m=new THREE.MeshBasicMaterial({color:0xffffff,colorWrite:false,depthWrite:false,side:THREE.FrontSide}); const mesh=new THREE.Mesh(g,m);mesh.castShadow=true;mesh.receiveShadow=false;mesh.name='terrain-shadow-proxy';return mesh;
}

function buildTerrainRender(grid, colors) {
  clearGroup(compiledRoot); chunkObjects=[]; if(shadowProxy){scene.remove(shadowProxy);shadowProxy.geometry.dispose();shadowProxy.material.dispose();shadowProxy=null;}
  const chunkSize=Number($('chunkSize').value); const topGeoBase=new THREE.PlaneGeometry(1,1);topGeoBase.rotateX(-Math.PI/2);
  const topMat=new THREE.MeshStandardMaterial({map:seamTexture,roughness:0.84,metalness:0,side:THREE.FrontSide,dithering:true});
  const sideMat=new THREE.MeshStandardMaterial({vertexColors:true,map:seamTexture,roughness:0.92,metalness:0,side:THREE.FrontSide,dithering:true}); sideMat.map.wrapS=sideMat.map.wrapT=THREE.RepeatWrapping;
  const baseThickness=Math.max(grid.blockHeight*1.8,grid.blockWidth*0.8);const baseWidth=grid.cols*grid.blockWidth+grid.blockWidth*2,baseDepth=grid.rows*grid.blockWidth+grid.blockWidth*2;
  const baseMesh=new THREE.Mesh(new THREE.BoxGeometry(baseWidth,baseThickness,baseDepth),new THREE.MeshStandardMaterial({color:0x181b19,roughness:0.9,metalness:0}));baseMesh.position.set(grid.originX+grid.cols*grid.blockWidth/2,grid.baseY-baseThickness/2-0.0005,grid.originZ+grid.rows*grid.blockWidth/2);baseMesh.receiveShadow=true;baseMesh.name='terrain-display-base';compiledRoot.add(baseMesh);
  const temp=new THREE.Object3D(); const color=new THREE.Color(); let nextChunkId=0;
  for(let r0=0;r0<grid.rows;r0+=chunkSize) for(let c0=0;c0<grid.cols;c0+=chunkSize){ const r1=Math.min(grid.rows,r0+chunkSize),c1=Math.min(grid.cols,c0+chunkSize); let count=0; for(let r=r0;r<r1;r++)for(let c=c0;c<c1;c++)if(grid.heights[r*grid.cols+c]!==EMPTY_LAYER)count++; if(!count)continue;
    const chunkId=nextChunkId++;
    const top=new THREE.InstancedMesh(topGeoBase.clone(),topMat.clone(),count); top.instanceMatrix.setUsage(THREE.StaticDrawUsage); let n=0;
    for(let r=r0;r<r1;r++)for(let c=c0;c<c1;c++){const i=r*grid.cols+c,h=grid.heights[i];if(h===EMPTY_LAYER)continue; temp.position.set(grid.originX+(c+0.5)*grid.blockWidth,grid.baseY+h*grid.blockHeight+0.00025,grid.originZ+(r+0.5)*grid.blockWidth);temp.rotation.set(0,0,0);temp.scale.set(grid.blockWidth,1,grid.blockWidth);temp.updateMatrix();top.setMatrixAt(n,temp.matrix);color.copy(colorAt(colors,i,1));top.setColorAt(n,color);n++;}
    top.instanceMatrix.needsUpdate=true;if(top.instanceColor)top.instanceColor.needsUpdate=true;top.computeBoundingBox();top.computeBoundingSphere();top.castShadow=false;top.receiveShadow=true;top.frustumCulled=$('frustumCulling').checked;top.userData.chunkId=chunkId;top.onBeforeRender=()=>{visibleChunkSet.add(chunkId);renderedTerrainCalls++;};compiledRoot.add(top);
    let sides=null; if($('sideWalls').checked){const sg=buildSideGeometry(grid,colors,r0,r1,c0,c1);if(sg){sides=new THREE.Mesh(sg,sideMat.clone());sides.castShadow=false;sides.receiveShadow=true;sides.frustumCulled=$('frustumCulling').checked;sides.userData.chunkId=chunkId;sides.onBeforeRender=()=>{visibleChunkSet.add(chunkId);renderedTerrainCalls++;};compiledRoot.add(sides);}}
    const box=new THREE.Box3();box.expandByObject(top);if(sides)box.expandByObject(sides);const sphere=new THREE.Sphere();box.getBoundingSphere(sphere);chunkObjects.push({id:chunkId,top,sides,center:sphere.center.clone(),radius:sphere.radius});
  }
  topGeoBase.dispose();
  compiledRoot.visible=$('compiledVisible').checked; shadowProxy=buildShadowProxy(grid);scene.add(shadowProxy); updateSun(); updateStats();
}

async function compileTerrain(signal = null) {
  if(!source)return; compileCancelled=false;$('compileBtn').disabled=true;$('cancelBtn').disabled=false;setStatus('Compiling fixed block grid…');
  try{
    const blockWidth=numberValue('blockWidth',0.02),blockHeight=numberValue('blockHeight',0.0125);
    const baseImage=source.baseImage; const t0=performance.now();
    compiled=await compileHeightGrid({...source,baseImage,ambientImage:ambientSampler,aoImage:aoSampler},{blockWidth,blockHeight,offsetX:numberValue('offsetX',0),offsetZ:numberValue('offsetZ',0),bakedStrength:numberValue('bakedStrength',1),aoStrength:numberValue('aoStrength',1),batchSize:2048,maxCells:250000,shouldCancel:()=>compileCancelled||signal?.aborted,onProgress:p=>{$('progress').value=p; $('progressText').textContent=Math.round(p*100)+'%';},yieldControl:()=>new Promise(r=>requestAnimationFrame(r))});
    displayColors=applyHeightAO(compiled, numberValue('previewAO',0.05)); compiled.compileMs=performance.now()-t0; compiled.sideWalls=countSideWalls(compiled); buildTerrainRender(compiled,displayColors); setStatus(`Compiled ${compiled.occupied.toLocaleString()} blocks in ${compiled.compileMs.toFixed(0)} ms.`);
  }catch(e){setStatus(e.message,true);}finally{$('compileBtn').disabled=false;$('cancelBtn').disabled=true;}
}

function updateStats(){ if(!compiled)return; $('gridCells').textContent=compiled.totalCells.toLocaleString();$('occupiedCells').textContent=compiled.occupied.toLocaleString();$('sideCount').textContent=compiled.sideWalls.toLocaleString();$('terrainTriangles').textContent=((compiled.occupied+compiled.sideWalls)*2).toLocaleString();$('chunkCount').textContent=chunkObjects.length.toLocaleString();$('compileTime').textContent=(compiled.compileMs||0).toFixed(0)+' ms'; }

function updateLook(){renderer.toneMappingExposure=numberValue('exposure',1.28);ambient.intensity=numberValue('ambientIntensity',0.82);skyFill.intensity=numberValue('skyIntensity',1.32);}

function updateSun(){ if(!compiled&&!source)return; const bounds=compiled?.bounds||source?.bounds; if(!bounds)return; const cx=(bounds.minX+bounds.maxX)/2,cy=(bounds.minY+bounds.maxY)/2,cz=(bounds.minZ+bounds.maxZ)/2;const ex=bounds.maxX-bounds.minX,ez=bounds.maxZ-bounds.minZ,ey=bounds.maxY-bounds.minY;const size=Math.max(ex,ez,ey,0.1);const az=THREE.MathUtils.degToRad(numberValue('sunAzimuth',38));const el=THREE.MathUtils.degToRad(clamp(numberValue('sunElevation',60),5,89));const d=size*5+2;const ce=Math.cos(el);sun.position.set(cx+d*ce*Math.cos(az),cy+d*Math.sin(el),cz+d*ce*Math.sin(az));sun.target.position.set(cx,cy,cz);sun.intensity=numberValue('sunIntensity',1.2);const s=size*1.4;Object.assign(sun.shadow.camera,{left:-s,right:s,top:s,bottom:-s,near:0.05,far:d*3});sun.shadow.camera.updateProjectionMatrix(); }

function compiledColorStats(){if(!compiled)return null;let nearBlack=0,sum=0,samples=0;for(let i=0;i<compiled.totalCells;i++){if(compiled.heights[i]===EMPTY_LAYER)continue;const r=compiled.colors[i*3],g=compiled.colors[i*3+1],b=compiled.colors[i*3+2];if(r<20&&g<20&&b<20)nearBlack++;sum+=r+g+b;samples+=3;}return {nearBlack,meanByte:samples?sum/samples:0};}

function tuningState(){return {ok:true,tuningRevision,settings:{blockWidth:numberValue('blockWidth',0.02),blockHeight:numberValue('blockHeight',0.0125),previewAO:numberValue('previewAO',0.05),exposure:numberValue('exposure',1.28),ambientIntensity:numberValue('ambientIntensity',0.82),skyIntensity:numberValue('skyIntensity',1.32),sideBrightness:numberValue('sideBrightness',0.92),sunAzimuth:numberValue('sunAzimuth',38),sunElevation:numberValue('sunElevation',60),sunIntensity:numberValue('sunIntensity',1.2),shadowQuality:Number($('shadowQuality').value),chunkSize:Number($('chunkSize').value),sideWalls:$('sideWalls').checked},geometry:compiled?{rows:compiled.rows,cols:compiled.cols,totalCells:compiled.totalCells,occupied:compiled.occupied,sideWalls:compiled.sideWalls,triangles:(compiled.occupied+compiled.sideWalls)*2,compileMs:compiled.compileMs,colorStats:compiledColorStats()}:null,render:{fps:Number($('fps').textContent)||0,visibleChunks:Number($('visibleChunks').textContent)||0,terrainCalls:Number($('terrainCalls').textContent)||0,sceneCalls:Number($('drawCalls').textContent)||0}};}

async function setTuning(input,options={}){
  if(input.expectedTuningRevision!==tuningRevision)return {ok:false,reason:'revision_conflict',tuningRevision};
  const controlIds=['blockWidth','blockHeight','previewAO','exposure','ambientIntensity','skyIntensity','sideBrightness','sunAzimuth','sunElevation','sunIntensity','shadowQuality','chunkSize'];
  for(const id of controlIds)if(Object.hasOwn(input,id))$(id).value=String(input[id]);
  if(Object.hasOwn(input,'sideWalls'))$('sideWalls').checked=input.sideWalls;
  updateLook();updateSun();
  if(compiled&&Object.hasOwn(input,'previewAO')){displayColors=applyHeightAO(compiled,numberValue('previewAO',0.05));buildTerrainRender(compiled,displayColors);}
  else if(compiled&&(Object.hasOwn(input,'sideBrightness')||Object.hasOwn(input,'chunkSize')||Object.hasOwn(input,'sideWalls')))buildTerrainRender(compiled,displayColors);
  if(Object.hasOwn(input,'shadowQuality')){const n=Number($('shadowQuality').value);sun.shadow.mapSize.set(n,n);sun.shadow.map?.dispose();sun.shadow.map=null;}
  if(input.recompile)await compileTerrain(options.signal);
  tuningRevision++;
  return tuningState();
}

function resetTuningView(input){if(input.expectedTuningRevision!==tuningRevision)return {ok:false,reason:'revision_conflict',tuningRevision};if(source)fitCamera(source.bounds);tuningRevision++;return tuningState();}

async function exportPackage(){ if(!compiled)return; const binary=createCellBinary(compiled,compiled.colors); const cellHash=await sha256Hex(binary); const meta={formatVersion:1,rows:compiled.rows,cols:compiled.cols,blockWidth:compiled.blockWidth,blockHeight:compiled.blockHeight,gridOrigin:[compiled.originX,compiled.originZ],baseHeight:compiled.baseY,chunkSize:Number($('chunkSize').value),colorSpace:'sRGB',recordBytes:6,sourceSha256:sourceSha,cellDataSha256:cellHash,occupiedCells:compiled.occupied,emptyCells:compiled.totalCells-compiled.occupied}; downloadBlob(new Blob([JSON.stringify(meta,null,2)],{type:'application/json'}),'terrain.meta.json'); setTimeout(()=>downloadBlob(new Blob([binary],{type:'application/octet-stream'}),'terrain.cells.bin'),250); setStatus(`Exported package. Cell hash ${cellHash.slice(0,12)}…`); }
function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}

async function roundTripTest(){ if(!compiled)return;const binary=createCellBinary(compiled,compiled.colors);const meta={rows:compiled.rows,cols:compiled.cols,blockWidth:compiled.blockWidth,blockHeight:compiled.blockHeight,gridOrigin:[compiled.originX,compiled.originZ],baseHeight:compiled.baseY};const parsed=parseCellBinary(meta,binary);const rebuilt=createCellBinary(parsed,parsed.colors);const a=await sha256Hex(binary),b=await sha256Hex(rebuilt);setStatus(a===b?`Round-trip PASS: ${a.slice(0,12)}…`:'Round-trip FAIL',a!==b);}

async function stressTest(){ if(!source)return;const target=Number($('stressTarget').value);const area=(source.bounds.maxX-source.bounds.minX)*(source.bounds.maxZ-source.bounds.minZ);const bw=Math.sqrt(area/target);setStatus(`Stress test: about ${target.toLocaleString()} cells…`);const t0=performance.now();try{const g=await compileHeightGrid({...source,baseImage:source.baseImage},{blockWidth:bw,blockHeight:numberValue('blockHeight',0.0125),maxCells:130000,batchSize:4096,yieldControl:()=>new Promise(r=>requestAnimationFrame(r))});const ms=performance.now()-t0;setStatus(`Stress PASS: ${g.totalCells.toLocaleString()} cells, ${g.occupied.toLocaleString()} occupied, ${ms.toFixed(0)} ms.`);}catch(e){setStatus(`Stress FAIL: ${e.message}`,true);} }

$('compileBtn').addEventListener('click',()=>compileTerrain());$('cancelBtn').addEventListener('click',()=>{compileCancelled=true;});$('exportBtn').addEventListener('click',exportPackage);$('roundTripBtn').addEventListener('click',roundTripTest);$('stressBtn').addEventListener('click',stressTest);
$('sourceVisible').addEventListener('change',e=>sourceRoot.visible=e.target.checked);$('compiledVisible').addEventListener('change',e=>compiledRoot.visible=e.target.checked);
$('gridVisible').addEventListener('change',e=>gridHelper.visible=e.target.checked);$('frustumCulling').addEventListener('change',e=>chunkObjects.forEach(c=>{c.top.frustumCulled=e.target.checked;if(c.sides)c.sides.frustumCulled=e.target.checked;}));
$('sideWalls').addEventListener('change',()=>compiled&&buildTerrainRender(compiled,displayColors));$('chunkSize').addEventListener('change',()=>compiled&&buildTerrainRender(compiled,displayColors));
for(const id of ['sunAzimuth','sunElevation','sunIntensity']) $(id).addEventListener('input',updateSun);
$('exposure').addEventListener('input',updateLook);$('ambientIntensity').addEventListener('input',updateLook);$('skyIntensity').addEventListener('input',updateLook);$('sideBrightness').addEventListener('change',()=>compiled&&buildTerrainRender(compiled,displayColors));
$('shadowQuality').addEventListener('change',e=>{const n=Number(e.target.value);sun.shadow.mapSize.set(n,n);sun.shadow.map?.dispose();sun.shadow.map=null;});
$('worldScale').addEventListener('change',()=>{if(sourceBuffer)loadBuffer(sourceBuffer.slice(0),'terrain.glb');});
$('terrainFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;await loadBuffer(await f.arrayBuffer(),f.name);});
$('ambientFile').addEventListener('change',async e=>{ambientSampler=await fileToSampler(e.target.files?.[0]);setStatus(ambientSampler?'Ambient/GI bake loaded. Recompile terrain.':'Ambient bake cleared.');});
$('aoFile').addEventListener('change',async e=>{aoSampler=await fileToSampler(e.target.files?.[0]);setStatus(aoSampler?'AO bake loaded. Recompile terrain.':'AO bake cleared.');});
$('resetView').addEventListener('click',()=>{if(source)fitCamera(source.bounds);tuningRevision++;});

for(const id of ['blockWidth','blockHeight','previewAO','exposure','ambientIntensity','skyIntensity','sideBrightness','sunAzimuth','sunElevation','sunIntensity','shadowQuality','chunkSize','sideWalls'])$(id).addEventListener('change',()=>{tuningRevision++;});

const webmcpStatus=$('webmcpStatus');
registerTerrainTuningTools({getState:tuningState,setTuning,resetView:resetTuningView}).then((result)=>{webmcpStatus.textContent=result.ok?`${result.toolCount} WEBMCP TOOLS`:'WEBMCP UNAVAILABLE';webmcpStatus.className=`agent-status ${result.ok?'ok':'warn'}`;});

let last=performance.now(),frames=0,fps=0;
function animate(now){requestAnimationFrame(animate);controls.update();visibleChunkSet=new Set();renderedTerrainCalls=0;const maxD=numberValue('maxDistance',0);if(maxD>0){for(const ch of chunkObjects){const vis=camera.position.distanceTo(ch.center)-ch.radius<=maxD;ch.top.visible=vis;if(ch.sides)ch.sides.visible=vis;}}else{for(const ch of chunkObjects){ch.top.visible=true;if(ch.sides)ch.sides.visible=true;}}
renderer.render(scene,camera);frames++;if(now-last>=500){fps=frames*1000/(now-last);frames=0;last=now;$('fps').textContent=fps.toFixed(0);$('visibleChunks').textContent=visibleChunkSet.size.toLocaleString();$('drawCalls').textContent=renderer.info.render.calls.toLocaleString();$('terrainCalls').textContent=renderedTerrainCalls.toLocaleString();}}
requestAnimationFrame(animate);

new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}).observe(viewport);

(async()=>{try{const res=await fetch('./assets/Terrain_Optimised_10k.glb');if(!res.ok)throw new Error(`HTTP ${res.status}`);await loadBuffer(await res.arrayBuffer(),'Terrain_Optimised_10k.glb');}catch(e){setStatus(`Default GLB could not load: ${e.message}. Use Load GLB.`,true);}})();
