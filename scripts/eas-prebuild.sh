#!/bin/sh
set -e

if [ -d "ios" ]; then
  echo "Running iOS pod install with repo update..."
  cd ios
  pod install --repo-update
  cd ..
fi
