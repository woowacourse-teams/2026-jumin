# PWA 홈 화면 설치 가이드

## 1. 목적

주차의민족을 브라우저의 홈 화면 또는 Dock에 설치할 수 있도록 설치 진입 버튼과 기기별 안내 UI를 제공한다.

이 기능에서 사용하는 [`pwa-add-to-homescreen`](https://github.com/philfung/add-to-homescreen) 라이브러리는 웹 앱을 직접 설치하는 도구가 아니다. 현재 운영체제와 브라우저를 판별하고 사용자가 따라야 할 설치 절차를 안내한다.

- iOS Safari·Chrome: 공유 메뉴 또는 브라우저 메뉴에서 `홈 화면에 추가`하는 방법 안내
- Android Chrome·Edge: 홈 화면 추가 메뉴 또는 브라우저 설치 기능 안내
- macOS Safari: Dock에 추가하는 방법 안내
- Desktop Chrome·Edge: 브라우저의 PWA 설치 이벤트를 이용한 설치 안내
- 인앱 브라우저: Safari나 Chrome 같은 시스템 브라우저로 여는 방법 안내

## 2. 적용 전 준비 사항

설치 안내 라이브러리를 사용하기 전에 웹 앱의 PWA 기반 설정이 준비돼 있어야 한다.

| 준비 사항        | 의미                                                                    | 현재 적용 위치                                                                |
| ---------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Web App Manifest | 앱 이름, 아이콘, 시작 URL과 standalone 실행 방식을 브라우저에 전달한다. | [`client/public/manifest.webmanifest`](../client/public/manifest.webmanifest) |
| Manifest 연결    | 브라우저가 manifest 파일을 찾을 수 있도록 HTML에서 연결한다.            | [`client/index.html`](../client/index.html)                                   |
| 앱 아이콘        | 홈 화면과 설치 가이드에서 사용할 아이콘을 제공한다.                     | `client/public/icons/`                                                        |
| Service Worker   | 설치 후 정적 리소스 캐시와 오프라인 대응 기반을 제공한다.               | [`client/public/service-worker.js`](../client/public/service-worker.js)       |
| HTTPS            | Service Worker를 등록하고 실제 PWA 동작을 검증하기 위한 보안 환경이다.  | 개발·운영 배포 서버                                                           |

## 3. 적용 순서

### 3.1. 라이브러리 설치

```bash
cd client
pnpm add pwa-add-to-homescreen
```

라이브러리 패키지를 프로젝트 의존성으로 추가하고 `pnpm-lock.yaml`에 설치 버전을 고정하는 작업이다. 같은 역할의 설치 가이드 라이브러리는 중복으로 유지하지 않는다.

### 3.2. 라이브러리 정적 파일 배포

라이브러리는 JavaScript 외에 CSS와 브라우저별 안내 이미지를 사용한다. `node_modules`는 배포 결과에 직접 포함되지 않으므로 [`client/webpack.config.js`](../client/webpack.config.js)의 `CopyWebpackPlugin`을 통해 다음 파일을 `dist/vendor/add-to-homescreen/`으로 복사한다.

```text
add-to-homescreen.min.css
add-to-homescreen_ko.min.js
assets/img/
```

한국어 번들인 `add-to-homescreen_ko.min.js`만 사용해 다른 언어 번들이 애플리케이션에 포함되지 않도록 한다. 라이브러리의 샘플 이미지는 실제 가이드에 필요하지 않으므로 복사 대상에서 제외한다.

### 3.3. HTML에서 라이브러리 로드

[`client/index.html`](../client/index.html)에서 배포된 CSS와 JavaScript를 불러온다.

```html
<link
  rel="stylesheet"
  href="/vendor/add-to-homescreen/add-to-homescreen.min.css"
/>
<script src="/vendor/add-to-homescreen/add-to-homescreen.min.js"></script>
```

JavaScript가 실행되면 라이브러리가 전역 객체에 다음 함수를 등록한다.

```ts
window.AddToHomeScreen;
```

`window.AddToHomeScreen`은 TypeScript 선언으로 생성되는 값이 아니다. HTML에서 불러온 라이브러리 JavaScript가 런타임에 제공하는 함수다.

### 3.4. 전역 타입 선언

라이브러리가 별도의 TypeScript 타입 진입점을 제공하지 않기 때문에 [`client/types/pwa-add-to-homescreen.d.ts`](../client/types/pwa-add-to-homescreen.d.ts)에 프로젝트에서 사용하는 API 타입을 선언한다.

이 파일은 컴파일 단계에서 타입을 검사하기 위한 것이며 런타임 동작에는 영향을 주지 않는다.

### 3.5. 설치 가이드 인스턴스 초기화

[`client/shared/pwa/addToHomeScreen.ts`](../client/shared/pwa/addToHomeScreen.ts)에서 라이브러리 설정과 인스턴스를 관리한다.

```ts
const guide = window.AddToHomeScreen?.({
  appName: "주차의민족",
  appNameDisplay: "standalone",
  appIconUrl: "/icons/pwa-192.png",
  assetUrl: "/vendor/add-to-homescreen/assets/img/",
  maxModalDisplayCount: -1,
  displayOptions: {
    showMobile: true,
    showDesktop: true,
  },
  allowClose: true,
  showArrow: true,
});
```

앱 시작 시 [`client/main.tsx`](../client/main.tsx)에서 한 번 초기화한다. Desktop Chrome처럼 `beforeinstallprompt` 이벤트를 사용하는 브라우저가 있으므로 사용자가 버튼을 누르기 전에 인스턴스를 만들어 두어야 한다.

```ts
initializeInstallGuide();
```

### 3.6. 홈 화면 설치 버튼 연결

[`InstallAppButton`](../client/src/pages/HomePage/components/InstallAppButton.tsx)을 홈 화면에 렌더링하고 클릭 시 한국어 가이드를 표시한다.

```ts
export const showInstallGuide = () => {
  initializeInstallGuide()?.show("ko");
};
```

```tsx
<button type="button" onClick={showInstallGuide}>
  홈 화면에 설치
</button>
```

설치된 PWA에서 다시 설치 버튼이 보이지 않도록 standalone 모드에서는 버튼을 숨긴다.

```css
@media (display-mode: standalone) {
  display: none;
}
```

### 3.7. Service Worker 캐시 범위 추가

가이드 JavaScript, CSS와 이미지도 정적 리소스이므로 `/vendor/` 경로를 Service Worker 캐시 대상에 포함한다.

```js
url.pathname.startsWith("/vendor/");
```

이는 한 번 불러온 설치 가이드 리소스를 재사용할 수 있게 한다. Service Worker가 아직 설치되지 않은 최초 방문에서는 일반 네트워크 요청으로 파일을 불러온다.

### 3.8. 테스트와 빌드 검증

```bash
cd client
pnpm check
pnpm build
```

다음 항목을 함께 확인한다.

- 홈 화면에 설치 버튼이 렌더링되는가
- 버튼 클릭 시 `show('ko')`가 호출되는가
- `dist/vendor/add-to-homescreen/`에 CSS, JavaScript와 이미지가 생성되는가
- 브라우저 Network 탭에서 가이드 리소스가 `200`으로 응답하는가
- iOS Safari, Android Chrome과 Desktop 환경에서 각기 맞는 가이드가 표시되는가
- 홈 화면에 설치해 standalone으로 실행했을 때 설치 버튼이 숨겨지는가

## 4. 라이브러리 사용법

### 주요 옵션

| 옵션                         | 현재 값                                 | 의미                                                                         |
| ---------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| `appName`                    | `주차의민족`                            | 설치 가이드에 표시할 앱 이름                                                 |
| `appNameDisplay`             | `standalone`                            | `앱 설치` 제목과 앱 이름을 각각 표시한다. `inline`이면 한 줄로 표시한다.     |
| `appIconUrl`                 | `/icons/pwa-192.png`                    | 가이드 상단에 표시할 앱 아이콘                                               |
| `assetUrl`                   | `/vendor/add-to-homescreen/assets/img/` | 브라우저별 안내 이미지 경로                                                  |
| `maxModalDisplayCount`       | `-1`                                    | 자동 노출 횟수를 제한하지 않는다. 현재는 사용자가 버튼을 눌러 여는 방식이다. |
| `displayOptions.showMobile`  | `true`                                  | 모바일 가이드 표시 여부                                                      |
| `displayOptions.showDesktop` | `true`                                  | 데스크톱 가이드 표시 여부                                                    |
| `allowClose`                 | `true`                                  | 배경을 눌러 가이드를 닫을 수 있는지 여부                                     |
| `showArrow`                  | `true`                                  | 브라우저 메뉴 위치를 가리키는 안내 화살표 표시 여부                          |

### 주요 메서드

```ts
guide.show("ko");
```

현재 기기와 브라우저에 맞는 한국어 설치 안내를 표시한다.

```ts
guide.isStandAlone();
```

현재 페이지가 홈 화면에 설치된 standalone 웹 앱으로 실행 중인지 확인한다.

```ts
guide.closeModal();
guide.modalIsShowing();
```

가이드 닫기와 현재 표시 여부 확인에 사용한다.

```ts
guide.clearModalDisplayCount();
```

`maxModalDisplayCount`를 사용하는 경우 Local Storage에 저장된 노출 횟수를 초기화한다.

## 5. 한국어 문구와 디자인

한국어 문구는 라이브러리의 [`src/locales/ko.json`](https://github.com/philfung/add-to-homescreen/blob/main/src/locales/ko.json)에서 제공한다. 프로젝트에서 직접 영어 문구를 번역하는 방식이 아니다.

`appName`, 아이콘과 표시 방식은 옵션으로 변경할 수 있지만 번역 문구를 직접 덮어쓰는 옵션은 제공하지 않는다.

- 자연스러운 줄바꿈이나 크기 조정: `.adhs-*` 클래스의 CSS 오버라이드
- 앱 제목을 한 줄로 표시: `appNameDisplay: 'inline'`
- 번역 문구 자체 변경: 라이브러리 포크 또는 자체 가이드 UI 검토

라이브러리가 생성한 DOM을 실행 후 직접 변경하는 방식은 내부 클래스와 마크업 변경에 취약하므로 사용하지 않는다.

## 6. 로컬 iPhone 확인 방법

Mac과 iPhone을 같은 Wi-Fi에 연결한 후 개발 서버를 실행한다.

```bash
cd client
pnpm dev
```

Mac의 로컬 IP를 확인한다.

```bash
ipconfig getifaddr en0
```

iPhone Safari에서 다음 주소로 접속한다.

```text
http://<Mac 로컬 IP>:3000
```

이 환경에서는 설치 버튼과 iOS용 안내 UI를 확인할 수 있다. 현재 Webpack 설정은 개발 모드에서 Service Worker를 등록하지 않으므로 오프라인 캐시를 포함한 전체 PWA 동작은 HTTPS 개발 서버 또는 실제 배포 환경에서 검증한다.

## 7. 문제 해결

### `window.AddToHomeScreen`이 `undefined`인 경우

1. `webpack.config.js`를 수정한 후 개발 서버를 재시작했는지 확인한다.
2. `/vendor/add-to-homescreen/add-to-homescreen.min.js` 요청이 `200`인지 확인한다.
3. 응답의 Content-Type이 JavaScript인지 확인한다.
4. 브라우저를 강력 새로고침한다.

```js
typeof window.AddToHomeScreen;
// 정상 결과: 'function'
```

### 버튼을 눌러도 가이드가 표시되지 않는 경우

- 이미 standalone 모드로 실행 중인지 확인한다.
- `displayOptions`에서 현재 기기 유형이 활성화돼 있는지 확인한다.
- Desktop Chrome에서는 `beforeinstallprompt`가 발생할 수 있는 설치 가능 환경인지 확인한다.
- 가이드 CSS와 이미지 요청에 `404`가 발생하지 않는지 확인한다.

### 안내 이미지가 보이지 않는 경우

`assetUrl` 마지막에 `/`가 있는지, Webpack 복사 경로와 동일한지 확인한다.

```ts
assetUrl: "/vendor/add-to-homescreen/assets/img/";
```

## 8. 유지보수 시 확인 사항

- 라이브러리 버전 변경 시 릴리스 노트와 브라우저 지원 범위를 확인한다.
- 한국어 번들의 파일명과 `assetUrl` 구조가 유지되는지 확인한다.
- 새 가이드 이미지가 추가되면 Webpack의 복사 제외 규칙에 걸리지 않는지 확인한다.
- iOS와 Android 주요 버전에서 실제 설치 절차가 라이브러리 안내와 일치하는지 확인한다.
- 라이브러리 UI를 크게 수정해야 한다면 내부 DOM 변경보다 자체 컴포넌트 도입을 검토한다.
