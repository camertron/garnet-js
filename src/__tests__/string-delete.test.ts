import {beforeAll, describe, expect, test} from '@jest/globals';
import * as Garnet from "../garnet";
import { evaluate } from '../test_helpers';

beforeAll(() => {
    return Garnet.init();
});

afterAll(() => {
    return Garnet.deinit();
});

describe("String#delete", () => {
    test("single-charactor selector", async () => {
        expect((await evaluate("'abracadabra'.delete('a')")).get_data<string>()).toEqual("brcdbr");
        expect((await evaluate("'abracadabra'.delete('b')")).get_data<string>()).toEqual("aracadara");
        expect((await evaluate("'abracadabra'.delete('x')")).get_data<string>()).toEqual("abracadabra");
        expect((await evaluate("'abracadabra'.delete('')")).get_data<string>()).toEqual("abracadabra");

        expect((await evaluate("'тест'.delete('т')")).get_data<string>()).toEqual("ес");
        expect((await evaluate("'тест'.delete('е')")).get_data<string>()).toEqual("тст");

        expect((await evaluate("'よろしくお願いします'.delete('よ')")).get_data<string>()).toEqual("ろしくお願いします");
        expect((await evaluate("'よろしくお願いします'.delete('し')")).get_data<string>()).toEqual("よろくお願います");
    });

    test("multi-character selector", async () => {
        expect((await evaluate("'abracadabra'.delete('ab')")).get_data<string>()).toEqual("rcdr");
        expect((await evaluate("'abracadabra'.delete('abc')")).get_data<string>()).toEqual("rdr");
        expect((await evaluate("'abracadabra'.delete('abcd')")).get_data<string>()).toEqual("rr");
        expect((await evaluate("'abracadabra'.delete('abcdr')")).get_data<string>()).toEqual("");
        expect((await evaluate("'abracadabra'.delete('abcdrx')")).get_data<string>()).toEqual("");
    });

    test("selector order does not matter", async () => {
        expect((await evaluate("'abracadabra'.delete('ba') == 'abracadabra'.delete('ab')")).get_data<boolean>()).toEqual(true);
        expect((await evaluate("'abracadabra'.delete('baab') == 'abracadabra'.delete('ab')")).get_data<boolean>()).toEqual(true);
    });

    test("forms a single selector that is the intersection of characters in all selectors", async () => {
        expect((await evaluate("'abcdefg'.delete('abcde', 'dcbfg') == 'abcdefg'.delete('bcd')")).get_data<boolean>()).toEqual(true);
        expect((await evaluate("'abcdefg'.delete('abc', 'def') == 'abcdefg'.delete('')")).get_data<boolean>()).toEqual(true);
    });

    test("carets negate patterns", async () => {
        expect((await evaluate("'abracadabra'.delete('^bc')")).get_data<string>()).toEqual("bcb");
    });

    test("dashes specify character ranges", async () => {
        expect((await evaluate("'abracadabra'.delete('a-c')")).get_data<string>()).toEqual("rdr");
    });

    test("backslash escapes special characters", async () => {
        expect((await evaluate("'abracadabra'.delete('\\\\^bc')")).get_data<string>()).toEqual("araadara");
        expect((await evaluate("'abracadabra'.delete('a\\\\-c')")).get_data<string>()).toEqual("brdbr");
        expect((await evaluate("'foo\\\\bar\\\\baz'.delete('\\\\')")).get_data<string>()).toEqual("foobarbaz");
    });

    test("usages may be mixed", async () => {
        // Multiple ranges.
        expect((await evaluate("'abracadabra'.delete('a-cq-t')")).get_data<string>()).toEqual("d");

        // Range mixed with plain characters.
        expect((await evaluate("'abracadabra'.delete('ac-d')")).get_data<string>()).toEqual("brbr");

        // Range mixed with negation.
        expect((await evaluate("'abracadabra'.delete('^a-c')")).get_data<string>()).toEqual("abacaaba");
    });

    test("all forms may be mixed for multiple selectors", async () => {
        expect((await evaluate("'abracadabra'.delete('^abc', '^def') == 'abracadabra'.delete('^abcdef')")).get_data<boolean>()).toEqual(true);
        expect((await evaluate("'abracadabra'.delete('a-e', 'c-g') == 'abracadabra'.delete('cde')")).get_data<boolean>()).toEqual(true);
        expect((await evaluate("'abracadabra'.delete('^abc', 'c-g') == 'abracadabra'.delete('defg')")).get_data<boolean>()).toEqual(true);
    });
});
