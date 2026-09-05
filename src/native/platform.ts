import { Capacitor } from '@capacitor/core';

/**
 * True only inside the Capacitor Android/iOS shell. Every native side effect in
 * this folder is gated on it, so the same bundle keeps behaving as a plain web
 * app (and as the PWA) when served in a browser.
 */
export const isNative = (): boolean => Capacitor.isNativePlatform();

export const nativePlatform = (): 'android' | 'ios' | 'web' =>
  Capacitor.getPlatform() as 'android' | 'ios' | 'web';
