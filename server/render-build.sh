#!/usr/bin/env bash
set -e

echo "==> [VisionControl] Building server..."
cd /opt/render/project/src
pnpm install
pnpm --filter server build
echo "==> [VisionControl] Server build complete!"
