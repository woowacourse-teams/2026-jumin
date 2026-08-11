import UIKit
import Capacitor
import NMapsMap

final class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeNaverMapPlugin())
    }
}

final class AppRootViewController: UIViewController, NMFAuthManagerDelegate {
    let mapHost = UIView()
    let bridgeController = AppBridgeViewController()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        mapHost.backgroundColor = .white
        view.addSubview(mapHost)
        addChild(bridgeController)
        view.addSubview(bridgeController.view)
        bridgeController.didMove(toParent: self)
        bridgeController.webView?.isOpaque = false
        bridgeController.webView?.backgroundColor = .clear
        bridgeController.webView?.underPageBackgroundColor = .clear
        bridgeController.webView?.scrollView.backgroundColor = .clear
        bridgeController.view.backgroundColor = .clear
        NMFAuthManager.shared().ncpKeyId = "dpvl046rlx"
        NMFAuthManager.shared().delegate = self
    }

    func authorized(_ state: NMFAuthState, error: Error?) {
        NSLog("NAVER_NATIVE_AUTH state=%ld error=%@", state.rawValue, String(describing: error))
    }

    func makeWebViewTransparent() {
        guard let webView = bridgeController.webView else { return }
        webView.isOpaque = false
        webView.underPageBackgroundColor = .clear
        clearBackgrounds(webView)
    }

    private func clearBackgrounds(_ view: UIView) {
        view.backgroundColor = .clear
        view.layer.isOpaque = false
        view.subviews.forEach(clearBackgrounds)
    }

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
    private var mapView: NMFMapView?
    private var overlays: [NMFOverlay] = []

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
            let map = self.mapView ?? NMFMapView(frame: mapFrame)
            self.mapView = map
            if map.superview == nil { root.mapHost.addSubview(map) }
            map.frame = mapFrame
            map.layoutIfNeeded()
            NSLog("NAVER_NATIVE_FRAME map=%@ host=%@ web=%@ auth=%ld", String(describing: map.frame), String(describing: root.mapHost.frame), String(describing: root.bridgeController.view.frame), NMFAuthManager.shared().authState.rawValue)
            map.isHidden = false
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
            guard let self else { return }
            if call.getString("id") == self.activeID { self.mapView?.isHidden = true }
            call.resolve()
        }
    }
}
