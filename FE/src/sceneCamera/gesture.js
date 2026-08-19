function distance([first, second]) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function createOverlayGesture({ getOverlay, getBounds, onPatch }) {
  const pointers = new Map();
  let baseline = null;

  function setBaseline() {
    const points = [...pointers.values()];
    if (points.length >= 2) baseline = { kind: 'pinch', distance: Math.max(distance(points), 1), scale: getOverlay().scale };
    else if (points.length === 1) baseline = { kind: 'drag', point: points[0], overlay: getOverlay() };
    else baseline = null;
  }

  return {
    pointerDown(event) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      setBaseline();
    },
    pointerMove(event) {
      if (!pointers.has(event.pointerId)) return null;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = [...pointers.values()];
      const bounds = getBounds();
      if (!bounds || !baseline) return null;
      let patch;
      if (points.length >= 2) {
        if (baseline.kind !== 'pinch') setBaseline();
        patch = { scale: baseline.scale * distance(points) / baseline.distance };
      } else {
        if (baseline.kind !== 'drag') setBaseline();
        patch = {
          x: baseline.overlay.x + (points[0].x - baseline.point.x) / bounds.width,
          y: baseline.overlay.y + (points[0].y - baseline.point.y) / bounds.height,
        };
      }
      onPatch(patch);
      return patch;
    },
    pointerUp(event) {
      pointers.delete(event.pointerId);
      setBaseline();
    },
  };
}
