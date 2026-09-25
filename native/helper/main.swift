// CarThingHelper — location + calendar for the bridge. Lives in an .app bundle so macOS can ask
// for (and remember) Location Services and Calendars permission under its own name.
//
// stdin, one JSON object per line:
//   {"id":1,"cmd":"status"}
//   {"id":2,"cmd":"location"}                          prompts for permission the first time
//   {"id":3,"cmd":"events","from":<ms>,"to":<ms>}      prompts for permission the first time
// stdout, one JSON object per line: replies carry the request's "id"; unsolicited notices
// carry "event": "ready" | "calendarChanged" | "locationAuthorization".

import AppKit
import CoreLocation
import EventKit
import Foundation

// Be our own "responsible process" so permissions attach to this app, not to node/launchd.
// Re-execs in place (same pid and stdio) with the private disclaim spawn attribute.
func disclaimResponsibility() {
  guard getenv("CARTHING_HELPER_DISCLAIMED") == nil,
    let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_spawnattrs_setdisclaim"),
    let path = Bundle.main.executablePath
  else { return }
  typealias SetDisclaim = @convention(c) (UnsafeMutablePointer<posix_spawnattr_t?>, Int32) -> Int32
  var attr: posix_spawnattr_t?
  posix_spawnattr_init(&attr)
  posix_spawnattr_setflags(&attr, Int16(POSIX_SPAWN_SETEXEC))
  _ = unsafeBitCast(sym, to: SetDisclaim.self)(&attr, 1)
  setenv("CARTHING_HELPER_DISCLAIMED", "1", 1)
  var argv: [UnsafeMutablePointer<CChar>?] = CommandLine.arguments.map { strdup($0) } + [nil]
  posix_spawn(nil, path, nil, &attr, &argv, environ)
}
disclaimResponsibility()
setvbuf(stdout, nil, _IOLBF, 0)

func send(_ obj: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj),
    let line = String(data: data, encoding: .utf8)
  else { return }
  print(line)
}

func hex(_ color: NSColor?) -> String {
  guard let c = color?.usingColorSpace(.sRGB) else { return "#8e8e93" }
  return String(format: "#%02x%02x%02x", Int(c.redComponent * 255), Int(c.greenComponent * 255), Int(c.blueComponent * 255))
}

/// A video-call link from the event's location, URL or notes, for events whose location doesn't
/// say where the meeting is (the link is often only in the invite's notes).
let callPattern = try! NSRegularExpression(
  pattern: #"https?://([a-z0-9-]+\.)*(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|facetime\.apple\.com)(/[^\s<>"')]*)?"#,
  options: [.caseInsensitive])
func callLink(_ ev: EKEvent) -> String? {
  for text in [ev.location, ev.url?.absoluteString, ev.notes].compactMap({ $0 }) {
    let range = NSRange(text.startIndex..., in: text)
    if let match = callPattern.firstMatch(in: text, range: range), let r = Range(match.range, in: text) {
      return String(text[r])
    }
  }
  return nil
}

final class Helper: NSObject, CLLocationManagerDelegate {
  let store = EKEventStore()
  let locationManager = CLLocationManager()
  let geocoder = CLGeocoder()
  var locationWaiters: [Any] = []
  var askedForCalendar = false

  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.desiredAccuracy = kCLLocationAccuracyKilometer
    NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: store, queue: .main) { _ in
      send(["event": "calendarChanged"])
    }
  }

  var locationStatus: String {
    switch locationManager.authorizationStatus {
    case .notDetermined: return "notDetermined"
    case .denied: return "denied"
    case .restricted: return "restricted"
    default: return "authorized"
    }
  }

  var calendarStatus: String {
    switch EKEventStore.authorizationStatus(for: .event) {
    case .notDetermined: return "notDetermined"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .writeOnly: return "writeOnly"
    case .fullAccess: return "authorized"
    @unknown default: return "unknown"
    }
  }

  func handle(_ msg: [String: Any]) {
    let id = msg["id"] ?? NSNull()
    switch msg["cmd"] as? String {
    case "status":
      send(["id": id, "ok": true, "location": locationStatus, "calendar": calendarStatus])
    case "location":
      location(id)
    case "events":
      events(id, from: msg["from"] as? Double ?? 0, to: msg["to"] as? Double ?? 0)
    case "calendars":
      calendars(id)
    default:
      send(["id": id, "ok": false, "error": "unknown command"])
    }
  }

  // MARK: Location

  func location(_ id: Any) {
    switch locationManager.authorizationStatus {
    case .denied, .restricted:
      send(["id": id, "ok": false, "status": locationStatus])
    case .notDetermined:
      locationWaiters.append(id)
      locationManager.requestWhenInUseAuthorization()
    default:
      locationWaiters.append(id)
      locationManager.requestLocation()
    }
  }

  func flushLocation(_ reply: [String: Any]) {
    let ids = locationWaiters
    locationWaiters = []
    for id in ids { send(reply.merging(["id": id]) { $1 }) }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    send(["event": "locationAuthorization", "status": locationStatus])
    guard !locationWaiters.isEmpty else { return }
    switch manager.authorizationStatus {
    case .notDetermined: break
    case .denied, .restricted: flushLocation(["ok": false, "status": locationStatus])
    default: manager.requestLocation()
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let loc = locations.last, !locationWaiters.isEmpty else { return }
    geocoder.reverseGeocodeLocation(loc) { placemarks, _ in
      let p = placemarks?.first
      self.flushLocation([
        "ok": true, "status": "authorized",
        "lat": loc.coordinate.latitude, "lon": loc.coordinate.longitude,
        "accuracy": loc.horizontalAccuracy,
        "name": p?.locality ?? p?.subAdministrativeArea ?? p?.administrativeArea ?? "",
        "region": p?.administrativeArea ?? "", "country": p?.isoCountryCode ?? "",
      ])
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    flushLocation(["ok": false, "status": "unavailable", "error": error.localizedDescription])
  }

  // MARK: Calendar

  func events(_ id: Any, from: Double, to: Double) {
    let status = EKEventStore.authorizationStatus(for: .event)
    if status == .notDetermined && !askedForCalendar {
      askedForCalendar = true
      store.requestFullAccessToEvents { _, _ in
        DispatchQueue.main.async { self.events(id, from: from, to: to) }
      }
      return
    }
    guard status == .fullAccess else {
      send(["id": id, "ok": false, "status": calendarStatus])
      return
    }
    let predicate = store.predicateForEvents(
      withStart: Date(timeIntervalSince1970: from / 1000), end: Date(timeIntervalSince1970: to / 1000), calendars: nil)
    let events = store.events(matching: predicate)
      .filter { ev in
        ev.status != .canceled
          && !(ev.attendees?.contains { $0.isCurrentUser && $0.participantStatus == .declined } ?? false)
      }
      .sorted { $0.startDate < $1.startDate }
      .prefix(80)
      .map { ev -> [String: Any] in
        [
          "title": ev.title ?? "", "location": ev.location ?? "",
          "start": ev.startDate.timeIntervalSince1970 * 1000, "end": ev.endDate.timeIntervalSince1970 * 1000,
          "allDay": ev.isAllDay, "calendar": ev.calendar.title, "color": hex(ev.calendar.color),
          "calendarId": ev.calendar.calendarIdentifier,
          "call": callLink(ev) ?? "",
          // The event's alerts, as ms before its start (negative = after). Location-based
          // ("when I leave") alerts have no time, so they're left out.
          "alerts": (ev.alarms ?? []).filter { $0.proximity == .none }.map { alarm -> Double in
            if let date = alarm.absoluteDate { return (ev.startDate.timeIntervalSince(date)) * 1000 }
            return -alarm.relativeOffset * 1000
          },
        ]
      }
    send(["id": id, "ok": true, "status": "authorized", "events": Array(events)])
  }

  /// Every event calendar the Mac knows about, so the settings page can offer them as choices.
  func calendars(_ id: Any) {
    guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
      send(["id": id, "ok": false, "status": calendarStatus])
      return
    }
    let list = store.calendars(for: .event)
      .sorted { ($0.source.title, $0.title) < ($1.source.title, $1.title) }
      .map { cal -> [String: Any] in
        ["id": cal.calendarIdentifier, "title": cal.title, "color": hex(cal.color), "account": cal.source.title]
      }
    send(["id": id, "ok": true, "status": "authorized", "calendars": list])
  }
}

let helper = Helper()
send(["event": "ready", "location": helper.locationStatus, "calendar": helper.calendarStatus])

Thread {
  while let line = readLine() {
    guard let data = line.data(using: .utf8),
      let msg = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    else { continue }
    DispatchQueue.main.async { helper.handle(msg) }
  }
  exit(0)  // stdin closed: the bridge went away
}.start()

RunLoop.main.run()
