#!/bin/sh
# Puts the kit in kit/: a clone of xr-kit's main. The showcase uses
# @gadxr/aframe-tap-to-move and the tap cursor in @gadxr/ui's Scene3D, which are on main but
# not on npm yet. Once they're published, delete kit/, drop `kit/packages/*` from
# pnpm-workspace.yaml and depend on the npm versions instead.
set -e
cd "$(dirname "$0")/.."
if [ -d kit ]; then
  echo "kit/ is already here. Remove it to set it up again (or: git -C kit pull)."
  exit 1
fi
git clone --depth 1 https://github.com/gad-sh/xr-kit.git kit
pnpm install
