/**
 * PhotoSwipe TypeScript Definitions
 * Type definitions for PhotoSwipe customization
 */

import type PhotoSwipe from 'photoswipe';

/**
 * PhotoSwipe UI Element Configuration
 */
export interface PhotoSwipeUIElement {
  name: string;
  order: number;
  isButton: boolean;
  html: string;
  onClick?: (event: MouseEvent, element: HTMLElement) => void;
}

/**
 * PhotoSwipe UI Registration Function
 */
export type UIRegistrationFunction = (pswp: PhotoSwipe) => void;

/**
 * PhotoSwipe Cleanup Function
 */
export type CleanupFunction = () => void;

/**
 * PhotoSwipe Zoom Levels
 */
export interface ZoomLevels {
  initial: number;
  secondary: number;
  max: number;
}

/**
 * PhotoSwipe Padding Configuration
 */
export interface PaddingConfig {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * PhotoSwipe Viewport Size
 */
export interface ViewportSize {
  x: number;
  y: number;
}
