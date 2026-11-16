#!/bin/sh
# Puts the kit in kit/: xr-kit's main with the tap-to-move branch merged in (the showcase
# uses @gadxr/aframe-tap-to-move and the tap cursor it adds to Scene3D, neither released
# yet). Once that branch is merged and published, delete kit/, drop `kit/packages/*` from
# pnpm-workspace.yaml and depend on the npm versions instead.
set -e
cd "$(dirname "$0")/.."
if [ -d kit ]; then
  echo "kit/ is already here. Remove it to set it up again."
  exit 1
fi
git clone https://github.com/gad-sh/xr-kit.git kit
cd kit
git checkout -b showcase origin/main
# The two branches only disagree in docs and the root package.json, which nothing here uses.
git -c user.name=showcase -c user.email=showcase@localhost merge --no-edit -X ours origin/feat/mobile-tap-to-move
cd ..
pnpm install
