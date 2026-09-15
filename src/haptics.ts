// Standalone replacement for gizmoRuntime.performHaptic().

export type HapticKind = 'light' | 'medium' | 'heavy' | 'countdown' | 'go';

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 15,
  medium: 40,
  heavy: [60, 40, 60],
  countdown: 30,
  go: [20, 30, 50],
};

export function haptic(kind: HapticKind): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(PATTERNS[kind]);
    }
  } catch {
    /* vibrate unsupported — ignore */
  }
}
