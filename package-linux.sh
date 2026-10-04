#!/usr/bin/env bash
# Package the DeepSeek Harness Desktop application for Linux x64 as an AppImage.
# Mirrors apps/desktop/scripts/package-target.ts, limited to the linux-x64 target.
set -euo pipefail

REPO="/home/user/Documents/Default Project/deepseek-harness"
TARGET="linux-x64"
BUILD_ROOT="$REPO/apps/desktop/.desktop-build/targets/$TARGET"
PACKED_DSH="$BUILD_ROOT/packed/dsh"
PACKED_VENDOR="$BUILD_ROOT/packed/vendor"
PACKED_LANDLOCK="$BUILD_ROOT/packed/landlock"
LOGDIR="/tmp/opencode/package-logs"
mkdir -p "$LOGDIR"

# /tmp is a 2 GB tmpfs: the runtime install extracts a 146 MB Office engine, and pnpm skips an
# optional dependency that fails to unpack. Stage on the data disk instead.
export TMPDIR="$REPO/apps/desktop/.desktop-build/tmp"
mkdir -p "$TMPDIR"

export DSH_DESKTOP_APP_ID="${DSH_DESKTOP_APP_ID:-com.deepseek.dsh}"
export DSH_DESKTOP_AUTO_UPDATE_ENV="${DSH_DESKTOP_AUTO_UPDATE_ENV:-production}"
export DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN="${DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN:-https://download.deepseek.com}"
export DSH_DESKTOP_TARGET_PLATFORM=linux
export DSH_DESKTOP_TARGET_ARCH=x64
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"

step() { echo "[$(date +%H:%M:%S)] === $* ==="; }

cd "$REPO"

# Prerequisite: the workspace build (tsc host/client, tsdown host/client, build:web) and the client
# build record written by scripts/client-build-environment.ts must already be in place.

step "release:pack dsh"
pnpm run release:pack --family dsh --out "$PACKED_DSH" 2>&1 | tee "$LOGDIR/02-pack-dsh.log" | tail -10

step "pack desktop-host"
pnpm --dir apps/desktop-host pack --pack-destination "$PACKED_DSH" 2>&1 | tee "$LOGDIR/03-pack-host.log" | tail -5

step "release:pack vendor"
pnpm run release:pack --family vendor --out "$PACKED_VENDOR" 2>&1 | tee "$LOGDIR/04-pack-vendor.log" | tail -10

step "pack landlock entry"
rm -rf "$PACKED_LANDLOCK"
mkdir -p "$PACKED_LANDLOCK"
pnpm --dir native/system run build:ts 2>&1 | tee "$LOGDIR/05-build-native.log" | tail -5
pnpm --dir native/system/packages/entry pack --pack-destination "$PACKED_LANDLOCK" 2>&1 | tee "$LOGDIR/06-pack-landlock.log" | tail -5

step "prepare:runtime"
pnpm --filter @deepseek-ai/dsh-desktop run prepare:runtime 2>&1 | tee "$LOGDIR/07-prepare-runtime.log" | tail -20

step "prepare:packages"
pnpm --filter @deepseek-ai/dsh-desktop run prepare:packages 2>&1 | tee "$LOGDIR/08-prepare-packages.log" | tail -10

step "prepare:dsh"
pnpm --filter @deepseek-ai/dsh-desktop run prepare:dsh 2>&1 | tee "$LOGDIR/09-prepare-dsh.log" | tail -20

step "electron-builder --linux AppImage"
(
  cd "$REPO/apps/desktop"
  pnpm exec electron-builder --config electron-builder.config.mjs --linux --x64 --publish never
) 2>&1 | tee "$LOGDIR/10-electron-builder.log" | tail -30

step "done"
find "$BUILD_ROOT/artifacts" -maxdepth 2 \( -name '*.AppImage' -o -name '*.deb' \) -exec ls -lh {} \;
