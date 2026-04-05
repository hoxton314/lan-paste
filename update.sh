#!/bin/bash
set -e

cd /opt/lan-paste

echo "Pulling latest..."
git pull

echo "Installing dependencies..."
yarn install

echo "Building..."
yarn workspace @lan-paste/shared build
yarn workspace @lan-paste/web build
yarn workspace @lan-paste/server build

echo "Restarting service..."
systemctl restart lan-paste

echo "Done. Status:"
systemctl status lan-paste --no-pager | head -10
