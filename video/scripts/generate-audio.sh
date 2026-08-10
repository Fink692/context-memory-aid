#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
VIDEO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PUBLIC_DIR="$VIDEO_DIR/public"
NODE_BIN=${NODE_BIN:-node}
FFMPEG=$($NODE_BIN -e "process.stdout.write(require('ffmpeg-static'))")
VOICE_TEMP=$(mktemp -t context-pass-voice.XXXXXX.aiff)

cleanup() {
  rm -f "$VOICE_TEMP"
}
trap cleanup EXIT

mkdir -p "$PUBLIC_DIR"

/usr/bin/say -v Samantha -r 185 -o "$VOICE_TEMP" "Meeting copilots are useful when they know the relationship. But they should not need your inbox, contact book, or every private note. Context Pass turns an AI Passport request into exact, visible choices. You approve which memories can travel. The pass is bound to one recipient, one purpose, and thirty minutes. Every read leaves a receipt. Revoke it, and the next request is denied. Useful context travels. Control stays with you."

"$FFMPEG" -y -i "$VOICE_TEMP" -ar 48000 -ac 2 -codec:a libmp3lame -b:a 192k "$PUBLIC_DIR/voice.mp3"
"$FFMPEG" -y -f lavfi -i "anoisesrc=color=pink:duration=28:sample_rate=48000" -af "lowpass=f=700,volume=0.008,afade=t=in:st=0:d=1,afade=t=out:st=26.5:d=1.5" -ac 2 -codec:a libmp3lame -b:a 128k "$PUBLIC_DIR/bed.mp3"
"$FFMPEG" -y -f lavfi -i "sine=frequency=1100:duration=0.10:sample_rate=48000" -af "volume=0.10,afade=t=out:st=0.05:d=0.05" -ac 2 "$PUBLIC_DIR/click.wav"
"$FFMPEG" -y -f lavfi -i "sine=frequency=1650:duration=0.08:sample_rate=48000" -af "volume=0.055,afade=t=out:st=0.04:d=0.04" -ac 2 "$PUBLIC_DIR/tick.wav"
"$FFMPEG" -y -f lavfi -i "sine=frequency=125:duration=0.22:sample_rate=48000" -af "volume=0.08,afade=t=out:st=0.10:d=0.12" -ac 2 "$PUBLIC_DIR/deny.wav"
