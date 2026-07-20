#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ContextPDFTextExtractor, NSObject)

RCT_EXTERN_METHOD(extractText:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
