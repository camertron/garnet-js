## Garnet.js

Garnet is an implementation of the YARV (Yet Another Ruby VM) virtual machine and Ruby standard library written in TypeScript.

## Goals

Writing an implementation of an entire programming language is hard. Writing an implementation of a programming language that has 30+ years of development behind it is especially hard. However, Garnet isn't another Ruby implementation - Garnet's primary reason for being is because I wanted an excuse to learn more about Ruby and virtual machines. For that reason, Garnet is not production ready nor particularly complete. Maybe one day it will be, but for now it's just a hobby project I work on for fun.

If you, like me, enjoy hacking on virtual machines and playing with code, then this project might be for you.

If instead you just want something that works, try [Opal](https://github.com/opalrb/opal).

Aside from the project's educational objectives, it's different from Opal and other JavaScript-based Ruby implementations in the following key ways:

1. Garnet interprets Ruby code directly. There is no transpilation step.
2. Garnet aims for bug-for-bug compatibility with MRI (Matz's Ruby Interpreter, i.e. cruby, i.e. regular 'ol Ruby).
3. Garnet uses the [Prism](https://github.com/ruby/prism) parser, the same parser MRI uses, to parse and understand Ruby code. The project includes a copy of Prism compiled into a WASM module.
4. Garnet uses a [WASM-compiled version](https://github.com/camertron/onigmo-wasm) of the [Onigmo](https://github.com/k-takata/Onigmo) regular expression engine, the same one that MRI uses. This provides 1:1 compatibility with MRI regex behavior.

## Getting Started

Right now, Garnet isn't available on npm or published anywhere. It's only runnable with nodejs directly inside this repository. The project should be able to run in the browser as well, but I haven't actually tested browser compatibility in a very long time.

### Clone the repository

```bash
git clone https://github.com/camertron/garnet-js.git
```

### Install dependencies

You'll need nodejs. I personally use [asdf](https://github.com/asdf-vm/asdf) to install and manage language versions, but there are a lot of options out there. For example, I've also heard [mise](https://github.com/jdx/mise) is great. If you're using asdf, you can install nodejs by adding the [nodejs plugin](https://github.com/asdf-vm/asdf-nodejs), then running:

```bash
asdf install nodejs 25.4.0
```

Once that's done, run `npm install` to install JavaScript dependencies.

### Using Docker instead

Garnet comes with a handy dev script you can use instead of installing nodejs, etc manually. The script uses Docker, which you'll have to install. I recommend either [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/), a Docker alternative.

Once you have Docker installed, run:

```bash
exe/dev setup
```

This will build the Docker container and install JavaScript dependencies.

Make sure everything is set up and working by running:

```bash
exe/dev ruby --version
```

You should see a message of the form:

```
Garnet.js 3.2.2 +PRISM [arm64-linux6]
```

### Running code

The main executable Garnet provides lives in the exe/ directory and is perhaps unsurprisingly named `ruby`. You can run ruby code by passing `exe/ruby` the path to a file, or run a snippet of code via the `-e` command-line flag. For example, here's the canonical hello world example:

```bash
exe/ruby -e "puts 'hello world!'"
```

You should see `hello world!` printed to the console.

Note that if you're using the dev script via Docker as described above, run this instead:

```bash
exe/dev ruby -e "puts 'hello world!'"
```

Without exception, anything you can do with the regular 'ol `ruby` executable you should be able to do with `exe/ruby`. I say "should" because `exe/ruby` does not support all of `ruby`'s CLI flags yet. If you need one that doesn't exist, please consider diving in and submitting a pull request.

### Running tests

Garnet comes with two test suites, a Jest-powered one for sanity checking and the massive ruby/spec test suite and mspec test runner.

### JavaScript API

## Contributing

Please follow the code of conduct rules in CODE_OF_CONDUCT.md.

### A note about the use of LLM-assisted coding tools

This project does not accept LLM-generated contributions, full stop.

While I do believe that LLMs are a generally harmful and fraught technology, the LLM ban has nothing to do with ideology. Garnet is an avenue for learning. Delegating that learning to an AI tool entirely defeats the purpose.

## License

MIT

## Author

* Cameron C. Dutro ([@camertron](https://github.com/camertron))
