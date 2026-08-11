/** iOS 네이티브 지도 플러그인 브릿지. */

import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNativeIOS = Capacitor.getPlatform() === 'ios';

export const NativeNaverMap = registerPlugin<{
  show(options: Record<string, unknown>): Promise<void>;
  hide(options: { id: string }): Promise<void>;
  addListener(event: 'markerClick', listener: (data: { parkingLotId: string }) => void): Promise<{ remove(): void }>;
}>('NativeNaverMap');
