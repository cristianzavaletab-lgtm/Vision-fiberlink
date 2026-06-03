// Haptic Feedback Service
// Provides native-like vibration patterns for different interactions

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' | 'selection';

const patterns: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [10, 50, 10],
  error: [50, 30, 50, 30, 50],
  warning: [30, 20, 30],
  selection: 5,
};

/**
 * Trigger haptic feedback if device supports vibration
 */
export function haptic(type: HapticPattern = 'light'): void {
  if (!navigator.vibrate) return;
  
  try {
    const pattern = patterns[type];
    navigator.vibrate(pattern);
  } catch {
    // Silently fail if vibration not supported
  }
}

/**
 * Check if device supports haptic feedback
 */
export function supportsHaptic(): boolean {
  return 'vibrate' in navigator;
}
