#! /bin/bash

yarn build
yarn pack -o camertron-yarv-js.tgz
git subtree split --prefix demo -b release
git checkout release
echo $(jq '.dependencies."@camertron/yarv-js" = "./camertron-yarv-js.tgz"' package.json) > package.json
yarn install --mode update-lockfile
git add camertron-yarv-js.tgz package.json yarn.lock .yarn/install-state.gz
git commit -m "Release"
git push -f heroku release:main
git checkout -
git branch -D release
