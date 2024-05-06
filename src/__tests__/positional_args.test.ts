import {beforeAll, describe, expect, test} from '@jest/globals';
import * as Garnet from "../garnet";
import { evaluate } from '../test_helpers';
import { RubyArray, String } from '../garnet';

beforeAll(() => {
    return Garnet.init();
});

afterAll(() => {
    return Garnet.deinit();
});

describe("Positional arguments", () => {
    test("positional arg, positional arg", async () => {
        const code = `
            def foo(arg1, arg2)
                [arg1, arg2]
            end

            foo("bar", "baz")
        `

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);

        expect(elements[0].klass).toBe(await String.klass());
        expect(elements[0].get_data<string>()).toEqual("bar");
        expect(elements[1].klass).toBe(await String.klass());
        expect(elements[1].get_data<string>()).toEqual("baz");
    });

    test("positional arg, optional arg", async () => {
        const code = `
            def foo(arg1, arg2 = "baz")
                [arg1, arg2]
            end

            foo("bar")
        `

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);

        expect(elements[0].klass).toBe(await String.klass());
        expect(elements[0].get_data<string>()).toEqual("bar");
        expect(elements[1].klass).toBe(await String.klass());
        expect(elements[1].get_data<string>()).toEqual("baz");
    });

    test("positional arg, optional arg with default expression", async () => {
        const code = `
            def baz
                "baz"
            end

            def foo(arg1, arg2 = baz)
                [arg1, arg2]
            end

            foo("bar")
        `

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);

        expect(elements[0].klass).toBe(await String.klass());
        expect(elements[0].get_data<string>()).toEqual("bar");
        expect(elements[1].klass).toBe(await String.klass());
        expect(elements[1].get_data<string>()).toEqual("baz");
    });

    test("positional arg, single-value splat", async () => {
        const code = `
            def foo(arg1, *arg2)
                [arg1, arg2]
            end

            foo("bar", "baz")
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);

        expect(elements[0].klass).toBe(await String.klass());
        expect(elements[0].get_data<string>()).toEqual("bar");

        expect(elements[1].klass).toBe(await RubyArray.klass());
    });

    test("positional arg, multi-value splat", async () => {
        const code = `
            def foo(arg1, *arg2)
                [arg1, arg2]
            end

            foo("bar", "baz", "boo")
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);

        expect(elements[0].klass).toBe(await String.klass());
        expect(elements[0].get_data<string>()).toEqual("bar");

        expect(elements[1].klass).toBe(await RubyArray.klass());
        const splat_arr = elements[1].get_data<RubyArray>().elements;

        expect(splat_arr.length).toEqual(2);
        expect(splat_arr[0].get_data<string>()).toEqual("baz");
        expect(splat_arr[1].get_data<string>()).toEqual("boo");
    });

    test("positional arg, splat, positional arg", async () => {
        const code = `
            def foo(arg1, *arg2, arg3)
                [arg1, arg2, arg3]
            end

            foo("bar", "baz", "boo", "bit")
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(3);

        expect(elements[0].klass).toBe(await String.klass());
        expect(elements[0].get_data<string>()).toEqual("bar");

        expect(elements[1].klass).toBe(await RubyArray.klass());
        const splat_arr = elements[1].get_data<RubyArray>().elements;

        expect(splat_arr.length).toEqual(2);
        expect(splat_arr[0].get_data<string>()).toEqual("baz");
        expect(splat_arr[1].get_data<string>()).toEqual("boo");

        expect(elements[2].klass).toBe(await String.klass());
        expect(elements[2].get_data<string>()).toEqual("bit");
    });

    test("missing positional arg", async () => {
        const code = `
            def foo(arg1)
                [arg1]
            end

            foo
        `;

        await expect(async () => await evaluate(code)).rejects.toThrow(
            "wrong number of arguments (given 0, expected 1)"
        );
    });
});
