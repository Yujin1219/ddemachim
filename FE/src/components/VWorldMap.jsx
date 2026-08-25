import { useEffect, useRef, useState } from 'react'
import Feature from 'ol/Feature.js'
import Map from 'ol/Map.js'
import Overlay from 'ol/Overlay.js'
import View from 'ol/View.js'
import GeoJSON from 'ol/format/GeoJSON.js'
import LineString from 'ol/geom/LineString.js'
import Polygon from 'ol/geom/Polygon.js'
import TileLayer from 'ol/layer/Tile.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import XYZ from 'ol/source/XYZ.js'
import { boundingExtent } from 'ol/extent.js'
import { easeOut } from 'ol/easing.js'
import { fromLonLat, transformExtent } from 'ol/proj.js'
import { Fill, Stroke, Style, Text } from 'ol/style.js'
import Point from 'ol/geom/Point.js'
import { __iconNode as calendarDaysIcon } from 'lucide-react/dist/esm/icons/calendar-days.mjs'
import { __iconNode as cameraIcon } from 'lucide-react/dist/esm/icons/camera.mjs'
import { __iconNode as coffeeIcon } from 'lucide-react/dist/esm/icons/coffee.mjs'
import { __iconNode as flameIcon } from 'lucide-react/dist/esm/icons/flame.mjs'
import { __iconNode as imageIcon } from 'lucide-react/dist/esm/icons/image.mjs'
import { __iconNode as landmarkIcon } from 'lucide-react/dist/esm/icons/landmark.mjs'
import { __iconNode as mapPinIcon } from 'lucide-react/dist/esm/icons/map-pin.mjs'
import { __iconNode as paletteIcon } from 'lucide-react/dist/esm/icons/palette.mjs'
import { __iconNode as routeIcon } from 'lucide-react/dist/esm/icons/route.mjs'
import { __iconNode as shoppingBagIcon } from 'lucide-react/dist/esm/icons/shopping-bag.mjs'
import { __iconNode as sparklesIcon } from 'lucide-react/dist/esm/icons/sparkles.mjs'
import { __iconNode as treesIcon } from 'lucide-react/dist/esm/icons/trees.mjs'
import { __iconNode as utensilsIcon } from 'lucide-react/dist/esm/icons/utensils.mjs'
import 'ol/ol.css'
import '../vworld-map.css'
import VWorldMapRegion, { NavigationLocationButton } from './VWorldMapRegion.js'
import {
  resolveExpandedClusterPlaces,
  resolveMapClusterTone,
  resolveMapMarkerTone,
} from '../utils/mapHomeFilters.js'
import {
  navigationViewCenter,
  resolveNavigationHeading,
  rotationForHeading,
} from '../utils/navigationCamera.js'
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
import {
  chevronAnchors,
  lineStringLength,
  orderRouteFeaturesBySequence,
  partialLineString,
  routeDrawTransition,
  routeFitPointCoordinates,
  routeLegFeatureSpecs,
} from '../utils/routeGeometry.js'
import { resolveRouteFitDuration } from '../utils/routeComparison.js'

const DEFAULT_CENTER = [126.978, 37.5665]
const DEFAULT_ROUTE_FIT_PADDING = [120, 36, 380, 36]
const CLUSTER_ZOOM_MAX = 17.5
const CLUSTER_PIXEL_RADIUS = 44
const MARKER_STAGGER_STEP = 22
const MARKER_STAGGER_MAX = 340
const ROUTE_CHEVRON_SPACING_PX = 78
const ROUTE_CHEVRON_MAX_PER_LEG = 8
const ROUTE_DRAW_DURATION = 1250
const ROUTE_GLOW_DURATION = 620
const MARKER_ARRIVAL_RADIUS_PX = 26
const MARKER_ARRIVAL_DURATION = 640
const GHOST_ROUTE_FADED_OPACITY = 0.45
const NAVIGATION_CAMERA_DURATION = 360
const NAVIGATION_CAMERA_ZOOM = 17
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const MAP_MARKER_ICONS = Object.freeze({
  restaurant: utensilsIcon,
  'cafe-dessert': coffeeIcon,
  hot: flameIcon,
  event: calendarDaysIcon,
  attraction: landmarkIcon,
  culture: paletteIcon,
  exhibition: paletteIcon,
  shopping: shoppingBagIcon,
  popup: sparklesIcon,
  park: treesIcon,
  walk: routeIcon,
  'photo-spot': imageIcon,
  filming: cameraIcon,
  search: mapPinIcon,
  default: mapPinIcon,
})
const CROWDING_GRID_COLORS = {
  여유: { fill: 'rgba(34, 197, 94, 0.22)', stroke: 'rgba(21, 128, 61, 0.72)' },
  보통: { fill: 'rgba(59, 130, 246, 0.20)', stroke: 'rgba(29, 78, 216, 0.70)' },
  '약간 붐빔': { fill: 'rgba(249, 115, 22, 0.23)', stroke: 'rgba(194, 65, 12, 0.74)' },
  붐빔: { fill: 'rgba(239, 68, 68, 0.26)', stroke: 'rgba(185, 28, 28, 0.78)' },
  정보없음: { fill: 'rgba(51, 65, 85, 0.10)', stroke: 'rgba(51, 65, 85, 0.34)' },
}

export const ROUTE_STYLES = {
  WALK: new Style({ stroke: new Stroke({ color: '#7dd3fc', width: 2.2, lineCap: 'round' }) }),
  TRANSIT: new Style({ stroke: new Stroke({ color: '#7dd3fc', width: 2.2, lineCap: 'round' }) }),
  TAXI: new Style({ stroke: new Stroke({ color: '#7dd3fc', width: 2.2, lineCap: 'round' }) }),
}

const ROUTE_RIBBON_HALO = new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.64)', width: 5, lineCap: 'round', lineJoin: 'round' }) })
const ROUTE_RIBBON_BODY = new Style({ stroke: new Stroke({ color: 'rgba(51,65,85,0.62)', width: 3.2, lineCap: 'round', lineJoin: 'round' }) })
const SOLID_ROUTE_RIBBON_STYLE = [ROUTE_RIBBON_HALO, ROUTE_RIBBON_BODY]
const ROUTE_FOCUS_STYLE = [
  new Style({ stroke: new Stroke({ color: '#55c7ff', width: 3.25, lineCap: 'round', lineJoin: 'round' }) }),
]
const ROUTE_GLOW_STYLE = new Style({ stroke: new Stroke({ color: 'rgba(96,165,250,0.85)', width: 16, lineCap: 'round', lineJoin: 'round' }) })
const GHOST_ROUTE_STYLE = new Style({ stroke: new Stroke({ color: 'rgba(71,85,105,0.9)', width: 2.5, lineDash: [2, 8], lineCap: 'round' }) })
const GHOST_HIGHLIGHT_STYLE = [
  new Style({ stroke: new Stroke({ color: 'rgba(249,115,22,0.20)', width: 12, lineCap: 'round', lineJoin: 'round' }) }),
  new Style({ stroke: new Stroke({ color: '#ea580c', width: 3, lineDash: [2, 8], lineCap: 'round' }) }),
]

const prefersReducedMotion = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
const motionDuration = (duration) => (prefersReducedMotion() ? 0 : duration)
const markerStaggerDelay = (order) => (prefersReducedMotion() ? 0 : Math.min(order * MARKER_STAGGER_STEP, MARKER_STAGGER_MAX))

function visiblePlaceLimit(map, maximum) {
  const zoomLevel = map.getView().getZoom() ?? CLUSTER_ZOOM_MAX
  if (zoomLevel <= 14) return Math.min(maximum, 60)
  if (zoomLevel <= CLUSTER_ZOOM_MAX) return Math.min(maximum, 120)
  return maximum
}

function createMarkerIcon(tone) {
  const iconNode = MAP_MARKER_ICONS[tone] || MAP_MARKER_ICONS.default
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')

  iconNode.forEach(([tag, attributes]) => {
    const node = document.createElementNS(SVG_NAMESPACE, tag)
    Object.entries(attributes).forEach(([name, value]) => {
      if (name === 'key') return
      node.setAttribute(name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), String(value))
    })
    svg.appendChild(node)
  })
  return svg
}

function ribbonStyle(feature, resolution = 1) {
  const styles = [ROUTE_RIBBON_HALO, ROUTE_RIBBON_BODY, ROUTE_STYLES.TRANSIT]
  if (feature.get('drawing')) return styles
  const coordinates = feature.getGeometry()?.getCoordinates()
  chevronAnchors(coordinates, ROUTE_CHEVRON_SPACING_PX * resolution, ROUTE_CHEVRON_MAX_PER_LEG)
    .forEach((anchor) => styles.push(new Style({
      geometry: new Point(anchor.coordinate),
      text: new Text({
        text: '›',
        font: '700 15px system-ui, -apple-system, "Segoe UI", sans-serif',
        fill: new Fill({ color: 'rgba(255,255,255,0.95)' }),
        rotation: anchor.rotation,
        rotateWithView: true,
        offsetY: -1,
      }),
    })))
  return styles
}

function focusRouteStyle(feature, resolution = 1) {
  const styles = [...ROUTE_FOCUS_STYLE]
  if (feature.get('drawing')) return styles
  const coordinates = feature.getGeometry()?.getCoordinates()
  chevronAnchors(coordinates, ROUTE_CHEVRON_SPACING_PX * resolution, ROUTE_CHEVRON_MAX_PER_LEG)
    .forEach((anchor) => styles.push(new Style({
      geometry: new Point(anchor.coordinate),
      text: new Text({
        text: '›',
        font: '700 15px system-ui, -apple-system, "Segoe UI", sans-serif',
        fill: new Fill({ color: '#ffffff' }),
        stroke: new Stroke({ color: '#249fe5', width: 2.5 }),
        rotation: anchor.rotation,
        rotateWithView: true,
      }),
    })))
  return styles
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
  center = null,
  zoom = 15,
  interactive = true,
  className = '',
  style,
  ariaLabel = 'Map',
  userLocation = null,
  followUserLocation = true,
  navigationMode = false,
  userHeading = null,
  userSpeed = null,
  userLocationAccuracy = null,
  loadPlacesInBounds = null,
  placeMarkerFilter = null,
  placeMarkerFilterKey = '',
  placeMarkerLabel = null,
  placeMarkerEntrance = 'pop',
  selectedPlaceKey = '',
  focusedPlaceKey = '',
  focusedPlacePadding = null,
  clusterPlaces = true,
  fitPlaceMarkers = false,
  fitUserLocation = false,
  placeRequestKey = '',
  placeLimit = 300,
  loadCongestionInBounds = null,
  showCongestionAreas = true,
  mapDimmed = false,
  selectedCongestionGridCode = null,
  onMapClick = null,
  onPlaceClick = null,
  onPlaceClusterClick = null,
  onCongestionAreaClick = null,
  onPlacesChange = null,
  routeLegs = [],
  routeMode = 'WALK',
  routeFitKey = '',
  routeFitCoordinates = [],
  routeFitPadding = DEFAULT_ROUTE_FIT_PADDING,
  routeDrawKey = '',
  routeDrawDelay = 0,
  routeAppearance = 'detailed',
  placeMarkerOffset = true,
  ghostRouteLegs = [],
  ghostHighlightLegs = [],
  routeHighlightLegs = [],
  onRouteDrawEnd = null,
  onRouteReady = null,
}) {
  const targetRef = useRef(null)
  const mapRef = useRef(null)
  const locationOverlayRef = useRef(null)
  const congestionAreaLayerRef = useRef(null)
  const mapDimLayerRef = useRef(null)
  const routeLayerRef = useRef(null)
  const routeGlowLayerRef = useRef(null)
  const ghostLayerRef = useRef(null)
  const ghostHighlightLayerRef = useRef(null)
  const routeHighlightLayerRef = useRef(null)
  const sparkOverlayRef = useRef(null)
  const placeOverlaysRef = useRef([])
  const rawPlacesRef = useRef([])
  const expandedClusterPlacesRef = useRef([])
  const preserveClusterExpansionOnNextLoadRef = useRef(false)
  const placeAbortRef = useRef(null)
  const crowdingRequestRef = useRef(null)
  const fittedPlaceKeyRef = useRef('')
  const fittedRouteKeyRef = useRef('')
  const pendingPlaceFitRef = useRef(true)
  const pendingMarkerEntranceRef = useRef(true)
  const appliedRouteShapeRef = useRef('')
  const appliedGhostShapeRef = useRef('')
  const readyRouteShapeRef = useRef('')
  const routeDrawRef = useRef({ key: '', frame: 0, timer: null, arrivalTimers: [] })
  const onRouteDrawEndRef = useRef(onRouteDrawEnd)
  const onRouteReadyRef = useRef(onRouteReady)
  const selectedPlaceKeyRef = useRef(selectedPlaceKey)
  const focusedPlaceKeyRef = useRef(focusedPlaceKey)
  const focusedPlacePaddingRef = useRef(focusedPlacePadding)
  const loadVisiblePlacesRef = useRef(null)
  const lastPlaceRequestKeyRef = useRef(placeRequestKey)
  const loadPlacesRef = useRef(loadPlacesInBounds)
  const loadCongestionRef = useRef(loadCongestionInBounds)
  const placeMarkerFilterRef = useRef(placeMarkerFilter)
  const placeMarkerLabelRef = useRef(placeMarkerLabel)
  const placeMarkerOffsetRef = useRef(placeMarkerOffset)
  const onMapClickRef = useRef(onMapClick)
  const onPlaceClickRef = useRef(onPlaceClick)
  const onPlaceClusterClickRef = useRef(onPlaceClusterClick)
  const onCongestionAreaClickRef = useRef(onCongestionAreaClick)
  const selectedCongestionGridCodeRef = useRef(selectedCongestionGridCode)
  const showCongestionAreasRef = useRef(showCongestionAreas)
  const onPlacesChangeRef = useRef(onPlacesChange)
  const navigationModeRef = useRef(navigationMode)
  const followCameraRef = useRef(navigationMode)
  const navigationFixRef = useRef(null)
  const navigationHeadingRef = useRef(null)
  const navigationObservationRef = useRef(null)
  const [liveUserLocation, setLiveUserLocation] = useState(userLocation)
  const [followCameraActive, setFollowCameraActive] = useState(navigationMode)
  const [mapVersion, setMapVersion] = useState(0)
  const [tileError, setTileError] = useState(false)
  const apiKey = import.meta.env?.VITE_VWORLD_API_KEY?.trim()
  const hasExplicitCenter = Array.isArray(center) && center.length >= 2
  const [longitude, latitude] = normalizeCenter(center)
  const safeZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 15
  if (!crowdingRequestRef.current) crowdingRequestRef.current = createLatestViewportRequest()
  navigationModeRef.current = navigationMode
  followCameraRef.current = followCameraActive

  function animateNavigationCamera({ force = false } = {}) {
    const map = mapRef.current
    const observation = navigationObservationRef.current
    if (!map || !navigationModeRef.current || (!force && !followCameraRef.current)) return
    if (!Array.isArray(observation?.coordinate) || observation.coordinate.length < 2) return

    const [longitude, latitude] = normalizeCenter(observation.coordinate)
    const currentFix = {
      longitude,
      latitude,
      heading: observation.heading,
      speed: observation.speed,
      accuracy: observation.accuracy,
    }
    const direction = resolveNavigationHeading({
      previousFix: navigationFixRef.current,
      currentFix,
      previousHeading: navigationHeadingRef.current,
    })
    if (!navigationFixRef.current || direction.movedMeters >= 3) navigationFixRef.current = currentFix
    if (Number.isFinite(direction.heading)) navigationHeadingRef.current = direction.heading

    const view = map.getView()
    const currentRotation = view.getRotation() || 0
    const rotation = Number.isFinite(navigationHeadingRef.current)
      ? rotationForHeading(navigationHeadingRef.current, currentRotation)
      : currentRotation
    const coordinate = fromLonLat([longitude, latitude])
    const size = map.getSize()
    const resolution = view.getResolutionForZoom(NAVIGATION_CAMERA_ZOOM) ?? view.getResolution()
    const center = size?.[0] && size?.[1] && Number.isFinite(resolution)
      ? navigationViewCenter({ coordinate, size, resolution, rotation })
      : coordinate

    view.cancelAnimations()
    view.animate({
      center,
      rotation,
      zoom: NAVIGATION_CAMERA_ZOOM,
      duration: motionDuration(NAVIGATION_CAMERA_DURATION),
      easing: easeOut,
    })
  }

  function resumeNavigationCamera() {
    if (!navigationModeRef.current) return
    followCameraRef.current = true
    setFollowCameraActive(true)
    animateNavigationCamera({ force: true })
  }

  useEffect(() => {
    loadPlacesRef.current = loadPlacesInBounds
    loadCongestionRef.current = loadCongestionInBounds
    placeMarkerFilterRef.current = placeMarkerFilter
    placeMarkerLabelRef.current = placeMarkerLabel
    placeMarkerOffsetRef.current = placeMarkerOffset
    onMapClickRef.current = onMapClick
    onPlaceClickRef.current = onPlaceClick
    onPlaceClusterClickRef.current = onPlaceClusterClick
    onCongestionAreaClickRef.current = onCongestionAreaClick
    selectedCongestionGridCodeRef.current = selectedCongestionGridCode
    showCongestionAreasRef.current = showCongestionAreas
    onPlacesChangeRef.current = onPlacesChange
    onRouteDrawEndRef.current = onRouteDrawEnd
    onRouteReadyRef.current = onRouteReady
    selectedPlaceKeyRef.current = selectedPlaceKey
    focusedPlaceKeyRef.current = focusedPlaceKey
    focusedPlacePaddingRef.current = focusedPlacePadding
  }, [loadPlacesInBounds, loadCongestionInBounds, placeMarkerFilter, placeMarkerLabel, placeMarkerOffset, onMapClick, onPlaceClick, onPlaceClusterClick, onCongestionAreaClick, onPlacesChange, selectedCongestionGridCode, showCongestionAreas, onRouteDrawEnd, onRouteReady, selectedPlaceKey, focusedPlaceKey, focusedPlacePadding])

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

  function isSelectedPlace(place) {
    return selectedPlaceKeyRef.current
      && `${place.externalSource || 'INTERNAL'}:${place.id}` === selectedPlaceKeyRef.current
  }

  function focusPlace(map, placeKey) {
    if (!map || !placeKey) return
    const place = rawPlacesRef.current.find((item) => (
      `${item.externalSource || 'INTERNAL'}:${item.id}` === placeKey
    ))
    const coordinate = place && getPlaceCoordinate(place)
    if (!coordinate) return
    const view = map.getView()
    view.cancelAnimations()
    const padding = focusedPlacePaddingRef.current
    if (Array.isArray(padding) && padding.length === 4 && map.getSize()) {
      view.fit(new Point(fromLonLat(coordinate)), {
        padding,
        maxZoom: view.getZoom(),
        duration: motionDuration(380),
        easing: easeOut,
      })
      return
    }
    view.animate({
      center: fromLonLat(coordinate),
      duration: motionDuration(380),
      easing: easeOut,
    })
  }

  function addPlaceOverlay(map, place, order = -1, expandedPosition = null) {
    const coordinate = getPlaceCoordinate(place)
    if (!coordinate) return

    const markerLabel = placeMarkerLabelRef.current?.(place)
    const hasMarkerLabel = markerLabel !== undefined && markerLabel !== null && markerLabel !== ''
    const crowdingPresentation = getMockCrowdingMarkerPresentation({
      placeName: place.name,
      markerLabel: hasMarkerLabel ? markerLabel : null,
      grid: getCrowdingGridAtCoordinate(coordinate),
    })
    const markerTone = resolveMapMarkerTone(place)
    const marker = document.createElement('button')
    marker.className = [
      'vworld-place-marker',
      `is-${markerTone}`,
      markerSizeClass(map),
      crowdingPresentation.className,
      crowdingPresentation.ringTone ? `has-crowding-ring is-ring-${crowdingPresentation.ringTone}` : '',
      isSelectedPlace(place) ? 'is-selected' : '',
      order >= 0 ? 'is-entering' : '',
      order >= 0 && placeMarkerEntrance === 'renumber' ? 'is-renumber' : '',
    ].filter(Boolean).join(' ')
    marker.type = 'button'
    if (order >= 0) marker.style.setProperty('--marker-delay', `${markerStaggerDelay(order)}ms`)
    if (expandedPosition && expandedPosition.total > 1) {
      const radius = expandedPosition.total <= 4 ? 24 : 30
      const angle = ((Math.PI * 2) * expandedPosition.index / expandedPosition.total) - (Math.PI / 2)
      marker.style.setProperty('--marker-offset-x', `${Math.round(Math.cos(angle) * radius)}px`)
      marker.style.setProperty('--marker-offset-y', `${Math.round(Math.sin(angle) * radius)}px`)
      marker.classList.add('is-cluster-expanded')
    }
    if (hasMarkerLabel) {
      marker.classList.add('is-numbered')
      const markerNumber = Number(markerLabel)
      if (placeMarkerOffsetRef.current && Number.isFinite(markerNumber) && markerNumber > 0) {
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
    markerContent.className = 'vworld-place-marker__content'
    if (hasMarkerLabel) markerContent.textContent = String(markerLabel)
    else markerContent.appendChild(createMarkerIcon(markerTone))
    marker.appendChild(markerContent)
    if (isSelectedPlace(place) && crowdingPresentation.statusLabel) {
      const crowdingStatus = document.createElement('span')
      crowdingStatus.className = 'vworld-place-marker__crowding-status'
      crowdingStatus.textContent = crowdingPresentation.statusLabel
      marker.appendChild(crowdingStatus)
    }
    marker.addEventListener('click', () => {
      expandedClusterPlacesRef.current = []
      preserveClusterExpansionOnNextLoadRef.current = false
      onPlaceClickRef.current?.(place)
    })

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

  function addClusterOverlay(map, cluster, order = -1) {
    const marker = document.createElement('button')
    marker.className = `vworld-place-cluster is-${resolveMapClusterTone(cluster.places)} ${markerSizeClass(map)}${order >= 0 ? ' is-entering' : ''}`
    if (order >= 0) marker.style.setProperty('--marker-delay', `${markerStaggerDelay(order)}ms`)
    marker.type = 'button'
    marker.setAttribute('aria-label', `${cluster.places.length}개 장소 모아보기`)
    marker.title = `${cluster.places.length}개 장소`
    marker.textContent = cluster.places.length
    marker.addEventListener('click', () => {
      focusedPlaceKeyRef.current = ''
      selectedPlaceKeyRef.current = ''
      expandedClusterPlacesRef.current = cluster.places
      preserveClusterExpansionOnNextLoadRef.current = true
      onPlaceClusterClickRef.current?.(cluster.places)
      const view = map.getView()
      const coordinates = cluster.places.map(getPlaceCoordinate).filter(Boolean).map((coordinate) => fromLonLat(coordinate))
      const extent = boundingExtent(coordinates)
      const hasArea = coordinates.length > 1 && (extent[0] !== extent[2] || extent[1] !== extent[3])
      if (hasArea && map.getSize()) {
        view.fit(extent, {
          padding: [96, 64, 164, 64],
          maxZoom: 18.5,
          duration: motionDuration(380),
          easing: easeOut,
        })
      } else {
        view.animate({
          center: fromLonLat(cluster.coordinate),
          zoom: 18.5,
          duration: motionDuration(380),
          easing: easeOut,
        })
      }
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
    const expandedPlaces = resolveExpandedClusterPlaces(visiblePlaces, expandedClusterPlacesRef.current)
    const zoomLevel = map.getView().getZoom() ?? safeZoom

    if (expandedClusterPlacesRef.current.length) {
      const entering = pendingMarkerEntranceRef.current
      pendingMarkerEntranceRef.current = false
      expandedPlaces.forEach((place, index) => addPlaceOverlay(
        map,
        place,
        entering ? index : -1,
        { index, total: expandedPlaces.length },
      ))
      fitVisiblePlaces(map, expandedPlaces)
      return
    }

    if (clusterPlaces && zoomLevel <= CLUSTER_ZOOM_MAX) {
      const entering = pendingMarkerEntranceRef.current
      pendingMarkerEntranceRef.current = false
      buildClusters(map, visiblePlaces).forEach((cluster, index) => {
        if (cluster.places.length > 1) addClusterOverlay(map, cluster, entering ? index : -1)
        else addPlaceOverlay(map, cluster.places[0], entering ? index : -1)
      })
      fitVisiblePlaces(map, visiblePlaces)
      return
    }

    const entering = pendingMarkerEntranceRef.current
    pendingMarkerEntranceRef.current = false
    visiblePlaces.forEach((place, index) => addPlaceOverlay(map, place, entering ? index : -1))
    fitVisiblePlaces(map, visiblePlaces)
  }

  function fitVisiblePlaces(map, places) {
    if (!fitPlaceMarkers) return
    const coordinates = places
      .map(getPlaceCoordinate)
      .filter(Boolean)
      .map((coordinate) => fromLonLat(coordinate))
    if (!coordinates.length) return
    if (!pendingPlaceFitRef.current) return
    const size = map.getSize()
    if (!size || !size[0] || !size[1]) return
    pendingPlaceFitRef.current = false
    if (coordinates.length === 1) {
      map.getView().animate({ center: coordinates[0], zoom: 17, duration: motionDuration(420), easing: easeOut })
      return
    }
    map.getView().fit(boundingExtent(coordinates), {
      padding: [34, 34, 58, 34],
      maxZoom: 17,
      duration: motionDuration(420),
      easing: easeOut,
    })
  }

  useEffect(() => {
    const handleLocation = (event) => {
      const location = event.detail || null
      setLiveUserLocation(location)
      if (location && followUserLocation && mapRef.current) {
        const view = mapRef.current.getView()
        view.setCenter(fromLonLat(normalizeCenter(location)))
        view.setZoom(17)
      }
    }
    window.addEventListener('vworld:user-location', handleLocation)
    return () => window.removeEventListener('vworld:user-location', handleLocation)
  }, [followUserLocation])

  useEffect(() => {
    setLiveUserLocation(userLocation || null)
    if (!userLocation) return
    if (followUserLocation && mapRef.current) {
      const view = mapRef.current.getView()
      view.setCenter(fromLonLat(normalizeCenter(userLocation)))
      view.setZoom(17)
    }
  }, [userLocation?.[0], userLocation?.[1], followUserLocation])

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
    const mapDimLayer = new VectorLayer({
      source: new VectorSource({
        features: [new Feature({ geometry: new Polygon([[
          [-20037508, -20037508], [20037508, -20037508], [20037508, 20037508], [-20037508, 20037508], [-20037508, -20037508],
        ]]) })],
      }),
      style: new Style({ fill: new Fill({ color: 'rgba(15,23,42,0.46)' }) }),
      visible: mapDimmed,
      zIndex: 1.25,
      properties: { name: 'map-dim-layer' },
    })
    map.addLayer(mapDimLayer)
    mapDimLayerRef.current = mapDimLayer
    const routeLayer = new VectorLayer({
      source: new VectorSource(),
      style: routeAppearance === 'focus' ? focusRouteStyle : routeAppearance === 'solid' ? SOLID_ROUTE_RIBBON_STYLE : ribbonStyle,
      zIndex: 2,
      properties: { name: 'selected-route-legs' },
    })
    map.addLayer(routeLayer)
    routeLayerRef.current = routeLayer
    const routeHighlightLayer = new VectorLayer({
      source: new VectorSource(),
      style: focusRouteStyle,
      zIndex: 2.25,
      properties: { name: 'route-highlight-legs' },
    })
    map.addLayer(routeHighlightLayer)
    routeHighlightLayerRef.current = routeHighlightLayer
    const ghostLayer = new VectorLayer({
      source: new VectorSource(),
      style: GHOST_ROUTE_STYLE,
      opacity: GHOST_ROUTE_FADED_OPACITY,
      zIndex: 1.5,
      properties: { name: 'route-ghost' },
    })
    const ghostHighlightLayer = new VectorLayer({
      source: new VectorSource(),
      style: GHOST_HIGHLIGHT_STYLE,
      zIndex: 1.6,
      properties: { name: 'route-ghost-highlight' },
    })
    const routeGlowLayer = new VectorLayer({
      source: new VectorSource(),
      style: ROUTE_GLOW_STYLE,
      opacity: 0,
      zIndex: 2.5,
      properties: { name: 'route-glow' },
    })
    map.addLayer(ghostLayer)
    map.addLayer(ghostHighlightLayer)
    map.addLayer(routeGlowLayer)
    ghostLayerRef.current = ghostLayer
    ghostHighlightLayerRef.current = ghostHighlightLayer
    routeGlowLayerRef.current = routeGlowLayer
    const spark = document.createElement('span')
    spark.className = 'vworld-route-spark'
    const sparkOverlay = new Overlay({
      element: spark,
      positioning: 'center-center',
      stopEvent: false,
    })
    map.addOverlay(sparkOverlay)
    sparkOverlayRef.current = sparkOverlay
    mapRef.current = map
    setMapVersion((current) => current + 1)

    const handleCongestionAreaClick = (event) => {
      expandedClusterPlacesRef.current = []
      preserveClusterExpansionOnNextLoadRef.current = false
      renderPlaceOverlays(map, rawPlacesRef.current)
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

      if (preserveClusterExpansionOnNextLoadRef.current) {
        preserveClusterExpansionOnNextLoadRef.current = false
      } else {
        expandedClusterPlacesRef.current = []
      }

      placeAbortRef.current?.abort()
      const controller = new AbortController()
      placeAbortRef.current = controller

      loader({ ...bounds, limit: visiblePlaceLimit(map, placeLimit), signal: controller.signal })
        .then((places = []) => {
          if (controller.signal.aborted) return
          const loadedPlaces = Array.isArray(places) ? places : []
          const loadedKeys = new Set(loadedPlaces.map((place) => `${place.externalSource || 'INTERNAL'}:${place.id}`))
          rawPlacesRef.current = [
            ...loadedPlaces,
            ...expandedClusterPlacesRef.current.filter((place) => !loadedKeys.has(`${place.externalSource || 'INTERNAL'}:${place.id}`)),
          ]
          onPlacesChangeRef.current?.(rawPlacesRef.current)
          renderPlaceOverlays(map, rawPlacesRef.current)
          focusPlace(map, focusedPlaceKeyRef.current)
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
    const resizeObserver = typeof ResizeObserver !== 'undefined' && targetRef.current
      ? new ResizeObserver(() => {
        map.updateSize()
        map.render()
        if (pendingPlaceFitRef.current) renderPlaceOverlays(map, rawPlacesRef.current)
        if (navigationModeRef.current && followCameraRef.current) animateNavigationCamera({ force: true })
      })
      : null
    resizeObserver?.observe(targetRef.current)
    const firstFrame = requestAnimationFrame(() => { map.updateSize(); map.render() })

    return () => {
      cancelRouteDraw()
      map.getView().cancelAnimations()
      map.un('postrender', loadViewportData)
      map.un('moveend', loadViewportData)
      if (interactive) map.un('singleclick', handleCongestionAreaClick)
      if (loadVisiblePlacesRef.current === loadVisiblePlaces) loadVisiblePlacesRef.current = null
      placeAbortRef.current?.abort()
      clearPlaceOverlays(map)
      crowdingRequestRef.current.abort()
      if (crowdingSlotTimerId !== null) globalThis.clearTimeout(crowdingSlotTimerId)
      document.removeEventListener('visibilitychange', handleCrowdingVisibility)
      resizeObserver?.disconnect()
      cancelAnimationFrame(firstFrame)
      if (congestionAreaLayerRef.current === congestionAreaLayer) congestionAreaLayerRef.current = null
      if (mapDimLayerRef.current === mapDimLayer) mapDimLayerRef.current = null
      if (routeLayerRef.current === routeLayer) routeLayerRef.current = null
      if (routeGlowLayerRef.current === routeGlowLayer) routeGlowLayerRef.current = null
      if (ghostLayerRef.current === ghostLayer) ghostLayerRef.current = null
      if (ghostHighlightLayerRef.current === ghostHighlightLayer) ghostHighlightLayerRef.current = null
      if (sparkOverlayRef.current === sparkOverlay) sparkOverlayRef.current = null
      map.removeLayer(congestionAreaLayer)
      map.removeLayer(mapDimLayer)
      map.removeLayer(routeLayer)
      map.removeLayer(ghostLayer)
      map.removeLayer(ghostHighlightLayer)
      map.removeLayer(routeGlowLayer)
      map.removeOverlay(sparkOverlay)
      source.un('tileloaderror', handleTileError)
      source.un('tileloadend', handleTileSuccess)
      map.setTarget(undefined)
      mapRef.current = null
      fittedRouteKeyRef.current = ''
      pendingPlaceFitRef.current = true
      pendingMarkerEntranceRef.current = true
      routeDrawRef.current.key = ''
      appliedRouteShapeRef.current = ''
      appliedGhostShapeRef.current = ''
      readyRouteShapeRef.current = ''
    }
  }, [apiKey, interactive, Boolean(loadPlacesInBounds), Boolean(loadCongestionInBounds), placeLimit, clusterPlaces, fitPlaceMarkers])

  useEffect(() => {
    navigationObservationRef.current = {
      coordinate: userLocation,
      heading: userHeading,
      speed: userSpeed,
      accuracy: userLocationAccuracy,
    }
    if (navigationMode && followCameraRef.current) animateNavigationCamera()
  }, [
    mapVersion,
    navigationMode,
    userLocation?.[0],
    userLocation?.[1],
    userHeading,
    userSpeed,
    userLocationAccuracy,
  ])

  useEffect(() => {
    navigationModeRef.current = navigationMode
    if (navigationMode) {
      followCameraRef.current = true
      setFollowCameraActive(true)
      animateNavigationCamera({ force: true })
      return
    }

    followCameraRef.current = false
    setFollowCameraActive(false)
    navigationFixRef.current = null
    navigationHeadingRef.current = null
    const view = mapRef.current?.getView()
    if (!view) return
    view.cancelAnimations()
    view.animate({
      rotation: 0,
      duration: motionDuration(NAVIGATION_CAMERA_DURATION),
      easing: easeOut,
    })
  }, [mapVersion, navigationMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !interactive) return undefined
    const viewport = map.getViewport()
    const suspendFollowCamera = () => {
      if (!navigationModeRef.current || !followCameraRef.current) return
      map.getView().cancelAnimations()
      followCameraRef.current = false
      setFollowCameraActive(false)
    }
    const suspendForPinch = (event) => {
      if (event.touches?.length > 1) suspendFollowCamera()
    }
    map.on('pointerdrag', suspendFollowCamera)
    viewport.addEventListener('wheel', suspendFollowCamera, { passive: true })
    viewport.addEventListener('dblclick', suspendFollowCamera)
    viewport.addEventListener('touchstart', suspendForPinch, { passive: true })
    return () => {
      map.un('pointerdrag', suspendFollowCamera)
      viewport.removeEventListener('wheel', suspendFollowCamera)
      viewport.removeEventListener('dblclick', suspendFollowCamera)
      viewport.removeEventListener('touchstart', suspendForPinch)
    }
  }, [mapVersion, interactive])

  function cancelRouteDraw() {
    const state = routeDrawRef.current
    if (state.frame) cancelAnimationFrame(state.frame)
    if (state.timer) clearTimeout(state.timer)
    state.frame = 0
    state.timer = null
    state.arrivalTimers.forEach((timer) => clearTimeout(timer))
    state.arrivalTimers = []
    sparkOverlayRef.current?.setPosition(undefined)
  }

  function popMarkerOnArrival(element) {
    if (!element || prefersReducedMotion()) return
    element.classList.remove('is-arrived')
    void element.offsetWidth
    element.classList.add('is-arrived')
    const timer = setTimeout(() => element.classList.remove('is-arrived'), MARKER_ARRIVAL_DURATION)
    routeDrawRef.current.arrivalTimers.push(timer)
  }

  function collectArrivalTargets(map) {
    return placeOverlaysRef.current.map((overlay) => ({
      element: overlay.getElement(),
      position: overlay.getPosition(),
    })).filter((target) => target.element && Array.isArray(target.position))
      .map((target) => ({ ...target, position: target.position.slice() }))
  }

  function playRouteGlow(paths) {
    const layer = routeGlowLayerRef.current
    const source = layer?.getSource()
    if (!layer || !source || prefersReducedMotion()) {
      layer?.setOpacity(0)
      source?.clear()
      return
    }
    source.clear()
    source.addFeatures(paths.filter((path) => path.length >= 2).map((path) => new Feature({ geometry: new LineString(path) })))
    const startedAt = performance.now()
    const step = (now) => {
      const progress = Math.min(1, (now - startedAt) / ROUTE_GLOW_DURATION)
      layer.setOpacity(progress < 0.3 ? (progress / 0.3) * 0.75 : 0.75 * (1 - (progress - 0.3) / 0.7))
      if (progress < 1) requestAnimationFrame(step)
      else {
        layer.setOpacity(0)
        source.clear()
      }
    }
    requestAnimationFrame(step)
  }

  function playRouteDraw(features, delay, map) {
    cancelRouteDraw()
    const paths = features.map((feature) => feature.getGeometry()?.getCoordinates() || [])
    const lengths = paths.map(lineStringLength)
    const total = lengths.reduce((sum, length) => sum + length, 0)
    const finish = (notify = true) => {
      paths.forEach((path, index) => features[index].getGeometry()?.setCoordinates(path))
      features.forEach((feature) => feature.set('drawing', false, false))
      routeLayerRef.current?.changed()
      sparkOverlayRef.current?.setPosition(undefined)
      ghostLayerRef.current?.setOpacity(GHOST_ROUTE_FADED_OPACITY)
      if (notify) onRouteDrawEndRef.current?.()
    }
    if (!(total > 0)) {
      features.forEach((feature) => feature.set('drawing', false, false))
      return
    }
    if (prefersReducedMotion()) {
      finish()
      return
    }
    ghostLayerRef.current?.setOpacity(ghostRouteLegs?.length ? 1 : 0)
    features.forEach((feature) => {
      feature.set('drawing', true, false)
      feature.getGeometry()?.setCoordinates([])
    })
    const start = () => {
      const startedAt = performance.now()
      const pending = collectArrivalTargets(map)
      const arrivalRadius = MARKER_ARRIVAL_RADIUS_PX * (map.getView().getResolution() || 1)
      const step = (now) => {
        const progress = Math.min(1, (now - startedAt) / ROUTE_DRAW_DURATION)
        const eased = easeOut(progress)
        let drawn = eased * total
        let head = null
        paths.forEach((path, index) => {
          const length = lengths[index]
          const ratio = length > 0 ? Math.max(0, Math.min(1, drawn / length)) : (drawn > 0 ? 1 : 0)
          const partial = partialLineString(path, ratio)
          features[index].getGeometry()?.setCoordinates(partial || [])
          if (partial && ratio > 0) head = partial[partial.length - 1]
          drawn -= length
        })
        if (head) {
          sparkOverlayRef.current?.setPosition(head)
          for (let index = pending.length - 1; index >= 0; index -= 1) {
            const target = pending[index]
            if (Math.hypot(head[0] - target.position[0], head[1] - target.position[1]) > arrivalRadius) continue
            pending.splice(index, 1)
            popMarkerOnArrival(target.element)
          }
        }
        ghostLayerRef.current?.setOpacity(1 - (1 - GHOST_ROUTE_FADED_OPACITY) * eased)
        if (progress < 1) routeDrawRef.current.frame = requestAnimationFrame(step)
        else {
          routeDrawRef.current.frame = 0
          finish()
          playRouteGlow(paths)
        }
      }
      routeDrawRef.current.frame = requestAnimationFrame(step)
    }
    if (delay > 0) routeDrawRef.current.timer = setTimeout(start, delay)
    else start()
  }

  useEffect(() => {
    const layer = routeLayerRef.current
    if (!layer) return
    const shapeKey = JSON.stringify([routeMode, (routeLegs || []).map((leg) => [leg?.mode, leg?.geometry?.coordinates || null])])
    const source = layer.getSource()
    const shapeChanged = appliedRouteShapeRef.current !== shapeKey
    if (shapeChanged) {
      appliedRouteShapeRef.current = shapeKey
      source.clear()
      const features = routeLegFeatureSpecs(routeLegs, fromLonLat).map((spec, routeSequence) => {
        const feature = new Feature({ geometry: new LineString(spec.coordinates) })
        feature.setProperties({ mode: spec.mode || routeMode, routeName: spec.routeName, routeSequence }, false)
        return feature
      })
      source.addFeatures(features)
      layer.changed()
    }
    const features = orderRouteFeaturesBySequence(source.getFeatures())
    if (features.length > 0 && readyRouteShapeRef.current !== shapeKey) {
      mapRef.current?.renderSync()
      readyRouteShapeRef.current = shapeKey
      onRouteReadyRef.current?.()
    }
    const key = routeDrawKey || routeFitKey
    const transition = routeDrawTransition(routeDrawRef.current.key, key, shapeChanged)
    if (transition === 'cancel') {
      routeDrawRef.current.key = ''
      cancelRouteDraw()
      return
    }
    if (transition === 'keep') return
    if (transition === 'replace') {
      cancelRouteDraw()
      return
    }
    routeDrawRef.current.key = key
    playRouteDraw(features, routeDrawDelay, mapRef.current)
  }, [routeLegs, routeMode, routeDrawKey, routeFitKey, routeDrawDelay])

  useEffect(() => {
    const layer = routeHighlightLayerRef.current
    if (!layer) return
    const source = layer.getSource()
    source.clear()
    source.addFeatures(routeLegFeatureSpecs(routeHighlightLegs, fromLonLat).map((spec) => new Feature({
      geometry: new LineString(spec.coordinates),
    })))
    layer.changed()
  }, [routeHighlightLegs])

  useEffect(() => {
    const layer = ghostLayerRef.current
    const highlightLayer = ghostHighlightLayerRef.current
    if (!layer || !highlightLayer) return
    const shapeKey = JSON.stringify([
      (ghostRouteLegs || []).map((leg) => leg?.geometry?.coordinates || null),
      (ghostHighlightLegs || []).map((leg) => leg?.geometry?.coordinates || null),
    ])
    if (appliedGhostShapeRef.current === shapeKey) return
    appliedGhostShapeRef.current = shapeKey
    layer.getSource().clear()
    highlightLayer.getSource().clear()
    const add = (target, legs) => target.getSource().addFeatures(routeLegFeatureSpecs(legs, fromLonLat).map((spec) => new Feature({ geometry: new LineString(spec.coordinates) })))
    add(layer, ghostRouteLegs)
    add(highlightLayer, ghostHighlightLegs)
    layer.setOpacity(ghostRouteLegs?.length ? GHOST_ROUTE_FADED_OPACITY : 0)
    layer.changed()
    highlightLayer.changed()
  }, [ghostRouteLegs, ghostHighlightLegs])

  useEffect(() => {
    const map = mapRef.current
    const layer = routeLayerRef.current
    if (!map || !layer) return

    if (!routeFitKey) {
      fittedRouteKeyRef.current = ''
      return
    }
    if (fittedRouteKeyRef.current === routeFitKey) return

    const applyFit = () => {
      const size = map.getSize()
      if (!size || !size[0] || !size[1]) return false
      const extents = layer.getSource().getFeatures()
        .map((feature) => feature.getGeometry()?.getExtent())
        .filter((extent) => Array.isArray(extent) && extent.length === 4 && extent.every(Number.isFinite))
      const fitPoints = routeFitPointCoordinates(routeFitCoordinates, fromLonLat)
      if (fitPoints.length) extents.push(boundingExtent(fitPoints))
      if (!extents.length) return false
      const extent = extents.reduce((combined, current) => [
        Math.min(combined[0], current[0]),
        Math.min(combined[1], current[1]),
        Math.max(combined[2], current[2]),
        Math.max(combined[3], current[3]),
      ], extents[0])
      if (!extent.every(Number.isFinite)) return false
      map.getView().fit(extent, {
        size,
        padding: routeFitPadding,
        maxZoom: 17,
        duration: motionDuration(resolveRouteFitDuration()),
        easing: easeOut,
      })
      fittedRouteKeyRef.current = routeFitKey
      return true
    }
    if (applyFit()) return undefined
    const retryFit = () => { if (applyFit()) map.un('rendercomplete', retryFit) }
    map.on('rendercomplete', retryFit)
    map.render()
    return () => map.un('rendercomplete', retryFit)
  }, [routeFitCoordinates, routeFitKey, routeLegs, routeFitPadding])

  useEffect(() => {
    congestionAreaLayerRef.current?.setVisible(showCongestionAreas)
    showCongestionAreasRef.current = showCongestionAreas
  }, [showCongestionAreas])

  useEffect(() => {
    mapDimLayerRef.current?.setVisible(mapDimmed)
  }, [mapDimmed])

  useEffect(() => {
    if (lastPlaceRequestKeyRef.current === placeRequestKey) return
    lastPlaceRequestKeyRef.current = placeRequestKey
    expandedClusterPlacesRef.current = []
    preserveClusterExpansionOnNextLoadRef.current = false
    pendingPlaceFitRef.current = true
    pendingMarkerEntranceRef.current = true
    loadVisiblePlacesRef.current?.()
  }, [placeRequestKey])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    pendingMarkerEntranceRef.current = true
    pendingPlaceFitRef.current = true
    renderPlaceOverlays(map, rawPlacesRef.current)
  }, [placeMarkerFilterKey])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    renderPlaceOverlays(map, rawPlacesRef.current)
  }, [selectedPlaceKey, placeMarkerEntrance])

  useEffect(() => {
    focusPlace(mapRef.current, focusedPlaceKey)
  }, [focusedPlaceKey])

  useEffect(() => {
    const view = mapRef.current?.getView()
    if (!view || !hasExplicitCenter) return

    view.setCenter(fromLonLat([longitude, latitude]))
    view.setZoom(safeZoom)
  }, [longitude, latitude, safeZoom, hasExplicitCenter])

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
      {navigationMode && (
        <NavigationLocationButton
          following={followCameraActive}
          disabled={!Array.isArray(liveUserLocation) || liveUserLocation.length < 2}
          onClick={resumeNavigationCamera}
        />
      )}
      {statusMessage && (
        <div className="vworld-map__fallback" role="status">
          <span>{statusMessage}</span>
        </div>
      )}
    </VWorldMapRegion>
  )
}
