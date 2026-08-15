import { useEffect, useRef, useState } from 'react'
import Feature from 'ol/Feature.js'
import Map from 'ol/Map.js'
import Overlay from 'ol/Overlay.js'
import View from 'ol/View.js'
import GeoJSON from 'ol/format/GeoJSON.js'
import LineString from 'ol/geom/LineString.js'
import TileLayer from 'ol/layer/Tile.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import XYZ from 'ol/source/XYZ.js'
import { boundingExtent } from 'ol/extent.js'
import { fromLonLat, transformExtent } from 'ol/proj.js'
import { Fill, Stroke, Style } from 'ol/style.js'
import 'ol/ol.css'
import '../vworld-map.css'
import { indexCongestionAreasByCode } from '../utils/congestionAreaIndex.js'
import { resolveMapClusterTone, resolveMapMarkerTone } from '../utils/mapHomeFilters.js'
import { routeFitPointCoordinates, routeLegFeatureSpecs } from '../utils/routeGeometry.js'
import { resolveRouteFitDuration } from '../utils/routeComparison.js'

const DEFAULT_CENTER = [126.978, 37.5665]
const CLUSTER_ZOOM_MAX = 14.5
const CLUSTER_PIXEL_RADIUS = 44
const CONGESTION_AREA_COLORS = {
  여유: { fill: 'rgba(34, 197, 94, 0.48)', stroke: 'rgba(21, 128, 61, 0.96)' },
  보통: { fill: 'rgba(59, 130, 246, 0.44)', stroke: 'rgba(29, 78, 216, 0.96)' },
  '약간 붐빔': { fill: 'rgba(249, 115, 22, 0.48)', stroke: 'rgba(194, 65, 12, 0.96)' },
  붐빔: { fill: 'rgba(239, 68, 68, 0.52)', stroke: 'rgba(185, 28, 28, 0.98)' },
  정보없음: { fill: 'rgba(51, 65, 85, 0.10)', stroke: 'rgba(51, 65, 85, 0.34)' },
}

export const ROUTE_STYLES = {
  WALK: new Style({ stroke: new Stroke({ color: '#2563eb', width: 5, lineDash: [3, 8] }) }),
  TRANSIT: new Style({ stroke: new Stroke({ color: '#0f766e', width: 6 }) }),
  TAXI: new Style({ stroke: new Stroke({ color: '#f2b705', width: 6 }) }),
}

function normalizeCenter(center) {
  if (!Array.isArray(center) || center.length < 2) return DEFAULT_CENTER

  const longitude = Number(center[0])
  const latitude = Number(center[1])
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : DEFAULT_CENTER
}

function markerSizeClass(map) {
  const zoomLevel = map.getView().getZoom() ?? 15
  if (zoomLevel >= 17) return 'is-zoom-near'
  if (zoomLevel >= 15) return 'is-zoom-mid'
  return 'is-zoom-far'
}

function congestionAreaStyle(feature) {
  const level = feature.get('congestionLevel') || '정보없음'
  const colors = CONGESTION_AREA_COLORS[level] || CONGESTION_AREA_COLORS.정보없음
  return new Style({
    fill: new Fill({ color: colors.fill }),
    stroke: new Stroke({
      color: colors.stroke,
      width: level === '정보없음' ? 1 : 2,
    }),
  })
}

function normalizeCongestionAreaCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function congestionAreaFromFeature(feature) {
  return {
    areaCode: feature.get('areaCode') || '',
    areaName: feature.get('areaName') || '혼잡도 영역',
    category: feature.get('category') || '',
    congestionLevel: feature.get('congestionLevel') || '정보없음',
    congestionMessage: feature.get('congestionMessage') || null,
    populationMin: feature.get('populationMin') ?? null,
    populationMax: feature.get('populationMax') ?? null,
    populationTime: feature.get('populationTime') || null,
    updatedAt: feature.get('congestionUpdatedAt') || null,
    stale: feature.get('congestionStale') ?? true,
  }
}

function resolveCongestionResponse(data) {
  if (!data || typeof data !== 'object') return null
  if (Array.isArray(data.areas)) return data
  if (data.result && typeof data.result === 'object' && Array.isArray(data.result.areas)) return data.result
  return null
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
  fitUserLocation = false,
  placeRequestKey = '',
  placeLimit = 300,
  congestionAreaUrl = '',
  congestionAreaKey = '',
  congestionData = null,
  showCongestionAreas = true,
  onMapClick = null,
  onPlaceClick = null,
  onCongestionAreaClick = null,
  onPlacesChange = null,
  routeLegs = [],
  routeMode = 'WALK',
  routeFitKey = '',
  routeFitCoordinates = [],
}) {
  const targetRef = useRef(null)
  const mapRef = useRef(null)
  const locationOverlayRef = useRef(null)
  const congestionAreaLayerRef = useRef(null)
  const routeLayerRef = useRef(null)
  const placeOverlaysRef = useRef([])
  const rawPlacesRef = useRef([])
  const placeAbortRef = useRef(null)
  const congestionAreaAbortRef = useRef(null)
  const fittedPlaceKeyRef = useRef('')
  const fittedRouteKeyRef = useRef('')
  const loadVisiblePlacesRef = useRef(null)
  const lastPlaceRequestKeyRef = useRef(placeRequestKey)
  const loadPlacesRef = useRef(loadPlacesInBounds)
  const placeMarkerFilterRef = useRef(placeMarkerFilter)
  const placeMarkerLabelRef = useRef(placeMarkerLabel)
  const onMapClickRef = useRef(onMapClick)
  const onPlaceClickRef = useRef(onPlaceClick)
  const onCongestionAreaClickRef = useRef(onCongestionAreaClick)
  const onPlacesChangeRef = useRef(onPlacesChange)
  const congestionDataRef = useRef(congestionData)
  const [liveUserLocation, setLiveUserLocation] = useState(userLocation)
  const [tileError, setTileError] = useState(false)
  const apiKey = import.meta.env.VITE_VWORLD_API_KEY?.trim()
  const [longitude, latitude] = normalizeCenter(center)
  const safeZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 15

  useEffect(() => {
    loadPlacesRef.current = loadPlacesInBounds
    placeMarkerFilterRef.current = placeMarkerFilter
    placeMarkerLabelRef.current = placeMarkerLabel
    onMapClickRef.current = onMapClick
    onPlaceClickRef.current = onPlaceClick
    onCongestionAreaClickRef.current = onCongestionAreaClick
    onPlacesChangeRef.current = onPlacesChange
    congestionDataRef.current = congestionData
  }, [loadPlacesInBounds, placeMarkerFilter, placeMarkerLabel, onMapClick, onPlaceClick, onCongestionAreaClick, onPlacesChange, congestionData])

  function applyCongestionData(data) {
    const layer = congestionAreaLayerRef.current
    if (!layer) return

    const response = resolveCongestionResponse(data)
    const vectorSource = layer.getSource()
    const features = vectorSource.getFeatures()
    const areasByCode = indexCongestionAreasByCode(response?.areas)

    features.forEach((feature) => {
      const staticAreaCode = feature.get('areaCode') || ''
      const area = areasByCode.get(normalizeCongestionAreaCode(staticAreaCode))
      feature.setProperties({
        areaCode: area?.areaCode || staticAreaCode,
        areaName: area?.areaName || feature.get('areaName') || '혼잡도 영역',
        category: area?.category || feature.get('category') || '',
        congestionLevel: area?.congestionLevel || '정보없음',
        congestionMessage: area?.congestionMessage || null,
        populationMin: area?.populationMin ?? null,
        populationMax: area?.populationMax ?? null,
        populationTime: area?.populationTime || null,
        congestionUpdatedAt: response?.updatedAt || null,
        congestionStale: response ? Boolean(response.stale) : true,
      }, false)
      feature.changed()
    })

    vectorSource.changed()
    layer.changed()
  }

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
    marker.className = `vworld-place-marker is-${resolveMapMarkerTone(place)} ${markerSizeClass(map)}`
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
    marker.className = `vworld-place-cluster is-${resolveMapClusterTone(cluster.places)} ${markerSizeClass(map)}`
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
    setLiveUserLocation(userLocation || null)
    if (!userLocation) return
    if (mapRef.current) {
      const view = mapRef.current.getView()
      view.setCenter(fromLonLat(normalizeCenter(userLocation)))
      view.setZoom(17)
    }
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
    const congestionAreaLayer = new VectorLayer({
      source: new VectorSource(),
      style: congestionAreaStyle,
      zIndex: 1,
      visible: showCongestionAreas,
      properties: { name: 'jongno-congestion-areas' },
    })
    map.addLayer(congestionAreaLayer)
    congestionAreaLayerRef.current = congestionAreaLayer
    const routeLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => ROUTE_STYLES[feature.get('mode')] || ROUTE_STYLES[routeMode] || ROUTE_STYLES.WALK,
      zIndex: 2,
      properties: { name: 'selected-route-legs' },
    })
    map.addLayer(routeLayer)
    routeLayerRef.current = routeLayer
    mapRef.current = map

    const handleCongestionAreaClick = (event) => {
      const feature = map.forEachFeatureAtPixel(
        event.pixel,
        (candidate) => candidate,
        {
          layerFilter: (layer) => layer === congestionAreaLayer,
          hitTolerance: 4,
        },
      )
      onCongestionAreaClickRef.current?.(feature ? congestionAreaFromFeature(feature) : null)
      onMapClickRef.current?.()
    }
    if (interactive) map.on('singleclick', handleCongestionAreaClick)

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
      if (interactive) map.un('singleclick', handleCongestionAreaClick)
      if (loadVisiblePlacesRef.current === loadVisiblePlaces) loadVisiblePlacesRef.current = null
      placeAbortRef.current?.abort()
      clearPlaceOverlays(map)
      congestionAreaAbortRef.current?.abort()
      if (congestionAreaLayerRef.current === congestionAreaLayer) congestionAreaLayerRef.current = null
      if (routeLayerRef.current === routeLayer) routeLayerRef.current = null
      source.un('tileloaderror', handleTileError)
      source.un('tileloadend', handleTileSuccess)
      map.setTarget(undefined)
      mapRef.current = null
    }
  }, [apiKey, interactive, Boolean(loadPlacesInBounds), placeLimit, clusterPlaces, fitPlaceMarkers])

  useEffect(() => {
    const layer = routeLayerRef.current
    if (!layer) return

    const source = layer.getSource()
    source.clear()
    const features = routeLegFeatureSpecs(routeLegs, fromLonLat).map((spec) => {
      const feature = new Feature({ geometry: new LineString(spec.coordinates) })
      feature.setProperties({ mode: spec.mode, routeName: spec.routeName }, false)
      return feature
    })
    source.addFeatures(features)
    layer.changed()
  }, [routeLegs])

  useEffect(() => {
    const layer = routeLayerRef.current
    if (!layer) return
    layer.setStyle((feature) => ROUTE_STYLES[feature.get('mode')] || ROUTE_STYLES[routeMode] || ROUTE_STYLES.WALK)
    layer.changed()
  }, [routeMode])

  useEffect(() => {
    const map = mapRef.current
    const layer = routeLayerRef.current
    if (!map || !layer) return

    if (!routeFitKey) {
      fittedRouteKeyRef.current = ''
      return
    }
    if (fittedRouteKeyRef.current === routeFitKey) return

    const extents = layer.getSource().getFeatures()
      .map((feature) => feature.getGeometry()?.getExtent())
      .filter((extent) => Array.isArray(extent) && extent.length === 4)
    const fitPoints = routeFitPointCoordinates(routeFitCoordinates, fromLonLat)
    if (fitPoints.length) extents.push(boundingExtent(fitPoints))
    if (!extents.length) return
    const extent = extents.reduce((combined, current) => [
      Math.min(combined[0], current[0]),
      Math.min(combined[1], current[1]),
      Math.max(combined[2], current[2]),
      Math.max(combined[3], current[3]),
    ], extents[0])
    fittedRouteKeyRef.current = routeFitKey
    map.getView().fit(extent, {
      padding: [112, 28, 420, 28],
      maxZoom: 17,
      duration: resolveRouteFitDuration(),
    })
  }, [routeFitCoordinates, routeFitKey, routeLegs])

  useEffect(() => {
    const layer = congestionAreaLayerRef.current
    if (!layer) return undefined

    const vectorSource = layer.getSource()
    vectorSource.clear()
    congestionAreaAbortRef.current?.abort()
    if (!congestionAreaUrl) return undefined

    const controller = new AbortController()
    congestionAreaAbortRef.current = controller

    fetch(congestionAreaUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`GeoJSON ${congestionAreaUrl} failed: ${response.status}`)
        return response.json()
      })
      .then((geojson) => {
        if (controller.signal.aborted) return
        const features = new GeoJSON().readFeatures(geojson, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        })
        features.forEach((feature) => {
          feature.setProperties({
            congestionLevel: feature.get('congestionLevel') || '정보없음',
            congestionMessage: null,
            populationMin: null,
            populationMax: null,
            populationTime: null,
            congestionUpdatedAt: null,
            congestionStale: true,
          }, false)
        })
        vectorSource.clear()
        vectorSource.addFeatures(features)
        applyCongestionData(congestionDataRef.current)
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        console.error('혼잡도 영역 정보를 불러오지 못했어요.', error)
        vectorSource.clear()
      })

    return () => {
      controller.abort()
    }
  }, [congestionAreaUrl, congestionAreaKey])

  useEffect(() => {
    applyCongestionData(congestionData)
  }, [congestionData])

  useEffect(() => {
    congestionAreaLayerRef.current?.setVisible(showCongestionAreas)
  }, [showCongestionAreas])

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

    if (!Array.isArray(liveUserLocation) || liveUserLocation.length < 2) {
      if (fitUserLocation) {
        fittedPlaceKeyRef.current = ''
        fitVisiblePlaces(map, rawPlacesRef.current)
      }
      return undefined
    }
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
    if (fitUserLocation) {
      fitVisiblePlaces(map, [
        ...rawPlacesRef.current,
        { longitude: location[0], latitude: location[1] },
      ])
    }

    return () => {
      map.removeOverlay(overlay)
      if (locationOverlayRef.current === overlay) locationOverlayRef.current = null
    }
  }, [liveUserLocation?.[0], liveUserLocation?.[1], fitUserLocation])

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
