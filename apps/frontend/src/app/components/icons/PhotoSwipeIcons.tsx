/**
 * PhotoSwipe Custom Icons
 * SVG icons for PhotoSwipe lightbox UI customization
 */

export const PhotoSwipeIcons = {
  /**
   * Zoom Out Icon
   * Minus sign (matching PhotoSwipe default style - no circle)
   */
  zoomOut: `
    <svg aria-hidden="true" class="pswp__icn" width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
      <path d="M8 14h16v4H8z"/>
    </svg>
  `,

  /**
   * Zoom In Icon
   * Plus sign in a circle
   */
  zoomIn: `
    <svg aria-hidden="true" class="pswp__icn" width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
      <path d="M23 14h-5v-5h-4v5h-5v4h5v5h4v-5h5v-4z"/>
      <path d="M16 2C8.3 2 2 8.3 2 16s6.3 14 14 14 14-6.3 14-14S23.7 2 16 2zm0 25c-6.1 0-11-4.9-11-11S9.9 5 16 5s11 4.9 11 11-4.9 11-11 11z"/>
    </svg>
  `,

  /**
   * Fullscreen Icon
   * Expand arrows in corners
   */
  fullscreen: `
    <svg aria-hidden="true" class="pswp__icn" width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
      <path d="M6 6v6h2V8h4V6H6zm2 14H6v6h6v-2H8v-4zm16-14h-6v2h4v4h2V6zm-2 14v4h-4v2h6v-6h-2z"/>
    </svg>
  `,

  /**
   * Exit Fullscreen Icon
   * Compress arrows
   */
  exitFullscreen: `
    <svg aria-hidden="true" class="pswp__icn" width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
      <path d="M10 8H8v2h4V6h-2v2zm4 16H8v2h2v2h2v-4zm8-20v4h2V6h2V4h-4v2h2zm-2 20v4h2v-2h2v-2h-4z"/>
    </svg>
  `,

  /**
   * Close Icon
   * X mark
   */
  close: `
    <svg aria-hidden="true" class="pswp__icn" width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
      <path d="M25.3 8.3l-1.4-1.4L16 14.8 8.1 6.9 6.7 8.3l7.9 7.9-7.9 7.9 1.4 1.4 7.9-7.9 7.9 7.9 1.4-1.4-7.9-7.9z"/>
    </svg>
  `,

  /**
   * Arrow Left Icon
   * Previous slide
   */
  arrowLeft: `
    <svg aria-hidden="true" class="pswp__icn" width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
      <path d="M20 24l-10-8 10-8v16z"/>
    </svg>
  `,

  /**
   * Arrow Right Icon
   * Next slide
   */
  arrowRight: `
    <svg aria-hidden="true" class="pswp__icn" width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
      <path d="M12 8l10 8-10 8V8z"/>
    </svg>
  `,
} as const;

/**
 * Type-safe icon keys
 */
export type PhotoSwipeIconKey = keyof typeof PhotoSwipeIcons;

/**
 * Helper function to get icon HTML
 */
export function getPhotoSwipeIcon(key: PhotoSwipeIconKey): string {
  return PhotoSwipeIcons[key].trim();
}
