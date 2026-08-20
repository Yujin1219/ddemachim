import React, { useEffect, useRef, useState } from 'react';

const APPROACH_DISTANCE_METERS = 80;
const CLOSE_DISTANCE_METERS = 30;
const NOW_DISTANCE_METERS = 12;
const REACHED_DISTANCE_METERS = 15;
const PASSED_DISTANCE_METERS = 24;
const ARRIVAL_DISTANCE_METERS = 30;

function coordinateOf(step) {
  const latitude = Number(step?.latitude);
  const longitude = Number(step?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function distanceMeters(from, to) {
  const radians = (value) => value * Math.PI / 180;
  const earthRadius = 6_371_000;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function collectCourseNavigationSteps(preview) {
  const seen = new Set();
  return (preview?.stops || []).flatMap((stop) => {
    const route = stop?.selectedRoute || stop?.incomingRoute;
    return (route?.legs || []).flatMap((leg) => leg?.mode === 'WALK' ? leg.steps || [] : []);
  }).filter((step) => {
    const coordinate = coordinateOf(step);
    const key = coordinate ? `${coordinate.latitude}:${coordinate.longitude}:${step?.description || ''}` : null;
    if (!coordinate || !step?.description || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function guidanceCopy(step, distance) {
  const description = step?.description || '다음 안내를 확인하세요';
  if (!Number.isFinite(distance)) return description;
  if (distance <= NOW_DISTANCE_METERS) return `지금 ${description}`;
  if (distance <= CLOSE_DISTANCE_METERS) return `곧 ${description}`;
  if (distance <= APPROACH_DISTANCE_METERS) return `${Math.max(10, Math.round(distance / 10) * 10)}m 앞에서 ${description}`;
  return description;
}

export default function CourseNavigationGuidance({ preview, destination, onArrival }) {
  const steps = collectCourseNavigationSteps(preview);
  const stepKey = steps.map((step) => `${step.latitude}:${step.longitude}:${step.description}`).join('|');
  const destinationCoordinate = coordinateOf(destination);
  const destinationKey = destinationCoordinate ? `${destinationCoordinate.latitude}:${destinationCoordinate.longitude}` : '';
  const currentIndexRef = useRef(0);
  const reachedCurrentRef = useRef(false);
  const destinationReachedRef = useRef(false);
  const onArrivalRef = useRef(onArrival);
  const [guidance, setGuidance] = useState({ status: 'idle', distance: null, index: 0 });

  useEffect(() => {
    onArrivalRef.current = onArrival;
  }, [onArrival]);

  useEffect(() => {
    currentIndexRef.current = 0;
    reachedCurrentRef.current = false;
    destinationReachedRef.current = false;
    if (steps.length === 0) {
      setGuidance({ status: 'unavailable', distance: null, index: 0 });
      return undefined;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGuidance({ status: 'unsupported', distance: null, index: 0 });
      return undefined;
    }

    setGuidance({ status: 'requesting', distance: null, index: 0 });
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const current = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        if (destinationCoordinate && !destinationReachedRef.current
          && distanceMeters(current, destinationCoordinate) <= ARRIVAL_DISTANCE_METERS) {
          destinationReachedRef.current = true;
          onArrivalRef.current?.(destination);
        }
        let index = currentIndexRef.current;
        const step = steps[index];
        if (!step) {
          setGuidance({ status: 'complete', distance: 0, index });
          return;
        }
        const distance = distanceMeters(current, coordinateOf(step));
        if (distance <= REACHED_DISTANCE_METERS) reachedCurrentRef.current = true;
        if (reachedCurrentRef.current && distance >= PASSED_DISTANCE_METERS) {
          index += 1;
          currentIndexRef.current = index;
          reachedCurrentRef.current = false;
          const nextStep = steps[index];
          if (!nextStep) {
            setGuidance({ status: 'complete', distance: 0, index });
            return;
          }
          setGuidance({ status: 'active', distance: distanceMeters(current, coordinateOf(nextStep)), index });
          return;
        }
        setGuidance({ status: 'active', distance, index });
      },
      (error) => {
        setGuidance({ status: error?.code === 1 ? 'denied' : 'unavailable', distance: null, index: currentIndexRef.current });
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [stepKey, destinationKey]);

  if (guidance.status === 'unavailable' || guidance.status === 'unsupported') return null;
  if (guidance.status === 'denied') {
    return React.createElement('aside', { className: 'course-navigation-guidance is-muted', role: 'status' },
      React.createElement('span', null, '길 안내'),
      React.createElement('strong', null, '위치 권한을 허용하면 다음 안내를 보여드려요.'),
    );
  }
  if (guidance.status === 'requesting') {
    return React.createElement('aside', { className: 'course-navigation-guidance is-muted', role: 'status' },
      React.createElement('span', null, '길 안내'),
      React.createElement('strong', null, '현재 위치를 확인하고 있어요.'),
    );
  }
  if (guidance.status === 'complete') {
    return React.createElement('aside', { className: 'course-navigation-guidance', role: 'status' },
      React.createElement('span', null, '길 안내'),
      React.createElement('strong', null, '이동 구간에 도착했어요.'),
    );
  }

  const step = steps[guidance.index];
  return React.createElement('aside', { className: 'course-navigation-guidance', role: 'status', 'aria-live': 'polite' },
    React.createElement('span', null, `다음 안내 · ${guidance.index + 1} / ${steps.length}`),
    React.createElement('strong', { className: 'course-navigation-guidance-copy', key: `step-${guidance.index}` }, guidanceCopy(step, guidance.distance)),
    step?.streetName && React.createElement('small', null, step.streetName),
  );
}
