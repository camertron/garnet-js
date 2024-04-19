import {beforeAll, describe, expect, test} from '@jest/globals';
import * as Garnet from "../garnet";
import { evaluate } from '../test_helpers';
import { Qtrue, RubyArray, Runtime, String, TrueClass } from '../garnet';
import { Hash } from '../runtime/hash';

beforeAll(() => {
    return Garnet.init();
});

afterAll(() => {
    return Garnet.deinit();
});

describe("Arguments", () => {
    test("splat, kwsplat", async () => {
        const code = `
            def foo(*args, **kwargs)
                [args, kwargs]
            end

            splat_args = ["arg1", "arg2"]
            kwsplat_args = { arg3: "arg3", arg4: "arg4" }

            foo(*splat_args, **kwsplat_args)
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(RubyArray.klass);

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);

        expect(elements[0].klass).toBe(RubyArray.klass);
        const splat_args = elements[0].get_data<RubyArray>();
        expect(splat_args.elements.length).toEqual(2);

        expect(splat_args.elements[0].klass).toBe(String.klass);
        expect(splat_args.elements[0].get_data<string>()).toEqual("arg1");
        expect(splat_args.elements[1].klass).toBe(String.klass);
        expect(splat_args.elements[1].get_data<string>()).toEqual("arg2");

        expect(elements[1].klass).toBe(Hash.klass);
        const kwsplat_args = elements[1].get_data<Hash>();
        expect(kwsplat_args.length).toEqual(2);

        expect(kwsplat_args.get(Runtime.intern("arg3")).klass).toBe(String.klass);
        expect(kwsplat_args.get(Runtime.intern("arg3")).get_data<string>()).toEqual("arg3");
        expect(kwsplat_args.get(Runtime.intern("arg4")).klass).toBe(String.klass);
        expect(kwsplat_args.get(Runtime.intern("arg4")).get_data<string>()).toEqual("arg4");
    });
});
