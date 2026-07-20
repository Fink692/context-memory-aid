# Context Desktop for macOS

This target packages the production Expo web build in a small native AppKit/WebKit application.

- The bundled site is served only on `127.0.0.1:43127` so Expo's root-relative assets, routing, and persistent browser storage work normally.
- External links open in the default browser.
- `context://` links route back into the desktop app.
- The app includes standard macOS menus and a resizable window.

From the repository root, build the latest web bundle and package the app:

```sh
npm run build:desktop:macos
```

The packaged app is written to `apps/desktop-macos/build/Context Desktop.app` and is ad-hoc signed for local installation.
