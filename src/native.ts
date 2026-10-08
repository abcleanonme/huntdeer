// Thin wrappers around Capacitor plugins. Everything here is a no-op in a regular browser.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { StatusBar } from '@capacitor/status-bar';

export const isNative = Capacitor.isNativePlatform();

export async function initNative() {
  if (!isNative) return;
  try {
    await StatusBar.hide();
  } catch {
    // iPad in some multitasking modes has no status bar to hide.
  }
}

export function haptic(kind: 'light' | 'heavy' | 'success' | 'warning') {
  if (!isNative) return;
  if (kind === 'success' || kind === 'warning') {
    void Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning }).catch(() => {});
  } else {
    void Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : ImpactStyle.Light }).catch(() => {});
  }
}

export async function nativeLoad(key: string): Promise<string | null> {
  if (!isNative) return null;
  try {
    return (await Preferences.get({ key })).value;
  } catch {
    return null;
  }
}

export async function nativeSave(key: string, value: string) {
  if (!isNative) return;
  try {
    await Preferences.set({ key, value });
  } catch {
    // ignore
  }
}
