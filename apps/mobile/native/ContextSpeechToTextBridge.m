#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(ContextSpeechToText, RCTEventEmitter)

RCT_EXTERN_METHOD(getStatus:(NSString *)localeTag
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(start:(NSString *)sessionId
                  localeTag:(NSString *)localeTag
                  maxDurationSeconds:(nonnull NSNumber *)maxDurationSeconds
                  maxCharacters:(nonnull NSNumber *)maxCharacters
                  contextualStrings:(NSArray<NSString *> *)contextualStrings
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(NSString *)sessionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancel:(NSString *)sessionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
