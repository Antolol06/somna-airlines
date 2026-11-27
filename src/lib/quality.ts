import type { Quality } from '../state/store';

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    return !!gl;
  } catch {
    return false;
  }
}

export const isTouch = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);

export const isMobile = () => isTouch() && Math.min(window.innerWidth, window.innerHeight) < 820;

export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'high';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as any).deviceMemory || 8;
  if (isMobile()) return 'low';
  if (cores <= 4 && mem <= 4) return 'low';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) return 'low';
    if (/intel.*(hd|uhd) graphics (4|5|6)\d\d/i.test(renderer)) return 'low';
  } catch {
    /* ignore */
  }
  return 'high';
}
