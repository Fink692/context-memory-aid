import { Composition } from "remotion";
import { ContextPassVideo } from "./video";

export function RemotionRoot() {
  return (
    <Composition
      component={ContextPassVideo}
      durationInFrames={840}
      fps={30}
      height={1080}
      id="ContextPassVideo"
      width={1920}
    />
  );
}
