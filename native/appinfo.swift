// appinfo <bundle-id> [icon-size]
// Prints {"name": "...", "icon": "<base64 png>"} for an installed app, or {} if not found.
// Used by the bridge to label and badge non-music sources (e.g. a browser playing YouTube).

import AppKit

let args = CommandLine.arguments
guard args.count > 1 else {
  FileHandle.standardError.write("usage: appinfo <bundle-id> [icon-size]\n".data(using: .utf8)!)
  exit(2)
}
let size = args.count > 2 ? CGFloat(Double(args[2]) ?? 96) : 96

var out: [String: Any] = [:]
if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: args[1]) {
  let bundle = Bundle(url: url)
  out["name"] =
    (bundle?.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
    ?? (bundle?.object(forInfoDictionaryKey: "CFBundleName") as? String)
    ?? FileManager.default.displayName(atPath: url.path).replacingOccurrences(of: ".app", with: "")

  let icon = NSWorkspace.shared.icon(forFile: url.path)
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
    samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  icon.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
  NSGraphicsContext.restoreGraphicsState()
  if let png = rep.representation(using: .png, properties: [:]) {
    out["icon"] = png.base64EncodedString()
  }
}

let data = try! JSONSerialization.data(withJSONObject: out)
FileHandle.standardOutput.write(data)
