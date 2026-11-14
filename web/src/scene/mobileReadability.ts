export interface ViewportReadability {
  exposureScale: number;
  lampScale: number;
}

/**
 * Phone displays need a stronger readability floor than a calibrated desktop
 * monitor, especially when the low-quality path has no post-processing lift.
 * Tablets receive a smaller lift; desktop art direction remains untouched.
 */
export function readabilityForViewport(
  width: number,
  height: number,
  coarsePointer: boolean,
): ViewportReadability {
  const portrait = height > width;
  if (coarsePointer && portrait && width <= 600) return { exposureScale: 1.5, lampScale: 3 };
  if (coarsePointer && portrait && width <= 900) return { exposureScale: 1.15, lampScale: 1.5 };
  return { exposureScale: 1, lampScale: 1 };
}
