import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchRouteComparison } from '../api/client.js';
import { distanceBetweenMeters, normalizeRouteCoordinate } from '../utils/routeComparison.js';

export function useRouteComparison({ origin, destination } = {}) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [retryToken, setRetryToken] = useState(0);
  const controllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const originCoordinate = normalizeRouteCoordinate(origin);
  const destinationCoordinate = normalizeRouteCoordinate(destination);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  const retry = useCallback(() => setRetryToken((value) => value + 1), []);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    controllerRef.current?.abort();
    controllerRef.current = null;

    const coordinatesAreValid = originCoordinate && destinationCoordinate;
    const destinationIsCurrent = coordinatesAreValid
      && distanceBetweenMeters(originCoordinate, destinationCoordinate) < 30;
    if (!coordinatesAreValid || destinationIsCurrent) {
      setData(null);
      setStatus('idle');
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setData(null);
    setStatus('loading');
    setError(null);

    fetchRouteComparison({
      origin: originCoordinate,
      destination: destinationCoordinate,
      signal: controller.signal,
    })
      .then((nextData) => {
        if (!mountedRef.current || requestIdRef.current !== requestId || controller.signal.aborted) return;
        setData(nextData);
        setStatus('ready');
      })
      .catch((nextError) => {
        if (
          !mountedRef.current
          || requestIdRef.current !== requestId
          || controller.signal.aborted
          || nextError?.name === 'AbortError'
        ) return;
        setData(null);
        setStatus('error');
        setError(nextError);
      })
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });

    return () => {
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [
    destinationCoordinate?.latitude,
    destinationCoordinate?.longitude,
    originCoordinate?.latitude,
    originCoordinate?.longitude,
    retryToken,
  ]);

  return {
    data,
    status,
    error,
    retry,
  };
}
