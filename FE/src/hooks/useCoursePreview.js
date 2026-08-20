import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchCoursePreview } from '../api/client.js';
import {
  coursePreviewErrorMessage,
  normalizeCoursePreview,
  normalizeCoursePreviewFailure,
  validateCoursePreviewRequest,
} from '../components/coursePreviewModel.js';

const INITIAL_STATE = { preview: null, failure: null, status: 'idle', message: null };

export function useCoursePreview({ loadPreview = fetchCoursePreview, onAuthRequired } = {}) {
  const [state, setState] = useState(INITIAL_STATE);
  const mountedRef = useRef(true);
  const controllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(null);
  const lastPayloadRef = useRef(null);
  const loadPreviewRef = useRef(loadPreview);
  const onAuthRequiredRef = useRef(onAuthRequired);
  loadPreviewRef.current = loadPreview;
  onAuthRequiredRef.current = onAuthRequired;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      inFlightRef.current = null;
    };
  }, []);

  const submit = useCallback((payload) => {
    if (inFlightRef.current) return inFlightRef.current;
    const validationMessage = validateCoursePreviewRequest(payload);
    if (validationMessage) {
      setState({ preview: null, failure: null, status: 'validation', message: validationMessage });
      return Promise.resolve(null);
    }

    lastPayloadRef.current = payload;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ preview: null, failure: null, status: 'loading', message: null });

    const requestPromise = Promise.resolve()
      .then(() => loadPreviewRef.current(payload, { signal: controller.signal }))
      .then((response) => {
        if (!mountedRef.current || requestIdRef.current !== requestId || controller.signal.aborted) return null;
        const preview = normalizeCoursePreview(response);
        if (!preview) {
          const error = new Error('코스 미리보기 응답이 비어 있어요.');
          error.code = 'COURSE_PREVIEW_MALFORMED';
          throw error;
        }
        setState({ preview, failure: null, status: 'success', message: null });
        return preview;
      })
      .catch((error) => {
        if (!mountedRef.current || requestIdRef.current !== requestId || controller.signal.aborted || error?.name === 'AbortError') return null;
        if (error?.status === 401) onAuthRequiredRef.current?.();
        const failure = error?.status === 422 && error?.code === 'COURSE4222'
          ? normalizeCoursePreviewFailure(error.result, payload)
          : null;
        setState({ preview: null, failure, status: 'error', message: coursePreviewErrorMessage(error) });
        return null;
      });

    const finalPromise = requestPromise.finally(() => {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (inFlightRef.current === finalPromise) inFlightRef.current = null;
    });
    inFlightRef.current = finalPromise;
    return finalPromise;
  }, []);

  const retry = useCallback(() => (
    lastPayloadRef.current ? submit(lastPayloadRef.current) : Promise.resolve(null)
  ), [submit]);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    inFlightRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  return { ...state, submit, retry, reset };
}
