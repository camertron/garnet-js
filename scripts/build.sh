#! /bin/bash

npx tsc

if [[ "$1" == "--release" ]]; then
    echo "Building in release mode"
    npx vite build --minify terser
else
    echo "Building in debug mode"
    npx vite build
fi

brotli -f -q 11 -o dist/garnet.js.br dist/garnet.js
gzip -9 -c dist/garnet.js > dist/garnet.js.gz
ls -lah dist | grep garnet.js
