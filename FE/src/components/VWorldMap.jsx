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
import VWorldMapRegion from './VWorldMapRegion.js'
import { resolveMapClusterTone, resolveMapMarkerTone } from '../utils/mapHomeFilters.js'
import {
  createLatestViewportRequest,
  createViewportLoadGate,
  getMockCrowdingGridDetailAtCoordinate,
  getMockCrowdingMarkerPresentation,
  getSeoulCrowdingSlot,
  reconcileSelectedMockCrowdingGrid,
  toMockCrowdingFeatureCollection,
  toMockCrowdingGridDetail,
} from '../utils/mockCrowdingMap.js'
import { routeFitPointCoordinates, routeLegFeatureSpecs } from '../utils/routeGeometry.js'
import { resolveRouteFitDuration } from '../utils/routeComparison.js'

const DEFAULT_CENTER = [126.978, 37.5665]
const DEFAULT_ROUTE_FIT_PADDING = [120, 36, 380, 36]
const CLUSTER_ZOOM_MAX = 14.5
const CLUSTER_PIXEL_RADIUS = 44
const CROWDING_GRID_COLORS = {
  여유: { fill: 'rgba(34, 197, 94, 0.22)', stroke: 'rgba(21, 128, 61, 0.72)' },
  보통: { fill: 'rgba(59, 130, 246, 0.20)', stroke: 'rgba(29, 78, 216, 0.70)' },
  '약간 붐빔': { fill: 'rgba(249, 115, 22, 0.23)', stroke: 'rgba(194, 65, 12, 0.74)' },
  붐빔: { fill: 'rgba(239, 68, 68, 0.26)', stroke: 'rgba(185, 28, 28, 0.78)' },
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

function crowdingGridStyle(feature) {
  const level = feature.get('levelLabel') || '정보없음'
  const colors = CROWDING_GRID_COLORS[level] || CROWDING_GRID_COLORS.정보없음
  return new Style({
    fill: new Fill({ color: colors.fill }),
    stroke: new Stroke({
      color: colors.stroke,
      width: 1,
    }),
  })
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
  loadCongestionInBounds = null,
  showCongestionAreas = true,
  selectedCongestionGridCode = null,
  onMapClick = null,
  onPlaceClick = null,
  onCongestionAreaClick = null,
  onPlacesChange = null,
  routeLegs = [],
  routeMode = 'WALK',
  routeFitKey = '',
  routeFitPadding = DEFAULT_ROUTE_FIT_PADDING,
}) {
  const targetRef = useRef(null)
  const mapRef = useRef(null)
  const locationOverlayRef = useRef(null)
  const congestionAreaLayerRef = useRef(null)
  const routeLayerRef = useRef(null)
  const placeOverlaysRef = useRef([])
  const rawPlacesRef = useRef([])
  const placeAbortRef = useRef(null)
  const crowdingRequestRef = useRef(null)
  const fittedPlaceKeyRef = useRef('')
  const fittedRouteKeyRef = useRef('')
  const loadVisiblePlacesRef = useRef(null)
  const lastPlaceRequestKeyRef = useRef(placeRequestKey)
  const loadPlacesRef = useRef(loadPlacesInBounds)
  const loadCongestionRef = useRef(loadCongestionInBounds)
  const placeMarkerFilterRef = useRef(placeMarkerFilter)
  const placeMarkerLabelRef = useRef(placeMarkerLabel)
  const onMapClickRef = useRef(onMapClick)
  const onPlaceClickRef = useRef(onPlaceClick)
  const onCongestionAreaClickRef = useRef(onCongestionAreaClick)
  const selectedCongestionGridCodeRef = useRef(selectedCongestionGridCode)
  const showCongestionAreasRef = useRef(showCongestionAreas)
  const onPlacesChangeRef = useRef(onPlacesChange)
  const [liveUserLocation, setLiveUserLocation] = useState(userLocation)
  const [tileError, setTileError] = useState(false)
  const apiKey = import.meta.env?.VITE_VWORLD_API_KEY?.trim()
  const [longitude, latitude] = normalizeCenter(center)
  const safeZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 15
  if (!crowdingRequestRef.current) crowdingRequestRef.current = createLatestViewportRequest()

  useEffect(() => {
    loadPlacesRef.current = loadPlacesInBounds
    loadCongestionRef.current = loadCongestionInBounds
    placeMarkerFilterRef.current = placeMarkerFilter
    placeMarkerLabelRef.current = placeMarkerLabel
    onMapClickRef.current = onMapClick
    onPlaceClickRef.current = onPlaceClick
    onCongestionAreaClickRef.current = onCongestionAreaClick
    selectedCongestionGridCodeRef.current = selectedCongestionGridCode
    showCongestionAreasRef.current = showCongestionAreas
    onPlacesChangeRef.current = onPlacesChange
  }, [loadPlacesInBounds, loadCongestionInBounds, placeMarkerFilter, placeMarkerLabel, onMapClick, onPlaceClick, onCongestionAreaClick, onPlacesChange, selectedCongestionGridCode, showCongestionAreas])

  function clearPlaceOverlays(map) {
    placeOverlaysRef.current.forEach((overlay) => map.removeOverlay(overlay))
    placeOverlaysRef.current = []
  }

  function getPlaceCoordinate(place) {
    const longitude = Number(place.longitude)
    const latitude = Number(place.latitude)
    return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null
  }

  function getCrowdingGridAtCoordinate(coordinate) {
    const source = congestionAreaLayerRef.current?.getSource()
    if (!source) return null
    const feature = source.getFeaturesAtCoordinate(fromLonLat(coordinate))[0]
    return feature?.getProperties() || null
  }

  function publishSelectedCongestionArea(detail) {
    selectedCongestionGridCodeRef.current = detail?.gridCode ?? null
    onCongestionAreaClickRef.current?.(detail)
  }

  function selectCrowdingAtProjectedCoordinate(coordinate) {
    if (!showCongestionAreasRef.current) return
    const source = congestionAreaLayerRef.current?.getSource()
    const detail = getMockCrowdingGridDetailAtCoordinate(source, coordinate)
    publishSelectedCongestionArea(detail)
    onMapClickRef.current?.()
  }

  function addPlaceOverlay(map, place) {
    const coordinate = getPlaceCoordinate(place)
    if (!coordinate) return

    const markerLabel = placeMarkerLabelRef.current?.(place)
    const hasMarkerLabel = markerLabel !== undefined && markerLabel !== null && markerLabel !== ''
    const crowdingPresentation = getMockCrowdingMarkerPresentation({
      placeName: place.name,
      markerLabel: hasMarkerLabel ? markerLabel : null,
      grid: getCrowdingGridAtCoordinate(coordinate),
    })
    const marker = document.createElement('button')
    marker.className = [
      'vworld-place-marker',
      `is-${resolveMapMarkerTone(place)}`,
      markerSizeClass(map),
      crowdingPresentation.className,
    ].filter(Boolean).join(' ')
    marker.type = 'button'
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
    marker.setAttribute('aria-label', crowdingPresentation.ariaLabel)
    marker.title = crowdingPresentation.levelLabel
      ? `${place.name} · 혼잡도 ${crowdingPresentation.levelLabel}`
      : place.name
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
      style: crowdingGridStyle,
      zIndex: 1,
      visible: showCongestionAreas,
      properties: { name: 'jongno-mock-crowding-grids' },
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
      publishSelectedCongestionArea(feature
        ? toMockCrowdingGridDetail(feature.getProperties())
        : null)
      onMapClickRef.current?.()
    }
    if (interactive) map.on('singleclick', handleCongestionAreaClick)

    const getViewportBounds = () => {
      const size = map.getSize()
      if (!size) return null
      const extent = map.getView().calculateExtent(size)
      const [minLng, minLat, maxLng, maxLat] = transformExtent(extent, 'EPSG:3857', 'EPSG:4326')
      if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null
      return { minLat, maxLat, minLng, maxLng }
    }
    const viewportLoadGate = createViewportLoadGate()

    const loadVisiblePlaces = (providedBounds = null) => {
      const loader = loadPlacesRef.current
      const bounds = providedBounds ?? getViewportBounds()
      if (!loader || !bounds) return

      placeAbortRef.current?.abort()
      const controller = new AbortController()
      placeAbortRef.current = controller

      loader({ ...bounds, limit: placeLimit, signal: controller.signal })
        .then((places = []) => {
          if (controller.signal.aborted) return
          rawPlacesRef.current = Array.isArray(places) ? places : []
          onPlacesChangeRef.current?.(rawPlacesRef.current)
          renderPlaceOverlays(map, rawPlacesRef.current)
        })
        .catch((error) => {
          if (error?.name === 'AbortError') return
          console.error('지도 장소 정보를 불러오지 못했어요.', error)
          viewportLoadGate.reset()
          rawPlacesRef.current = []
          onPlacesChangeRef.current?.([])
          clearPlaceOverlays(map)
        })
    }
    loadVisiblePlacesRef.current = loadVisiblePlaces

    let crowdingSlotTimerId = null
    let activeCrowdingSlotKey = null
    const scheduleCrowdingSlotRefresh = (slot) => {
      if (crowdingSlotTimerId !== null) globalThis.clearTimeout(crowdingSlotTimerId)
      activeCrowdingSlotKey = slot.key
      const delay = Math.max(25, slot.endTimestamp - Date.now() + 25)
      crowdingSlotTimerId = globalThis.setTimeout(() => {
        crowdingSlotTimerId = null
        const nextSlot = getSeoulCrowdingSlot()
        if (nextSlot.key !== activeCrowdingSlotKey) loadVisibleCongestion()
        else scheduleCrowdingSlotRefresh(nextSlot)
      }, delay)
    }

    const loadVisibleCongestion = (providedBounds = null) => {
      const loader = loadCongestionRef.current
      const bounds = providedBounds ?? getViewportBounds()
      if (!loader || !bounds) return

      const slot = getSeoulCrowdingSlot()
      if (slot.key !== activeCrowdingSlotKey) scheduleCrowdingSlotRefresh(slot)
      void crowdingRequestRef.current.run(
        (signal) => loader(bounds, { signal, at: slot.requestAt }),
        (grids) => {
          const geojson = toMockCrowdingFeatureCollection(grids)
          const features = new GeoJSON().readFeatures(geojson, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
          })
          congestionAreaLayer.setSource(new VectorSource({ features }))
          congestionAreaLayer.changed()
          renderPlaceOverlays(map, rawPlacesRef.current)
          const selectedGridCode = selectedCongestionGridCodeRef.current
          if (selectedGridCode) {
            publishSelectedCongestionArea(
              reconcileSelectedMockCrowdingGrid(grids, selectedGridCode),
            )
          }
            },
            (error) => {
              viewportLoadGate.reset()
              console.warn('혼잡도 격자를 새로고침하지 못했어요.', error)
            },
      )
    }

    const loadViewportData = () => {
      const bounds = getViewportBounds()
      if (!bounds || !viewportLoadGate.shouldLoad(bounds)) return
      loadVisiblePlaces(bounds)
      loadVisibleCongestion(bounds)
    }
    const handleCrowdingVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const slot = getSeoulCrowdingSlot()
      if (slot.key !== activeCrowdingSlotKey) loadVisibleCongestion()
    }

    map.once('postrender', loadViewportData)
    map.on('moveend', loadViewportData)
    document.addEventListener('visibilitychange', handleCrowdingVisibility)

    return () => {
      map.un('postrender', loadViewportData)
      map.un('moveend', loadViewportData)
      if (interactive) map.un('singleclick', handleCongestionAreaClick)
      if (loadVisiblePlacesRef.current === loadVisiblePlaces) loadVisiblePlacesRef.current = null
      placeAbortRef.current?.abort()
      clearPlaceOverlays(map)
      crowdingRequestRef.current.abort()
      if (crowdingSlotTimerId !== null) globalThis.clearTimeout(crowdingSlotTimerId)
      document.removeEventListener('visibilitychange', handleCrowdingVisibility)
      if (congestionAreaLayerRef.current === congestionAreaLayer) congestionAreaLayerRef.current = null
      if (routeLayerRef.current === routeLayer) routeLayerRef.current = null
      map.removeLayer(congestionAreaLayer)
      map.removeLayer(routeLayer)
      source.un('tileloaderror', handleTileError)
      source.un('tileloadend', handleTileSuccess)
      map.setTarget(undefined)
      mapRef.current = null
    }
  }, [apiKey, interactive, Boolean(loadPlacesInBounds), Boolean(loadCongestionInBounds), placeLimit, clusterPlaces, fitPlaceMarkers])

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
      padding: routeFitPadding,
      maxZoom: 17,
      duration: resolveRouteFitDuration(),
    })
  }, [routeFitKey, routeLegs, routeFitPadding])

  useEffect(() => {
    congestionAreaLayerRef.current?.setVisible(showCongestionAreas)
    showCongestionAreasRef.current = showCongestionAreas
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

  const handleKeyboardCrowdingSelection = (event) => {
    if (
      !interactive
      || !showCongestionAreas
      || event.target !== event.currentTarget
      || (event.key !== 'Enter' && event.key !== ' ')
    ) return

    const centerCoordinate = mapRef.current?.getView().getCenter()
    if (!centerCoordinate) return
    event.preventDefault()
    selectCrowdingAtProjectedCoordinate(centerCoordinate)
  }

  return (
    <VWorldMapRegion
      ariaLabel={ariaLabel}
      className={className}
      interactive={interactive}
      onKeyDown={handleKeyboardCrowdingSelection}
      showCongestionAreas={showCongestionAreas}
      style={style}
    >
      <div ref={targetRef} className="vworld-map__canvas" />
      {statusMessage && (
        <div className="vworld-map__fallback" role="status">
          <span>{statusMessage}</span>
        </div>
      )}
    </VWorldMapRegion>
  )
}
