import { compileImageData } from './compiler.js';
import { decodeImageFile } from './image-loader.js';
import { makePattern, PATTERN_NAMES } from './patterns.js';
import { DEFAULT_PALETTE } from './palette.js';
import { validateBlueprint } from './blueprint.js';
import { createInventory, inventoryHasNoOverlap } from '../bricks/inventory.js';
import { BRICK_SPEC } from '../bricks/brick-spec.js';

const $ = (id) => document.getElementById(id);
const paletteById = new Map(DEFAULT_PALETTE.map((item) => [item.id, item]));
const query = new URLSearchParams(location.search);
const requestedPattern = PATTERN_NAMES.includes(query.get('pattern')) ? query.get('pattern') : 'ring';
let currentImage = makePattern(requestedPattern, 320);
let currentPattern = requestedPattern;

function cssColour(entry) { return `rgb(${entry.srgb.map((v) => Math.round(v)).join(',')})`; }

function drawSource(image) {
  const canvas = $('source-canvas');
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d');
  const data = image instanceof ImageData ? image : new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.putImageData(data, 0, 0);
}

function drawPreview(blueprint) {
  const canvas = $('preview-canvas');
  const cols = blueprint.grid.cols; const rows = blueprint.grid.rows;
  const scale = Math.max(18, Math.min(42, Math.floor(Math.min(600 / cols, 430 / rows))));
  canvas.width = cols * scale + 2; canvas.height = rows * scale + 2;
  const context = canvas.getContext('2d');
  context.fillStyle = '#080c11'; context.fillRect(0, 0, canvas.width, canvas.height);
  for (const target of blueprint.targets) {
    const entry = paletteById.get(target.colour);
    const x = target.gridCol * scale + 1; const y = target.gridRow * scale + 1;
    context.fillStyle = cssColour(entry); context.fillRect(x + 1.5, y + 1.5, scale * 2 - 3, scale - 3);
    const gradient = context.createLinearGradient(x, y, x, y + scale);
    gradient.addColorStop(0, 'rgba(255,255,255,.18)'); gradient.addColorStop(.5, 'rgba(255,255,255,0)'); gradient.addColorStop(1, 'rgba(0,0,0,.16)');
    context.fillStyle = gradient; context.fillRect(x + 1.5, y + 1.5, scale * 2 - 3, scale - 3);
    context.strokeStyle = 'rgba(255,255,255,.17)'; context.lineWidth = 1; context.strokeRect(x + 1.5, y + 1.5, scale * 2 - 3, scale - 3);
    const studR = Math.max(1.8, scale * .09); const studY = y + scale * .5;
    for (let s = 0; s < 4; s += 1) { context.beginPath(); context.arc(x + scale * (.25 + s * .5), studY, studR, 0, Math.PI * 2); context.fillStyle='rgba(255,255,255,.18)'; context.fill(); }
  }
  context.strokeStyle = 'rgba(255,255,255,.055)'; context.lineWidth = 1;
  for (let col = 0; col <= cols; col += 1) { context.beginPath(); context.moveTo(col*scale+1,1); context.lineTo(col*scale+1,rows*scale+1); context.stroke(); }
  for (let row = 0; row <= rows; row += 1) { context.beginPath(); context.moveTo(1,row*scale+1); context.lineTo(cols*scale+1,row*scale+1); context.stroke(); }
}

function drawBoard(blueprint) {
  const canvas = $('board-canvas'); canvas.width = 720; canvas.height = 500;
  const context = canvas.getContext('2d'); context.clearRect(0,0,canvas.width,canvas.height);
  const board = blueprint.board; const width = board.widthMm; const height = board.heightMm;
  const scale = Math.min(1.7, 580 / Math.max(width, height));
  const origin = { x: 360, y: 390 };
  const project = (x,y,z=0) => ({ x: origin.x + (x - board.origin.xMm) * scale * .77 - (y - board.origin.yMm) * scale * .43 - width*scale*.22, y: origin.y - (x-board.origin.xMm)*scale*.22 - (y-board.origin.yMm)*scale*.45 - z*scale*1.25 });
  const cornerWorld = [
    [board.origin.xMm,board.origin.yMm],[board.origin.xMm+width,board.origin.yMm],[board.origin.xMm+width,board.origin.yMm+height],[board.origin.xMm,board.origin.yMm+height]
  ];
  const corners = cornerWorld.map(([x,y])=>project(x,y,0));
  context.beginPath(); context.moveTo(corners[0].x,corners[0].y); corners.slice(1).forEach(p=>context.lineTo(p.x,p.y)); context.closePath();
  const bg=context.createLinearGradient(200,160,520,400);bg.addColorStop(0,'#1c2430');bg.addColorStop(1,'#0b1017');context.fillStyle=bg;context.fill();context.strokeStyle='#394352';context.lineWidth=1.5;context.stroke();
  const targets=[...blueprint.targets].sort((a,b)=>b.worldYmm-a.worldYmm || a.worldXmm-b.worldXmm);
  for (const target of targets) {
    const halfX=BRICK_SPEC.lengthMm/2, halfY=BRICK_SPEC.widthMm/2, z=target.worldZmm;
    const pts=[[target.worldXmm-halfX,target.worldYmm-halfY],[target.worldXmm+halfX,target.worldYmm-halfY],[target.worldXmm+halfX,target.worldYmm+halfY],[target.worldXmm-halfX,target.worldYmm+halfY]].map(([x,y])=>project(x,y,z));
    context.beginPath(); context.moveTo(pts[0].x,pts[0].y); pts.slice(1).forEach(p=>context.lineTo(p.x,p.y)); context.closePath(); context.fillStyle=cssColour(paletteById.get(target.colour)); context.fill(); context.strokeStyle='rgba(255,255,255,.2)'; context.stroke();
  }
  context.fillStyle='#9ba7b7';context.font='600 11px system-ui';context.fillText(`origin (${board.origin.xMm.toFixed(0)}, ${board.origin.yMm.toFixed(0)}, ${board.origin.zMm.toFixed(0)}) mm`,20,24);
  context.fillStyle='#687587';context.fillText('Every tile above is projected from target.worldXmm / worldYmm / worldZmm',20,43);
}

function updateFacts(blueprint, diagnostics) {
  $('grid-metric').textContent = `${blueprint.grid.cols} × ${blueprint.grid.rows}`;
  $('brick-metric').textContent = `${blueprint.brickCount}`; $('budget-metric').textContent = `budget ${blueprint.settings.brickBudget}`;
  $('board-metric').textContent = `${blueprint.board.widthMm} × ${blueprint.board.heightMm}`; $('id-metric').textContent = blueprint.blueprintId;
  $('compile-time').textContent = `${diagnostics.compileMs.toFixed(1)} ms`;
  $('colour-counts').innerHTML = Object.entries(blueprint.colourCounts).sort().map(([id,count])=>`<span class="swatch"><i style="background:${cssColour(paletteById.get(id))}"></i>${id.toUpperCase()} <strong>${count}</strong></span>`).join('');
  const validation=validateBlueprint(blueprint); const inventory=createInventory(blueprint,{seed:blueprint.settings.seed});
  const checks=[['even width',blueprint.grid.cols%2===0],['budget',blueprint.brickCount<=blueprint.settings.brickBudget],['no overlap',validation.ok],['canonical yaw',blueprint.targets.every(t=>t.yawDeg===0)],['inventory complete',inventory.items.length===blueprint.brickCount],['spawn clear',inventoryHasNoOverlap(inventory.items)]];
  $('invariants').innerHTML=checks.map(([label,ok])=>`<span class="check ${ok?'':'fail'}">${ok?'PASS':'FAIL'} · ${label}</span>`).join('');
}

async function compile() {
  $('status').textContent='COMPILING';
  await new Promise((resolve)=>requestAnimationFrame(resolve));
  try {
    const budget=Number($('budget').value); const fitMode=$('fit').value;
    const result=compileImageData(currentImage,{brickBudget:budget,fitMode,seed:173});
    drawSource(currentImage); drawPreview(result.blueprint); drawBoard(result.blueprint); updateFacts(result.blueprint,result.diagnostics);
    globalThis.__LOGO_ROBO_LAST__={blueprint:result.blueprint,diagnostics:result.diagnostics,pattern:currentPattern};
    $('status').textContent='PASS'; document.body.dataset.ready='true';
  } catch(error) { $('status').textContent='ERROR'; $('compile-time').textContent=String(error.message||error); document.body.dataset.ready='error'; console.error(error); }
}

for (const name of PATTERN_NAMES) {
  const button=document.createElement('button');button.textContent=name.toUpperCase();button.dataset.pattern=name;
  button.classList.toggle('active',name===currentPattern);button.addEventListener('click',()=>{currentPattern=name;currentImage=makePattern(name,320);document.querySelectorAll('[data-pattern]').forEach(el=>el.classList.toggle('active',el.dataset.pattern===name));compile();});$('pattern-buttons').append(button);
}
const requestedBudget = Number(query.get('budget'));
if (Number.isFinite(requestedBudget) && requestedBudget >= 12 && requestedBudget <= 128) { $('budget').value=String(Math.trunc(requestedBudget)); $('budget-value').textContent=$('budget').value; }
if (query.get('fit') === 'cover') $('fit').value='cover';
$('budget').addEventListener('input',()=>{$('budget-value').textContent=$('budget').value;compile();});$('fit').addEventListener('change',compile);
$('file').addEventListener('change',async(event)=>{const file=event.target.files?.[0];if(!file)return;currentImage=await decodeImageFile(file);currentPattern='upload';document.querySelectorAll('[data-pattern]').forEach(el=>el.classList.remove('active'));compile();});
compile();
