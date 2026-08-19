import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const cameraScreen = await readFile(new URL('./SceneCameraScreens.jsx', import.meta.url), 'utf8');

test('camera preview remains a centered 3:4 layer while filling the viewport', () => {
  assert.match(css, /\.scene-camera-stage\s*\{[^}]*width:\s*max\(100%,\s*calc\(100dvh \* \.75\)\)[^}]*aspect-ratio:\s*3\s*\/\s*4[^}]*top:\s*50%[^}]*left:\s*50%/);
  assert.match(css, /\.scene-camera-stage\s*\{[^}]*transform:\s*translate\(-50%,\s*-50%\)/);
});

test('landscape comparison stage derives width from available height while preserving 3:4', () => {
  assert.match(css, /--scene-landscape-stage-width:\s*min\(100%,\s*calc\(72dvh \* \.75\)\)/);
  assert.match(css, /\.scene-comparison-stage\s*\{[^}]*width:\s*var\(--scene-landscape-stage-width\)/);
});

test('comparison layers derive width from their stage and overlay range labels have 44px hit areas', () => {
  assert.match(css, /\.scene-comparison-reference img\s*\{[^}]*width:\s*var\(--scene-comparison-stage-width\)/);
  assert.match(css, /\.scene-overlay-controls label\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.scene-overlay-controls input\[type='range'\]\s*\{[^}]*min-height:\s*44px/);
});

test('camera chrome matches the 390x844 filming overlay contract', () => {
  assert.match(css, /\.scene-camera-screen\s*\{[^}]*--scene-camera-bg:\s*#0f141f[^}]*--scene-camera-header-height:\s*calc\(92px \+ env\(safe-area-inset-top\)\)[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/);
  assert.match(css, /\.scene-camera-screen \.scene-camera-header\s*\{[^}]*background:\s*rgba\(0,0,0,\.45\)/);
  assert.match(css, /\.scene-camera-header h1\s*\{[^}]*font-size:\s*17px[^}]*font-weight:\s*700/);
  assert.match(css, /\.scene-camera-reference-card\s*\{[^}]*right:\s*20px[^}]*bottom:\s*calc\(112px \+ env\(safe-area-inset-bottom\)\)[^}]*left:\s*20px[^}]*height:\s*106px[^}]*padding:\s*12px[^}]*border-radius:\s*18px[^}]*background:\s*rgba\(10,15,26,\.84\)/);
  assert.match(css, /\.scene-camera-reference-card img\s*\{[^}]*width:\s*116px[^}]*height:\s*82px[^}]*border-radius:\s*12px/);
  assert.match(css, /\.scene-camera-capture\s*\{[^}]*width:\s*68px[^}]*height:\s*68px[^}]*border-radius:\s*999px/);
});

test('camera preview is free of decorative guide grids and crosshairs', () => {
  assert.doesNotMatch(cameraScreen, /scene-camera-guide/);
  assert.doesNotMatch(css, /\.scene-camera-guide/);
  assert.doesNotMatch(cameraScreen, /camera-grid|camera-horizon|composition-box/);
});

test('camera keeps help, reference, lens label, and capture contracts in the overlay chrome', () => {
  assert.match(cameraScreen, /aria-label="촬영 도움말 및 참고 장면 조절"/);
  assert.match(cameraScreen, /className="scene-camera-reference-card"/);
  assert.match(cameraScreen, /className="scene-camera-lens"[^>]*>1× 렌즈</);
  assert.match(cameraScreen, /<OverlayControls\s/);
});

test('camera chrome has an opaque reduced-transparency fallback and tactile button feedback', () => {
  assert.match(css, /@media\s*\(prefers-reduced-transparency:\s*reduce\)\s*\{[^}]*\.scene-camera-reference-card,[^}]*\.scene-camera-help-panel,[^}]*\.scene-overlay-controls\s*\{[^}]*backdrop-filter:\s*none/s);
  assert.match(css, /\.scene-camera-screen button:active\s*\{[^}]*transform:\s*scale\(\.97\)/);
});

test('dark overlay controls override the light-surface focus ring with a white outline', () => {
  assert.match(css, /\.scene-overlay-controls button:focus-visible,\s*\.scene-overlay-controls input:focus-visible\s*\{[^}]*outline:\s*3px solid #fff[^}]*outline-offset:\s*3px/);
});
