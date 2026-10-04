#!/bin/bash
set -e

SERVICE="${LAN_PASTE_SERVICE:-lan-paste-server}"

cd "${LAN_PASTE_DIR:-/opt/lan-paste}"

echo "Pulling latest..."
git pull

echo "Installing dependencies..."
yarn install --frozen-lockfile

echo "Building..."
yarn workspace @lan-paste/shared build
yarn workspace @lan-paste/web build
yarn workspace @lan-paste/server build

echo "Restarting service..."
systemctl restart "$SERVICE"

echo "Done. Status:"
systemctl status "$SERVICE" --no-pager | head -10
