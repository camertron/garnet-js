#! /bin/bash

pushd vendor/prism
bundle
bundle exec rake templates
pushd javascript
npx tsc --types --allowJs --target es6 -d --emitDeclarationOnly --outDir src src/index.js
popd -1
