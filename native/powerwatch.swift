// powerwatch — tells the bridge when the Mac sleeps/wakes and when its displays sleep/wake.
//
// stdout, one JSON object per line:
//   {"event":"display","asleep":true|false}   on start and whenever the main display changes
//   {"event":"lock","locked":true|false}      on start and whenever the session locks/unlocks
//   {"event":"willSleep"}                      system is about to sleep (held until "ack" or 3 s)
//   {"event":"didWake"}                        system woke up
// stdin: "ack" — the bridge has finished getting ready for sleep.

import CoreGraphics
import Foundation
import IOKit
import IOKit.pwr_mgt

setvbuf(stdout, nil, _IOLBF, 0)

func emit(_ obj: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj), let line = String(data: data, encoding: .utf8)
  else { return }
  print(line)
}

// iokit_common_msg(...) values from IOKit/IOMessage.h (C macros aren't imported into Swift).
let kCanSystemSleep: UInt32 = 0xE000_0270
let kSystemWillSleep: UInt32 = 0xE000_0280
let kSystemHasPoweredOn: UInt32 = 0xE000_0300

var rootPort: io_connect_t = 0
var pendingSleep: Int?

func allowSleep() {
  guard let id = pendingSleep else { return }
  pendingSleep = nil
  IOAllowPowerChange(rootPort, id)
}

var notifier: IONotificationPortRef?
var notifierObject: io_object_t = 0
rootPort = IORegisterForSystemPower(nil, &notifier, { _, _, messageType, messageArgument in
  let id = Int(bitPattern: messageArgument)
  switch messageType {
  case kCanSystemSleep:
    IOAllowPowerChange(rootPort, id)
  case kSystemWillSleep:
    pendingSleep = id
    emit(["event": "willSleep"])
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { allowSleep() } // never hold sleep for long
  case kSystemHasPoweredOn:
    emit(["event": "didWake"])
  default:
    break
  }
}, &notifierObject)

if rootPort != 0, let notifier {
  CFRunLoopAddSource(CFRunLoopGetCurrent(), IONotificationPortGetRunLoopSource(notifier).takeUnretainedValue(), .defaultMode)
} else {
  FileHandle.standardError.write("powerwatch: could not register for system power notifications\n".data(using: .utf8)!)
}

/// Locked: the lock screen is up, or someone switched away from this login session.
func sessionLocked() -> Bool {
  guard let info = CGSessionCopyCurrentDictionary() as? [String: Any] else { return false }
  let locked = info["CGSSessionScreenIsLocked"] as? Bool ?? false
  let onConsole = info["kCGSSessionOnConsoleKey"] as? Bool ?? true
  return locked || !onConsole
}

// Display sleep and the lock screen: cheap to poll, and works without an NSApplication.
var displayAsleep: Bool?
var locked: Bool?
Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
  let asleep = CGDisplayIsAsleep(CGMainDisplayID()) != 0
  if asleep != displayAsleep {
    displayAsleep = asleep
    emit(["event": "display", "asleep": asleep])
  }
  let isLocked = sessionLocked()
  if isLocked != locked {
    locked = isLocked
    emit(["event": "lock", "locked": isLocked])
  }
}.fire()

Thread {
  while let line = readLine() {
    if line.trimmingCharacters(in: .whitespaces) == "ack" { DispatchQueue.main.async { allowSleep() } }
  }
  exit(0) // stdin closed: the bridge went away
}.start()

RunLoop.main.run()
