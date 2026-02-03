import {beforeAll, describe, expect, test} from '@jest/globals';
import * as Garnet from "../garnet";
import { evaluate } from '../test_helpers';

beforeAll(() => {
    return Garnet.init();
});

afterAll(() => {
    return Garnet.deinit();
});

describe("String#count", () => {
    test("single-charactor selector", async () => {
        expect((await evaluate("'abracadabra'.count('a')")).get_data<number>()).toEqual(5);
        expect((await evaluate("'abracadabra'.count('b')")).get_data<number>()).toEqual(2);
        expect((await evaluate("'abracadabra'.count('x')")).get_data<number>()).toEqual(0);
        expect((await evaluate("'abracadabra'.count('')")).get_data<number>()).toEqual(0);

        expect((await evaluate("'тест'.count('т')")).get_data<number>()).toEqual(2);
        expect((await evaluate("'тест'.count('е')")).get_data<number>()).toEqual(1);

        expect((await evaluate("'よろしくお願いします'.count('よ')")).get_data<number>()).toEqual(1);
        expect((await evaluate("'よろしくお願いします'.count('し')")).get_data<number>()).toEqual(2);
    });

    test("multi-character selector", async () => {
        expect((await evaluate("'abracadabra'.count('ab')")).get_data<number>()).toEqual(7);
        expect((await evaluate("'abracadabra'.count('abc')")).get_data<number>()).toEqual(8);
        expect((await evaluate("'abracadabra'.count('abcd')")).get_data<number>()).toEqual(9);
        expect((await evaluate("'abracadabra'.count('abcdr')")).get_data<number>()).toEqual(11);
        expect((await evaluate("'abracadabra'.count('abcdrx')")).get_data<number>()).toEqual(11);
    });

    test("selector order does not matter", async () => {
        expect((await evaluate("'abracadabra'.count('ba') == 'abracadabra'.count('ab')")).get_data<boolean>()).toEqual(true);
        expect((await evaluate("'abracadabra'.count('baab') == 'abracadabra'.count('ab')")).get_data<boolean>()).toEqual(true);
    });

    test("forms a single selector that is the intersection of characters in all selectors", async () => {
        expect((await evaluate("'abcdefg'.count('abcde', 'dcbfg') == 'abcdefg'.count('bcd')")).get_data<boolean>()).toEqual(true);
        expect((await evaluate("'abcdefg'.count('abc', 'def') == 'abcdefg'.count('')")).get_data<boolean>()).toEqual(true);
    });

    test("carets negate patterns", async () => {
        expect((await evaluate("'abracadabra'.count('^bc')")).get_data<number>()).toEqual(8);
    });

    test("dashes specify character ranges", async () => {
        expect((await evaluate("'abracadabra'.count('a-c')")).get_data<number>()).toEqual(8);
    });

    test("backslash escapes special characters", async () => {
        expect((await evaluate("'abracadabra'.count('\\\\^bc')")).get_data<number>()).toEqual(3);
        expect((await evaluate("'abracadabra'.count('a\\\\-c')")).get_data<number>()).toEqual(6);
        expect((await evaluate("'foo\\\\bar\\\\baz'.count('\\\\')")).get_data<number>()).toEqual(2);
    });

    test("usages may be mixed", async () => {
        // Multiple ranges.
        expect((await evaluate("'abracadabra'.count('a-cq-t')")).get_data<number>()).toEqual(10);

        // Range mixed with plain characters.
        expect((await evaluate("'abracadabra'.count('ac-d')")).get_data<number>()).toEqual(7);

        // Range mixed with negation.
        expect((await evaluate("'abracadabra'.count('^a-c')")).get_data<number>()).toEqual(3);
    });

    test("all forms may be mixed for multiple selectors", async () => {
        expect((await evaluate("'abracadabra'.count('^abc', '^def') == 'abracadabra'.count('^abcdef')")).get_data<boolean>()).toEqual(true);
        expect((await evaluate("'abracadabra'.count('a-e', 'c-g') == 'abracadabra'.count('cde')")).get_data<boolean>()).toEqual(true);
        expect((await evaluate("'abracadabra'.count('^abc', 'c-g') == 'abracadabra'.count('defg')")).get_data<boolean>()).toEqual(true);
    });
});
