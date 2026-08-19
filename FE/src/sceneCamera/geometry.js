export const OUTPUT = Object.freeze({ width: 1080, height: 1440 });

function positive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export function createSceneGeometry({ sourceWidth, sourceHeight, stageWidth, stageHeight, overlay }) {
  if (![sourceWidth, sourceHeight, stageWidth, stageHeight].every(positive)) throw new TypeError('Valid positive dimensions are required');
  const scale = Math.max(stageWidth / sourceWidth, stageHeight / sourceHeight);
  const dw = sourceWidth * scale;
  const dh = sourceHeight * scale;
  return {
    stage: { width: stageWidth, height: stageHeight },
    base: { dx: (stageWidth - dw) / 2, dy: (stageHeight - dh) / 2, dw, dh },
    overlay: overlay ? {
      translateX: overlay.x * stageWidth,
      translateY: overlay.y * stageHeight,
      scale: overlay.scale,
      opacity: overlay.opacity,
      visible: overlay.visible,
    } : null,
  };
}

export function geometryToCssVars(plan) {
  if (!plan.overlay) return {};
  return {
    '--scene-overlay-x': `${plan.overlay.translateX / plan.stage.width * 100}%`,
    '--scene-overlay-y': `${plan.overlay.translateY / plan.stage.height * 100}%`,
    '--scene-overlay-scale': plan.overlay.scale,
    '--scene-overlay-opacity': plan.overlay.opacity,
  };
}
