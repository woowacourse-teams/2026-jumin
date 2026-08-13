/** 네이버 지도 웹 SDK의 외부 타입. 우리가 쓰는 범위만 좁게 선언한다. */

export type Listener = object | null;
export type Overlay = { setMap(map: NaverMap | null): void; setIcon?(icon: NaverMarkerIcon): void };
export type NaverMarkerIcon = { content: string; size: NaverSize; anchor: NaverPoint };
export type NaverMap = { setCenter(point: NaverLatLng): void; panTo(point: NaverLatLng): void };
export type NaverLatLng = object;
export type NaverSize = object;
export type NaverPoint = object;

export interface NaverMaps {
  Map: new (
    element: HTMLElement,
    options: {
      center: NaverLatLng;
      zoom: number;
      minZoom: number;
      zoomControl: boolean;
      scaleControl: boolean;
      logoControl: boolean;
      mapDataControl: boolean;
    },
  ) => NaverMap;
  LatLng: new (latitude: number, longitude: number) => NaverLatLng;
  Size: new (width: number, height: number) => NaverSize;
  Point: new (x: number, y: number) => NaverPoint;
  Marker: new (options: { map: NaverMap; position: NaverLatLng; icon: NaverMarkerIcon; title?: string }) => Overlay;
  Circle: new (options: {
    map: NaverMap;
    center: NaverLatLng;
    radius: number;
    strokeColor: string;
    strokeOpacity: number;
    strokeWeight: number;
    fillColor: string;
    fillOpacity: number;
  }) => Overlay;
  Event: {
    addListener(target: object, eventName: string, listener: () => void): Listener;
    removeListener(listener: Exclude<Listener, null>): void;
    trigger(target: object, eventName: string): void;
  };
}

declare global {
  interface Window {
    naver?: { maps: NaverMaps };
    navermap_authFailure?: () => void;
  }
}
