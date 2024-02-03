#! /bin/bash

if [[ "$1" == "--release" ]]; then
    echo "Building in release mode"
    export RELEASE=1
else
    echo "Building in debug mode"
fi

npx tsc && rollup -c
