// Explicit real-Player click check, no screenshots or generated files.
import assert from 'node:assert/strict';
import { ChromiumSession } from '../tools/submission/cdp-browser.mjs';
import { V8_COLOUR_HEX } from '../apps/web/src/player/v8-brick-visual.js';

const browser = await ChromiumSession.launch({args:['--enable-experimental-web-platform-features']});
const evaluate = (fn, arg = null) => browser.evaluate(`(${fn.toString()})(${JSON.stringify(arg)})`);
try {
  await browser.navigate('http://127.0.0.1:8774/?demo=simple');
  await browser.waitFor(`document.documentElement.dataset.runtimeReady === 'true'`);
  // Keep the diagnostic camera stationary between aim and actual input. We step
  // rendering explicitly; no robot/board authority or pickup rule is bypassed.
  await evaluate(() => __ROBO_BRIDGE__.renderer.stop());
  // Exercise the real reset path that used to leave reused-ID colours stale.
  for (const mode of ['bridge', 'simple']) await evaluate(mode => __ROBO_BRIDGE__.demoModeControl.change(mode), mode);
  const sources = await evaluate(() => {
    const r = __ROBO_BRIDGE__; r.renderer.render();
    return r.robotController.getBricks().map(b => ({id:b.id,colour:b.colour,hex:r.renderer.brickMeshes.get(b.id).userData.material.color.getHex()}));
  });
  for (const source of sources) assert.equal(source.hex, V8_COLOUR_HEX[source.colour], source.id);
  console.log(JSON.stringify({check:'reset source colours',matched:sources.length}));
  const results = [];
  for (const source of [sources.find(b => b.colour === 'red'), ...sources.filter(b => b.colour === 'blue')]) {
    const aim = await evaluate(id => {
      const r = __ROBO_BRIDGE__, renderer = r.renderer, mesh = renderer.brickMeshes.get(id);
      renderer.scene.updateMatrixWorld(true);
      const target = mesh.getWorldPosition(mesh.position.clone());
      const camera = target.clone(); camera.z += 100;
      renderer.player.setEnabled(true); renderer.player.activateFallbackLook();
      renderer.player.setLookAt(camera, target); renderer.camera.updateMatrixWorld(true);
      renderer.render(); renderer.updatePlayerInteraction();
      const rect = document.querySelector('#scene').getBoundingClientRect();
      const x = rect.x + rect.width/2, y = rect.y + rect.height/2;
      return {picked:renderer.highlightedBrickId,x,y,element:document.elementFromPoint(x,y)?.outerHTML.slice(0,350),mobile:renderer.player.mobileMode,enabled:renderer.player.enabled,fallback:renderer.player.fallbackLookActive};
    }, source.id);
    assert.equal(aim.picked, source.id, JSON.stringify(aim));
    if (process.argv.includes('--debug')) console.log(JSON.stringify({check:'aim',source,aim}));
    for (const type of ['mousePressed', 'mouseReleased']) await browser.connection.send('Input.dispatchMouseEvent', {
      type,x:aim.x,y:aim.y,button:'left',clickCount:1
    },browser.sessionId);
    if (process.argv.includes('--debug')) console.log(JSON.stringify({check:'after click',state:await evaluate(()=>({held:__ROBO_BRIDGE__.humanBuildAdapter.getState(),log:__ROBO_BRIDGE__.humanBuildAdapter.getPickupLog(),highlight:__ROBO_BRIDGE__.renderer.highlightedBrickId,body:document.body.className}))}));
    await browser.waitFor(`__ROBO_BRIDGE__.humanBuildAdapter.getState().heldBrickId === ${JSON.stringify(source.id)}`,{timeoutMs:2000});
    const held = await evaluate(() => {
      const r = __ROBO_BRIDGE__; r.renderer.render();
      const log = r.humanBuildAdapter.getPickupLog().at(-1);
      return {log,hex:r.renderer.heldGhost.userData.material.color.getHex(),emissive:r.renderer.heldGhost.userData.material.emissiveIntensity,
        colour:r.robotController.getBricks().find(b => b.id === log.brickId).colour,
        ui:document.querySelector('[data-log]').textContent};
    });
    assert.equal(held.log.brickId, source.id); assert.equal(held.colour, source.colour);
    assert.equal(held.log.colour, source.colour); assert.equal(held.log.colourPreserved, true);
    assert.equal(held.hex, source.hex); assert.equal(held.emissive, 0);
    assert.ok(held.ui.includes(`Player picked up ${source.id} · colour ${source.colour}`));
    results.push({id:source.id,colour:source.colour,beforeHex:source.hex,heldHex:held.hex,pickupLog:held.log});
    const cancelled = await evaluate(() => __ROBO_BRIDGE__.renderer.undoPlayerAction());
    assert.equal(cancelled.ok, true);
  }
  assert.equal(browser.console.errors.length + browser.console.exceptions.length, 0, JSON.stringify(browser.console));
  console.log(JSON.stringify({ok:true,browser:browser.version.product,realMousePickups:results,consoleErrors:browser.console.errors,warnings:browser.console.warnings}));
} finally { await browser.close(); }
