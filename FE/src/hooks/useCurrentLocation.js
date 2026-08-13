import { useCallback, useEffect, useRef, useState } from 'react';

import { requestRoutePosition } from '../utils/routeComparison.js';

export function useCurrentLocation({ auto = false } = {}) {
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorCode, setErrorCode] = useState(null);
  const activePromiseRef = useRef(null);
  const activeControllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
      activePromiseRef.current = null;
    };
  }, []);

  const locate = useCallback(() => {
    if (!mountedRef.current) return Promise.resolve(null);
    if (activePromiseRef.current) return activePromiseRef.current;

    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeControllerRef.current = controller;
    setStatus('locating');
    setErrorCode(null);

    const promise = requestRoutePosition({ signal: controller.signal })
      .then((nextLocation) => {
        if (mountedRef.current && requestIdRef.current === requestId) {
          setLocation(nextLocation);
          setStatus('ready');
          setErrorCode(null);
        }
        return nextLocation;
      })
      .catch((error) => {
        if (
          mountedRef.current
          && requestIdRef.current === requestId
          && error?.name !== 'AbortError'
          && !controller.signal.aborted
        ) {
          setLocation(null);
          setStatus('error');
          setErrorCode(error?.code || 'UNAVAILABLE');
        }
        return null;
      })
      .finally(() => {
        if (activePromiseRef.current === promise) {
          activePromiseRef.current = null;
          activeControllerRef.current = null;
        }
      });

    activePromiseRef.current = promise;
    return promise;
  }, []);

  const clear = useCallback(() => {
    requestIdRef.current += 1;
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    activePromiseRef.current = null;
    if (!mountedRef.current) return;
    setLocation(null);
    setStatus('idle');
    setErrorCode(null);
  }, []);

  useEffect(() => {
    if (!auto) {
      autoStartedRef.current = false;
      return undefined;
    }
    if (autoStartedRef.current) return undefined;
    autoStartedRef.current = true;
    locate();
    return () => {
      autoStartedRef.current = false;
    };
  }, [auto, locate]);

  return {
    location,
    status,
    errorCode,
    locate,
    clear,
  };
}
