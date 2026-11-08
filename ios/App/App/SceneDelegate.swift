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
    private var loadingObservation: NSKeyValueObservation?

    override func viewDidLoad() {
        super.viewDidLoad()
        // The page may not be loaded when the first hinge update arrives; resend after each load.
        loadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] wv, _ in
            if !wv.isLoading { self?.flushHinge() }
        }
        if #available(iOS 27.1, *) {
            let interaction = UIHingeInteraction { [weak self] _, update in
                self?.hingeChanged(update.hinge)
            }
            view.addInteraction(interaction)
        }
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
    }

    private func flushHinge() {
        guard let js = lastHingeJS else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}
