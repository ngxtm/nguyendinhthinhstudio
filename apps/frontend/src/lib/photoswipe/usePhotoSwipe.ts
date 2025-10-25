/**
 * usePhotoSwipe Hook
 * React hook for PhotoSwipe initialization
 */

import { useEffect, useMemo, useRef } from 'react';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import type { PhotoSwipeOptions } from 'photoswipe';
import { getDefaultPhotoSwipeOptions, registerPhotoSwipeUI } from './index';

export interface UsePhotoSwipeOptions {
  /**
   * Custom PhotoSwipe options (will be merged with defaults)
   */
  options?: Partial<PhotoSwipeOptions>;

  /**
   * Whether to enable custom UI (zoom out, fullscreen buttons)
   * @default true
   */
  enableCustomUI?: boolean;

  /**
   * Dependencies to re-initialize PhotoSwipe
   */
  dependencies?: unknown[];
}

/**
 * Custom hook for PhotoSwipe initialization
 * Handles setup, cleanup, and custom UI registration
 *
 * @example
 * ```tsx
 * function MyGallery({ images }) {
 *   usePhotoSwipe({
 *     options: { maxZoomLevel: 3 },
 *     dependencies: [images]
 *   });
 *
 *   return (
 *     <div id="album-gallery">
 *       {images.map(img => (
 *         <a href={img.url} data-pswp-width={img.width} data-pswp-height={img.height}>
 *           <img src={img.thumbnail} />
 *         </a>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePhotoSwipe({
  options = {},
  enableCustomUI = true,
  dependencies = [],
}: UsePhotoSwipeOptions = {}) {
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null);
  const memoizedDependencies = useMemo(
    () => (Array.isArray(dependencies) ? dependencies : []),
    [dependencies],
  );

  useEffect(() => {
    // Merge custom options with defaults
    const mergedOptions = {
      ...getDefaultPhotoSwipeOptions(),
      ...options,
    };

    // Initialize PhotoSwipe
    lightboxRef.current = new PhotoSwipeLightbox(mergedOptions);
    lightboxRef.current.init();

    // Register custom UI if enabled
    let cleanupUI: (() => void) | undefined;

    if (enableCustomUI) {
      lightboxRef.current.on('uiRegister', function() {
        const pswp = lightboxRef.current?.pswp;
        if (!pswp) return;

        cleanupUI = registerPhotoSwipeUI(pswp);
      });
    }

    // Cleanup
    return () => {
      if (cleanupUI) {
        cleanupUI();
      }

      if (lightboxRef.current) {
        lightboxRef.current.destroy();
        lightboxRef.current = null;
      }
    };
  }, [enableCustomUI, options, ...memoizedDependencies]);

  return lightboxRef;
}
