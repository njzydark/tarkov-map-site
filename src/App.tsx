import { Dialog, Slider, Tooltip } from '@base-ui/react';
import {
  Expand,
  Focus,
  ImageMinus,
  ImageUpscale,
  Map as MapIcon,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MapItem, maps } from './maps';
import { loadPreferences, savePreferences, ViewerPreferences } from './preferences';

type Transform = { fitScale: number; scale: number; x: number; y: number };
type Point = { x: number; y: number };
type Quality = 'preview' | 'original';
type OriginalMode = 'preferred' | 'manual';
type Layer = {
  token: number;
  map: MapItem;
  src: string;
  quality: Quality;
  preserveView: boolean;
  originalMode?: OriginalMode;
};
type Gesture =
  | { type: 'pan'; pointer: Point; origin: Point }
  | { type: 'pinch'; distance: number; scale: number; center: Point; origin: Point };
type ZoomControlsHandle = { sync: (value: number) => void };
type TrackpadGestureEvent = Event & { clientX: number; clientY: number; scale: number };
type TrackpadGesture = { percent: number; point: Point };

const MIN_ZOOM = 100;
const MAX_ZOOM = 800;
const warmedPreviews = new Set<string>();

function initialMap(preferences: ViewerPreferences): MapItem {
  const id = decodeURIComponent(location.hash.slice(1));
  return maps.find((map) => map.id === id)
    ?? maps.find((map) => map.id === preferences.lastMapId)
    ?? maps[0];
}

function warmPreview(map: MapItem) {
  if (warmedPreviews.has(map.preview)) return;
  warmedPreviews.add(map.preview);
  const image = new Image();
  image.decoding = 'async';
  image.src = map.preview;
}

function mapLayer(map: MapItem, token: number, preferences: ViewerPreferences): Layer {
  const prefersOriginal = preferences.originalMapIds.includes(map.id);
  return {
    token,
    map,
    src: prefersOriginal ? map.original : map.preview,
    quality: prefersOriginal ? 'original' : 'preview',
    preserveView: false,
    originalMode: prefersOriginal ? 'preferred' : undefined,
  };
}

function IconButton({
  label,
  children,
  className = '',
  disabled,
  onClick,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        aria-label={label}
        className={`hud-icon ${className}`}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8}>
          <Tooltip.Popup className="tooltip-popup">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const MapList = memo(function MapList({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (map: MapItem) => void;
}) {
  const groups = useMemo(() => {
    const result = new Map<string, MapItem[]>();
    maps.forEach((map) => result.set(map.group, [...(result.get(map.group) ?? []), map]));
    return result;
  }, []);

  return (
    <nav className="map-list" aria-label="地图列表">
      {[...groups.entries()].map(([group, items]) => (
        <section className="map-group" key={group}>
          <h2>{group}</h2>
          {items.map((map) => (
            <button
              className="map-option"
              aria-current={map.id === activeId}
              key={map.id}
              onClick={() => onSelect(map)}
              onFocus={() => warmPreview(map)}
              onPointerEnter={() => warmPreview(map)}
              type="button"
            >
              <img src={map.thumbnail} alt="" loading="lazy" decoding="async" />
              <span className="map-option-copy">
                <strong>{map.title}</strong>
                <small>{map.width} × {map.height}</small>
              </span>
            </button>
          ))}
        </section>
      ))}
    </nav>
  );
});

function MapDrawer({ activeId, onSelect }: { activeId: string; onSelect: (map: MapItem) => void }) {
  return (
    <div className="drawer-inner">
      <header className="drawer-header">
        <div className="drawer-symbol"><MapIcon size={19} /></div>
        <div>
          <p>MAP ARCHIVE</p>
          <h1>选择地图</h1>
          <span>17 张战术地图</span>
        </div>
        <Dialog.Close className="drawer-close" aria-label="关闭地图导航">
          <X size={18} />
        </Dialog.Close>
      </header>
      <MapList activeId={activeId} onSelect={onSelect} />
    </div>
  );
}

const ZoomControls = forwardRef<ZoomControlsHandle, {
  onChange: (value: number) => void;
  onReset: () => void;
}>(function ZoomControls({ onChange, onReset }, ref) {
  const [value, setValue] = useState(100);
  const update = (next: number) => {
    const normalized = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next)));
    setValue(normalized);
    onChange(normalized);
  };

  useImperativeHandle(ref, () => ({ sync: (next) => setValue(Math.round(next)) }), []);

  return (
    <section
      className="zoom-dock hud"
      aria-label="缩放控制"
      data-viewer-control
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <button className="zoom-step" aria-label="缩小" onClick={() => update(value - 25)} type="button">
        <Minus size={15} />
      </button>
      <Slider.Root
        aria-label="地图缩放比例"
        className="zoom-slider"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={10}
        value={value}
        onValueChange={(next) => update(next as number)}
      >
        <Slider.Control className="slider-control">
          <Slider.Track className="slider-track">
            <Slider.Indicator className="slider-indicator" />
            <Slider.Thumb className="slider-thumb" />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <label className="zoom-value">
        <input
          aria-label="输入缩放比例"
          type="number"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={10}
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => update(Number(event.target.value))}
        />
        <span>%</span>
      </label>
      <button className="zoom-step" aria-label="放大" onClick={() => update(value + 25)} type="button">
        <Plus size={15} />
      </button>
      <span className="dock-divider" />
      <button className="fit-button" onClick={onReset} type="button">
        <Focus size={15} />
        <span>适屏</span>
      </button>
    </section>
  );
});

export function App() {
  const initialPreferences = useMemo(loadPreferences, []);
  const initialMobile = useMemo(() => matchMedia('(max-width: 760px)').matches, []);
  const firstMap = useMemo(() => initialMap(initialPreferences), [initialPreferences]);
  const appRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const layerElementsRef = useRef(new Map<number, HTMLImageElement>());
  const currentRef = useRef<Layer | null>(null);
  const transformRef = useRef<Transform>({ fitScale: 1, scale: 1, x: 0, y: 0 });
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  const trackpadGestureRef = useRef<TrackpadGesture | null>(null);
  const tokenRef = useRef(1);
  const hudTimerRef = useRef<number | null>(null);
  const zoomFrameRef = useRef<number | null>(null);
  const persistViewTimerRef = useRef<number | null>(null);
  const loadingTimerRef = useRef<number | null>(null);
  const zoomControlsRef = useRef<ZoomControlsHandle>(null);
  const preferencesRef = useRef(initialPreferences);

  const [activeMap, setActiveMap] = useState(firstMap);
  const [quality, setQuality] = useState<Quality>('preview');
  const [current, setCurrent] = useState<Layer | null>(null);
  const [outgoing, setOutgoing] = useState<Layer | null>(null);
  const [pending, setPending] = useState<Layer | null>(() => (
    mapLayer(firstMap, 1, initialPreferences)
  ));
  const [loading, setLoading] = useState(() => !initialPreferences.originalMapIds.includes(firstMap.id));
  const [loadingText, setLoadingText] = useState(() => (
    initialPreferences.originalMapIds.includes(firstMap.id)
      ? `正在恢复 ${firstMap.title} 高清原图`
      : `正在载入 ${firstMap.title}`
  ));
  const [toast, setToast] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(initialMobile);

  currentRef.current = current;

  const calculateFit = useCallback((map: MapItem): Transform => {
    const viewer = viewerRef.current;
    if (!viewer) return { fitScale: 1, scale: 1, x: 0, y: 0 };
    const width = viewer.clientWidth;
    const height = viewer.clientHeight;
    const edge = isMobile ? 10 : 28;
    const top = isMobile ? 66 : 56;
    const bottom = isMobile ? 76 : 66;
    const usableWidth = Math.max(100, width - edge * 2);
    const usableHeight = Math.max(100, height - top - bottom);
    const fitScale = Math.min(usableWidth / map.width, usableHeight / map.height);
    return {
      fitScale,
      scale: fitScale,
      x: (width - map.width * fitScale) / 2,
      y: top + (usableHeight - map.height * fitScale) / 2,
    };
  }, [isMobile]);

  const updatePreferences = useCallback((update: (current: ViewerPreferences) => ViewerPreferences) => {
    const next = update(preferencesRef.current);
    preferencesRef.current = next;
    savePreferences(next);
  }, []);

  const constrain = useCallback((next: Transform, map: MapItem): Transform => {
    const viewer = viewerRef.current;
    if (!viewer) return next;
    const width = viewer.clientWidth;
    const height = viewer.clientHeight;
    const imageWidth = map.width * next.scale;
    const imageHeight = map.height * next.scale;
    const visible = Math.min(100, Math.max(44, Math.min(width, height) * 0.12));
    const x = imageWidth <= width
      ? (width - imageWidth) / 2
      : Math.min(width - visible, Math.max(visible - imageWidth, next.x));
    const y = imageHeight <= height
      ? (height - imageHeight) / 2
      : Math.min(height - visible, Math.max(visible - imageHeight, next.y));
    return { ...next, x, y };
  }, []);

  const applyTransform = useCallback((next: Transform, layer = currentRef.current) => {
    if (!layer) return;
    transformRef.current = next;
    const element = layerElementsRef.current.get(layer.token);
    if (element) element.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.scale})`;
  }, []);

  const captureView = useCallback((map: MapItem, transform: Transform) => {
    const viewer = viewerRef.current;
    if (!viewer) return null;
    return {
      zoom: Math.round(transform.scale / transform.fitScale * 100),
      centerX: (viewer.clientWidth / 2 - transform.x) / transform.scale,
      centerY: (viewer.clientHeight / 2 - transform.y) / transform.scale,
    };
  }, []);

  const persistView = useCallback((map: MapItem, transform = transformRef.current, immediate = false) => {
    if (persistViewTimerRef.current !== null) clearTimeout(persistViewTimerRef.current);
    const commit = () => {
      const view = captureView(map, transform);
      if (!view) return;
      updatePreferences((currentPreferences) => ({
        ...currentPreferences,
        views: { ...currentPreferences.views, [map.id]: view },
      }));
    };
    if (immediate) commit();
    else persistViewTimerRef.current = window.setTimeout(commit, 240);
  }, [captureView, updatePreferences]);

  const restoreView = useCallback((map: MapItem): Transform => {
    const fit = calculateFit(map);
    const saved = preferencesRef.current.views[map.id];
    const viewer = viewerRef.current;
    if (!saved || !viewer) return fit;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, saved.zoom));
    const scale = fit.fitScale * zoom / 100;
    return constrain({
      fitScale: fit.fitScale,
      scale,
      x: viewer.clientWidth / 2 - saved.centerX * scale,
      y: viewer.clientHeight / 2 - saved.centerY * scale,
    }, map);
  }, [calculateFit, constrain]);

  const syncZoom = useCallback((value: number) => {
    if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current);
    zoomFrameRef.current = requestAnimationFrame(() => zoomControlsRef.current?.sync(value));
  }, []);

  const resetView = useCallback((map = activeMap) => {
    const next = calculateFit(map);
    applyTransform(next);
    syncZoom(100);
    persistView(map, next, true);
  }, [activeMap, applyTransform, calculateFit, persistView, syncZoom]);

  const zoomAt = useCallback((percent: number, point?: Point) => {
    const layer = currentRef.current;
    const viewer = viewerRef.current;
    if (!layer || !viewer) return;
    const currentTransform = transformRef.current;
    const rect = viewer.getBoundingClientRect();
    const anchor = point ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const localX = anchor.x - rect.left;
    const localY = anchor.y - rect.top;
    const mapX = (localX - currentTransform.x) / currentTransform.scale;
    const mapY = (localY - currentTransform.y) / currentTransform.scale;
    const normalized = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, percent));
    const scale = currentTransform.fitScale * normalized / 100;
    const next = constrain({
      ...currentTransform,
      scale,
      x: localX - mapX * scale,
      y: localY - mapY * scale,
    }, layer.map);
    applyTransform(next, layer);
    syncZoom(normalized);
    persistView(layer.map, next);
  }, [applyTransform, constrain, persistView, syncZoom]);

  const wakeHud = useCallback(() => {
    const app = appRef.current;
    if (!app) return;
    app.classList.add('hud-awake');
    if (hudTimerRef.current !== null) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = window.setTimeout(() => {
      if (!drawerOpen) app.classList.remove('hud-awake');
    }, 2600);
  }, [drawerOpen]);

  const changeDrawerOpen = useCallback((open: boolean) => {
    setDrawerOpen(open);
  }, []);

  const beginLoading = useCallback((text: string, deferred = false) => {
    if (loadingTimerRef.current !== null) clearTimeout(loadingTimerRef.current);
    setLoadingText(text);
    if (!deferred) {
      setLoading(true);
      return;
    }
    setLoading(false);
    loadingTimerRef.current = window.setTimeout(() => setLoading(true), 450);
  }, []);

  const finishLoading = useCallback(() => {
    if (loadingTimerRef.current !== null) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = null;
    setLoading(false);
  }, []);

  useEffect(() => {
    if (pending?.originalMode === 'preferred') {
      beginLoading(`正在恢复 ${pending.map.title} 高清原图`, true);
    }
  }, []);

  const requestMap = useCallback((map: MapItem) => {
    if (currentRef.current?.map.id === map.id) {
      changeDrawerOpen(false);
      return;
    }
    if (currentRef.current) persistView(currentRef.current.map, transformRef.current, true);
    const token = ++tokenRef.current;
    const layer = mapLayer(map, token, preferencesRef.current);
    setPending(layer);
    beginLoading(layer.originalMode === 'preferred'
      ? `正在恢复 ${map.title} 高清原图`
      : `正在载入 ${map.title}`, layer.originalMode === 'preferred');
    changeDrawerOpen(false);
  }, [beginLoading, changeDrawerOpen, persistView]);

  const toggleQuality = useCallback(() => {
    if (!current || pending?.preserveView) return;
    const nextQuality: Quality = quality === 'original' ? 'preview' : 'original';
    const token = ++tokenRef.current;
    setPending({
      token,
      map: current.map,
      src: nextQuality === 'original' ? current.map.original : current.map.preview,
      quality: nextQuality,
      preserveView: true,
      originalMode: nextQuality === 'original' ? 'manual' : undefined,
    });
    beginLoading(nextQuality === 'original' ? '正在载入高清原图' : '正在切换快速预览');
  }, [beginLoading, current, pending?.preserveView, quality]);

  const handleLayerLoad = useCallback(async (layer: Layer, element: HTMLImageElement) => {
    try {
      await element.decode();
    } catch {
      // onLoad confirms the resource is ready even when decode is unsupported.
    }
    if (layer.token !== tokenRef.current) return;

    const nextTransform = layer.preserveView ? transformRef.current : restoreView(layer.map);
    element.style.transform = `translate3d(${nextTransform.x}px, ${nextTransform.y}px, 0) scale(${nextTransform.scale})`;

    const previous = currentRef.current;
    setOutgoing(previous);
    setCurrent(layer);
    currentRef.current = layer;
    transformRef.current = nextTransform;
    setPending(null);
    setActiveMap(layer.map);
    setQuality(layer.quality);
    finishLoading();
    history.replaceState(null, '', `#${layer.map.id}`);
    syncZoom(Math.round((nextTransform.scale / nextTransform.fitScale) * 100));
    updatePreferences((currentPreferences) => ({
      ...currentPreferences,
      lastMapId: layer.map.id,
      originalMapIds: layer.quality === 'original'
        ? [...new Set([...currentPreferences.originalMapIds, layer.map.id])]
        : currentPreferences.originalMapIds.filter((mapId) => mapId !== layer.map.id),
    }));

    window.setTimeout(() => {
      setOutgoing((candidate) => candidate?.token === previous?.token ? null : candidate);
    }, 180);

    const index = maps.findIndex((map) => map.id === layer.map.id);
    const warm = () => {
      if (maps[index - 1]) warmPreview(maps[index - 1]);
      if (maps[index + 1]) warmPreview(maps[index + 1]);
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 1800 });
    else globalThis.setTimeout(warm, 700);
  }, [finishLoading, restoreView, syncZoom, updatePreferences]);

  const handleLayerError = useCallback((layer: Layer) => {
    if (layer.token !== tokenRef.current) return;
    if (layer.quality === 'original' && layer.originalMode === 'preferred') {
      updatePreferences((currentPreferences) => ({
        ...currentPreferences,
        originalMapIds: currentPreferences.originalMapIds.filter((mapId) => mapId !== layer.map.id),
      }));
      const token = ++tokenRef.current;
      setPending({
        token,
        map: layer.map,
        src: layer.map.preview,
        quality: 'preview',
        preserveView: false,
      });
      beginLoading(`高清原图不可用，正在载入 ${layer.map.title} 预览`);
      return;
    }
    setPending(null);
    finishLoading();
    setToast(layer.quality === 'original'
      ? '高清原图加载失败，已继续保留预览图。'
      : '地图预览加载失败，已继续保留当前地图。');
  }, [beginLoading, finishLoading, updatePreferences]);

  useEffect(() => {
    const media = matchMedia('(max-width: 760px)');
    const update = () => {
      setIsMobile(media.matches);
      if (media.matches) setDrawerOpen(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const observer = new ResizeObserver(() => {
      if (!currentRef.current) return;
      const next = restoreView(currentRef.current.map);
      applyTransform(next);
      syncZoom(next.scale / next.fitScale * 100);
    });
    observer.observe(viewer);
    return () => observer.disconnect();
  }, [applyTransform, restoreView, syncZoom]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const index = maps.findIndex((map) => map.id === activeMap.id);
        const delta = event.key === 'ArrowLeft' ? -1 : 1;
        requestMap(maps[(index + delta + maps.length) % maps.length]);
      }
      if (event.key === '0') {
        event.preventDefault();
        resetView();
      }
      if (event.key.toLowerCase() === 'm') changeDrawerOpen(!drawerOpen);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMap.id, changeDrawerOpen, drawerOpen, requestMap, resetView]);

  useEffect(() => {
    const onHashChange = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const map = maps.find((candidate) => candidate.id === id);
      if (map && map.id !== currentRef.current?.map.id) requestMap(map);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [requestMap]);

  useEffect(() => {
    wakeHud();
    return () => {
      if (hudTimerRef.current !== null) clearTimeout(hudTimerRef.current);
      if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current);
      if (persistViewTimerRef.current !== null) clearTimeout(persistViewTimerRef.current);
      if (loadingTimerRef.current !== null) clearTimeout(loadingTimerRef.current);
    };
  }, [wakeHud]);

  useEffect(() => {
    const saveCurrentView = () => {
      if (currentRef.current) persistView(currentRef.current.map, transformRef.current, true);
    };
    window.addEventListener('pagehide', saveCurrentView);
    return () => window.removeEventListener('pagehide', saveCurrentView);
  }, [persistView]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const isViewerControl = (target: EventTarget | null) => (
      target instanceof Element && Boolean(target.closest('[data-viewer-control]'))
    );
    const onWheel = (event: WheelEvent) => {
      if (isViewerControl(event.target)) return;
      if (event.cancelable) event.preventDefault();
      wakeHud();
      const transform = transformRef.current;
      const percent = transform.scale / transform.fitScale * 100;
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
      const sensitivity = event.ctrlKey ? 0.009 : 0.00135;
      zoomAt(percent * Math.exp(-delta * sensitivity), { x: event.clientX, y: event.clientY });
    };
    const onGestureStart = (rawEvent: Event) => {
      const event = rawEvent as TrackpadGestureEvent;
      if (isViewerControl(event.target)) return;
      if (event.cancelable) event.preventDefault();
      const transform = transformRef.current;
      trackpadGestureRef.current = {
        percent: transform.scale / transform.fitScale * 100,
        point: { x: event.clientX, y: event.clientY },
      };
      wakeHud();
    };
    const onGestureChange = (rawEvent: Event) => {
      const event = rawEvent as TrackpadGestureEvent;
      const gesture = trackpadGestureRef.current;
      if (!gesture) return;
      if (event.cancelable) event.preventDefault();
      zoomAt(gesture.percent * event.scale, {
        x: Number.isFinite(event.clientX) ? event.clientX : gesture.point.x,
        y: Number.isFinite(event.clientY) ? event.clientY : gesture.point.y,
      });
    };
    const onGestureEnd = (event: Event) => {
      if (!trackpadGestureRef.current) return;
      if (event.cancelable) event.preventDefault();
      trackpadGestureRef.current = null;
      if (currentRef.current) persistView(currentRef.current.map, transformRef.current);
    };

    viewer.addEventListener('wheel', onWheel, { passive: false });
    viewer.addEventListener('gesturestart', onGestureStart, { passive: false });
    viewer.addEventListener('gesturechange', onGestureChange, { passive: false });
    viewer.addEventListener('gestureend', onGestureEnd, { passive: false });
    return () => {
      viewer.removeEventListener('wheel', onWheel);
      viewer.removeEventListener('gesturestart', onGestureStart);
      viewer.removeEventListener('gesturechange', onGestureChange);
      viewer.removeEventListener('gestureend', onGestureEnd);
    };
  }, [persistView, wakeHud, zoomAt]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('[data-viewer-control]')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add('is-dragging');
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const transform = transformRef.current;
    if (pointersRef.current.size === 1) {
      gestureRef.current = { type: 'pan', pointer: { x: event.clientX, y: event.clientY }, origin: { x: transform.x, y: transform.y } };
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      gestureRef.current = {
        type: 'pinch',
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        scale: transform.scale,
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        origin: { x: transform.x, y: transform.y },
      };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    wakeHud();
    if (!pointersRef.current.has(event.pointerId) || !gestureRef.current || !currentRef.current) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    const transform = transformRef.current;
    if (pointersRef.current.size === 1 && gesture.type === 'pan') {
      applyTransform(constrain({
        ...transform,
        x: gesture.origin.x + event.clientX - gesture.pointer.x,
        y: gesture.origin.y + event.clientY - gesture.pointer.y,
      }, currentRef.current.map));
    } else if (pointersRef.current.size === 2 && gesture.type === 'pinch') {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const [a, b] = [...pointersRef.current.values()];
      const rect = viewer.getBoundingClientRect();
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const initialX = gesture.center.x - rect.left;
      const initialY = gesture.center.y - rect.top;
      const mapX = (initialX - gesture.origin.x) / gesture.scale;
      const mapY = (initialY - gesture.origin.y) / gesture.scale;
      const scale = Math.min(transform.fitScale * 8, Math.max(transform.fitScale, gesture.scale * distance / Math.max(1, gesture.distance)));
      const next = constrain({
        fitScale: transform.fitScale,
        scale,
        x: center.x - rect.left - mapX * scale,
        y: center.y - rect.top - mapY * scale,
      }, currentRef.current.map);
      applyTransform(next);
      syncZoom(scale / transform.fitScale * 100);
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      event.currentTarget.classList.remove('is-dragging');
      if (currentRef.current) persistView(currentRef.current.map, transformRef.current);
      return;
    }
    const point = [...pointersRef.current.values()][0];
    const transform = transformRef.current;
    gestureRef.current = { type: 'pan', pointer: point, origin: { x: transform.x, y: transform.y } };
  };

  const layers = [outgoing, current, pending].filter((layer, index, all): layer is Layer => (
    Boolean(layer) && all.findIndex((candidate) => candidate?.token === layer?.token) === index
  ));

  return (
    <Tooltip.Provider delay={300}>
      <main ref={appRef} className="app-shell hud-awake" onPointerMove={wakeHud}>
        <Dialog.Root
          open={drawerOpen}
          modal={isMobile}
          onOpenChange={changeDrawerOpen}
        >
          <button
            className="map-trigger hud"
            aria-label="打开地图导航"
            onClick={() => changeDrawerOpen(true)}
            type="button"
          >
            <MapIcon size={18} />
            <span>地图</span>
            <kbd>M</kbd>
          </button>
          <Dialog.Portal>
            <Dialog.Backdrop className="drawer-backdrop" />
            <Dialog.Popup className="map-drawer">
              <Dialog.Title className="sr-only">地图导航</Dialog.Title>
              <MapDrawer activeId={activeMap.id} onSelect={requestMap} />
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>

        <section className="workspace">
          <button
            className="map-identity hud"
            aria-label="重置地图为适屏大小"
            data-viewer-control
            onClick={() => resetView()}
            type="button"
          >
            <p>ACTIVE MAP</p>
            <h2>{activeMap.title}</h2>
            <span>{quality === 'original' ? 'HD ORIGINAL' : 'FAST PREVIEW'} · {activeMap.width} × {activeMap.height}</span>
          </button>

          <div className="utility-actions hud">
            <IconButton label="适应屏幕" onClick={() => resetView()}><Focus size={17} /></IconButton>
            <IconButton
              label={pending?.preserveView
                ? '正在切换画质'
                : quality === 'original' ? '切换快速预览' : '切换高清原图'}
              className="accent"
              disabled={Boolean(pending?.preserveView)}
              onClick={toggleQuality}
            >
              {quality === 'original' ? <ImageMinus size={17} /> : <ImageUpscale size={17} />}
            </IconButton>
            <IconButton
              label={document.fullscreenElement ? '退出全屏' : '全屏查看'}
              onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()}
            >
              <Expand size={17} />
            </IconButton>
          </div>

          <div
            ref={viewerRef}
            className="viewer"
            onDoubleClick={(event) => {
              const transform = transformRef.current;
              const percent = transform.scale / transform.fitScale * 100;
              zoomAt(percent >= 350 ? 100 : percent * 2, { x: event.clientX, y: event.clientY });
            }}
            onPointerCancel={onPointerEnd}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
          >
            {layers.map((layer) => (
              <img
                key={layer.token}
                ref={(element) => {
                  if (element) layerElementsRef.current.set(layer.token, element);
                  else layerElementsRef.current.delete(layer.token);
                }}
                className={`map-layer ${layer.token === outgoing?.token ? 'is-outgoing' : ''} ${layer.token === current?.token ? 'is-current' : 'is-pending'}`}
                src={layer.src}
                alt={layer.map.title}
                draggable={false}
                decoding="async"
                fetchPriority={layer.token === pending?.token ? 'high' : 'auto'}
                onLoad={(event) => layer.token === pending?.token && handleLayerLoad(layer, event.currentTarget)}
                onError={() => layer.token === pending?.token && handleLayerError(layer)}
                style={{ width: layer.map.width, height: layer.map.height }}
              />
            ))}

            <div className={`loading-mark ${loading ? 'is-visible' : ''}`} role="status" aria-live="polite">
              <span className="spinner" />
              <span>{loadingText}</span>
            </div>
            {toast && <div className="toast" role="alert">{toast}</div>}

            <ZoomControls ref={zoomControlsRef} onChange={(value) => zoomAt(value)} onReset={() => resetView()} />
          </div>
        </section>
      </main>
    </Tooltip.Provider>
  );
}
