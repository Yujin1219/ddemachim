import { useEffect, useRef, useState } from 'react';

import { analyzeSceneMatch, createMatchWorkspace, MATCH_ANALYSIS, smoothMatchScore } from './matchScore.js';

export function useSceneMatchScore({ videoRef, outlineUrl, overlay, enabled }) {
  const [result, setResult] = useState({ score: null, status: enabled ? 'loading' : 'idle' });
  const overlayRef = useRef(overlay);
  const smoothedRef = useRef(null);
  overlayRef.current = overlay;

  useEffect(() => {
    smoothedRef.current = null;
    if (!enabled || !outlineUrl || typeof Image === 'undefined' || typeof document === 'undefined') {
      setResult({ score: null, status: enabled ? 'unavailable' : 'idle' });
      return undefined;
    }

    let disposed = false;
    let timer = null;
    let workspace = null;
    const outlineImage = new Image();
    setResult({ score: null, status: 'loading' });

    const stop = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };

    const analyze = () => {
      if (disposed || document.hidden) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      try {
        workspace ||= createMatchWorkspace();
        const rawScore = analyzeSceneMatch({ video, outlineImage, overlay: overlayRef.current, workspace });
        if (!Number.isFinite(rawScore)) return;
        const score = smoothMatchScore(smoothedRef.current, rawScore);
        smoothedRef.current = score;
        setResult({ score: Math.round(score), status: 'analyzing' });
      } catch {
        stop();
        if (!disposed) setResult({ score: null, status: 'unavailable' });
      }
    };

    outlineImage.onload = () => {
      if (disposed) return;
      analyze();
      timer = window.setInterval(analyze, MATCH_ANALYSIS.intervalMs);
    };
    outlineImage.onerror = () => {
      if (!disposed) setResult({ score: null, status: 'unavailable' });
    };
    outlineImage.src = outlineUrl;

    return () => {
      disposed = true;
      stop();
      outlineImage.onload = null;
      outlineImage.onerror = null;
      workspace = null;
    };
  }, [enabled, outlineUrl, videoRef]);

  return result;
}
