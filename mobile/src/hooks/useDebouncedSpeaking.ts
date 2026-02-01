import { useState, useEffect, useRef } from 'react';

/**
 * Debounces the isSpeaking state to prevent rapid flickering.
 * Only allows display state to change once every `debounceMs` milliseconds.
 */
export function useDebouncedSpeaking(
  isSpeaking: boolean,
  isActive: boolean,
  debounceMs: number = 500
): boolean {
  const [displayState, setDisplayState] = useState(false);
  const lastChange = useRef(0);
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isActive) {
      setDisplayState(false);
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      lastChange.current = 0;
      return;
    }

    if (isSpeaking === displayState) return;

    const now = Date.now();
    const elapsed = now - lastChange.current;

    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    if (elapsed >= debounceMs || lastChange.current === 0) {
      setDisplayState(isSpeaking);
      lastChange.current = now;
    } else {
      const remaining = debounceMs - elapsed;
      timer.current = setTimeout(() => {
        setDisplayState(isSpeaking);
        lastChange.current = Date.now();
        timer.current = null;
      }, remaining);
    }

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [isSpeaking, isActive, debounceMs]);

  return displayState;
}
