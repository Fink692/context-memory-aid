import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const palette = {
  canvas: "#F5F4FA",
  ink: "#101014",
  muted: "#61616B",
  purple: "#5856D6",
  purpleSoft: "#EFEEFF",
  red: "#D73A49",
  white: "#FFFFFF",
};

const shots = [
  { from: 0, duration: 60 },
  { from: 60, duration: 67 },
  { from: 127, duration: 86 },
  { from: 213, duration: 61 },
  { from: 274, duration: 63 },
  { from: 337, duration: 68 },
  { from: 405, duration: 46 },
  { from: 451, duration: 64 },
  { from: 515, duration: 70 },
  { from: 585, duration: 79 },
  { from: 664, duration: 41 },
  { from: 705, duration: 53 },
  { from: 758, duration: 41 },
  { from: 799, duration: 41 },
] as const;

type MovingImageProps = {
  duration: number;
  fromScale: number;
  fromX: number;
  fromY: number;
  src: string;
  toScale: number;
  toX: number;
  toY: number;
  imageHeight: number;
  imageWidth: number;
  children?: ReactNode;
};

function MovingImage({
  children,
  duration,
  fromScale,
  fromX,
  fromY,
  imageHeight,
  imageWidth,
  src,
  toScale,
  toX,
  toY,
}: MovingImageProps) {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, duration], [fromScale, toScale], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const x = interpolate(frame, [0, duration], [fromX, toX], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [0, duration], [fromY, toY], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: palette.canvas, overflow: "hidden" }}>
      <Img
        src={staticFile(src)}
        style={{
          height: imageHeight,
          left: "50%",
          position: "absolute",
          top: "50%",
          transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`,
          transformOrigin: "center",
          width: imageWidth,
        }}
      />
      {children}
    </AbsoluteFill>
  );
}

function Cursor({
  clickAt,
  duration,
  end,
  start,
}: {
  clickAt?: number;
  duration: number;
  end: [number, number];
  start: [number, number];
}) {
  const frame = useCurrentFrame();
  const progress = spring({ frame, fps: 30, config: { damping: 18, stiffness: 90 }, durationInFrames: duration });
  const x = interpolate(progress, [0, 1], [start[0], end[0]]);
  const y = interpolate(progress, [0, 1], [start[1], end[1]]);
  const ringProgress = clickAt === undefined
    ? 0
    : interpolate(frame, [clickAt, clickAt + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ringOpacity = clickAt === undefined
    ? 0
    : interpolate(frame, [clickAt, clickAt + 2, clickAt + 10], [0, 0.75, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ left: x, pointerEvents: "none", position: "absolute", top: y }}>
      <div style={{
        background: palette.white,
        border: `5px solid ${palette.purple}`,
        borderRadius: 999,
        boxShadow: "0 8px 24px rgba(16, 16, 20, 0.24)",
        height: 30,
        transform: "translate(-50%, -50%)",
        width: 30,
      }} />
      {clickAt === undefined ? null : (
        <div style={{
          border: `5px solid ${palette.purple}`,
          borderRadius: 999,
          height: 34 + ringProgress * 72,
          left: 0,
          opacity: ringOpacity,
          position: "absolute",
          top: 0,
          transform: "translate(-50%, -50%)",
          width: 34 + ringProgress * 72,
        }} />
      )}
    </div>
  );
}

function CornerLabel({ children, tone = "purple" }: { children: ReactNode; tone?: "purple" | "red" }) {
  const frame = useCurrentFrame();
  const entrance = spring({ frame, fps: 30, config: { damping: 18, stiffness: 120 } });
  return (
    <div style={{
      ...labelStyle,
      background: tone === "red" ? "#FFF0F1" : palette.purpleSoft,
      color: tone === "red" ? palette.red : palette.purple,
      opacity: entrance,
      transform: `translateY(${(1 - entrance) * 24}px)`,
    }}>
      {children}
    </div>
  );
}

const labelStyle: CSSProperties = {
  borderRadius: 999,
  bottom: 64,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: 28,
  fontWeight: 800,
  left: 72,
  letterSpacing: 1.6,
  padding: "16px 24px",
  position: "absolute",
};

function FinalStatement() {
  const frame = useCurrentFrame();
  const entrance = spring({ frame, fps: 30, config: { damping: 16, stiffness: 100 }, durationInFrames: 34 });
  return (
    <AbsoluteFill style={{
      alignItems: "center",
      background: "linear-gradient(135deg, #F7F6FB 0%, #ECEBFF 100%)",
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      overflow: "hidden",
    }}>
      <div style={{
        color: palette.ink,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 72,
        fontWeight: 800,
        letterSpacing: -2.5,
        lineHeight: 1.04,
        maxWidth: 1250,
        opacity: entrance,
        textAlign: "center",
        transform: `scale(${0.92 + entrance * 0.08}) translateY(${(1 - entrance) * 35}px)`,
      }}>
        Useful context travels.<br />
        <span style={{ color: palette.purple }}>Control stays with you.</span>
      </div>
    </AbsoluteFill>
  );
}

export function ContextPassVideo() {
  return (
    <AbsoluteFill style={{ backgroundColor: palette.canvas }}>
      <Audio src={staticFile("bed.mp3")} volume={0.9} />
      <Audio src={staticFile("voice.mp3")} volume={1} />
      <Sequence from={213}><Audio src={staticFile("click.wav")} /></Sequence>
      <Sequence from={337}><Audio src={staticFile("tick.wav")} /></Sequence>
      <Sequence from={405}><Audio src={staticFile("tick.wav")} /></Sequence>
      <Sequence from={451}><Audio src={staticFile("tick.wav")} /></Sequence>
      <Sequence from={664}><Audio src={staticFile("click.wav")} /></Sequence>
      <Sequence from={758}><Audio src={staticFile("deny.wav")} /></Sequence>

      <Sequence from={shots[0].from} durationInFrames={shots[0].duration}>
        <MovingImage duration={shots[0].duration} fromScale={1.00} fromX={0} fromY={0} imageHeight={1200} imageWidth={1920} src="context-pass-hero.jpg" toScale={1.035} toX={0} toY={-12} />
      </Sequence>
      <Sequence from={shots[1].from} durationInFrames={shots[1].duration}>
        <MovingImage duration={shots[1].duration} fromScale={1.42} fromX={470} fromY={30} imageHeight={1200} imageWidth={1920} src="context-pass-hero.jpg" toScale={1.52} toX={505} toY={22}>
          <CornerLabel>THE SMALLEST USEFUL SLICE</CornerLabel>
        </MovingImage>
      </Sequence>
      <Sequence from={shots[2].from} durationInFrames={shots[2].duration}>
        <MovingImage duration={shots[2].duration} fromScale={1.18} fromX={-435} fromY={0} imageHeight={1200} imageWidth={1920} src="context-pass-hero.jpg" toScale={1.28} toX={-480} toY={-5}>
          <Cursor duration={shots[2].duration} end={[1375, 602]} start={[1700, 870]} />
        </MovingImage>
      </Sequence>
      <Sequence from={shots[3].from} durationInFrames={shots[3].duration}>
        <MovingImage duration={shots[3].duration} fromScale={1.75} fromX={-690} fromY={-120} imageHeight={1200} imageWidth={1920} src="context-pass-hero.jpg" toScale={1.92} toX={-765} toY={-150}>
          <Cursor clickAt={28} duration={34} end={[1185, 640]} start={[1450, 800]} />
        </MovingImage>
      </Sequence>
      <Sequence from={shots[4].from} durationInFrames={shots[4].duration}>
        <MovingImage duration={shots[4].duration} fromScale={1.03} fromX={0} fromY={90} imageHeight={1080} imageWidth={771} src="context-pass-approval.jpg" toScale={1.10} toX={0} toY={0} />
      </Sequence>
      <Sequence from={shots[5].from} durationInFrames={shots[5].duration}>
        <MovingImage duration={shots[5].duration} fromScale={1.74} fromX={0} fromY={185} imageHeight={1080} imageWidth={771} src="context-pass-approval.jpg" toScale={1.82} toX={-20} toY={210}>
          <CornerLabel>EXACT FIELDS</CornerLabel>
        </MovingImage>
      </Sequence>
      <Sequence from={shots[6].from} durationInFrames={shots[6].duration}>
        <MovingImage duration={shots[6].duration} fromScale={1.88} fromX={0} fromY={30} imageHeight={1080} imageWidth={771} src="context-pass-approval.jpg" toScale={1.96} toX={18} toY={14} />
      </Sequence>
      <Sequence from={shots[7].from} durationInFrames={shots[7].duration}>
        <MovingImage duration={shots[7].duration} fromScale={1.92} fromX={0} fromY={-120} imageHeight={1080} imageWidth={771} src="context-pass-approval.jpg" toScale={2.02} toX={-15} toY={-142} />
      </Sequence>
      <Sequence from={shots[8].from} durationInFrames={shots[8].duration}>
        <MovingImage duration={shots[8].duration} fromScale={1.82} fromX={0} fromY={-265} imageHeight={1080} imageWidth={771} src="context-pass-approval.jpg" toScale={1.98} toX={0} toY={-302}>
          <CornerLabel>PRIVATE MEANS PRIVATE</CornerLabel>
        </MovingImage>
      </Sequence>
      <Sequence from={shots[9].from} durationInFrames={shots[9].duration}>
        <MovingImage duration={shots[9].duration} fromScale={1.67} fromX={0} fromY={-410} imageHeight={1080} imageWidth={771} src="context-pass-approval.jpg" toScale={1.80} toX={0} toY={-445}>
          <CornerLabel>30 MIN · REVIEW REQUIRED</CornerLabel>
        </MovingImage>
      </Sequence>
      <Sequence from={shots[10].from} durationInFrames={shots[10].duration}>
        <MovingImage duration={shots[10].duration} fromScale={1.92} fromX={0} fromY={-505} imageHeight={1080} imageWidth={771} src="context-pass-approval.jpg" toScale={2.05} toX={0} toY={-540}>
          <Cursor clickAt={20} duration={28} end={[960, 715]} start={[1330, 920]} />
        </MovingImage>
      </Sequence>
      <Sequence from={shots[11].from} durationInFrames={shots[11].duration}>
        <MovingImage duration={shots[11].duration} fromScale={1.00} fromX={0} fromY={50} imageHeight={1080} imageWidth={771} src="context-pass-revoked.jpg" toScale={1.11} toX={0} toY={-5}>
          <CornerLabel tone="red">ACCESS RECEIPT</CornerLabel>
        </MovingImage>
      </Sequence>
      <Sequence from={shots[12].from} durationInFrames={shots[12].duration}>
        <MovingImage duration={shots[12].duration} fromScale={1.45} fromX={0} fromY={-300} imageHeight={1080} imageWidth={771} src="context-pass-revoked.jpg" toScale={1.74} toX={0} toY={-390}>
          <CornerLabel tone="red">REVOKED → DENIED</CornerLabel>
        </MovingImage>
      </Sequence>
      <Sequence from={shots[13].from} durationInFrames={shots[13].duration}>
        <FinalStatement />
      </Sequence>
    </AbsoluteFill>
  );
}
