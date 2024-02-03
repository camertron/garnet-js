#! /bin/bash

yarn build
yarn pack -o camertron-garnet-js.tgz
git subtree split --prefix demo -b release
git checkout release
echo $(jq '.dependencies."@camertron/garnet-js" = "./camertron-garnet-js.tgz"' package.json) > package.json
yarn install --mode update-lockfile
git add camertron-garnet-js.tgz package.json yarn.lock .yarn/install-state.gz
git commit -m "Release"
git push -f heroku release:main
git checkout -
git branch -D release
