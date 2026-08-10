import { useEffect, useRef, useState } from 'react'
import Map from 'ol/Map.js'
import Overlay from 'ol/Overlay.js'
import View from 'ol/View.js'
import TileLayer from 'ol/layer/Tile.js'
import XYZ from 'ol/source/XYZ.js'
import { fromLonLat } from 'ol/proj.js'
import 'ol/ol.css'
import '../vworld-map.css'

const DEFAULT_CENTER = [126.978, 37.5665]

function normalizeCenter(center) {
  if (!Array.isArray(center) || center.length < 2) return DEFAULT_CENTER

  const longitude = Number(center[0])
  const latitude = Number(center[1])
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : DEFAULT_CENTER
}

export default function VWorldMap({
  center = DEFAULT_CENTER,
  zoom = 15,
  interactive = true,
  className = '',
  style,
  ariaLabel = 'Map',
  userLocation = null,
}) {
  const targetRef = useRef(null)
  const mapRef = useRef(null)
  const locationOverlayRef = useRef(null)
  const [liveUserLocation, setLiveUserLocation] = useState(userLocation)
  const [tileError, setTileError] = useState(false)
  const apiKey = import.meta.env.VITE_VWORLD_API_KEY?.trim()
  const [longitude, latitude] = normalizeCenter(center)
  const safeZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 15

  useEffect(() => {
    const handleLocation = (event) => {
      const location = event.detail || null
      setLiveUserLocation(location)
      if (location && mapRef.current) {
        const view = mapRef.current.getView()
        view.setCenter(fromLonLat(normalizeCenter(location)))
        view.setZoom(17)
      }
    }
    window.addEventListener('vworld:user-location', handleLocation)
    return () => window.removeEventListener('vworld:user-location', handleLocation)
  }, [])

  useEffect(() => {
    if (userLocation) setLiveUserLocation(userLocation)
  }, [userLocation?.[0], userLocation?.[1]])

  useEffect(() => {
    if (!apiKey || !targetRef.current) return undefined

    setTileError(false)
    const source = new XYZ({
      url: `https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(apiKey)}/Base/{z}/{y}/{x}.png`,
      crossOrigin: 'anonymous',
      maxZoom: 19,
    })
    const handleTileError = () => setTileError(true)
    const handleTileSuccess = () => setTileError(false)
    source.on('tileloaderror', handleTileError)
    source.on('tileloadend', handleTileSuccess)

    const map = new Map({
      target: targetRef.current,
      layers: [new TileLayer({ source })],
      view: new View({
        center: fromLonLat([longitude, latitude]),
        zoom: safeZoom,
      }),
      controls: [],
      interactions: interactive ? undefined : [],
    })
    mapRef.current = map

    return () => {
      source.un('tileloaderror', handleTileError)
      source.un('tileloadend', handleTileSuccess)
      map.setTarget(undefined)
      mapRef.current = null
    }
  }, [apiKey, interactive])

  useEffect(() => {
    const view = mapRef.current?.getView()
    if (!view) return

    view.setCenter(fromLonLat([longitude, latitude]))
    view.setZoom(safeZoom)
  }, [longitude, latitude, safeZoom])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined

    if (locationOverlayRef.current) {
      map.removeOverlay(locationOverlayRef.current)
      locationOverlayRef.current = null
    }

    if (!Array.isArray(liveUserLocation) || liveUserLocation.length < 2) return undefined
    const location = normalizeCenter(liveUserLocation)
    const marker = document.createElement('div')
    marker.className = 'vworld-user-location-marker'
    marker.setAttribute('aria-label', '현재 위치')
    marker.innerHTML = '<span class="vworld-user-location-target"><i></i></span>'

    const overlay = new Overlay({
      element: marker,
      position: fromLonLat(location),
      positioning: 'center-center',
      stopEvent: false,
    })
    map.addOverlay(overlay)
    locationOverlayRef.current = overlay

    return () => {
      map.removeOverlay(overlay)
      if (locationOverlayRef.current === overlay) locationOverlayRef.current = null
    }
  }, [liveUserLocation?.[0], liveUserLocation?.[1]])

  const statusMessage = !apiKey
    ? 'VWorld API key is not configured.'
    : tileError
      ? 'The map could not be loaded.'
      : ''

  return (
    <div
      className={`vworld-map${className ? ` ${className}` : ''}`}
      style={style}
      role="region"
      aria-label={ariaLabel}
    >
      <div ref={targetRef} className="vworld-map__canvas" />
      {statusMessage && (
        <div className="vworld-map__fallback" role="status">
          <span>{statusMessage}</span>
        </div>
      )}
    </div>
  )
}
