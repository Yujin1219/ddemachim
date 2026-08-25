import { useCallback, useEffect, useRef, useState } from 'react';

export function useTransientNotice(durationMs = 1800) {
  const [notice, setNotice] = useState({ isVisible: false, noticeKey: 0 });
  const dismissTimerRef = useRef(null);

  const show = useCallback(() => {
    if (dismissTimerRef.current !== null) globalThis.clearTimeout(dismissTimerRef.current);
    setNotice((current) => ({ isVisible: true, noticeKey: current.noticeKey + 1 }));
    dismissTimerRef.current = globalThis.setTimeout(() => {
      dismissTimerRef.current = null;
      setNotice((current) => ({ ...current, isVisible: false }));
    }, durationMs);
  }, [durationMs]);

  useEffect(() => () => {
    if (dismissTimerRef.current !== null) globalThis.clearTimeout(dismissTimerRef.current);
  }, []);

  return { ...notice, show };
}
