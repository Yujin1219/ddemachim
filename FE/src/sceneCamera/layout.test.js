import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const cameraScreen = await readFile(new URL('./SceneCameraScreens.jsx', import.meta.url), 'utf8');

test('camera preview fills the workspace between safe header and controls', () => {
  assert.match(css, /\.scene-camera-workspace\s*\{[^}]*top:\s*var\(--scene-camera-header-height\)[^}]*bottom:\s*var\(--scene-camera-controls-height\)/);
  assert.match(css, /\.scene-camera-stage\s*\{[^}]*inset:\s*0[^}]*width:\s*100%[^}]*height:\s*100%/);
});

test('landscape comparison stage derives width from available height while preserving 3:4', () => {
  assert.match(css, /--scene-landscape-stage-width:\s*min\(100%,\s*calc\(72dvh \* \.75\)\)/);
  assert.match(css, /\.scene-comparison-stage\s*\{[^}]*width:\s*var\(--scene-landscape-stage-width\)/);
});

test('comparison layers derive width from their stage and primary overlay tabs have 44px hit areas', () => {
  assert.match(css, /\.scene-comparison-reference img\s*\{[^}]*width:\s*var\(--scene-comparison-stage-width\)/);
  assert.match(css, /\.scene-overlay-mode\.detail-tabs button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.scene-overlay-opacity input\[type='range'\]\s*\{[^}]*width:\s*100%/);
});

test('camera chrome matches the current mobile filming workspace contract', () => {
  assert.match(css, /\.scene-camera-screen\s*\{[^}]*--scene-camera-bg:\s*#eef2f7[^}]*--scene-camera-header-height:\s*calc\(72px \+ env\(safe-area-inset-top\)\)[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/);
  assert.match(css, /\.scene-camera-screen \.scene-camera-header\s*\{[^}]*background:\s*rgba\(246,248,251,\.94\)/);
  assert.match(css, /\.scene-camera-header h1\s*\{[^}]*font-size:\s*17px[^}]*font-weight:\s*700/);
  assert.match(css, /\.scene-camera-controls\s*\{[^}]*right:\s*0[^}]*bottom:\s*0[^}]*left:\s*0/);
  assert.match(css, /\.scene-camera-capture\s*\{[^}]*width:\s*62px[^}]*height:\s*62px[^}]*border-radius:\s*999px/);
});

test('camera preview is free of decorative guide grids and crosshairs', () => {
  assert.doesNotMatch(cameraScreen, /scene-camera-guide/);
  assert.doesNotMatch(css, /\.scene-camera-guide/);
  assert.doesNotMatch(cameraScreen, /camera-grid|camera-horizon|composition-box/);
});

test('camera keeps match score, overlay controls, and capture contracts in the workspace', () => {
  assert.match(cameraScreen, /className={`scene-match-score/);
  assert.match(cameraScreen, /<OverlayControls\s/);
  assert.match(cameraScreen, /className="scene-camera-capture"/);
});

test('camera chrome has an opaque reduced-transparency fallback and tactile button feedback', () => {
  assert.match(css, /@media\s*\(prefers-reduced-transparency:\s*reduce\)\s*\{[^}]*\.scene-camera-controls,[^}]*\.scene-result-controls,[^}]*\.scene-overlay-controls[^}]*\{[^}]*backdrop-filter:\s*none/s);
  assert.match(css, /\.scene-camera-screen button:active\s*\{[^}]*transform:\s*scale\(\.97\)/);
});

test('light overlay controls use the product focus ring', () => {
  assert.match(css, /\.scene-overlay-controls button:focus-visible,\s*\.scene-overlay-controls input:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-focus-ring\)[^}]*outline-offset:\s*3px/);
});
