import test from 'node:test';import assert from 'node:assert/strict';import{DEFAULT_PALETTE,nearestPaletteColour,srgbToOklab}from'../../apps/web/src/logo/palette.js';
test('palette colours map to themselves',()=>{for(const entry of DEFAULT_PALETTE)assert.equal(nearestPaletteColour(entry.srgb).entry.id,entry.id)});
test('near white and black map correctly',()=>{assert.equal(nearestPaletteColour([250,249,248]).entry.id,'white');assert.equal(nearestPaletteColour([5,7,10]).entry.id,'black')});
test('known primary samples map sensibly',()=>{assert.equal(nearestPaletteColour([220,40,40]).entry.id,'red');assert.equal(nearestPaletteColour([30,80,220]).entry.id,'blue');assert.equal(nearestPaletteColour([245,205,30]).entry.id,'yellow')});
test('OKLab conversion is finite and lightness ordered',()=>{const black=srgbToOklab([0,0,0]),white=srgbToOklab([255,255,255]);assert.ok(white[0]>black[0]);for(const v of [...black,...white])assert.equal(Number.isFinite(v),true)});
