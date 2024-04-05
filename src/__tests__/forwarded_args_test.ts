import {beforeAll, describe, expect, test} from '@jest/globals';
import * as Garnet from "../garnet";
import { evaluate } from '../test_helpers';
import { RubyArray, Runtime, String } from '../garnet';
import { Hash } from '../runtime/hash';

beforeAll(() => {
    return Garnet.init();
});

afterAll(() => {
    return Garnet.deinit();
});

describe("Forwarded arguments", () => {
    test("args forwarded to an interpreted method", async () => {
        const code = `
            def bar(*args, **kwargs)
                [args, kwargs]
            end

            def foo(...)
                bar(...)
            end

            foo("arg1", "arg2", arg3: "arg3", arg4: "arg4")
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(RubyArray.klass);

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);

        expect(elements[0].klass).toBe(RubyArray.klass);
        const positional_args = elements[0].get_data<RubyArray>().elements;

        expect(positional_args[0].klass).toEqual(String.klass);
        expect(positional_args[0].get_data<string>()).toEqual("arg1");

        expect(positional_args[1].klass).toEqual(String.klass);
        expect(positional_args[1].get_data<string>()).toEqual("arg2");

        expect(elements[1].klass).toEqual(Hash.klass);
        const kwargs = elements[1].get_data<Hash>();
        expect(kwargs.length).toEqual(2);

        expect(kwargs.get(Runtime.intern("arg3")).klass).toBe(String.klass);
        expect(kwargs.get(Runtime.intern("arg3")).get_data<string>()).toEqual("arg3");

        expect(kwargs.get(Runtime.intern("arg4")).klass).toBe(String.klass);
        expect(kwargs.get(Runtime.intern("arg4")).get_data<string>()).toEqual("arg4");
    });

    test("args forwarded to a native method", async () => {
        const code = `
            class Foo
                # methods defined this way are native methods
                define_method(:bar) do |*args, **kwargs|
                    [args, kwargs]
                end

                def foo(...)
                    bar(...)
                end
            end

            Foo.new.foo("arg1", "arg2", arg3: "arg3", arg4: "arg4")
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(RubyArray.klass);

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);

        expect(elements[0].klass).toBe(RubyArray.klass);
        const positional_args = elements[0].get_data<RubyArray>().elements;

        expect(positional_args[0].klass).toEqual(String.klass);
        expect(positional_args[0].get_data<string>()).toEqual("arg1");

        expect(positional_args[1].klass).toEqual(String.klass);
        expect(positional_args[1].get_data<string>()).toEqual("arg2");

        expect(elements[1].klass).toEqual(Hash.klass);
        const kwargs = elements[1].get_data<Hash>();
        expect(kwargs.length).toEqual(2);

        expect(kwargs.get(Runtime.intern("arg3")).klass).toBe(String.klass);
        expect(kwargs.get(Runtime.intern("arg3")).get_data<string>()).toEqual("arg3");

        expect(kwargs.get(Runtime.intern("arg4")).klass).toBe(String.klass);
        expect(kwargs.get(Runtime.intern("arg4")).get_data<string>()).toEqual("arg4");
    });
});
