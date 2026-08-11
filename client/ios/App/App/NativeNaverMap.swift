import UIKit
import Capacitor
import NMapsMap
import WebKit

final class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeNaverMapPlugin())
    }
}

final class MapTouchRoutingView: UIView {
    weak var owner: AppRootViewController?

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let owner,
              let map = owner.nativeMapView,
              !map.isHidden,
              owner.nativeMapFrame.contains(point),
              !owner.webTouchRegions.contains(where: { $0.contains(point) }),
              owner.nativeSheetFrame?.contains(point) != true else {
            return super.hitTest(point, with: event)
        }
        return map.hitTest(convert(point, to: map), with: event)
    }
}

final class AppRootViewController: UIViewController, NMFAuthManagerDelegate, WKScriptMessageHandler {
    let mapHost = UIView()
    let sheetGrabber = UIView()
    let bridgeController = AppBridgeViewController()
    var nativeMapView: NMFMapView?
    var nativeMapFrame = CGRect.zero
    var webTouchRegions: [CGRect] = []
    var nativeSheetFrame: CGRect?

    private var sheetBaseFrame: CGRect?
    private var sheetOffset: CGFloat = 0
    private var sheetCollapsed = false
    private lazy var sheetPan = UIPanGestureRecognizer(target: self, action: #selector(handleSheetPan(_:)))

    override func loadView() {
        let root = MapTouchRoutingView()
        root.owner = self
        view = root
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        mapHost.backgroundColor = .white
        view.addSubview(mapHost)
        addChild(bridgeController)
        view.addSubview(bridgeController.view)
        bridgeController.didMove(toParent: self)
        sheetGrabber.isHidden = true
        sheetGrabber.addGestureRecognizer(sheetPan)
        view.addSubview(sheetGrabber)
        bridgeController.webView?.isOpaque = false
        bridgeController.webView?.backgroundColor = .clear
        bridgeController.webView?.underPageBackgroundColor = .clear
        bridgeController.webView?.scrollView.backgroundColor = .clear
        bridgeController.view.backgroundColor = .clear
        bridgeController.webView?.configuration.userContentController.add(self, name: "nativeTouchRegions")
        NMFAuthManager.shared().ncpKeyId = "dpvl046rlx"
        NMFAuthManager.shared().delegate = self
    }

    deinit {
        bridgeController.webView?.configuration.userContentController.removeScriptMessageHandler(forName: "nativeTouchRegions")
    }

    func authorized(_ state: NMFAuthState, error: Error?) {
        NSLog("NAVER_NATIVE_AUTH state=%ld error=%@", state.rawValue, String(describing: error))
    }

    func prepareNativeMap(frame: CGRect) {
        guard nativeMapView == nil else { return }
        guard frame.width > 0, frame.height > 0 else { return }
        let map = NMFMapView(frame: frame)
        map.minZoomLevel = 12
        mapHost.addSubview(map)
        nativeMapView = map
    }

    func makeWebViewTransparent() {
        guard let webView = bridgeController.webView else { return }
        webView.isOpaque = false
        webView.underPageBackgroundColor = .clear
        clearBackgrounds(webView)
        installTouchRegionObserver()
    }

    private func clearBackgrounds(_ view: UIView) {
        view.backgroundColor = .clear
        view.layer.isOpaque = false
        view.subviews.forEach(clearBackgrounds)
    }

    private func installTouchRegionObserver() {
        bridgeController.webView?.evaluateJavaScript(Self.touchRegionScript)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "nativeTouchRegions", let body = message.body as? [String: Any] else { return }
        webTouchRegions = Self.rects(from: body["interactive"])
        if let sheet = Self.rect(from: body["sheet"]) {
            sheetBaseFrame = sheet
            let collapsedOffset = max(0, sheet.height - 120)
            sheetOffset = sheetCollapsed ? collapsedOffset : 0
            nativeSheetFrame = sheet.offsetBy(dx: 0, dy: sheetOffset)
            if let grabber = Self.rect(from: body["grabber"]) {
                sheetGrabber.frame = grabber.offsetBy(dx: 0, dy: sheetOffset)
                sheetGrabber.isHidden = false
            } else {
                sheetGrabber.isHidden = true
            }
        } else {
            sheetBaseFrame = nil
            nativeSheetFrame = nil
            sheetOffset = 0
            sheetCollapsed = false
            sheetGrabber.isHidden = true
        }
    }

    @objc private func handleSheetPan(_ pan: UIPanGestureRecognizer) {
        guard let base = sheetBaseFrame else { return }
        let collapsedOffset = max(0, base.height - 120)
        switch pan.state {
        case .began, .changed:
            let origin = sheetCollapsed ? collapsedOffset : 0
            sheetOffset = min(collapsedOffset, max(0, origin + pan.translation(in: view).y))
            nativeSheetFrame = base.offsetBy(dx: 0, dy: sheetOffset)
            sheetGrabber.frame.origin.y = base.minY + sheetOffset
            setSheetOffset(sheetOffset, animated: false)
        case .ended, .cancelled:
            let velocity = pan.velocity(in: view).y
            sheetCollapsed = velocity > 350 || (velocity >= -350 && sheetOffset > collapsedOffset / 2)
            sheetOffset = sheetCollapsed ? collapsedOffset : 0
            nativeSheetFrame = base.offsetBy(dx: 0, dy: sheetOffset)
            sheetGrabber.frame.origin.y = base.minY + sheetOffset
            setSheetOffset(sheetOffset, animated: true)
        default:
            break
        }
    }

    private func setSheetOffset(_ offset: CGFloat, animated: Bool) {
        let script = "window.__nativeSetSheetOffset?.(\(offset), \(animated ? "true" : "false"));"
        bridgeController.webView?.evaluateJavaScript(script)
    }

    private static func rect(from value: Any?) -> CGRect? {
        guard let value = value as? [String: Any],
              let x = value["x"] as? Double,
              let y = value["y"] as? Double,
              let width = value["width"] as? Double,
              let height = value["height"] as? Double else { return nil }
        return CGRect(x: x, y: y, width: width, height: height)
    }

    private static func rects(from value: Any?) -> [CGRect] {
        (value as? [[String: Any]] ?? []).compactMap { rect(from: $0) }
    }

    private static let touchRegionScript = #"""
    (() => {
      if (window.__nativeTouchBridgeInstalled) {
        window.__nativeReportTouchRegions?.();
        return;
      }
      window.__nativeTouchBridgeInstalled = true;
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const toRect = (element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      const findSheet = () => {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog && visible(dialog)) return dialog;
        return Array.from(document.querySelectorAll('div')).filter((element) => {
          if (!visible(element)) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const hasHandle = Array.from(element.children).some((child) => {
            const childRect = child.getBoundingClientRect();
            return childRect.width >= 36 && childRect.width <= 50 && childRect.height <= 6;
          });
          const hasCarousel = Array.from(element.querySelectorAll('div')).some((child) => getComputedStyle(child).overflowX === 'auto');
          return style.position === 'absolute' && style.bottom !== 'auto' && rect.width >= innerWidth * 0.8 && rect.height > 100 && (hasHandle || hasCarousel);
        }).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] ?? null;
      };
      const report = () => {
        const sheet = findSheet();
        const handle = sheet && Array.from(sheet.children).find((child) => {
          const rect = child.getBoundingClientRect();
          return rect.width >= 36 && rect.width <= 50 && rect.height <= 6;
        });
        document.querySelectorAll('[data-native-bottom-sheet]').forEach((element) => element.removeAttribute('data-native-bottom-sheet'));
        sheet?.setAttribute('data-native-bottom-sheet', 'true');
        const modalOpen = Boolean(document.querySelector('[role="dialog"]'));
        const interactive = modalOpen
          ? [{ x: 0, y: 0, width: innerWidth, height: innerHeight }]
          : Array.from(document.querySelectorAll('button, a[href], input, select, textarea, label, [role="button"]'))
              .filter((element) => visible(element) && !sheet?.contains(element))
              .map(toRect);
        const grabber = handle
          ? { x: sheet.getBoundingClientRect().x, y: sheet.getBoundingClientRect().y, width: sheet.getBoundingClientRect().width, height: 40 }
          : null;
        window.webkit.messageHandlers.nativeTouchRegions.postMessage({ interactive, sheet: sheet ? toRect(sheet) : null, grabber });
      };
      let scheduled = false;
      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; report(); });
      };
      window.__nativeReportTouchRegions = report;
      window.__nativeSetSheetOffset = (offset, animated) => {
        const sheet = document.querySelector('[data-native-bottom-sheet]');
        if (!sheet) return;
        sheet.style.transition = animated ? 'transform 220ms ease-out' : 'none';
        sheet.style.transform = `translate3d(0, ${offset}px, 0)`;
      };
      new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
      document.addEventListener('click', () => setTimeout(report, 0), true);
      window.addEventListener('resize', schedule);
      report();
    })();
    """#

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        mapHost.frame = view.bounds
        bridgeController.view.frame = view.bounds
    }
}

@objc(NativeNaverMapPlugin)
final class NativeNaverMapPlugin: CAPInstancePlugin, CAPBridgedPlugin {
    let identifier = "NativeNaverMapPlugin"
    let jsName = "NativeNaverMap"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise)
    ]

    private var activeID = ""
    private var overlays: [NMFOverlay] = []
    private var lastRenderSignature: Data?

    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self,
                  let root = self.bridge?.viewController?.parent as? AppRootViewController,
                  let frame = call.getObject("frame"),
                  let x = frame["x"] as? Double,
                  let y = frame["y"] as? Double,
                  let width = frame["width"] as? Double,
                  let height = frame["height"] as? Double,
                  let center = call.getObject("center"),
                  let latitude = center["latitude"] as? Double,
                  let longitude = center["longitude"] as? Double else {
                call.reject("Invalid native map parameters")
                return
            }

            root.makeWebViewTransparent()
            self.activeID = call.getString("id") ?? ""
            let mapFrame = CGRect(x: x, y: y, width: width, height: height)
            root.prepareNativeMap(frame: mapFrame)
            guard let map = root.nativeMapView else {
                call.reject("Native map is unavailable")
                return
            }
            if map.superview == nil { root.mapHost.addSubview(map) }
            root.mapHost.isHidden = false
            map.frame = mapFrame
            root.nativeMapFrame = mapFrame
            map.layoutIfNeeded()
            map.isHidden = false
            map.setNeedsDisplay()
            let signature = try? JSONSerialization.data(withJSONObject: call.options ?? [:], options: [.sortedKeys])
            if signature == self.lastRenderSignature {
                call.resolve()
                return
            }
            self.lastRenderSignature = signature
            map.minZoomLevel = 12
            map.moveCamera(NMFCameraUpdate(scrollTo: NMGLatLng(lat: latitude, lng: longitude), zoomTo: 16))

            self.overlays.forEach { $0.mapView = nil }
            self.overlays.removeAll()

            if let destination = call.getObject("destination"),
               let lat = destination["latitude"] as? Double,
               let lng = destination["longitude"] as? Double {
                let point = NMGLatLng(lat: lat, lng: lng)
                self.addMarker(point, label: "도착", color: UIColor(red: 0.26, green: 0.34, blue: 0.85, alpha: 1), map: map)
                if call.getBool("radius") == true {
                    let circle = NMFCircleOverlay(point, radius: 600)
                    circle.fillColor = UIColor(red: 0.26, green: 0.34, blue: 0.85, alpha: 0.1)
                    circle.outlineColor = UIColor(red: 0.26, green: 0.34, blue: 0.85, alpha: 0.72)
                    circle.outlineWidth = 2
                    circle.mapView = map
                    self.overlays.append(circle)
                }
            }

            if let current = call.getObject("currentLocation"),
               let lat = current["latitude"] as? Double,
               let lng = current["longitude"] as? Double {
                let location = map.locationOverlay
                location.location = NMGLatLng(lat: lat, lng: lng)
                location.hidden = false
            } else {
                map.locationOverlay.hidden = true
            }

            let recommended = Set(call.getArray("recommendedIds", String.self) ?? [])
            let selected = call.getString("selectedId")
            for (index, lot) in (call.getArray("parkingLots", JSObject.self) ?? []).enumerated() {
                guard let id = lot["parkingLotId"] as? String,
                      let location = lot["location"] as? JSObject,
                      let lat = location["latitude"] as? Double,
                      let lng = location["longitude"] as? Double else { continue }
                let rank = (call.getArray("recommendedIds", String.self) ?? []).firstIndex(of: id).map { $0 + 1 } ?? index + 1
                let color = id == selected || recommended.contains(id)
                    ? UIColor(red: 0.26, green: 0.34, blue: 0.85, alpha: 1)
                    : UIColor(red: 0.41, green: 0.44, blue: 0.51, alpha: 1)
                let marker = self.addMarker(NMGLatLng(lat: lat, lng: lng), label: String(rank), color: color, map: map)
                marker.touchHandler = { [weak self] _ in
                    self?.notifyListeners("markerClick", data: ["parkingLotId": id])
                    return true
                }
            }
            call.resolve()
        }
    }

    @discardableResult
    private func addMarker(_ position: NMGLatLng, label: String, color: UIColor, map: NMFMapView) -> NMFMarker {
        let marker = NMFMarker(position: position)
        marker.captionText = label
        marker.captionColor = color
        marker.captionHaloColor = .white
        marker.iconTintColor = color
        marker.mapView = map
        overlays.append(marker)
        return marker
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let root = self.bridge?.viewController?.parent as? AppRootViewController else { return }
            if call.getString("id") == self.activeID {
                root.nativeMapView?.isHidden = true
                root.nativeMapFrame = .zero
                root.webTouchRegions = []
                root.nativeSheetFrame = nil
            }
            call.resolve()
        }
    }
}
