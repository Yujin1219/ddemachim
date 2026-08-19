import { OUTPUT, createSceneGeometry } from './geometry.js';

function encodePng(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG encode returned no data')), 'image/png');
    } catch (error) {
      reject(new Error('PNG encode failed', { cause: error }));
    }
  });
}

function intrinsicSize(source) {
  return {
    width: source.videoWidth || source.naturalWidth || source.width,
    height: source.videoHeight || source.naturalHeight || source.height,
  };
}

function drawCover(context, source) {
  const size = intrinsicSize(source);
  const plan = createSceneGeometry({ sourceWidth: size.width, sourceHeight: size.height, stageWidth: OUTPUT.width, stageHeight: OUTPUT.height });
  context.drawImage(source, plan.base.dx, plan.base.dy, plan.base.dw, plan.base.dh);
  return plan;
}

function normalizeRotation(value) {
  const rotation = Number(value ?? 0);
  if (![0, 90, 180, 270].includes(rotation)) throw new TypeError('Trusted rotation must be 0, 90, 180, or 270 degrees');
  return rotation;
}

function drawOrientedCover(context, source, rotationValue) {
  const rotation = normalizeRotation(rotationValue);
  if (rotation === 0) return drawCover(context, source);
  const size = intrinsicSize(source);
  const quarterTurn = rotation === 90 || rotation === 270;
  const orientedWidth = quarterTurn ? size.height : size.width;
  const orientedHeight = quarterTurn ? size.width : size.height;
  const scale = Math.max(OUTPUT.width / orientedWidth, OUTPUT.height / orientedHeight);
  const dw = size.width * scale;
  const dh = size.height * scale;
  context.save();
  context.translate(OUTPUT.width / 2, OUTPUT.height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(source, -dw / 2, -dh / 2, dw, dh);
  context.restore();
  return { rotation, base: { dx: -dw / 2, dy: -dh / 2, dw, dh } };
}

function outputCanvas(createCanvas) {
  const canvas = createCanvas();
  canvas.width = OUTPUT.width;
  canvas.height = OUTPUT.height;
  return canvas;
}

export async function captureVideoFrame(video, { createCanvas = () => document.createElement('canvas'), rotation = 0 } = {}) {
  const canvas = outputCanvas(createCanvas);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas capture is unavailable');
  drawOrientedCover(context, video, rotation);
  return { blob: await encodePng(canvas), width: OUTPUT.width, height: OUTPUT.height };
}

export async function exportScenePng({ mode = 'split', reference, capture, overlay }, { createCanvas = () => document.createElement('canvas') } = {}) {
  const canvas = outputCanvas(createCanvas);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas export is unavailable');

  if (mode === 'overlay') {
    drawCover(context, capture);
    if (overlay?.visible !== false) {
      const size = intrinsicSize(reference);
      const plan = createSceneGeometry({ sourceWidth: size.width, sourceHeight: size.height, stageWidth: OUTPUT.width, stageHeight: OUTPUT.height, overlay });
      context.save();
      context.globalAlpha = plan.overlay.opacity;
      context.translate(OUTPUT.width / 2 + plan.overlay.translateX, OUTPUT.height / 2 + plan.overlay.translateY);
      context.scale(plan.overlay.scale, plan.overlay.scale);
      context.drawImage(reference, plan.base.dx - OUTPUT.width / 2, plan.base.dy - OUTPUT.height / 2, plan.base.dw, plan.base.dh);
      context.restore();
    }
  } else {
    context.save();
    context.beginPath();
    context.rect(0, 0, OUTPUT.width / 2, OUTPUT.height);
    context.clip();
    drawCover(context, reference);
    context.restore();
    context.save();
    context.beginPath();
    context.rect(OUTPUT.width / 2, 0, OUTPUT.width / 2, OUTPUT.height);
    context.clip();
    drawCover(context, capture);
    context.restore();
  }
  return { blob: await encodePng(canvas), width: OUTPUT.width, height: OUTPUT.height };
}
