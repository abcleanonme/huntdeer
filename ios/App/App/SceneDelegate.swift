import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = HuntdeerViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Capacitor's view controller plus the iPhone Duo hinge. WebKit has no fold API for web content, so
/// UIHingeInteraction (iOS 27.1+) reports the hinge here and we pass it to the game as
/// `window.__huntdeerHinge(status, angleRadians)` (see src/layout.ts).
class HuntdeerViewController: CAPBridgeViewController {
    private var lastHingeJS: String?
    private var lastRegionsJS: String?
    private var loadingObservation: NSKeyValueObservation?

    override func viewDidLoad() {
        super.viewDidLoad()
        // The page may not be loaded when the first hinge update arrives; resend after each load.
        loadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] wv, _ in
            guard !wv.isLoading, let self else { return }
            // Regions read before the window was fully on screen can be empty; read them fresh.
            if #available(iOS 27.1, *) { self.sendReservedRegions() }
            self.flushHinge()
        }
        if #available(iOS 27.1, *) {
            let interaction = UIHingeInteraction { [weak self] _, update in
                self?.hingeChanged(update.hinge)
            }
            view.addInteraction(interaction)
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if #available(iOS 27.1, *) { sendReservedRegions() }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        refreshRegionsSoon()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        refreshRegionsSoon()
    }

    /// On a cold launch the camera region isn't always reported on the first layout passes, and no
    /// later layout happens until a rotation. Re-check a few times while the app settles.
    private func refreshRegionsSoon() {
        guard #available(iOS 27.1, *) else { return }
        for delay in [0.0, 0.3, 1.0, 2.5] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.sendReservedRegions()
            }
        }
    }

    /// iPhone Duo reserved regions (iOS 27.1+): the outer camera (.occlusion) and the fold (.division).
    /// UIKit has no change callback for these, so re-query on every layout pass and hinge change and
    /// only send when something changed. Frames are in this view's points, which match CSS px because
    /// the web view fills the view.
    @available(iOS 27.1, *)
    private func sendReservedRegions() {
        func list(_ kind: UIView.ReservedRegion.Kind) -> String {
            view.reservedRegions(kind: kind).map { r in
                let f = r.frame
                return "{\"x\":\(Double(f.minX)),\"y\":\(Double(f.minY)),\"w\":\(Double(f.width)),\"h\":\(Double(f.height))}"
            }.joined(separator: ",")
        }
        let js = "window.__huntdeerRegions && window.__huntdeerRegions({\"occlusion\":[\(list(.occlusion))],\"division\":[\(list(.division))]});"
        guard js != lastRegionsJS else { return }
        lastRegionsJS = js
        flushHinge()
    }

    @available(iOS 27.1, *)
    private func hingeChanged(_ hinge: UIHinge?) {
        let status: String
        if let hinge {
            switch hinge.status {
            case .closed: status = "closed"
            case .partiallyOpen: status = "partiallyOpen"
            case .fullyOpen: status = "fullyOpen"
            default: status = "unknown"
            }
        } else {
            status = "none"
        }
        let angle = hinge.map { Double($0.angle) } ?? -1
        lastHingeJS = "window.__huntdeerHinge && window.__huntdeerHinge('\(status)', \(angle));"
        flushHinge()
        // The fold region appears/disappears with the hinge; layout may not run, so check now too.
        view.setNeedsLayout()
    }

    /// Sends the latest hinge state and reserved regions to the page (again after every page load).
    private func flushHinge() {
        let js = [lastHingeJS, lastRegionsJS].compactMap { $0 }.joined(separator: "\n")
        guard !js.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}
