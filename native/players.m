// Every app that has something in Now Playing, not just the one macOS elected — the list Control
// Center shows when two apps have media. bridge/nowplaying/players.js loads this into /usr/bin/perl
// the way the mediaremote-adapter is loaded: since macOS 15.4 only Apple-entitled processes may read
// MediaRemote, and perl is one.
//
//   players_stream: a JSON line {"players": [...]} whenever the list changes. Each player carries
//     the same keys as the adapter's stream (title, durationMicros, processIdentifier…), so the
//     bridge reads both the same way.
//
// No commands: MediaRemote takes a command for a particular player only from Apple's own processes.
// From anything else (perl included) it goes to the player macOS elected, whichever player it
// names — sending "pause" to a browser paused Music. So the bridge controls the other players itself.
//
// MediaRemote is private. The signatures below were read off its disassembly on macOS 27.
#import <Foundation/Foundation.h>
#include <dlfcn.h>

typedef void (^ArrayBlock)(CFArrayRef);
typedef void (^InfoBlock)(CFDictionaryRef, void *);
typedef void (^StateBlock)(unsigned);

static void (*GetNowPlayingClients)(dispatch_queue_t, ArrayBlock);
static id (*GetLocalOrigin)(void);
static id (*PlayerPathCreate)(id origin, id client, id player);
static CFStringRef (*ClientBundleId)(id);
static CFStringRef (*ClientParentBundleId)(id);
static int (*ClientPid)(id);
// The flag asks for artwork data.
static void (*GetInfoForPlayer)(id path, long withArtwork, dispatch_queue_t, InfoBlock);
static void (*GetStateForPlayer)(id path, dispatch_queue_t, StateBlock);
static void (*RegisterForNotifications)(dispatch_queue_t);

static BOOL load(void) {
  void *h = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_NOW);
  if (!h) return NO;
#define SYM(var, name) if (!(var = dlsym(h, name))) { fprintf(stderr, "missing %s\n", name); return NO; }
  SYM(GetNowPlayingClients, "MRMediaRemoteGetNowPlayingClients");
  SYM(GetLocalOrigin, "MRMediaRemoteGetLocalOrigin");
  SYM(PlayerPathCreate, "MRNowPlayingPlayerPathCreate");
  SYM(ClientBundleId, "MRNowPlayingClientGetBundleIdentifier");
  SYM(ClientParentBundleId, "MRNowPlayingClientGetParentAppBundleIdentifier");
  SYM(ClientPid, "MRNowPlayingClientGetProcessIdentifier");
  SYM(GetInfoForPlayer, "MRMediaRemoteGetNowPlayingInfoForPlayer");
  SYM(GetStateForPlayer, "MRMediaRemoteGetPlaybackStateForPlayer");
  SYM(RegisterForNotifications, "MRMediaRemoteRegisterForNowPlayingNotifications");
#undef SYM
  return YES;
}

static dispatch_queue_t queue;
static const int64_t CALL_TIMEOUT = 2 * NSEC_PER_SEC;

static NSArray *clients(void) {
  __block NSArray *out = @[];
  dispatch_semaphore_t done = dispatch_semaphore_create(0);
  GetNowPlayingClients(queue, ^(CFArrayRef list) {
    if (list) out = [(__bridge NSArray *)list copy];
    dispatch_semaphore_signal(done);
  });
  dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, CALL_TIMEOUT));
  return out;
}

static NSString *str(CFStringRef s) { return s ? [(__bridge NSString *)s copy] : nil; }

// Now Playing info keys → the adapter's names (its --micros form).
static NSDictionary *player(id origin, id client) {
  id path = PlayerPathCreate(origin, client, nil);
  if (!path) return nil;
  __block NSDictionary *info = nil;
  __block unsigned state = 0;
  dispatch_semaphore_t done = dispatch_semaphore_create(0);
  GetInfoForPlayer(path, 1, queue, ^(CFDictionaryRef d, void *error) {
    if (d) info = [(__bridge NSDictionary *)d copy];
    dispatch_semaphore_signal(done);
  });
  dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, CALL_TIMEOUT));
  GetStateForPlayer(path, queue, ^(unsigned s) {
    state = s;
    dispatch_semaphore_signal(done);
  });
  dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, CALL_TIMEOUT));
  if (!info) return nil;

  NSMutableDictionary *out = [NSMutableDictionary dictionary];
  out[@"processIdentifier"] = @(ClientPid(client));
  NSString *bundle = str(ClientBundleId(client)), *parent = str(ClientParentBundleId(client));
  if (bundle) out[@"bundleIdentifier"] = bundle;
  if (parent) out[@"parentApplicationBundleIdentifier"] = parent;
  out[@"playing"] = @(state == 1); // MRPlaybackState: 1 playing, 2 paused, 3 stopped
  NSDictionary *names = @{
    @"Title": @"title", @"Artist": @"artist", @"Album": @"album",
    @"PlaybackRate": @"playbackRate", @"ContentItemIdentifier": @"contentItemIdentifier",
    @"UniqueIdentifier": @"uniqueIdentifier", @"ArtworkMIMEType": @"artworkMimeType",
    @"ArtworkIdentifier": @"artworkIdentifier",
  };
  for (NSString *key in names) {
    id v = info[[@"kMRMediaRemoteNowPlayingInfo" stringByAppendingString:key]];
    if ([v isKindOfClass:NSString.class] || [v isKindOfClass:NSNumber.class]) out[names[key]] = v;
  }
  NSNumber *duration = info[@"kMRMediaRemoteNowPlayingInfoDuration"];
  NSNumber *elapsed = info[@"kMRMediaRemoteNowPlayingInfoElapsedTime"];
  NSDate *at = info[@"kMRMediaRemoteNowPlayingInfoTimestamp"];
  NSData *art = info[@"kMRMediaRemoteNowPlayingInfoArtworkData"];
  if ([duration isKindOfClass:NSNumber.class]) out[@"durationMicros"] = @(llround(duration.doubleValue * 1e6));
  if ([elapsed isKindOfClass:NSNumber.class]) out[@"elapsedTimeMicros"] = @(llround(elapsed.doubleValue * 1e6));
  if ([at isKindOfClass:NSDate.class]) out[@"timestampEpochMicros"] = @(llround(at.timeIntervalSince1970 * 1e6));
  if ([art isKindOfClass:NSData.class] && art.length) out[@"artworkData"] = [art base64EncodedStringWithOptions:0];
  return out;
}

static NSString *lastLine = nil;

static void emit(void) {
  id origin = GetLocalOrigin();
  NSMutableArray *list = [NSMutableArray array];
  for (id client in clients()) {
    NSDictionary *p = player(origin, client);
    if (p) [list addObject:p];
  }
  NSData *json = [NSJSONSerialization dataWithJSONObject:@{@"players": list} options:0 error:nil];
  if (!json) return;
  NSString *line = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
  if ([line isEqualToString:lastLine]) return;
  lastLine = line;
  printf("%s\n", line.UTF8String);
  fflush(stdout);
}

void players_stream(void) {
  if (!load()) exit(1);
  queue = dispatch_queue_create("macthing.players.calls", DISPATCH_QUEUE_SERIAL);
  dispatch_queue_t work = dispatch_queue_create("macthing.players", DISPATCH_QUEUE_SERIAL);
  // A change anywhere (a player opening, closing, playing, a new track) is answered within 150ms;
  // a 2s poll catches anything that changes without saying so.
  __block BOOL pending = NO;
  void (^soon)(void) = ^{
    dispatch_async(work, ^{
      if (pending) return;
      pending = YES;
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 150 * NSEC_PER_MSEC), work, ^{
        pending = NO;
        emit();
      });
    });
  };
  RegisterForNotifications(dispatch_get_main_queue());
  [NSNotificationCenter.defaultCenter addObserverForName:nil object:nil queue:nil
                                              usingBlock:^(NSNotification *n) {
    if ([n.name hasPrefix:@"kMRMediaRemote"] || [n.name hasPrefix:@"MRMediaRemote"]) soon();
  }];
  dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, work);
  dispatch_source_set_timer(timer, DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC, 200 * NSEC_PER_MSEC);
  dispatch_source_set_event_handler(timer, ^{ emit(); });
  dispatch_resume(timer);
  // Quit with the bridge: its end of stdin closes.
  dispatch_source_t input = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, STDIN_FILENO, 0, work);
  dispatch_source_set_event_handler(input, ^{
    char buf[256];
    if (read(STDIN_FILENO, buf, sizeof buf) <= 0) exit(0);
  });
  dispatch_resume(input);
  CFRunLoopRun();
}
