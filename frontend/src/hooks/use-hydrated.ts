"use client";

import * as React from "react";

const subscribe = () => () => {};

/**
 * Returns false during server rendering and the first client render, then true once hydrated.
 * Use it to gate browser-only reads without calling setState inside an effect.
 */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
