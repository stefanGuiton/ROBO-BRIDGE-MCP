import * as THREE from '../../vendor/three.module.min.js';
import { clamp } from './math.js';

export function parseCubeLUT(text, allowedSizes = [17, 33, 65]) {
  const lines = String(text ?? '').split(/\r?\n/);
  let size = 0;
  let title = '';
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  const values = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const tag = parts[0].toUpperCase();
    if (tag === 'TITLE') {
      title = line.slice(5).trim().replace(/^"|"$/g, '');
      continue;
    }
    if (tag === 'LUT_3D_SIZE') {
      size = Number(parts[1]);
      continue;
    }
    if (tag === 'DOMAIN_MIN') {
      domainMin = parts.slice(1, 4).map(Number);
      continue;
    }
    if (tag === 'DOMAIN_MAX') {
      domainMax = parts.slice(1, 4).map(Number);
      continue;
    }
    if (tag === 'LUT_1D_SIZE') throw new Error('1D LUT is not supported');
    if (parts.length >= 3) {
      const value = parts.slice(0, 3).map(Number);
      if (value.every(Number.isFinite)) values.push(value);
    }
  }
  if (!Number.isInteger(size) || size < 2) throw new Error('Missing LUT_3D_SIZE');
  if (allowedSizes.length && !allowedSizes.includes(size)) {
    throw new Error(`LUT size ${size} is not supported. Use ${allowedSizes.join(', ')}.`);
  }
  const expected = size ** 3;
  if (values.length !== expected) throw new Error(`LUT has ${values.length} rows. Expected ${expected}.`);
  if (!domainMin.every(Number.isFinite) || !domainMax.every(Number.isFinite)) throw new Error('Invalid LUT domain');
  const data = new Uint8Array(expected * 4);
  for (let index = 0; index < expected; index += 1) {
    data[index * 4] = Math.round(clamp(values[index][0], 0, 1) * 255);
    data[index * 4 + 1] = Math.round(clamp(values[index][1], 0, 1) * 255);
    data[index * 4 + 2] = Math.round(clamp(values[index][2], 0, 1) * 255);
    data[index * 4 + 3] = 255;
  }
  return { size, title, domainMin, domainMax, data };
}

function identityLut(size = 2) {
  const data = new Uint8Array(size ** 3 * 4);
  let offset = 0;
  for (let blue = 0; blue < size; blue += 1) {
    for (let green = 0; green < size; green += 1) {
      for (let red = 0; red < size; red += 1) {
        data[offset++] = Math.round(red / (size - 1) * 255);
        data[offset++] = Math.round(green / (size - 1) * 255);
        data[offset++] = Math.round(blue / (size - 1) * 255);
        data[offset++] = 255;
      }
    }
  }
  return { size, title: 'Identity', domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

export class ColorGrader {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.loaded = false;
    this.name = 'None';
    this.size = 0;
    this.identity = identityLut();
    this.drawingSize = new THREE.Vector2();
    this.makeTarget();
    this.makePass();
    this.setLut(this.identity, false);
  }

  makeTarget() {
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false
    });
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.target.texture.name = 'MAIN_DEMO ACES grading source';
  }

  makePass() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const vertexShader = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
    const fragmentShader = `precision highp sampler3D;
varying vec2 vUv;
out vec4 outColor;
uniform sampler2D tInput;
uniform sampler3D tLut;
uniform float uLutSize;
uniform float uLutStrength;
uniform float uLutEnabled;
uniform vec3 uDomainMin;
uniform vec3 uDomainMax;
uniform float uExposureEV;
uniform float uTemperature;
uniform float uTint;
uniform float uContrast;
uniform float uSaturation;
uniform float uLift;
uniform float uGamma;
uniform float uGain;
vec3 applyLut(vec3 colour){
  vec3 span=max(uDomainMax-uDomainMin,vec3(1e-5));
  vec3 uvw=clamp((colour-uDomainMin)/span,0.0,1.0);
  uvw=(uvw*(uLutSize-1.0)+0.5)/uLutSize;
  return texture(tLut,uvw).rgb;
}
void main(){
  vec3 colour=texture(tInput,vUv).rgb;
  colour*=exp2(uExposureEV);
  colour.r*=1.0+0.12*uTemperature;
  colour.b*=1.0-0.12*uTemperature;
  colour.g*=1.0+0.10*uTint;
  colour=(colour-0.5)*uContrast+0.5;
  colour=max(colour+vec3(uLift),vec3(0.0));
  colour=pow(max(colour,vec3(0.0)),vec3(1.0/max(uGamma,0.001)))*uGain;
  float luminance=dot(colour,vec3(0.2126,0.7152,0.0722));
  colour=mix(vec3(luminance),colour,uSaturation);
  vec3 graded=clamp(colour,0.0,1.0);
  if(uLutEnabled>0.5)graded=mix(graded,applyLut(graded),uLutStrength);
  outColor=linearToOutputTexel(vec4(graded,1.0));
}`;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        tInput: { value: this.target.texture },
        tLut: { value: null },
        uLutSize: { value: 2 },
        uLutStrength: { value: 1 },
        uLutEnabled: { value: 0 },
        uDomainMin: { value: new THREE.Vector3(0, 0, 0) },
        uDomainMax: { value: new THREE.Vector3(1, 1, 1) },
        uExposureEV: { value: 0 },
        uTemperature: { value: 0 },
        uTint: { value: 0 },
        uContrast: { value: 1 },
        uSaturation: { value: 1 },
        uLift: { value: 0 },
        uGamma: { value: 1 },
        uGain: { value: 1 }
      }
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);
  }

  textureFrom(parsed) {
    const texture = new THREE.Data3DTexture(parsed.data, parsed.size, parsed.size, parsed.size);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.unpackAlignment = 1;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  setLut(parsed, loaded = true) {
    this.lutTexture?.dispose();
    this.lutTexture = this.textureFrom(parsed);
    this.material.uniforms.tLut.value = this.lutTexture;
    this.material.uniforms.uLutSize.value = parsed.size;
    this.material.uniforms.uDomainMin.value.fromArray(parsed.domainMin);
    this.material.uniforms.uDomainMax.value.fromArray(parsed.domainMax);
    this.loaded = loaded;
    this.name = loaded ? (parsed.title || 'Loaded LUT') : 'None';
    this.size = loaded ? parsed.size : 0;
  }

  loadCubeText(text, name = 'Inline LUT') {
    const parsed = parseCubeLUT(text, [17, 33, 65]);
    if (!parsed.title) parsed.title = name;
    this.setLut(parsed, true);
    this.settings.lutEnabled = true;
    this.settings.lutName = parsed.title;
    this.settings.lutSize = parsed.size;
    return this.getDiagnostics();
  }

  clearLut() {
    this.setLut(this.identity, false);
    this.settings.lutEnabled = false;
    this.settings.lutName = 'None';
    this.settings.lutSize = 0;
  }

  resize() {
    this.renderer.getDrawingBufferSize(this.drawingSize);
    const width = Math.max(1, Math.floor(this.drawingSize.x));
    const height = Math.max(1, Math.floor(this.drawingSize.y));
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);
  }

  sync() {
    const uniforms = this.material.uniforms;
    uniforms.uExposureEV.value = this.settings.gradeExposureEV;
    uniforms.uTemperature.value = this.settings.gradeTemperature;
    uniforms.uTint.value = this.settings.gradeTint;
    uniforms.uContrast.value = this.settings.gradeContrast;
    uniforms.uSaturation.value = this.settings.gradeSaturation;
    uniforms.uLift.value = this.settings.gradeLift;
    uniforms.uGamma.value = this.settings.gradeGamma;
    uniforms.uGain.value = this.settings.gradeGain;
    uniforms.uLutStrength.value = this.settings.lutStrength;
    uniforms.uLutEnabled.value = this.settings.lutEnabled && this.loaded ? 1 : 0;
  }

  render(scene, camera) {
    this.resize();
    this.sync();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    const sourceStats = { ...this.renderer.info.render };
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
    return {
      calls: sourceStats.calls + this.renderer.info.render.calls,
      triangles: sourceStats.triangles + this.renderer.info.render.triangles
    };
  }

  getDiagnostics() {
    return {
      enabled: Boolean(this.settings.colorGradingEnabled),
      lutLoaded: this.loaded,
      lutName: this.name,
      lutSize: this.size,
      lutStrength: this.settings.lutStrength,
      target: [this.target.width, this.target.height]
    };
  }
}
