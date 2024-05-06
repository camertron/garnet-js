import {beforeAll, describe, expect, test} from '@jest/globals';
import * as Garnet from "../garnet";
import { evaluate } from '../test_helpers';
import { RubyArray, Runtime, String, Object, Qtrue } from '../garnet';
import { Hash } from '../runtime/hash';
import { Integer } from '../runtime/integer';

beforeAll(() => {
    return Garnet.init();
});

afterAll(() => {
    return Garnet.deinit();
});

describe("Keyword arguments", () => {
    test("required kwarg", async () => {
        const code = `
            def foo(arg1:)
                [arg1]
            end

            foo(arg1: "bar")
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(1);

        expect(elements[0].klass).toBe(await String.klass());
        expect(elements[0].get_data<string>()).toEqual("bar");
    });

    test("required kwarg, optional kwarg", async () => {
        const code = `
            def foo(arg1:, arg2: "baz")
                [arg1, arg2]
            end

            foo(arg1: "bar")
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);

        expect(elements[0].klass).toBe(await String.klass());
        expect(elements[0].get_data<string>()).toEqual("bar");
        expect(elements[1].klass).toBe(await String.klass());
        expect(elements[1].get_data<string>()).toEqual("baz");
    });

    test("required kwarg, optional kwarg with default expression", async () => {
        const code = `
            def baz
                "baz"
            end

            def foo(arg1:, arg2: baz)
                [arg1, arg2]
            end

            foo(arg1: "bar")
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);

        expect(elements[0].klass).toBe(await String.klass());
        expect(elements[0].get_data<string>()).toEqual("bar");
        expect(elements[1].klass).toBe(await String.klass());
        expect(elements[1].get_data<string>()).toEqual("baz");
    });

    test("required kwarg, optional kwarg referencing first kwarg", async () => {
        const code = `
            def foo(arg1:, arg2: arg1)
                [arg1, arg2]
            end

            foo(arg1: "bar")
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);

        expect(elements[0].klass).toBe(await String.klass());
        expect(elements[0].get_data<string>()).toEqual("bar");
        expect(elements[1].klass).toBe(await String.klass());
        expect(elements[1].get_data<string>()).toEqual("bar");
    });

    test("required kwarg, kwsplat", async () => {
        const code = `
            def foo(arg1:, **arg2)
                [arg1, arg2]
            end

            foo(arg1: "bar", arg2: "baz", arg3: "boo")
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);

        expect(elements[0].klass).toBe(await String.klass());
        expect(elements[0].get_data<string>()).toEqual("bar");

        expect(elements[1].klass).toBe(await Hash.klass());
        const kwargs = elements[1].get_data<Hash>();

        expect(kwargs.length).toEqual(2);
        expect(kwargs.has(await Runtime.intern("arg2"))).toBeTruthy();
        expect(kwargs.has(await Runtime.intern("arg3"))).toBeTruthy();

        const arg2 = await kwargs.get(await Runtime.intern("arg2"));
        expect(arg2.klass).toBe(await String.klass());
        expect(arg2.get_data<string>()).toEqual("baz");

        const arg3 = await kwargs.get(await Runtime.intern("arg3"));
        expect(arg3.klass).toBe(await String.klass());
        expect(arg3.get_data<string>()).toEqual("boo");
    });

    test("missing kwarg", async () => {
        const code = `
            def foo(arg1:)
                [arg1]
            end

            foo
        `;

        await expect(async () => await evaluate(code)).rejects.toThrow("missing keyword: :arg1");
    });

    test("kwsplat passed multiple splatted hashes and kwargs", async () => {
        const code = `
            def foo(**kwargs)
                kwargs
            end

            hash1 = { arg1: "bar" }
            hash2 = { arg3: "boo" }

            foo(**hash1, arg2: "baz", **hash2, arg4: "bit")
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await Hash.klass());

        const kwargs = result.get_data<Hash>();
        expect(kwargs.length).toEqual(4);

        for (const arg_name of ["arg1", "arg2", "arg3", "arg4"]) {
            expect(kwargs.has(await Runtime.intern(arg_name))).toBeTruthy();
        }

        const arg1 = await kwargs.get(await Runtime.intern("arg1"));
        expect(arg1.klass).toBe(await String.klass());
        expect(arg1.get_data<string>()).toEqual("bar");

        const arg2 = await kwargs.get(await Runtime.intern("arg2"));
        expect(arg2.klass).toBe(await String.klass());
        expect(arg2.get_data<string>()).toEqual("baz");

        const arg3 = await kwargs.get(await Runtime.intern("arg3"));
        expect(arg3.klass).toBe(await String.klass());
        expect(arg3.get_data<string>()).toEqual("boo");

        const arg4 = await kwargs.get(await Runtime.intern("arg4"));
        expect(arg4.klass).toBe(await String.klass());
        expect(arg4.get_data<string>()).toEqual("bit");
    });

    describe("method passed kwargs with non-symbol keys", () => {
        test("errors for required kwargs", async () => {
            const code = `
                def foo(arg1:)
                    [arg1]
                end

                foo("arg1" => "foo")
            `;

            await expect(async () => await evaluate(code)).rejects.toThrow("missing keyword: :arg1");
        });

        test("puts non-symbol keys into the kwsplat", async () => {
            const code = `
                def foo(arg1:, **kwargs)
                    [arg1, kwargs]
                end

                foo(arg1: "bar", "arg2" => "baz", 3 => "boo")
            `;

            const result = await evaluate(code);
            expect(result.klass).toBe(await RubyArray.klass());

            const elements = result.get_data<RubyArray>().elements;
            expect(elements.length).toEqual(2);

            expect(elements[1].klass).toBe(await Hash.klass());
            const kwsplat = elements[1].get_data<Hash>();

            expect(await kwsplat.has(await String.new("arg2"))).toBeTruthy();
            expect(await kwsplat.has(await Integer.get(3))).toBeTruthy();
        });

        test("allows kwsplats mixed with individual kwargs", async () => {
            const code = `
                def foo(**kwargs)
                    [kwargs]
                end

                hash1 = { arg1: "bar", arg3: "boo" }
                hash2 = { arg2: "baz", arg4: "bit" }

                foo(arg0: "arg0", **hash1, arg5: "arg5", **hash2)
            `;

            const result = await evaluate(code);
            expect(result.klass).toBe(await RubyArray.klass());

            const elements = result.get_data<RubyArray>().elements;
            expect(elements.length).toEqual(1);

            const kwargs = elements[0].get_data<Hash>();
            expect(kwargs.length).toEqual(6);

            for (const arg of ["arg0", "arg1", "arg2", "arg3", "arg4", "arg5"]) {
                expect(kwargs.has(await Runtime.intern(arg))).toBeTruthy();
            }

            const arg0 = await kwargs.get(await Runtime.intern("arg0"));
            expect(arg0.klass).toBe(await String.klass());
            expect(arg0.get_data<string>()).toEqual("arg0");

            const arg1 = await kwargs.get(await Runtime.intern("arg1"));
            expect(arg1.klass).toBe(await String.klass());
            expect(arg1.get_data<string>()).toEqual("bar");

            const arg2 = await kwargs.get(await Runtime.intern("arg2"));
            expect(arg2.klass).toBe(await String.klass());
            expect(arg2.get_data<string>()).toEqual("baz");

            const arg3 = await kwargs.get(await Runtime.intern("arg3"));
            expect(arg3.klass).toBe(await String.klass());
            expect(arg3.get_data<string>()).toEqual("boo");

            const arg4 = await kwargs.get(await Runtime.intern("arg4"));
            expect(arg4.klass).toBe(await String.klass());
            expect(arg4.get_data<string>()).toEqual("bit");

            const arg5 = await kwargs.get(await Runtime.intern("arg5"));
            expect(arg5.klass).toBe(await String.klass());
            expect(arg5.get_data<string>()).toEqual("arg5");
        });
    });
});
