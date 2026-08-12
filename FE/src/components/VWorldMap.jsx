import { useEffect, useRef, useState } from 'react'
import Map from 'ol/Map.js'
import Overlay from 'ol/Overlay.js'
import View from 'ol/View.js'
import TileLayer from 'ol/layer/Tile.js'
import XYZ from 'ol/source/XYZ.js'
import { boundingExtent } from 'ol/extent.js'
import { fromLonLat, transformExtent } from 'ol/proj.js'
import 'ol/ol.css'
import '../vworld-map.css'

const DEFAULT_CENTER = [126.978, 37.5665]
const CLUSTER_ZOOM_MAX = 14.5
const CLUSTER_PIXEL_RADIUS = 44

function normalizeCenter(center) {
  if (!Array.isArray(center) || center.length < 2) return DEFAULT_CENTER

  const longitude = Number(center[0])
  const latitude = Number(center[1])
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : DEFAULT_CENTER
}

function hasPlaceTag(place, tagCode) {
  const normalize = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : '')
  const tags = Array.isArray(place.tags)
    ? place.tags.map((tag) => normalize(typeof tag === 'string' ? tag : tag?.code))
    : [normalize(place.tags)]
  return tags.includes(normalize(tagCode))
}

function placeMarkerTone(place) {
  if (hasPlaceTag(place, 'FILMING_LOCATION')) return 'filming'

  const categoryCode = typeof place.categoryCode === 'string' ? place.categoryCode.trim().toUpperCase() : ''
  if (categoryCode === 'RESTAURANT') return 'restaurant'
  if (categoryCode === 'CAFE' || categoryCode === 'DESSERT') return 'cafe-dessert'
  if (categoryCode === 'ATTRACTION') return 'attraction'
  if (categoryCode === 'CULTURE') return 'culture'
  if (categoryCode === 'EXHIBITION') return 'exhibition'
  if (categoryCode === 'SHOPPING') return 'shopping'
  if (categoryCode === 'POPUP') return 'popup'
  if (categoryCode === 'PARK') return 'park'
  if (categoryCode === 'WALK') return 'walk'
  if (categoryCode === 'PHOTO_SPOT') return 'photo-spot'
  return 'default'
}

function markerSizeClass(map) {
  const zoomLevel = map.getView().getZoom() ?? 15
  if (zoomLevel >= 17) return 'is-zoom-near'
  if (zoomLevel >= 15) return 'is-zoom-mid'
  return 'is-zoom-far'
}

export default function VWorldMap({
  center = DEFAULT_CENTER,
  zoom = 15,
  interactive = true,
  className = '',
  style,
  ariaLabel = 'Map',
  userLocation = null,
  loadPlacesInBounds = null,
  placeMarkerFilter = null,
  placeMarkerFilterKey = '',
  placeMarkerLabel = null,
  clusterPlaces = true,
  fitPlaceMarkers = false,
  placeRequestKey = '',
  placeLimit = 300,
  onPlaceClick = null,
  onPlacesChange = null,
}) {
  const targetRef = useRef(null)
  const mapRef = useRef(null)
  const locationOverlayRef = useRef(null)
  const placeOverlaysRef = useRef([])
  const rawPlacesRef = useRef([])
  const placeAbortRef = useRef(null)
  const fittedPlaceKeyRef = useRef('')
  const loadVisiblePlacesRef = useRef(null)
  const lastPlaceRequestKeyRef = useRef(placeRequestKey)
  const loadPlacesRef = useRef(loadPlacesInBounds)
  const placeMarkerFilterRef = useRef(placeMarkerFilter)
  const placeMarkerLabelRef = useRef(placeMarkerLabel)
  const onPlaceClickRef = useRef(onPlaceClick)
  const onPlacesChangeRef = useRef(onPlacesChange)
  const [liveUserLocation, setLiveUserLocation] = useState(userLocation)
  const [tileError, setTileError] = useState(false)
  const apiKey = import.meta.env.VITE_VWORLD_API_KEY?.trim()
  const [longitude, latitude] = normalizeCenter(center)
  const safeZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 15

  useEffect(() => {
    loadPlacesRef.current = loadPlacesInBounds
    placeMarkerFilterRef.current = placeMarkerFilter
    placeMarkerLabelRef.current = placeMarkerLabel
    onPlaceClickRef.current = onPlaceClick
    onPlacesChangeRef.current = onPlacesChange
  }, [loadPlacesInBounds, placeMarkerFilter, placeMarkerLabel, onPlaceClick, onPlacesChange])

  function clearPlaceOverlays(map) {
    placeOverlaysRef.current.forEach((overlay) => map.removeOverlay(overlay))
    placeOverlaysRef.current = []
  }

  function getPlaceCoordinate(place) {
    const longitude = Number(place.longitude)
    const latitude = Number(place.latitude)
    return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null
  }

  function addPlaceOverlay(map, place) {
    const coordinate = getPlaceCoordinate(place)
    if (!coordinate) return

    const marker = document.createElement('button')
    marker.className = `vworld-place-marker is-${placeMarkerTone(place)} ${markerSizeClass(map)}`
    marker.type = 'button'
    const markerLabel = placeMarkerLabelRef.current?.(place)
    const hasMarkerLabel = markerLabel !== undefined && markerLabel !== null && markerLabel !== ''
    if (hasMarkerLabel) {
      marker.classList.add('is-numbered')
      const markerNumber = Number(markerLabel)
      if (Number.isFinite(markerNumber) && markerNumber > 0) {
        const markerIndex = markerNumber - 1
        const radius = 18 + Math.floor(markerIndex / 4) * 10
        const angle = (markerIndex % 4) * (Math.PI / 2) - (Math.PI / 2)
        marker.style.setProperty('--marker-offset-x', `${Math.round(Math.cos(angle) * radius)}px`)
        marker.style.setProperty('--marker-offset-y', `${Math.round(Math.sin(angle) * radius)}px`)
      }
    }
    marker.setAttribute('aria-label', hasMarkerLabel ? `${markerLabel}번 ${place.name} 장소 보기` : `${place.name} 장소 보기`)
    marker.title = place.name
    const markerContent = document.createElement('span')
    markerContent.textContent = hasMarkerLabel ? String(markerLabel) : ''
    marker.appendChild(markerContent)
    marker.addEventListener('click', () => onPlaceClickRef.current?.(place))

    const overlay = new Overlay({
      element: marker,
      position: fromLonLat(coordinate),
      positioning: 'center-center',
      stopEvent: true,
    })
    map.addOverlay(overlay)
    placeOverlaysRef.current.push(overlay)
  }

  function buildClusters(map, places) {
    const clusters = []
    places.forEach((place) => {
      const coordinate = getPlaceCoordinate(place)
      if (!coordinate) return
      const position = fromLonLat(coordinate)
      const pixel = map.getPixelFromCoordinate(position)
      if (!pixel) return

      const cluster = clusters.find(({ pixel: clusterPixel }) => {
        const x = pixel[0] - clusterPixel[0]
        const y = pixel[1] - clusterPixel[1]
        return Math.hypot(x, y) <= CLUSTER_PIXEL_RADIUS
      })

      if (cluster) {
        cluster.places.push(place)
        const count = cluster.places.length
        cluster.pixel = [
          (cluster.pixel[0] * (count - 1) + pixel[0]) / count,
          (cluster.pixel[1] * (count - 1) + pixel[1]) / count,
        ]
        cluster.coordinate = [
          (cluster.coordinate[0] * (count - 1) + coordinate[0]) / count,
          (cluster.coordinate[1] * (count - 1) + coordinate[1]) / count,
        ]
      } else {
        clusters.push({ coordinate, pixel, places: [place] })
      }
    })
    return clusters
  }

  function addClusterOverlay(map, cluster) {
    const marker = document.createElement('button')
    marker.className = `vworld-place-cluster is-${placeMarkerTone(cluster.places[0])} ${markerSizeClass(map)}`
    marker.type = 'button'
    marker.setAttribute('aria-label', `${cluster.places.length}개 장소 모아보기`)
    marker.title = `${cluster.places.length}개 장소`
    marker.textContent = cluster.places.length
    marker.addEventListener('click', () => {
      const view = map.getView()
      const currentZoom = view.getZoom() ?? CLUSTER_ZOOM_MAX
      view.animate({
        center: fromLonLat(cluster.coordinate),
        zoom: Math.min(currentZoom + 2, 19),
        duration: 240,
      })
    })

    const overlay = new Overlay({
      element: marker,
      position: fromLonLat(cluster.coordinate),
      positioning: 'center-center',
      stopEvent: true,
    })
    map.addOverlay(overlay)
    placeOverlaysRef.current.push(overlay)
  }

  function renderPlaceOverlays(map, places) {
    clearPlaceOverlays(map)
    const filterPlace = placeMarkerFilterRef.current
    const visiblePlaces = typeof filterPlace === 'function' ? places.filter(filterPlace) : places
    const zoomLevel = map.getView().getZoom() ?? safeZoom

    if (clusterPlaces && zoomLevel <= CLUSTER_ZOOM_MAX) {
      buildClusters(map, visiblePlaces).forEach((cluster) => {
        if (cluster.places.length > 1) addClusterOverlay(map, cluster)
        else addPlaceOverlay(map, cluster.places[0])
      })
      fitVisiblePlaces(map, visiblePlaces)
      return
    }

    visiblePlaces.forEach((place) => addPlaceOverlay(map, place))
    fitVisiblePlaces(map, visiblePlaces)
  }

  function fitVisiblePlaces(map, places) {
    if (!fitPlaceMarkers) return
    const coordinates = places
      .map(getPlaceCoordinate)
      .filter(Boolean)
      .map((coordinate) => fromLonLat(coordinate))
    if (!coordinates.length) return
    const coordinateKey = coordinates.map((coordinate) => coordinate.join(',')).join('|')
    if (fittedPlaceKeyRef.current === coordinateKey) return
    fittedPlaceKeyRef.current = coordinateKey
    if (coordinates.length === 1) {
      map.getView().setCenter(coordinates[0])
      map.getView().setZoom(17)
      return
    }
    map.getView().fit(boundingExtent(coordinates), {
      padding: [34, 34, 58, 34],
      maxZoom: 17,
      duration: 0,
    })
  }

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

    const loadVisiblePlaces = () => {
      const loader = loadPlacesRef.current
      const size = map.getSize()
      if (!loader || !size) return

      const extent = map.getView().calculateExtent(size)
      const [minLng, minLat, maxLng, maxLat] = transformExtent(extent, 'EPSG:3857', 'EPSG:4326')
      placeAbortRef.current?.abort()
      const controller = new AbortController()
      placeAbortRef.current = controller

      loader({ minLat, maxLat, minLng, maxLng, limit: placeLimit, signal: controller.signal })
        .then((places = []) => {
          if (controller.signal.aborted) return
          rawPlacesRef.current = Array.isArray(places) ? places : []
          onPlacesChangeRef.current?.(rawPlacesRef.current)
          renderPlaceOverlays(map, rawPlacesRef.current)
        })
        .catch((error) => {
          if (error?.name === 'AbortError') return
          console.error('지도 장소 정보를 불러오지 못했어요.', error)
          rawPlacesRef.current = []
          onPlacesChangeRef.current?.([])
          clearPlaceOverlays(map)
        })
    }
    loadVisiblePlacesRef.current = loadVisiblePlaces

    map.once('postrender', loadVisiblePlaces)
    map.on('moveend', loadVisiblePlaces)

    return () => {
      map.un('moveend', loadVisiblePlaces)
      if (loadVisiblePlacesRef.current === loadVisiblePlaces) loadVisiblePlacesRef.current = null
      placeAbortRef.current?.abort()
      clearPlaceOverlays(map)
      source.un('tileloaderror', handleTileError)
      source.un('tileloadend', handleTileSuccess)
      map.setTarget(undefined)
      mapRef.current = null
    }
  }, [apiKey, interactive, Boolean(loadPlacesInBounds), placeLimit, clusterPlaces, fitPlaceMarkers])

  useEffect(() => {
    if (lastPlaceRequestKeyRef.current === placeRequestKey) return
    lastPlaceRequestKeyRef.current = placeRequestKey
    fittedPlaceKeyRef.current = ''
    loadVisiblePlacesRef.current?.()
  }, [placeRequestKey])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    renderPlaceOverlays(map, rawPlacesRef.current)
  }, [placeMarkerFilterKey])

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
    marker.innerHTML = '<span class="vworld-user-location-dot"></span>'

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
