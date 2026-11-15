/**
 * The fire under the page: flame tongues licking up from the bottom edge, with sparks rising
 * out of it, all quantised with an 8x8 ordered (Bayer) dither so the field reads as pixels.
 *
 * The flame is turbulence scrolling upward, cut off by a height that wanders across the width
 * and over time, so it is solid at the base and breaks into tongues near its tip. The sparks
 * are two layers of cells scrolling upward, at most one spark per cell, swaying as they climb
 * and dying out with height. Nothing is drawn below a floor, so there is no loose speckle.
 *
 * One full-screen fragment shader on a WebGL1 canvas, rendered at a fraction of the viewport
 * (each dither dot is PX css pixels) and stretched with `image-rendering: pixelated`.
 * Colours come from the theme tokens (--color-ember-hot / --color-ember / --color-ember-cool,
 * --field-strength) and are re-read when the theme changes. Capped at 30fps, paused while the
 * tab is hidden, and drawn once (still) under reduced motion. No WebGL: the canvas stays empty.
 */
import { makeColorReader } from './color';

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uCool;
uniform float uStrength;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return v;
}

// Ordered dither thresholds, built from the 2x2 matrix.
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

// One layer of sparks: a cell grid scrolling upward, at most one spark per cell. A spark is a
// tiny glow (about one field pixel) that cools as it climbs and dies at its own height; it is
// returned as heat, so it goes through the same dither and colour ramp as the flame.
float sparks(vec2 uv, float scale, float speed, float density, float seed, float t) {
  vec2 p = uv * scale;
  p.y -= t * speed * scale;               // speed in viewport heights per second
  vec2 cell = floor(p);
  float h = hash(cell + seed);
  float cy = (cell.y + 0.5) / scale + t * speed;   // the cell's height on screen
  float life = 1.0 - smoothstep(0.04, 0.75, cy);
  if (h > density * life) return 0.0;
  vec2 f = fract(p) - 0.5;
  vec2 c = (vec2(hash(cell + seed + 3.1), hash(cell + seed + 7.7)) - 0.5) * 0.5;
  // Sway: a slow drift plus a quicker flutter, as a hot fleck rides the updraft.
  c.x += sin(t * 0.9 + h * 50.0 + p.y * 0.7) * 0.22 + sin(t * 3.1 + h * 20.0) * 0.06;
  // Distance in field pixels, so a spark stays one dot whatever the viewport.
  float px = length((f - c) * uRes.y / scale);
  float glow = 1.0 - smoothstep(0.25, 1.0, px);
  float flicker = 0.75 + 0.25 * sin(t * (5.0 + h * 11.0) + h * 70.0);
  return glow * flicker * mix(0.45, 1.0, life);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float y = frag.y / uRes.y;              // 0 at the bottom of the viewport
  vec2 uv = frag / uRes.y;                // aspect-true
  float t = uTime;

  // How high the flame reaches here: wandering across the width and slowly over time.
  float reach = 0.24 + 0.38 * smoothstep(0.2, 0.8, fbm(vec2(uv.x * 2.4 + 3.0, t * 0.16)));

  // Turbulence scrolling upward, stretched tall and warped sideways into tongues.
  vec2 q = vec2(uv.x * 6.5, uv.y * 2.4 - t * 1.5);
  float warp = fbm(q * vec2(0.35, 0.5) + vec2(t * 0.1, -t * 0.3));
  float n = fbm(q + vec2(warp * 2.4 - 1.2, warp * 0.6));
  // Solid at the base; toward the tip the noise takes over and splits it into tongues.
  float body = 1.0 - y / reach;
  float flame = body + (n - 0.5) * (0.6 + 2.1 * (1.0 - clamp(body, 0.0, 1.0)));
  flame = clamp(flame, 0.0, 1.0);
  flame = flame * flame * (3.0 - 2.0 * flame) * 0.9;
  flame = flame < 0.08 ? 0.0 : flame;     // no lone pixels above the flame

  // Sparks: thick just above the flame, thinning out and gone by the upper part of the page.
  float s = max(sparks(uv, 30.0, 0.2, 0.12, 37.0, t), sparks(uv, 18.0, 0.14, 0.08, 71.0, t));

  float v = max(flame, s);
  float d = bayer8(frag);
  float level = floor(v * 4.0 + d) / 4.0;  // 0, .25, .5, .75, 1
  if (level <= 0.0) { gl_FragColor = vec4(0.0); return; }

  vec3 col = mix(uCool, uMid, smoothstep(0.25, 0.5, level));
  col = mix(col, uHot, smoothstep(0.5, 1.0, level));
  float alpha = uStrength * (0.35 + 0.65 * level);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const FRAME_MS = 1000 / 30;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

export function initFlameField(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
  if (!gl) return;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const attr = gl.getAttribLocation(program, 'a');
  gl.enableVertexAttribArray(attr);
  gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);

  const u = {
    res: gl.getUniformLocation(program, 'uRes'),
    time: gl.getUniformLocation(program, 'uTime'),
    hot: gl.getUniformLocation(program, 'uHot'),
    mid: gl.getUniformLocation(program, 'uMid'),
    cool: gl.getUniformLocation(program, 'uCool'),
    strength: gl.getUniformLocation(program, 'uStrength'),
  };

  const root = document.documentElement;
  const readColor = makeColorReader();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme() {
    if (!gl) return;
    const style = getComputedStyle(root);
    const token = (name: string) => style.getPropertyValue(name).trim();
    gl.uniform3fv(u.hot, readColor(token('--color-ember-hot'), [1, 0.75, 0.4]));
    gl.uniform3fv(u.mid, readColor(token('--color-ember'), [0.95, 0.42, 0.15]));
    gl.uniform3fv(u.cool, readColor(token('--color-ember-cool'), [0.78, 0.25, 0.1]));
    gl.uniform1f(u.strength, Number.parseFloat(token('--field-strength')) || 0.5);
  }

  function resize() {
    if (!gl) return;
    const px = window.innerWidth < 768 ? 2 : 3;
    const w = Math.max(1, Math.ceil(canvas.clientWidth / px));
    const h = Math.max(1, Math.ceil(canvas.clientHeight / px));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.res, w, h);
    }
  }

  // A random start, so the fire is not the same picture on every page load.
  const t0 = performance.now() - Math.random() * 60_000;
  let raf = 0;
  let last = 0;

  function draw(now: number) {
    if (!gl) return;
    gl.uniform1f(u.time, (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (now - last < FRAME_MS) return;
    last = now;
    draw(now);
  }

  function start() {
    cancelAnimationFrame(raf);
    raf = 0;
    resize();
    if (motion.matches) draw(performance.now());
    else if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
  }

  applyTheme();
  start();
  canvas.classList.add('is-live');

  new MutationObserver(() => {
    applyTheme();
    if (motion.matches) draw(performance.now());
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  darkScheme.addEventListener('change', () => {
    applyTheme();
    if (motion.matches) draw(performance.now());
  });
  motion.addEventListener('change', start);
  document.addEventListener('visibilitychange', start);

  let pending = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      resize();
      if (motion.matches) draw(performance.now());
    });
  });

  canvas.addEventListener('webglcontextlost', () => {
    cancelAnimationFrame(raf);
    canvas.classList.remove('is-live');
  });
}
