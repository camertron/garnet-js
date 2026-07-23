![The Garnet.js logo](/garnet-logotype.svg)

Garnet is an implementation of the YARV (Yet Another Ruby VM) virtual machine and Ruby standard library written in TypeScript.

## Goals

Writing an implementation of an entire programming language is hard. Writing an implementation of a programming language that has 30+ years of development behind it is especially hard. However, Garnet isn't just another Ruby implementation - its primary reason for being is because I wanted an excuse to learn more about Ruby and virtual machines. For that reason, Garnet is not production ready nor particularly complete. Maybe one day it will be, but for now it's just a hobby project I work on for fun.

If you, like me, enjoy hacking on virtual machines and playing with code, then this project might be for you.

If instead you just want something that works, try [Opal](https://github.com/opalrb/opal).

Aside from the project's educational objectives, it's different from Opal and other JavaScript-based Ruby implementations in the following important ways:

1. Garnet interprets Ruby code directly. There is no transpilation step.
2. Garnet aims for bug-for-bug compatibility with MRI (Matz's Ruby Interpreter, i.e. cruby, i.e. regular 'ol Ruby).
3. Garnet uses the [Prism](https://github.com/ruby/prism) parser, the same parser MRI uses, to parse and understand Ruby code. The project includes a copy of Prism compiled into a WASM module.
4. Garnet uses a [WASM-compiled version](https://github.com/camertron/onigmo-wasm) of the [Onigmo](https://github.com/k-takata/Onigmo) regular expression engine, the same one that MRI uses. This provides 1:1 compatibility with MRI regex behavior.

## Getting Started

Right now, Garnet isn't available on npm or published anywhere. It's only runnable with nodejs directly inside this repository. The project can also run in the browser. Take a look at the demo at [https://garnet-js.dev](https://garnet-js.dev)

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

Garnet comes with a handy dev script you can use instead of installing things by hand. You'll still have to install Docker, but that's considerably easier than language toolchains, etc. I recommend either [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/), a Docker alternative.

Once you have Docker installed, run:

```bash
exe/dev setup
```

This will build the Docker image and install JavaScript dependencies into your local checkout.

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

Garnet comes with two test suites: a Jest-powered one for sanity checking, and the massive ruby/spec test suite that all Ruby implementations test against. The repository contains copies of both ruby/spec and ruby/mspec, Ruby's simple test runner.

#### Jest tests

Run the Jest tests by executing:

```bash
npm run test
```

Or, in docker like so:

```bash
exe/dev npm run test
```

#### ruby/spec tests

Currently, paths to test files must be provided (i.e. running the whole test suite doesn't work yet). Identify which test file to run, then run it like so:

```bash
exe/mspec-run ruby/spec/core/array/clear_spec.rb
```

Or, in docker like so:

```bash
exe/dev mspec-run ruby/spec/core/array/clear_spec.rb
```

## Contributing

Before contributing, please read the code of conduct rules in CODE_OF_CONDUCT.md. Anyone contributing to Garnet must agree to abide by the code of conduct.

### Anatomy of a Garnet method

Internally, Garnet uses a lot of the same terminology as MRI:

|MRI                 |Garnet                          |Description                                                      |
|--------------------|--------------------------------|-----------------------------------------------------------------|
| `VALUE`            | `RValue`                       | A reference to a Ruby object                                    |
| `Qnil`             | `Qnil`                         | The only instance of `NilClass`                                 |
| `Qtrue`, `Qfalse`  | `Qtrue`, `Qfalse`              | The only instances of `TrueClass` and `FalseClass` respectively |
| `rb_scan_args`     | `Args.scan(...)`               | Convenience method for extracting positional arguments          |
| `rb_check_frozen`  | `RubyObject.check_frozen(...)` | Raises if the given object is frozen                            |
| `Check_Type()`     | `Runtime.assert_type(...)`     | Raises if the given object is not of the given type             |

Garnet implementations of Ruby methods tend to follow this general shape:

1. *Check temperature*: If the method mutates `self` and is frozen, raise a `FrozenError`.
2. *Extract arguments*: Pull arguments out of the positional args array and keyword args hash.
3. *Assert argument types*: Make sure the method has been called with arguments of the appropriate types.
4. *Act*: Do the thing the method is supposed to do.
5. *Return a value*: All Ruby methods return a value, even if that value is `nil` (or more accurately `Qnil`).

Let's take a look at an example. We'll implement `Array#include?`. I've included the `Array` class definition for completeness:

```typescript
import { Class, ObjectClass, Qfalse, Qtrue, RValue, Runtime } from "../runtime";
import { Object } from "./object";

// This is the JavaScript class that represents a Ruby array
export class RubyArray {
    // ...
}

// Defines a class named `Array` that inherits from `Object`
Runtime.define_class("Array", ObjectClass, async (klass: Class) => {
    klass.define_native_method("include?", async (self: RValue, args: RValue[]): Promise<RValue> => {
        // extract a required positional argument
        const [target_rval] = await Args.scan("1", args);

        // actually do the thing, i.e. try to find the given object in the array
        for (const elem of self.get_data<RubyArray>().elements) {
            // this is how to call Ruby methods, `==` in this case
            if ((await Object.send(elem, "==", [target_rval])).is_truthy()) {
                return Qtrue;
            }
        }

        return Qfalse;
   });
});
```

### `Args.scan`

The arg scanner follows the same conventions as MRI's `rb_scan_args`. It accepts two arguments: a pattern string and the args, i.e. an array of `RValue`s. The pattern string can contain a maximum of four characters in the following order:

1. The number of leading required arguments: a digit
1. The number of optional arguments: a digit
1. A splatted argument: the literal character "*"
1. The number of trailing required arguments: a digit

Each character is optional, so you can leave out the characters for things you don’t need. However, the parsing of the format string is greedy: `1*` describes a method with one mandatory argument and a splat. If you want one optional argument and a splat you must specify `01*`.

### A note about the use of LLM-assisted coding tools

This project does not accept LLM-generated contributions, full stop.

While I do believe that LLMs are a generally harmful and fraught technology, the LLM ban has nothing to do with ideology. Garnet is an avenue for learning. Delegating that learning to an AI tool entirely defeats the purpose.

## License

MIT

## Author

* Cameron C. Dutro ([@camertron](https://github.com/camertron))
