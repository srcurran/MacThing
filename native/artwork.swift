// artwork <in-image> <max-size> <cover.jpg> [background.jpg]
// Prepares a cover for the device in one pass, and prints {"width":…,"height":…} of cover.jpg.
//
// cover.jpg: a square JPEG of at most <max-size>px (the art panel is exactly 480×480), whatever the
// source format was (HEIC/TIFF would not render on the device's 2018-era Chromium). The centre
// crop happens at the source's own resolution, before any resize: a 16:9 video thumbnail scaled to
// fit 480 first is only 270px tall, and filling the square from that stretches it by 1.8×.
//
// background.jpg: the album art background the device shows behind the UI — the cover filling the
// screen's width with mirrored copies against its left and right edges, blurred and saturated to
// match the CSS it replaces (blur(50px) saturate(1.6) on an 800px square, cropped to 800×480), at
// half size. The device scales it back up, which a blur this heavy doesn't show, and no longer has
// to blur anything itself: in software that took it about 1.7s of drawing per cover.

import CoreImage
import Foundation

let args = CommandLine.arguments
guard args.count > 3, let maxSide = Double(args[2]),
  let input = CIImage(contentsOf: URL(fileURLWithPath: args[1]), options: [.applyOrientationProperty: true])
else {
  FileHandle.standardError.write("usage: artwork <in-image> <max-size> <cover.jpg> [background.jpg]\n".data(using: .utf8)!)
  exit(2)
}

let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
func writeJPEG(_ image: CIImage, _ path: String, quality: Double, context: CIContext) throws {
  try context.writeJPEGRepresentation(
    of: image, to: URL(fileURLWithPath: path), colorSpace: srgb,
    options: [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): quality])
}
/// Moves an image's extent to start at the origin.
func atOrigin(_ image: CIImage) -> CIImage {
  image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
}

// ---- Cover ----
let e = input.extent.integral
let sourceSide = min(e.width, e.height)
let square = atOrigin(input.cropped(to: CGRect(
  x: e.minX + ((e.width - sourceSide) / 2).rounded(.down), y: e.minY + ((e.height - sourceSide) / 2).rounded(.down),
  width: sourceSide, height: sourceSide)))
let side = min(sourceSide, CGFloat(maxSide)).rounded()
let cover = side < sourceSide
  ? square.applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: side / sourceSide, kCIInputAspectRatioKey: 1])
      .cropped(to: CGRect(x: 0, y: 0, width: side, height: side))
  : square

do {
  try writeJPEG(cover, args[3], quality: 0.88, context: CIContext(options: [.outputColorSpace: srgb]))
} catch {
  FileHandle.standardError.write("artwork: \(error.localizedDescription)\n".data(using: .utf8)!)
  exit(1)
}

// ---- Background ----
if args.count > 4 {
  let scale: CGFloat = 0.5 // of the device's 800×480 screen
  let bgSide = 800 * scale, bgHeight = 480 * scale
  let fit = bgSide / side
  let bgSquare = cover.transformed(by: CGAffineTransform(scaleX: fit, y: fit))
    .cropped(to: CGRect(x: 0, y: 0, width: bgSide, height: bgSide))

  // Mirrored copies either side, so the blur there mixes in matching colour rather than darkening
  // the edges; past those, edge pixels repeat.
  let left = bgSquare.transformed(by: CGAffineTransform(scaleX: -1, y: 1))
  let right = left.transformed(by: CGAffineTransform(translationX: 2 * bgSide, y: 0))
  let strip = bgSquare.composited(over: left).composited(over: right).clampedToExtent()

  // CSS blur(50px) is a Gaussian with a 50px standard deviation, as is CIGaussianBlur's radius.
  let blurred = strip.applyingGaussianBlur(sigma: 50 * scale)

  // CSS saturate(1.6), with the matrix the Filter Effects spec gives for it.
  let s: CGFloat = 1.6
  let saturated = blurred.applyingFilter("CIColorMatrix", parameters: [
    "inputRVector": CIVector(x: 0.213 + 0.787 * s, y: 0.715 - 0.715 * s, z: 0.072 - 0.072 * s, w: 0),
    "inputGVector": CIVector(x: 0.213 - 0.213 * s, y: 0.715 + 0.285 * s, z: 0.072 - 0.072 * s, w: 0),
    "inputBVector": CIVector(x: 0.213 - 0.213 * s, y: 0.715 - 0.715 * s, z: 0.072 + 0.928 * s, w: 0),
    "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1),
  ])

  // The screen's window onto the square: its middle 480 of 800 rows.
  let background = atOrigin(saturated.cropped(to: CGRect(x: 0, y: (bgSide - bgHeight) / 2, width: bgSide, height: bgHeight)))

  // Browsers apply CSS filters to sRGB values as they are, so blur in sRGB rather than linear light.
  do {
    try writeJPEG(background, args[4], quality: 0.85, context: CIContext(options: [.workingColorSpace: srgb, .outputColorSpace: srgb]))
  } catch {
    FileHandle.standardError.write("artwork: background: \(error.localizedDescription)\n".data(using: .utf8)!)
  }
}

print("{\"width\":\(Int(side)),\"height\":\(Int(side))}")
