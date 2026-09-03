// Read-only exact cross-section audit for the current co-oriented bridge parts.
// Front-face triangles are extruded through the exact part depth. A positive
// clipped intersection area and depth proves physical volume intersection.
import { constructionHarness } from '../tests/helpers/construction-harness.js';
import { partBounds, partsOverlap } from '../apps/web/src/bricks/part-spec.js';
import { createChallengeService } from '../apps/web/src/challenge/challenge-service.js';
import { createEasyBridgeChallenge } from '../apps/web/src/challenge/main-demo-easy.js';
import { createBridgeHost } from '../apps/web/src/bridge-core/index.js';
import { TERRAIN7_BRIDGE_INITIAL_SETTINGS } from '../apps/web/src/bridge/main-demo-bridge.js';
import { prepareBridgeBuild } from '../apps/web/src/bridge-construction/bridge-build-session.js';
import { V8_WORKSPACE } from '../apps/web/src/workcell/v8-workcell-profile.js';
import { pathToFileURL } from 'node:url';

const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area = p => Math.abs(p.reduce((v,a,i) => { const b=p[(i+1)%p.length]; return v+a[0]*b[1]-a[1]*b[0]; },0))/2;
function clip(subject, input) {
  const boundary = cross(...input) >= 0 ? input : [...input].reverse();
  let poly = subject;
  for(let i=0;i<3;i++) {
    const a=boundary[i],b=boundary[(i+1)%3], next=[];
    for(let j=0;j<poly.length;j++) {
      const p=poly[j],q=poly[(j+1)%poly.length],dp=cross(a,b,p),dq=cross(a,b,q);
      if(dp>=0) next.push(p);
      if((dp>=0)!==(dq>=0)) { const t=dp/(dp-dq); next.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]); }
    }
    poly=next;
  }
  return poly;
}
function triangles(p, registry) {
  if(p.customPartDefinitionId) {
    const geometry=registry.getCustomGeometry(p.customPartDefinitionId), result=[];
    for(let i=0;i<geometry.positions.length;i+=9) {
      if(geometry.normals[i+2]<0.9) continue;
      result.push([0,1,2].map(j=>[p.renderPose.position.xMm+geometry.positions[i+j*3]*p.renderPose.uniformScale,
        p.renderPose.position.zMm+geometry.positions[i+j*3+1]*p.renderPose.uniformScale]));
    }
    return result;
  }
  const b=partBounds(p), a=[b.min.xMm,b.min.zMm],c=[b.max.xMm,b.max.zMm];
  return [[a,[c[0],a[1]],c],[a,c,[a[0],c[1]]]];
}
export function auditPreparedGeometry({normalisedBuild,registry}) {
const placements=normalisedBuild.placements;
const intersections=[];
const trackProxyRisks=[];
for(let i=0;i<placements.length;i++)for(let j=0;j<i;j++) {
  const a=placements[i], b=placements[j];
  if(!partsOverlap(a,b))continue;
  if(a.partClass==='TRACK_SEGMENT'||b.partClass==='TRACK_SEGMENT') {
    // Track proxy is its enclosing exact AABB. No overlap proves separation;
    // positive overlap remains a risk, not a claimed exact volume result.
    trackProxyRisks.push({ a:a.placementId,b:b.placementId }); continue;
  }
  if(Math.abs(a.yawRad)>1e-8||Math.abs(b.yawRad)>1e-8)throw new Error('Audit requires current co-oriented Z-up span');
  const aa=partBounds(a),bb=partBounds(b), depth=Math.min(aa.max.yMm,bb.max.yMm)-Math.max(aa.min.yMm,bb.min.yMm);
  let sectionArea=0, example=null;
  for(const at of triangles(a,registry))for(const bt of triangles(b,registry)) {
    const polygon=clip(at,bt), overlapArea=polygon.length>=3?area(polygon):0;
    if(overlapArea>0.01) { sectionArea+=overlapArea; example??=polygon; }
  }
  if(sectionArea>0.01&&depth>0.1)intersections.push({a:a.placementId,b:b.placementId,aType:a.partType,bType:b.partType,areaMm2:sectionArea,depthMm:depth,volumeMm3:sectionArea*depth,examplePolygonXZmm:example});
}
return {planId:normalisedBuild.planId,checksum:normalisedBuild.designChecksum,worldTransform:normalisedBuild.worldTransform,partCount:placements.length,
  internalGeometryClear: intersections.length === 0 && trackProxyRisks.length === 0,
  intersectionCount:intersections.length,intersections,trackProxyRiskCount:trackProxyRisks.length,trackProxyRisks};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
const terrain7 = process.argv.includes('--terrain7');
const host = terrain7 ? await createBridgeHost({ initialSettings: TERRAIN7_BRIDGE_INITIAL_SETTINGS,
  challenge: createEasyBridgeChallenge(createChallengeService({ terrain7: true })), challengePolicy: 'locked', compilerOptions: { preferWorker: false } }) : (await constructionHarness()).host;
const report = auditPreparedGeometry(prepareBridgeBuild({ host, workspace: V8_WORKSPACE }));
console.log(JSON.stringify(report,null,2));
if (process.argv.includes('--write-evidence')) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir('output/playwright/construction', { recursive: true });
  await writeFile('output/playwright/construction/exact-geometry-audit.json', JSON.stringify(report,null,2));
}
}
