#! /bin/bash

set -ex

rm -rf node_modules/@ruby/prism
sha=$(jq -r '.dependencies."@ruby/prism"' package.json | cut -d'?' -f 2)
git clone --single-branch --branch main https://github.com/ruby/prism node_modules/@ruby/prism
pushd node_modules/@ruby/prism
git checkout $sha
rm -rf .git
bundle
bundle exec rake templates
pushd javascript
npx tsc --types --allowJs --target es6 -d --emitDeclarationOnly --outDir src src/index.js
popd -1
