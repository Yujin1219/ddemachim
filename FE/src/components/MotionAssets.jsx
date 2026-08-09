const base = '/assets/motion';

export function BrandLoading({ compact = false }) {
  return (
    <div className={`motion-loading ${compact ? 'is-compact' : ''}`} aria-label="데이터를 불러오는 중" role="status">
      <img className="motion-loading-orbit" src={`${base}/loading-orbit.svg`} alt="" />
      <img className="motion-loading-logo" src={`${base}/loading-logo.svg`} alt="" />
    </div>
  );
}

export function MapPlacePulse() {
  return (
    <div className="motion-map-pulse" aria-hidden="true">
      <img className="motion-pulse-ring" src={`${base}/map-pulse-ring.svg`} alt="" />
      <img className="motion-place-marker" src={`${base}/map-place-marker.svg`} alt="" />
    </div>
  );
}

export function RouteMotion() {
  return (
    <div className="motion-route" aria-hidden="true">
      <img className="motion-route-track" src={`${base}/route-track.svg`} alt="" />
      <img className="motion-route-line" src={`${base}/route-line.svg`} alt="" />
      <img className="motion-route-dot" src={`${base}/route-dot.svg`} alt="" />
    </div>
  );
}

export function ArrivalMotion() {
  return (
    <div className="motion-arrival" aria-hidden="true">
      <img className="motion-arrival-ring" src={`${base}/arrival-ring.svg`} alt="" />
      <img className="motion-arrival-check" src={`${base}/arrival-check.svg`} alt="" />
    </div>
  );
}

export function CrowdMotion() {
  return (
    <div className="motion-crowd" aria-hidden="true">
      <img className="motion-crowd-ring ring-one" src={`${base}/crowd-ring-1.svg`} alt="" />
      <img className="motion-crowd-ring ring-two" src={`${base}/crowd-ring-2.svg`} alt="" />
      <img className="motion-crowd-ring ring-three" src={`${base}/crowd-ring-3.svg`} alt="" />
      <img className="motion-crowd-center" src={`${base}/crowd-center.svg`} alt="" />
    </div>
  );
}

export function NearbyMotion() {
  return (
    <div className="motion-nearby" aria-hidden="true">
      <img className="motion-nearby-pin" src={`${base}/nearby-pin.svg`} alt="" />
      <img className="motion-nearby-spark spark-one" src={`${base}/nearby-spark-one.svg`} alt="" />
      <img className="motion-nearby-spark spark-two" src={`${base}/nearby-spark-two.svg`} alt="" />
    </div>
  );
}

export function CameraGuide() {
  return <img className="motion-camera-guide" src={`${base}/camera-guide.svg`} alt="촬영 구도 안내" />;
}
