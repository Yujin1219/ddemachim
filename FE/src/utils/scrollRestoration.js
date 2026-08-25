export function createDeferredScrollRestoration(savedScrollTop) {
  const target = Number.isFinite(savedScrollTop) && savedScrollTop > 0 ? savedScrollTop : 0;
  let isRestoring = true;

  return {
    restore(scroll) {
      if (!scroll || !isRestoring) return true;
      scroll.scrollTop = target;
      if (scroll.scrollTop >= target - 1) isRestoring = false;
      return !isRestoring;
    },
    capture(scrollTop) {
      if (isRestoring || !Number.isFinite(scrollTop)) return null;
      return Math.max(0, scrollTop);
    },
  };
}
