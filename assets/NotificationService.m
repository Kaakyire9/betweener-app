// Notification Service Extension for rich push (images) on iOS.
//
// Expo Push supports `richContent.image`, but iOS will only render images if your
// app includes a Notification Service Extension (NSE) that downloads the image
// and attaches it to the notification.
//
// This file is consumed by `expo-notification-service-extension-plugin` during
// `expo prebuild` / EAS Build.

#import <UserNotifications/UserNotifications.h>

@interface NotificationService : UNNotificationServiceExtension

@property (nonatomic, copy) void (^contentHandler)(UNNotificationContent *contentToDeliver);
@property (nonatomic, strong) UNMutableNotificationContent *bestAttemptContent;

@end

@implementation NotificationService

static NSString * _Nullable BTAsString(id _Nullable v) {
  if (v && [v isKindOfClass:[NSString class]]) {
    return (NSString *)v;
  }
  return nil;
}

static BOOL BTLooksLikeHttpUrl(NSString * _Nullable s) {
  if (!s || s.length < 8) return NO;
  NSString *lower = [s lowercaseString];
  return [lower hasPrefix:@"http://"] || [lower hasPrefix:@"https://"];
}

// Find an image URL in common Expo push payload shapes.
// We prefer specific keys, then fall back to a shallow scan.
- (NSString * _Nullable)findImageUrl:(NSDictionary *)userInfo {
  if (!userInfo) return nil;

  // Expo JS gets the "data" object at `notification.request.content.data`.
  id dataObj = userInfo[@"data"];
  if (dataObj && [dataObj isKindOfClass:[NSDictionary class]]) {
    NSDictionary *data = (NSDictionary *)dataObj;
    NSString *richImage = nil;
    id richObj = data[@"richContent"];
    if (richObj && [richObj isKindOfClass:[NSDictionary class]]) {
      richImage = BTAsString(((NSDictionary *)richObj)[@"image"]);
    }
    if (BTLooksLikeHttpUrl(richImage)) return richImage;

    NSString *image = BTAsString(data[@"image"]);
    if (BTLooksLikeHttpUrl(image)) return image;

    NSString *avatar = BTAsString(data[@"avatar_url"]);
    if (BTLooksLikeHttpUrl(avatar)) return avatar;

    NSString *avatar2 = BTAsString(data[@"avatarUrl"]);
    if (BTLooksLikeHttpUrl(avatar2)) return avatar2;
  }

  // Some payloads may put richContent at the top-level.
  id richObj = userInfo[@"richContent"];
  if (richObj && [richObj isKindOfClass:[NSDictionary class]]) {
    NSString *richImage = BTAsString(((NSDictionary *)richObj)[@"image"]);
    if (BTLooksLikeHttpUrl(richImage)) return richImage;
  }

  NSString *image = BTAsString(userInfo[@"image"]);
  if (BTLooksLikeHttpUrl(image)) return image;

  NSString *avatar = BTAsString(userInfo[@"avatar_url"]);
  if (BTLooksLikeHttpUrl(avatar)) return avatar;

  NSString *avatar2 = BTAsString(userInfo[@"avatarUrl"]);
  if (BTLooksLikeHttpUrl(avatar2)) return avatar2;

  // Shallow scan (best-effort) to handle unexpected nesting.
  for (id key in userInfo) {
    id value = userInfo[key];
    if ([value isKindOfClass:[NSString class]]) {
      NSString *s = (NSString *)value;
      if (BTLooksLikeHttpUrl(s)) return s;
    } else if ([value isKindOfClass:[NSDictionary class]]) {
      NSDictionary *d = (NSDictionary *)value;
      NSString *candidate = BTAsString(d[@"image"]) ?: BTAsString(d[@"avatar_url"]) ?: BTAsString(d[@"avatarUrl"]);
      if (BTLooksLikeHttpUrl(candidate)) return candidate;
    }
  }

  return nil;
}

- (NSString *)fileExtensionForResponse:(NSURLResponse *)response url:(NSURL *)url {
  NSString *mime = response.MIMEType ?: @"";
  NSString *lower = [mime lowercaseString];
  if ([lower hasPrefix:@"image/"]) {
    NSString *sub = [lower substringFromIndex:6];
    if ([sub isEqualToString:@"jpeg"] || [sub isEqualToString:@"jpg"]) return @"jpg";
    if ([sub isEqualToString:@"png"]) return @"png";
    if ([sub isEqualToString:@"gif"]) return @"gif";
    if ([sub isEqualToString:@"webp"]) return @"webp";
    if ([sub isEqualToString:@"heic"]) return @"heic";
  }

  NSString *pathExt = url.pathExtension;
  if (pathExt && pathExt.length > 0 && pathExt.length <= 8) {
    return [pathExt lowercaseString];
  }

  return @"jpg";
}

- (void)didReceiveNotificationRequest:(UNNotificationRequest *)request
                 withContentHandler:(void (^)(UNNotificationContent * _Nonnull))contentHandler {
  self.contentHandler = contentHandler;
  self.bestAttemptContent = [request.content mutableCopy];

  NSDictionary *userInfo = request.content.userInfo;
  NSString *imageUrlString = [self findImageUrl:userInfo];
  if (!BTLooksLikeHttpUrl(imageUrlString)) {
    self.contentHandler(self.bestAttemptContent);
    return;
  }

  NSURL *imageUrl = [NSURL URLWithString:imageUrlString];
  if (!imageUrl) {
    self.contentHandler(self.bestAttemptContent);
    return;
  }

  NSURLSessionDataTask *task =
    [[NSURLSession sharedSession] dataTaskWithURL:imageUrl
                                completionHandler:^(NSData * _Nullable data, NSURLResponse * _Nullable response, NSError * _Nullable error) {
      if (error || !data || !response) {
        self.contentHandler(self.bestAttemptContent);
        return;
      }

      NSString *ext = [self fileExtensionForResponse:response url:imageUrl];
      NSString *tmpDir = [NSTemporaryDirectory() stringByAppendingPathComponent:[[NSUUID UUID] UUIDString]];
      NSError *dirErr = nil;
      [[NSFileManager defaultManager] createDirectoryAtPath:tmpDir
                                withIntermediateDirectories:YES
                                                 attributes:nil
                                                      error:&dirErr];
      if (dirErr) {
        self.contentHandler(self.bestAttemptContent);
        return;
      }

      NSString *filePath = [tmpDir stringByAppendingPathComponent:[NSString stringWithFormat:@"image.%@", ext]];
      BOOL ok = [data writeToFile:filePath atomically:YES];
      if (!ok) {
        self.contentHandler(self.bestAttemptContent);
        return;
      }

      NSError *attachErr = nil;
      NSURL *fileUrl = [NSURL fileURLWithPath:filePath];
      UNNotificationAttachment *attachment =
        [UNNotificationAttachment attachmentWithIdentifier:@"bt_image" URL:fileUrl options:nil error:&attachErr];

      if (attachment && !attachErr) {
        self.bestAttemptContent.attachments = @[ attachment ];
      }

      self.contentHandler(self.bestAttemptContent);
    }];

  [task resume];
}

- (void)serviceExtensionTimeWillExpire {
  // Called just before the extension will be terminated by the system.
  // Deliver whatever we have so far.
  if (self.contentHandler && self.bestAttemptContent) {
    self.contentHandler(self.bestAttemptContent);
  }
}

@end

