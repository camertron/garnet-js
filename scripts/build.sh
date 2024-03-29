#! /bin/bash

if [[ "$1" == "--release" ]]; then
    echo "Building in release mode"
    export RELEASE=1
else
    echo "Building in debug mode"
fi

npx tsc && rollup -c
brotli -f -q 11 -o dist/garnet.js.br dist/garnet.js
gzip -9 -c dist/garnet.js > dist/garnet.js.gz
