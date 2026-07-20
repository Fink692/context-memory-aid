#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}
REPO_ROOT=${SCRIPT_DIR:h:h}
WEB_DIST="$REPO_ROOT/apps/mobile/dist"
BUILD_ROOT="$SCRIPT_DIR/build"
APP_PATH="$BUILD_ROOT/Context Desktop.app"
mkdir -p "$BUILD_ROOT"
STAGING_ROOT=$(mktemp -d /tmp/context-desktop-build.XXXXXX)
STAGING_APP="$STAGING_ROOT/Context Desktop.app"
CONTENTS="$STAGING_APP/Contents"
MACOS_DIR="$CONTENTS/MacOS"
RESOURCES_DIR="$CONTENTS/Resources"
ICONSET_DIR="$STAGING_ROOT/ContextDesktop.iconset"
SOURCE_ICON="$REPO_ROOT/apps/mobile/assets/icon.png"

cleanup() {
  if [[ -d "$STAGING_ROOT" ]]; then
    rm -rf "$STAGING_ROOT"
  fi
}
trap cleanup EXIT

if [[ ! -f "$WEB_DIST/index.html" ]]; then
  print -u2 "Missing Expo web export at $WEB_DIST. Run the mobile web export first."
  exit 1
fi

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$ICONSET_DIR"

swiftc \
  "$SCRIPT_DIR/Sources/main.swift" \
  -o "$MACOS_DIR/ContextDesktop" \
  -O \
  -framework AppKit \
  -framework Network \
  -framework WebKit

cp "$SCRIPT_DIR/Info.plist" "$CONTENTS/Info.plist"
ditto --noextattr --noqtn "$WEB_DIST" "$RESOURCES_DIR/Web"

sips -z 16 16 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null
iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/ContextDesktop.icns"

xattr -cr "$STAGING_APP"
codesign --force --deep --sign - --timestamp=none "$STAGING_APP"
codesign --verify --deep --strict "$STAGING_APP"

if [[ -e "$APP_PATH" ]]; then
  BACKUP_PATH="$BUILD_ROOT/Context Desktop.previous.app"
  if [[ -e "$BACKUP_PATH" ]]; then
    rm -rf "$BACKUP_PATH"
  fi
  mv "$APP_PATH" "$BACKUP_PATH"
fi
mv "$STAGING_APP" "$APP_PATH"

# Filesystem metadata can be attached while the bundle moves into Documents.
# Clear it and verify the signature at the final install path.
xattr -cr "$APP_PATH"
codesign --force --deep --sign - --timestamp=none "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

print "$APP_PATH"
