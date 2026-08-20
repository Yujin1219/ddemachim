export const MATCH_ANALYSIS = Object.freeze({
  width: 240,
  height: 320,
  intervalMs: 400,
  edgeThreshold: 72,
  dilationRadius: 3,
  smoothingAlpha: 0.3,
  minimumReferencePixels: 48,
});

function drawCover(context, source, sourceWidth, sourceHeight, width, height) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }
  context.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
}

function grayscale(imageData) {
  const pixels = imageData.data;
  const gray = new Uint8Array(imageData.width * imageData.height);
  for (let source = 0, target = 0; source < pixels.length; source += 4, target += 1) {
    gray[target] = Math.round((pixels[source] * 0.299) + (pixels[source + 1] * 0.587) + (pixels[source + 2] * 0.114));
  }
  return gray;
}

function blur3x3(gray, width, height) {
  const blurred = new Uint8Array(gray.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let sum = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        const row = (y + oy) * width;
        for (let ox = -1; ox <= 1; ox += 1) sum += gray[row + x + ox];
      }
      blurred[(y * width) + x] = Math.round(sum / 9);
    }
  }
  return blurred;
}

function sobelEdges(gray, width, height, threshold) {
  const edges = new Uint8Array(gray.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const top = (y - 1) * width;
      const middle = y * width;
      const bottom = (y + 1) * width;
      const gx = -gray[top + x - 1] + gray[top + x + 1]
        - (2 * gray[middle + x - 1]) + (2 * gray[middle + x + 1])
        - gray[bottom + x - 1] + gray[bottom + x + 1];
      const gy = -gray[top + x - 1] - (2 * gray[top + x]) - gray[top + x + 1]
        + gray[bottom + x - 1] + (2 * gray[bottom + x]) + gray[bottom + x + 1];
      if (Math.abs(gx) + Math.abs(gy) >= threshold) edges[middle + x] = 1;
    }
  }
  return edges;
}

function dilate(edges, width, height, radius) {
  const result = new Uint8Array(edges.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!edges[(y * width) + x]) continue;
      const minY = Math.max(0, y - radius);
      const maxY = Math.min(height - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);
      for (let oy = minY; oy <= maxY; oy += 1) {
        for (let ox = minX; ox <= maxX; ox += 1) result[(oy * width) + ox] = 1;
      }
    }
  }
  return result;
}

function renderOutlineMask(context, image, overlay, width, height) {
  context.clearRect(0, 0, width, height);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const coverScale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * coverScale;
  const drawHeight = imageHeight * coverScale;
  context.save();
  context.translate((width / 2) + (overlay.x * width), (height / 2) + (overlay.y * height));
  context.scale(overlay.scale, overlay.scale);
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();
  const pixels = context.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let source = 3, target = 0; source < pixels.length; source += 4, target += 1) {
    if (pixels[source] > 36) mask[target] = 1;
  }
  return mask;
}

export function createMatchWorkspace(createCanvas = () => document.createElement('canvas')) {
  const cameraCanvas = createCanvas();
  const maskCanvas = createCanvas();
  cameraCanvas.width = MATCH_ANALYSIS.width;
  cameraCanvas.height = MATCH_ANALYSIS.height;
  maskCanvas.width = MATCH_ANALYSIS.width;
  maskCanvas.height = MATCH_ANALYSIS.height;
  const cameraContext = cameraCanvas.getContext('2d', { willReadFrequently: true });
  const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!cameraContext || !maskContext) throw new Error('구도 분석용 Canvas를 준비하지 못했어요.');
  return { cameraCanvas, maskCanvas, cameraContext, maskContext };
}

export function analyzeSceneMatch({ video, outlineImage, overlay, workspace }) {
  const { width, height, edgeThreshold, dilationRadius, minimumReferencePixels } = MATCH_ANALYSIS;
  const videoWidth = video?.videoWidth;
  const videoHeight = video?.videoHeight;
  if (!(videoWidth > 0 && videoHeight > 0) || !outlineImage || !overlay?.visible) return null;

  const { cameraContext, maskContext } = workspace;
  cameraContext.clearRect(0, 0, width, height);
  drawCover(cameraContext, video, videoWidth, videoHeight, width, height);
  const cameraGray = grayscale(cameraContext.getImageData(0, 0, width, height));
  const cameraEdges = sobelEdges(blur3x3(cameraGray, width, height), width, height, edgeThreshold);
  const tolerantEdges = dilate(cameraEdges, width, height, dilationRadius);
  const referenceMask = renderOutlineMask(maskContext, outlineImage, overlay, width, height);

  let referencePixels = 0;
  let matchedPixels = 0;
  for (let index = 0; index < referenceMask.length; index += 1) {
    if (!referenceMask[index]) continue;
    referencePixels += 1;
    if (tolerantEdges[index]) matchedPixels += 1;
  }
  if (referencePixels < minimumReferencePixels) return null;
  return Math.max(0, Math.min(100, (matchedPixels / referencePixels) * 100));
}

export function smoothMatchScore(previous, current, alpha = MATCH_ANALYSIS.smoothingAlpha) {
  if (!Number.isFinite(current)) return Number.isFinite(previous) ? previous : null;
  if (!Number.isFinite(previous)) return current;
  return (previous * (1 - alpha)) + (current * alpha);
}

export function matchScoreFeedback(score) {
  if (!Number.isFinite(score)) return '장면을 분석하고 있어요';
  if (score < 40) return '장면의 방향을 맞춰보세요';
  if (score < 60) return '조금 더 가까워졌어요';
  if (score < 80) return '거의 비슷한 구도예요';
  if (score < 90) return '장면과 잘 맞고 있어요';
  return '거의 같은 구도예요';
}
