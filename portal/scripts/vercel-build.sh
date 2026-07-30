#!/usr/bin/env bash

set -euo pipefail

npm run build

# Vercel checks traced Next.js files from the repository root even though this
# project uses portal/ as its configured app root.
cp -R .next ../.next
cp package.json ../package.json
ln -s portal/node_modules ../node_modules
ln -s portal/src ../src
ln -s portal/public ../public
ln -s portal/next.config.ts ../next.config.ts

if [[ -d .data ]]; then
  ln -s portal/.data ../.data
fi
