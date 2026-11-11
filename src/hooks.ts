import { useEffect, useState } from 'react';

/**
 * Width of an element in pixels, following its resizes. The returned callback ref can be attached to an element
 * which is rendered later than the component is mounted.
 */
export function useElementWidth<T extends HTMLElement>(): [(element: T | null) => void, number] {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width];
}

/**
 * Calls the loader immediately and then periodically; a slow answer never overtakes a newer one.
 * The value of the previous keys is dropped when the keys change.
 */
export function usePolling<T>(loader: () => Promise<T>, intervalMs: number, keys: unknown[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let active = true;
    let running = false;
    setValue(undefined);
    const tick = async () => {
      if (running) {
        return;
      }
      running = true;
      try {
        const result = await loader();
        if (active) {
          setValue(result);
        }
      } catch (e) {
        console.error(e);
      } finally {
        running = false;
      }
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, keys);
  return value;
}
