import {beforeAll, describe, expect, test} from '@jest/globals';
import { TrueClass } from '../runtime';
import { RubyArray } from "../runtime/array";
import { Symbol } from "../runtime/symbol";
import { RubyString } from "../runtime/string";
import { evaluate } from '../test_helpers';
import { LoadError } from '../garnet';
import * as Garnet from "../garnet";

beforeAll(() => {
    return Garnet.init();
});

afterAll(() => {
    return Garnet.deinit();
});

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

        const result = await evaluate(code);
        expect(result.klass).toBe(await Symbol.klass());
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

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());
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

        const result = await evaluate(code);
        expect(result.klass).toBe(await Symbol.klass());
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

        const result = await evaluate(code);
        expect(result.klass).toBe(await Symbol.klass());
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

        const result = await evaluate(code);
        expect(result.klass).toBe(await Symbol.klass());
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

        const result = await evaluate(code);
        expect(result.klass).toBe(await Symbol.klass());
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

        const result = await evaluate(code);
        expect(result.klass).toBe(await Symbol.klass());
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

        const result = await evaluate(code);
        expect(result.klass).toBe(await Symbol.klass());
        expect(result.get_data<string>()).toEqual("handled");
    });

    test("re-raises unhandled errors", async () => {
        const code = `
            begin
                require "foo"
                :no_error
            rescue StandardError  # LoadError does not inherit from StandardError
                :handled
            end
        `;

        await expect(async () => await evaluate(code)).rejects.toThrow(LoadError);
    });

    test("rescues StandardError by default if no error class is provided", async () => {
        const code = `
            begin
                require "foo"
                :no_error
            rescue
                :handled
            end
        `;

        await expect(async () => await evaluate(code)).rejects.toThrow(LoadError);
    });

    test("runs the ensure clause on error", async () => {
        const code = `
            ensure_reached = false

            begin
                require "foo"
            rescue LoadError
                :handled
            ensure
                ensure_reached = true
            end

            ensure_reached
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(TrueClass);
    });

    test("runs the ensure clause on else", async () => {
        const code = `
            ensure_reached = false

            begin
            rescue
            else
                :no_error
            ensure
                ensure_reached = true
            end

            ensure_reached
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(TrueClass);
    });

    test("runs the ensure clause when error is unhandled", async () => {
        const code = `
            ensure_reached = false

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

        const result = await evaluate(code);
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

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyString.klass());
        expect(result.get_data<string>()).toEqual("cannot load such file -- foo");
    });
});
