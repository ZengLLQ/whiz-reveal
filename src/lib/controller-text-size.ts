export const CONTROLLER_TEXT_SIZE_KEY = 'whizreveal.controller-text-size.v1';
export const MIN_CONTROLLER_TEXT_SIZE = 90;
export const MAX_CONTROLLER_TEXT_SIZE = 150;
export const DEFAULT_CONTROLLER_TEXT_SIZE = 100;
export const CONTROLLER_TEXT_SIZE_STEP = 10;

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;

/** Keep every preference on a supported 10% step, including stale saved values. */
export function normalizeControllerTextSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CONTROLLER_TEXT_SIZE;
  const rounded = Math.round(value / CONTROLLER_TEXT_SIZE_STEP) * CONTROLLER_TEXT_SIZE_STEP;
  return Math.min(MAX_CONTROLLER_TEXT_SIZE, Math.max(MIN_CONTROLLER_TEXT_SIZE, rounded));
}

export function parseControllerTextSize(value: string | null): number {
  if (value === null || !/^\d+(?:\.\d+)?$/.test(value.trim())) return DEFAULT_CONTROLLER_TEXT_SIZE;
  return normalizeControllerTextSize(Number(value.trim()));
}

export function readControllerTextSize(storage?: ReadStorage): number {
  try {
    const source = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    return source ? parseControllerTextSize(source.getItem(CONTROLLER_TEXT_SIZE_KEY)) : DEFAULT_CONTROLLER_TEXT_SIZE;
  } catch {
    // Browser privacy settings and a damaged preference must never prevent opening the controller.
    return DEFAULT_CONTROLLER_TEXT_SIZE;
  }
}

export function saveControllerTextSize(value: number, storage?: WriteStorage): boolean {
  try {
    const destination = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!destination) return false;
    destination.setItem(CONTROLLER_TEXT_SIZE_KEY, String(normalizeControllerTextSize(value)));
    return true;
  } catch {
    // The current window still changes size even if persistence is unavailable.
    return false;
  }
}
