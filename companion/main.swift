// MacThing Menu: a menu bar companion that shows and controls the com.carthing.bridge LaunchAgent.
import AppKit

let label = "com.carthing.bridge"
let uid = getuid()
let domain = "gui/\(uid)"
let plistPath = NSHomeDirectory() + "/Library/LaunchAgents/\(label).plist"

@discardableResult
func launchctl(_ args: [String]) -> (status: Int32, output: String) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/bin/launchctl")
    p.arguments = args
    let pipe = Pipe()
    p.standardOutput = pipe
    p.standardError = pipe
    do { try p.run() } catch { return (-1, "\(error)") }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    try? pipe.fileHandleForReading.close()
    return (p.terminationStatus, String(decoding: data, as: UTF8.self))
}

enum BridgeState { case running, loadedStopped, notLoaded }

func bridgeState() -> BridgeState {
    let r = launchctl(["print", "\(domain)/\(label)"])
    if r.status != 0 { return .notLoaded }
    return r.output.contains("state = running") ? .running : .loadedStopped
}

/// The MacThing glyph as a template, filling the status item: 18x16pt (drawn on a 20x18 grid, scaled), bold bars and knob, no padding.
let glyphSize = NSSize(width: 18, height: 16)
func drawGlyph(_ color: NSColor) {
    let scale = NSAffineTransform(); scale.scaleX(by: 18.0 / 20.0, yBy: 16.0 / 18.0); scale.concat()
    color.setFill()
    let w: CGFloat = 4, r: CGFloat = 1.5
    // (x, top, bottom), y measured from the top
    let bars: [(CGFloat, CGFloat)] = [(0, 1.5), (5.33, 10.5), (10.67, 10.5), (16, 1.5)]
    for (x, top) in bars {
        NSBezierPath(roundedRect: NSRect(x: x, y: top, width: w, height: 18 - top), xRadius: r, yRadius: r).fill()
    }
    NSBezierPath(ovalIn: NSRect(x: 5.25, y: 0, width: 9.5, height: 9.5)).fill()
}
/// Opacity of the stopped icon, matched to a neighboring app's grayed status icon (measured 0.44).
let stoppedAlpha: CGFloat = 0.44
func templateIcon(alpha: CGFloat = 1) -> NSImage {
    let img = NSImage(size: glyphSize, flipped: true) { _ in drawGlyph(NSColor.black.withAlphaComponent(alpha)); return true }
    img.isTemplate = true
    return img
}

/// --render-icons <dir>: writes the icon at 2x in both states, on light and dark menu bars.
func renderIcons(to dir: String) {
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    let variants: [(String, NSColor, NSColor)] = [
        ("running-light", .black, NSColor(white: 0.93, alpha: 1)),
        ("stopped-light", NSColor.black.withAlphaComponent(stoppedAlpha), NSColor(white: 0.93, alpha: 1)),
        ("running-dark", .white, NSColor(white: 0.15, alpha: 1)),
        ("stopped-dark", NSColor.white.withAlphaComponent(stoppedAlpha), NSColor(white: 0.15, alpha: 1)),
    ]
    for (name, fg, bg) in variants {
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 64, pixelsHigh: 44, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        rep.size = NSSize(width: 32, height: 22) // a 22pt menu bar slot, 2x pixels
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        bg.setFill(); NSRect(x: 0, y: 0, width: 32, height: 22).fill()
        let t = NSAffineTransform(); t.translateX(by: 7, yBy: 19); t.scaleX(by: 1, yBy: -1); t.concat()
        drawGlyph(fg)
        NSGraphicsContext.restoreGraphicsState()
        try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: dir + "/menubar-\(name)@2x.png"))
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    let menu = NSMenu()
    let settingsItem = NSMenuItem(title: "Open Settings", action: #selector(openSettings), keyEquivalent: ",")
    let restartItem = NSMenuItem(title: "Restart MacThing", action: #selector(restart), keyEquivalent: "r")
    let runningIcon = templateIcon()
    let stoppedIcon = templateIcon(alpha: stoppedAlpha)
    let statusLine = NSMenuItem(title: "MacThing: …", action: nil, keyEquivalent: "")
    let toggle = NSMenuItem(title: "Start MacThing", action: #selector(toggleBridge), keyEquivalent: "")

    func applicationDidFinishLaunching(_ n: Notification) {
        item.length = NSStatusItem.variableLength
        item.button?.image = templateIcon()
        item.button?.imageScaling = .scaleNone
        item.button?.toolTip = "MacThing"
        statusLine.isEnabled = false
        menu.addItem(statusLine)
        menu.addItem(.separator())
        settingsItem.target = self
        menu.addItem(settingsItem)
        toggle.target = self
        menu.addItem(toggle)
        restartItem.target = self
        menu.addItem(restartItem)
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit", action: #selector(quit), keyEquivalent: "q").target = self
        menu.delegate = self
        item.menu = menu
        refresh()
        Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in autoreleasepool { self?.refresh() } }
    }

    func menuWillOpen(_ menu: NSMenu) { refresh() }

    func refresh() {
        let state = bridgeState()
        item.button?.image = state == .running ? runningIcon : stoppedIcon
        // The settings page is served by the bridge. Hiding it leaves no dangling separator:
        // Start still follows the one under the status line. Restart only makes sense while running.
        settingsItem.isHidden = state != .running
        restartItem.isHidden = state != .running
        item.button?.toolTip = state == .running ? "MacThing is running" : "MacThing is stopped"
        switch state {
        case .running:
            statusLine.title = "MacThing is running"
            toggle.title = "Stop MacThing"
        case .loadedStopped:
            statusLine.title = "MacThing is stopped (loaded)"
            toggle.title = "Start MacThing"
        case .notLoaded:
            statusLine.title = "MacThing is stopped"
            toggle.title = "Start MacThing"
        }
    }

    @objc func openSettings() { NSWorkspace.shared.open(URL(string: "http://127.0.0.1:4747")!) }

    @objc func toggleBridge() {
        if bridgeState() == .running { stop() } else { start() }
        refresh()
    }

    func start() {
        if bridgeState() == .notLoaded {
            let r = launchctl(["bootstrap", domain, plistPath])
            if r.status != 0 { alert("Couldn’t start MacThing", r.output) }
        } else {
            launchctl(["kickstart", "\(domain)/\(label)"])
        }
    }

    func stop() {
        // bootout unloads the job only; the plist on disk is untouched.
        launchctl(["bootout", "\(domain)/\(label)"])
    }

    @objc func restart() {
        if bridgeState() == .notLoaded { start() } else { launchctl(["kickstart", "-k", "\(domain)/\(label)"]) }
        refresh()
    }

    @objc func quit() { NSApp.terminate(nil) }

    func alert(_ title: String, _ text: String) {
        let a = NSAlert()
        a.messageText = title
        a.informativeText = text
        NSApp.activate(ignoringOtherApps: true)
        a.runModal()
    }
}

if let i = CommandLine.arguments.firstIndex(of: "--render-icons"), i + 1 < CommandLine.arguments.count {
    renderIcons(to: CommandLine.arguments[i + 1])
    exit(0)
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
