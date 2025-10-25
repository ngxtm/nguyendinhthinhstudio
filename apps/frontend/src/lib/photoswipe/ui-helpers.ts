/**
 * PhotoSwipe UI Utilities
 * Helper functions to register custom UI elements in PhotoSwipe
 */

import PhotoSwipe from 'photoswipe';
import { PhotoSwipeIcons } from '@/app/components/icons/PhotoSwipeIcons';

/**
 * Register zoom out button
 */
export function registerZoomOutButton(pswp: PhotoSwipe) {
  pswp.ui?.registerElement({
    name: 'zoom-out-button',
    order: 9,
    isButton: true,
    html: PhotoSwipeIcons.zoomOut,
    onClick: () => {
      if (pswp) {
        const zoomValue = pswp.currSlide?.zoomLevels?.initial ?? pswp.options.initialZoomLevel ?? 1;
        const initialZoom = typeof zoomValue === 'number' ? zoomValue : 1;
        pswp.zoomTo(initialZoom, undefined, 500);
      }
    },
  });
}

/**
 * Register fullscreen button with dynamic icon
 */
export function registerFullscreenButton(pswp: PhotoSwipe) {
  pswp.ui?.registerElement({
    name: 'fullscreen-button',
    order: 8,
    isButton: true,
    html: PhotoSwipeIcons.fullscreen,
    onClick: () => {
      if (!document.fullscreenElement) {
        pswp.element?.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    },
  });
}

/**
 * Register fullscreen keyboard shortcut (F key)
 */
export function registerFullscreenKeyboard(pswp: PhotoSwipe): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) {
        pswp.element?.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  // Return cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Register all custom UI elements for PhotoSwipe
 * This is the main entry point for UI customization
 */
export function registerPhotoSwipeUI(pswp: PhotoSwipe): () => void {
  // Register UI elements
  registerFullscreenButton(pswp);

  // Register keyboard shortcuts
  const cleanupKeyboard = registerFullscreenKeyboard(pswp);

  // Return cleanup function
  return () => {
    cleanupKeyboard();
  };
}
