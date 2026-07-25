/**
 * PhotoSwipe Configuration
 * Centralized configuration for PhotoSwipe lightbox
 * Based on admin ImageGrid zoom settings
 */

import type { PhotoSwipeOptions } from 'photoswipe';

type ExtendedPhotoSwipeOptions = PhotoSwipeOptions & {
  transitionDuration?: number;
  easing?: string;
  zoomAnimationDuration?: number;
};

const MOBILE_MEDIA_QUERY = '(max-width: 768px)';

const DESKTOP_ZOOM_SETTINGS: Partial<ExtendedPhotoSwipeOptions> = {
  zoom: true,
  maxZoomLevel: 3,
  initialZoomLevel: 'fit',
  secondaryZoomLevel: 1.2,
};

const MOBILE_ZOOM_SETTINGS: Partial<ExtendedPhotoSwipeOptions> = {
  zoom: true,
  maxZoomLevel: 1,
  initialZoomLevel: 'fit',
  secondaryZoomLevel: 0.4,
};

const DESKTOP_PADDING = { top: 65, bottom: 50, left: 80, right: 80 } as const;
const MOBILE_PADDING = { top: 0, bottom: 0, left: 20, right: 20 } as const;

export const PHOTOSWIPE_ZOOM_PRESETS = {
  desktop: DESKTOP_ZOOM_SETTINGS,
  mobile: MOBILE_ZOOM_SETTINGS,
} as const;

export const PHOTOSWIPE_PADDING_PRESETS = {
  desktop: DESKTOP_PADDING,
  mobile: MOBILE_PADDING,
} as const;

/**
 * Default PhotoSwipe options
 * Optimized for both desktop and mobile viewing
 */
const BASE_PHOTOSWIPE_OPTIONS: Partial<ExtendedPhotoSwipeOptions> = {
  // Gallery selector
  gallery: '#album-gallery',
  children: 'a',
  pswpModule: () => import('photoswipe'),

  // Padding - Fixed padding for top/bottom spacing
  // VERY LARGE padding for testing - you should see black bars clearly
  padding: DESKTOP_PADDING,

  // Background
  bgOpacity: 0.95,
  spacing: 0.1, // Spacing between slides when swiping

  // Navigation
  allowPanToNext: true,
  loop: true,

  // Mobile gestures
  pinchToClose: true,
  closeOnVerticalDrag: true,

  // Animation
  showHideAnimationType: 'zoom',
  // No maxWidthToAnimate cap: run the zoom open/close transition on every
  // viewport size (desktop included) so the lightbox doesn't snap open.
  transitionDuration: 420,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  zoomAnimationDuration: 380,

  // Zoom settings (customized via presets)
  zoom: true,
  doubleTapAction: 'zoom', // Double tap to zoom
  clickToCloseNonZoomable: false,

  // Mouse/Wheel zoom (scrollToZoom: true from admin)
  wheelToZoom: true, // Enable scroll wheel zoom

  // Keyboard navigation (keyboardMoveDistance: 50 from admin)
  arrowKeys: true,

  // Mobile-specific settings
  returnFocus: false,
  trapFocus: false,
};

function resolveIsMobile(override?: boolean): boolean {
  if (typeof override === 'boolean') {
    return override;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia?.(MOBILE_MEDIA_QUERY)?.matches ?? false;
}

export interface GetDefaultPhotoSwipeOptionsParams {
  /** Override mobile detection result */
  isMobile?: boolean;
}

export function getDefaultPhotoSwipeOptions(
  params: GetDefaultPhotoSwipeOptionsParams = {},
): Partial<ExtendedPhotoSwipeOptions> {
  const isMobile = resolveIsMobile(params.isMobile);

  const baseOptions: Partial<ExtendedPhotoSwipeOptions> = {
    ...BASE_PHOTOSWIPE_OPTIONS,
    padding: { ...PHOTOSWIPE_PADDING_PRESETS.desktop },
  };

  return {
    ...baseOptions,
    padding: {
      ...(isMobile ? PHOTOSWIPE_PADDING_PRESETS.mobile : PHOTOSWIPE_PADDING_PRESETS.desktop),
    },
    ...(isMobile ? PHOTOSWIPE_ZOOM_PRESETS.mobile : PHOTOSWIPE_ZOOM_PRESETS.desktop),
  };
}
