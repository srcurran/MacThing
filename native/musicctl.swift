// musicctl — Apple Music actions for the bridge, sent as Apple Events under this tool's own name,
// so macOS asks once whether "musicctl" may control Music (rather than node or a terminal).
//
//   musicctl favorite   toggle "favorited" on the current track → {"ok":true,"favorited":true}
//   musicctl play       start playback                           → {"ok":true}
// Failures print {"ok":false,"error":"…","code":N} and exit 1.

import Foundation

// Be our own "responsible process" so the Automation grant attaches to musicctl.
// Re-execs in place (same pid and stdio) with the private disclaim spawn attribute.
func disclaimResponsibility() {
  guard getenv("MUSICCTL_DISCLAIMED") == nil,
    let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_spawnattrs_setdisclaim"),
    let path = Bundle.main.executablePath
  else { return }
  typealias SetDisclaim = @convention(c) (UnsafeMutablePointer<posix_spawnattr_t?>, Int32) -> Int32
  var attr: posix_spawnattr_t?
  posix_spawnattr_init(&attr)
  posix_spawnattr_setflags(&attr, Int16(POSIX_SPAWN_SETEXEC))
  _ = unsafeBitCast(sym, to: SetDisclaim.self)(&attr, 1)
  setenv("MUSICCTL_DISCLAIMED", "1", 1)
  var argv: [UnsafeMutablePointer<CChar>?] = CommandLine.arguments.map { strdup($0) } + [nil]
  posix_spawn(nil, path, nil, &attr, &argv, environ)
}
disclaimResponsibility()

func reply(_ obj: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: obj)
  print(String(data: data, encoding: .utf8)!)
}

let scripts = [
  "favorite": """
    tell application id "com.apple.Music"
      if player state is stopped then error "Nothing is playing in Music" number 1
      set f to not (favorited of current track)
      set favorited of current track to f
      return f
    end tell
    """,
  "play": """
    tell application id "com.apple.Music" to play
    """,
]

guard let command = CommandLine.arguments.dropFirst().first, let source = scripts[command] else {
  FileHandle.standardError.write("usage: musicctl favorite|play\n".data(using: .utf8)!)
  exit(2)
}

var error: NSDictionary?
let result = NSAppleScript(source: source)?.executeAndReturnError(&error)
if let error {
  reply([
    "ok": false,
    "error": error[NSAppleScript.errorMessage] as? String ?? "AppleScript error",
    "code": error[NSAppleScript.errorNumber] as? Int ?? 0,
  ])
  exit(1)
}
reply(command == "favorite" ? ["ok": true, "favorited": result?.booleanValue ?? false] : ["ok": true])
