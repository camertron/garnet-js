import {beforeAll, afterEach, describe, expect, test} from '@jest/globals';
import * as Garnet from "../garnet";
import { evaluate } from '../test_helpers';
import { RubyArray, Integer } from '../garnet';
import { ExecutionContext } from '../execution_context';

beforeAll(() => {
    return Garnet.init();
});

afterEach(() => {
    // Clear global variables and aliases between tests to prevent state pollution
    const ec = ExecutionContext.current;
    if (ec) {
        // Clear all user-defined global variables (keep system ones)
        const systemGlobals = ['$:', '$"', '$,', '$/', '$stdout', '$stderr'];
        for (const key of Object.keys(ec.globals)) {
            if (!systemGlobals.includes(key)) {
                delete ec.globals[key];
            }
        }
        // Clear all global aliases
        ec.global_aliases = {};
    }
});

afterAll(() => {
    return Garnet.deinit();
});

describe("Global variable aliasing", () => {
    test("can create a new global variable, synonym of the original", async () => {
        const code = `
            $a = 1
            alias $b $a
            [$a, $b]
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);
        expect(elements[0].get_data<number>()).toEqual(1);
        expect(elements[1].get_data<number>()).toEqual(1);
    });

    test("changing aliased variable changes the original", async () => {
        const code = `
            $a = 1
            alias $b $a
            $b = 2
            [$a, $b]
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);
        expect(elements[0].get_data<number>()).toEqual(2);
        expect(elements[1].get_data<number>()).toEqual(2);
    });

    test("changing original variable changes the alias", async () => {
        const code = `
            $a = 1
            alias $b $a
            $a = 3
            [$a, $b]
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);
        expect(elements[0].get_data<number>()).toEqual(3);
        expect(elements[1].get_data<number>()).toEqual(3);
    });

    test("can override an existing global variable and make them synonyms", async () => {
        const code = `
            $a = 1
            $b = 2
            alias $b $a
            [$a, $b]
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);
        expect(elements[0].get_data<number>()).toEqual(1);
        expect(elements[1].get_data<number>()).toEqual(1);
    });

    test("supports aliasing twice the same global variables", async () => {
        const code = `
            $a = 1
            alias $b $a
            alias $b $a
            [$a, $b]
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(2);
        expect(elements[0].get_data<number>()).toEqual(1);
        expect(elements[1].get_data<number>()).toEqual(1);
    });

    test("chained aliases work correctly", async () => {
        const code = `
            $a = 1
            alias $b $a
            alias $c $b
            $c = 5
            [$a, $b, $c]
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());

        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(3);
        expect(elements[0].get_data<number>()).toEqual(5);
        expect(elements[1].get_data<number>()).toEqual(5);
        expect(elements[2].get_data<number>()).toEqual(5);
    });
});

