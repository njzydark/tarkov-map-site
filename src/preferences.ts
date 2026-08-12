import { maps } from './maps';

const STORAGE_KEY = 'tarkov-map-viewer:preferences:v1';
const VALID_MAP_IDS = new Set(maps.map((map) => map.id));

export type SavedMapView = {
  zoom: number;
  centerX: number;
  centerY: number;
};

export type ViewerPreferences = {
  version: 1;
  lastMapId: string | null;
  originalMapIds: string[];
  views: Record<string, SavedMapView>;
};

export const defaultPreferences: ViewerPreferences = {
  version: 1,
  lastMapId: null,
  originalMapIds: [],
  views: {},
};

function validView(value: unknown): value is SavedMapView {
  if (!value || typeof value !== 'object') return false;
  const view = value as Partial<SavedMapView>;
  return Number.isFinite(view.zoom)
    && Number.isFinite(view.centerX)
    && Number.isFinite(view.centerY)
    && Number(view.zoom) >= 100
    && Number(view.zoom) <= 800;
}

export function loadPreferences(): ViewerPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultPreferences, originalMapIds: [], views: {} };
    const parsed = JSON.parse(raw) as Partial<ViewerPreferences>;
    const views: Record<string, SavedMapView> = {};

    if (parsed.views && typeof parsed.views === 'object') {
      Object.entries(parsed.views).forEach(([mapId, view]) => {
        if (VALID_MAP_IDS.has(mapId) && validView(view)) views[mapId] = view;
      });
    }

    return {
      version: 1,
      lastMapId: typeof parsed.lastMapId === 'string' && VALID_MAP_IDS.has(parsed.lastMapId)
        ? parsed.lastMapId
        : null,
      originalMapIds: Array.isArray(parsed.originalMapIds)
        ? [...new Set(parsed.originalMapIds.filter((mapId): mapId is string => (
          typeof mapId === 'string' && VALID_MAP_IDS.has(mapId)
        )))]
        : [],
      views,
    };
  } catch {
    return { ...defaultPreferences, originalMapIds: [], views: {} };
  }
}

export function savePreferences(preferences: ViewerPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable in private modes or restricted webviews.
  }
}
