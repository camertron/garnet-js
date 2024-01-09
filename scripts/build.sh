#! /bin/bash

if [[ "$1" == "--release" ]]; then
    echo "Building in release mode"
    export RELEASE=1
else
    echo "Building in debug mode"
fi

npx tsc && rollup -c
brotli -f -q 11 -o dist/yarv.js.br dist/yarv.js
gzip -9 -c dist/yarv.js > dist/yarv.js.gz
