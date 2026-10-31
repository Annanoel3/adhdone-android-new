import UIKit
import ImageIO
import UniformTypeIdentifiers

/// "ADHDone" in the iPhone share sheet. The twin of Android's CaptureActivity:
/// shared text, a link, or one picture (a screenshot, a flyer) goes straight
/// to the server and becomes a task, without opening the app.
///
///   text / link -> captureText                      ("Adding task…")
///   picture     -> readImageCapture -> captureText  ("Reading image…")
///
/// Nothing is decided here: the server's own parser makes the task, the same
/// as for a share on Android. A text that can't be sent right now (no signal,
/// signed out) is kept (SharedSession) and the app sends it when it opens.
final class ShareViewController: UIViewController {

    private let card = UIView()
    private let titleLabel = UILabel()
    private let statusLabel = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let button = UIButton(type: .system)
    private var finished = false

    // MARK: - Screen

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.25)

        card.backgroundColor = .secondarySystemGroupedBackground
        card.layer.cornerRadius = 20
        card.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card)

        titleLabel.text = "ADHDone"
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.textAlignment = .center

        statusLabel.font = .preferredFont(forTextStyle: .body)
        statusLabel.textColor = .secondaryLabel
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0

        spinner.hidesWhenStopped = true

        button.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        button.setTitle("OK", for: .normal)
        button.isHidden = true
        button.addTarget(self, action: #selector(close), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [titleLabel, spinner, statusLabel, button])
        stack.axis = .vertical
        stack.spacing = 12
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)

        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            card.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 32),
            card.widthAnchor.constraint(lessThanOrEqualToConstant: 320),
            card.widthAnchor.constraint(greaterThanOrEqualToConstant: 240),
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 22),
            stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -22),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20)
        ])

        working("Adding task…")
        start()
    }

    private func working(_ text: String) {
        statusLabel.text = text
        spinner.startAnimating()
        button.isHidden = true
    }

    /// The end: a line, then the sheet closes by itself (or with OK when the
    /// person should read it).
    private func done(_ text: String, needsOK: Bool = false) {
        spinner.stopAnimating()
        statusLabel.text = text
        if needsOK {
            button.isHidden = false
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in self?.close() }
        }
    }

    @objc private func close() {
        guard !finished else { return }
        finished = true
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }

    // MARK: - What was shared

    private func start() {
        guard let session = SharedSession.load() else {
            done("Open ADHDone and sign in first, then share again.", needsOK: true)
            return
        }
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let providers = items.flatMap { $0.attachments ?? [] }

        if let imageProvider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }) {
            working("Reading image…")
            loadImage(imageProvider) { [weak self] base64 in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    guard let base64 = base64 else {
                        self.done("Couldn't open that picture.", needsOK: true)
                        return
                    }
                    self.readImage(session, base64: base64)
                }
            }
            return
        }

        let title = items.lazy.compactMap { $0.attributedContentText?.string ?? $0.attributedTitle?.string }
            .first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        loadText(providers) { [weak self] text, link in
            DispatchQueue.main.async {
                guard let self = self else { return }
                guard let words = Self.sentence(text: text, link: link, title: title) else {
                    self.done("There's no text to add.", needsOK: true)
                    return
                }
                self.sendText(session, text: words)
            }
        }
    }

    /// What to send, the way Android's CaptureActivity builds it: the shared
    /// text as it is; a bare link gets the page title in front of it.
    static func sentence(text: String?, link: URL?, title: String?) -> String? {
        let clean = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let titleClean = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let isBareLink = clean.range(of: "^https?://\\S+$", options: [.regularExpression, .caseInsensitive]) != nil
        if !clean.isEmpty && !isBareLink { return clean }
        let linkText = clean.isEmpty ? (link?.absoluteString ?? "") : clean
        if linkText.isEmpty { return nil }
        if !titleClean.isEmpty && titleClean != linkText { return "\(titleClean) \(linkText)" }
        return linkText
    }

    private func loadText(_ providers: [NSItemProvider], completion: @escaping (String?, URL?) -> Void) {
        let group = DispatchGroup()
        var text: String?
        var link: URL?
        let lock = NSLock()

        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) {
            group.enter()
            p.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                var found: String?
                if let s = item as? String { found = s }
                else if let a = item as? NSAttributedString { found = a.string }
                else if let d = item as? Data { found = String(data: d, encoding: .utf8) }
                else if let u = item as? URL {
                    found = u.isFileURL ? (try? String(contentsOf: u, encoding: .utf8)) : u.absoluteString
                }
                lock.lock(); text = found; lock.unlock()
                group.leave()
            }
        }
        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }) {
            group.enter()
            p.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                var found: URL?
                if let u = item as? URL, !u.isFileURL { found = u }
                else if let s = item as? String { found = URL(string: s) }
                lock.lock(); link = found; lock.unlock()
                group.leave()
            }
        }
        group.notify(queue: .global()) { completion(text, link) }
    }

    /// The picture as a JPEG no bigger than 1600 px on its long side, base64 —
    /// the same size and quality Android sends (SharedImageReader). Read with
    /// ImageIO so a big photo isn't decoded at full size (a share extension
    /// gets little memory).
    private func loadImage(_ provider: NSItemProvider, completion: @escaping (String?) -> Void) {
        provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { item, _ in
            var source: CGImageSource?
            if let url = item as? URL {
                source = CGImageSourceCreateWithURL(url as CFURL, nil)
            } else if let data = item as? Data {
                source = CGImageSourceCreateWithData(data as CFData, nil)
            } else if let image = item as? UIImage {
                completion(Self.jpegBase64(image))
                return
            }
            guard let src = source else { completion(nil); return }
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 1600
            ]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, options as CFDictionary) else {
                completion(nil)
                return
            }
            completion(UIImage(cgImage: cg).jpegData(compressionQuality: 0.85)?.base64EncodedString())
        }
    }

    private static func jpegBase64(_ image: UIImage) -> String? {
        let longest = max(image.size.width * image.scale, image.size.height * image.scale)
        guard longest > 0 else { return nil }
        let ratio = min(1, 1600 / longest)
        let size = CGSize(width: (image.size.width * image.scale * ratio).rounded(),
                          height: (image.size.height * image.scale * ratio).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return small.jpegData(compressionQuality: 0.85)?.base64EncodedString()
    }

    // MARK: - Sending

    private func readImage(_ session: SharedSessionInfo, base64: String) {
        CaptureAPI.readImage(session, jpegBase64: base64) { [weak self] result in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if result.isAuthFailure {
                    self.done("Open ADHDone to sign in again, then share it again.", needsOK: true)
                    return
                }
                guard result.isSuccess, let body = result.body else {
                    self.done(result.code == 0
                              ? "No connection. Try again when you're online."
                              : "Couldn't read that picture. Try again in a minute.", needsOK: true)
                    return
                }
                let text = (body["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if text.isEmpty || (body["nothing_found"] as? Bool) == true {
                    self.done("Couldn't find a task in that image.", needsOK: true)
                    return
                }
                self.sendText(session, text: text)
            }
        }
    }

    private func sendText(_ session: SharedSessionInfo, text: String) {
        working("Adding task…")
        let capture = PendingCapture(id: UUID().uuidString, text: text,
                                     saidAt: (Date().timeIntervalSince1970 * 1000).rounded())
        // Kept first, so it isn't lost if the sheet is closed or the call fails.
        SharedSession.addPending(capture)
        CaptureAPI.sendText(session, capture: capture) { [weak self] result in
            if result.delivered || result.code == 400 {
                SharedSession.removePending(id: capture.id)
            }
            DispatchQueue.main.async {
                guard let self = self else { return }
                if result.delivered {
                    self.done(Self.confirmation(result.body))
                } else if result.code == 400 {
                    self.done("Couldn't add that.", needsOK: true)
                } else if result.isAuthFailure {
                    self.done("Saved. Open ADHDone to finish adding it.", needsOK: true)
                } else if result.code == 0 {
                    self.done("No connection. Saved — it'll be added when you open ADHDone.", needsOK: true)
                } else {
                    self.done("Saved. It'll be added when you open ADHDone.", needsOK: true)
                }
            }
        }
    }

    /// kind and count come from captureText ("task" or "idea").
    static func confirmation(_ body: [String: Any]?) -> String {
        let count = (body?["count"] as? Int) ?? ((body?["tasks"] as? [Any])?.count ?? 1)
        if (body?["kind"] as? String) == "idea" {
            return count > 1 ? "Added \(count) ideas to your Parking Lot" : "Added to your Parking Lot"
        }
        return count > 1 ? "Added \(count) tasks" : "Task added"
    }
}
