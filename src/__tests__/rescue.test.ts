import {beforeAll, describe, expect, test} from '@jest/globals';
import * as Garnet from "../garnet";
import { Array as RubyArray, ArrayClass, SymbolClass, TrueClass, StringClass } from '../runtime';
import { LoadError } from '../errors';

beforeAll(() => {
    return Garnet.init();
});

// Can't get this to work with ts
// expect.extend({
//     toEqualRuby(received: RValue, expected: string) {
//         const klass = (() => {
//             if (expected.startsWith(":")) {
//                 return SymbolClass;
//             } else {
//                 return StringClass;
//             }
//         })();

//         const received_str = Object.send(received, "inspect").get_data<string>();
//         const pass = received.klass == klass && received_str === expected;

//         const message = () => {
//             return `Expected: ${expected} (${klass.get_data<Class>().name})\nReceived: ${received_str} (${received.klass.get_data<Class>().name})`
//         }

//         return {
//             pass,
//             message
//         };
//     }
// });

describe("begin / rescue / end", () => {
    test("rescues named exceptions", async () => {
        const code = `
            begin
                require "foo"
                outcome = :no_error
            rescue LoadError
                outcome = :handled
            end

            outcome
        `;

        const result = await Garnet.evaluate(code);
        expect(result.klass).toBe(SymbolClass);
        expect(result.get_data<string>()).toEqual("handled");
    });

    test("runs the appropriate rescue clause", async () => {
        const code = `
            handled_name_error = false
            handled_load_error = false

            begin
                require "foo"
            rescue NameError
                handled_name_error = true
            rescue LoadError
                handled_load_error = true
            end

            [handled_name_error, handled_load_error]
        `;

        const result = await Garnet.evaluate(code);
        expect(result.klass).toBe(ArrayClass);
        const results = result.get_data<RubyArray>().elements.map((val) => val.get_data<boolean>());
        expect(results).toEqual([false, true]);
    });

    test("rescues exceptions that inherit from a named base", async () => {
        const code = `
            begin
                require "foo"
                outcome = :no_error
            rescue ScriptError
                outcome = :handled
            end

            outcome
        `;

        const result = await Garnet.evaluate(code);
        expect(result.klass).toBe(SymbolClass);
        expect(result.get_data<string>()).toEqual("handled");
    });

    test("does not execute else when an error is raised", async () => {
        const code = `
            begin
                require "foo"
                :no_error
            rescue LoadError
                :handled
            else
                :else
            end
        `;

        const result = await Garnet.evaluate(code);
        expect(result.klass).toBe(SymbolClass);
        expect(result.get_data<string>()).toEqual("handled");
    });

    test("returns a value from the begin clause", async () => {
        const code = `
            begin
                :no_error
            rescue LoadError
                :handled
            end
        `;

        const result = await Garnet.evaluate(code);
        expect(result.klass).toBe(SymbolClass);
        expect(result.get_data<string>()).toEqual("no_error");
    });

    test("returns a value from the rescue clause", async () => {
        const code = `
            begin
                require "foo"
                :no_error
            rescue LoadError
                :handled
            end
        `;

        const result = await Garnet.evaluate(code);
        expect(result.klass).toBe(SymbolClass);
        expect(result.get_data<string>()).toEqual("handled");
    });

    test("returns a value from the else clause", async () => {
        const code = `
            begin
                :began
            rescue LoadError
                :handled
            else
                :no_error
            end
        `;

        const result = await Garnet.evaluate(code);
        expect(result.klass).toBe(SymbolClass);
        expect(result.get_data<string>()).toEqual("no_error");
    });

    test("supports rescuing with expressions", async () => {
        const code = `
            err_class = LoadError

            begin
                require "foo"
                :began
            rescue err_class
                :handled
            end
        `;

        const result = await Garnet.evaluate(code);
        expect(result.klass).toBe(SymbolClass);
        expect(result.get_data<string>()).toEqual("handled");
    });

    test("re-raises unhandled errors", () => {
        const code = `
            begin
                require "foo"
                :no_error
            rescue StandardError  # LoadError does not inherit from StandardError
                :handled
            end
        `;

        expect(() => Garnet.evaluate(code)).toThrow(LoadError);
    });

    test("rescues StandardError by default if no error class is provided", () => {
        const code = `
            begin
                require "foo"
                :no_error
            rescue
                :handled
            end
        `;

        expect(() => Garnet.evaluate(code)).toThrow(LoadError);
    });

    test("runs the ensure clause on error", async () => {
        const code = `
            ensure_reached = true

            begin
                require "foo"
            rescue LoadError
                :handled
            ensure
                ensure_reached = true
            end

            ensure_reached
        `;

        const result = await Garnet.evaluate(code);
        expect(result.klass).toBe(TrueClass);
    });

    test("runs the ensure clause on else", async () => {
        const code = `
            ensure_reached = true

            begin
            else
                :no_error
            ensure
                ensure_reached = true
            end

            ensure_reached
        `;

        const result = await Garnet.evaluate(code);
        expect(result.klass).toBe(TrueClass);
    });

    test("runs the ensure clause when error is unhandled", async () => {
        const code = `
            ensure_reached = true

            begin
                begin
                    require "foo"
                ensure
                    ensure_reached = true
                end
            rescue LoadError
            end

            ensure_reached
        `;

        const result = await Garnet.evaluate(code);
        expect(result.klass).toBe(TrueClass);
    });

    test("provides the error as a local", async () => {
        const code = `
            begin
                require "foo"
            rescue LoadError => e
                e.message
            end
        `;

        const result = await Garnet.evaluate(code);
        expect(result.klass).toBe(StringClass);
        expect(result.get_data<string>()).toEqual("cannot load such file -- foo");
    });
});
