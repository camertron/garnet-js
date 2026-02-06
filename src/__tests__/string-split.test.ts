import {beforeAll, describe, expect, test} from '@jest/globals';
import * as Garnet from "../garnet";
import { evaluate } from '../test_helpers';

beforeAll(() => {
    return Garnet.init();
});

afterAll(() => {
    return Garnet.deinit();
});

const convert_arr = (arr: Garnet.RValue): string[] => {
  return arr.get_data<Garnet.RubyArray>().elements.map(element => {
    return element.get_data<string>();
  });
}

describe("String#split", () => {
    test("with no block given, returns the array of substrings", async () => {
        expect(convert_arr(await evaluate("'abracadabra'.split('a')"))).toEqual(["", "br", "c", "d", "br"]);
    });

    test("when the field separator is nil or a single space, splits at each sequence of whitespace", async () => {
        expect(convert_arr(await evaluate("'foo bar baz'.split(nil)"))).toEqual(["foo", "bar", "baz"]);
        expect(convert_arr(await evaluate("'foo bar baz'.split(' ')"))).toEqual(["foo", "bar", "baz"]);
        expect(convert_arr(await evaluate("\"foo \\n\\tbar\\t\\n  baz\".split(' ')"))).toEqual(["foo", "bar", "baz"]);
        expect(convert_arr(await evaluate("'foo  bar   baz'.split(' ')"))).toEqual(["foo", "bar", "baz"]);
        expect(convert_arr(await evaluate("''.split(' ')"))).toEqual([]);
    });

    test("when field separator is an empty string, splits at every character", async () => {
        expect(convert_arr(await evaluate("'abracadabra'.split('')"))).toEqual(["a", "b", "r", "a", "c", "a", "d", "a", "b", "r", "a"]);
        expect(convert_arr(await evaluate("''.split('')"))).toEqual([]);
        expect(convert_arr(await evaluate("'тест'.split('')"))).toEqual(["т", "е", "с", "т"]);
        expect(convert_arr(await evaluate("'こんにちは'.split('')"))).toEqual(["こ", "ん", "に", "ち", "は"]);
    });

    test("when field separator is a non-empty string, but not a single space, uses that string as the separator", async () => {
        expect(convert_arr(await evaluate("'abracadabra'.split('a')"))).toEqual(["", "br", "c", "d", "br"]);
        expect(convert_arr(await evaluate("'abracadabra'.split('ab')"))).toEqual(["", "racad", "ra"]);
        expect(convert_arr(await evaluate("''.split('a')"))).toEqual([]);
        expect(convert_arr(await evaluate("'тест'.split('т')"))).toEqual(["", "ес"]);
        expect(convert_arr(await evaluate("'こんにちは'.split('に')"))).toEqual(["こん", "ちは"]);
    });

    test("when field separator is a Regexp, splits at each occurrence of a matching substring", async () => {
        expect(convert_arr(await evaluate("'abracadabra'.split(/ab/)"))).toEqual(["", "racad", "ra"]);
        expect(convert_arr(await evaluate("'1 + 1 == 2'.split(/\\W+/)"))).toEqual(["1", "1", "2"]);
        expect(convert_arr(await evaluate("'abracadabra'.split(//)"))).toEqual(["a", "b", "r", "a", "c", "a", "d", "a", "b", "r", "a"]);
    });

    test("if the Regexp contains groups, their matches are included in the returned array", async () => {
        expect(convert_arr(await evaluate("'1:2:3'.split(/(:)()()/, 2)"))).toEqual(["1", ":", "", "", "2:3"]);
    });

    test("when limit is zero, there is no limit on the size of the array, but trailing empty strings are omitted", async () => {
        expect(convert_arr(await evaluate("'abracadabra'.split('', 0)"))).toEqual(["a", "b", "r", "a", "c", "a", "d", "a", "b", "r", "a"]);

        // Empty string after last 'a' omitted.
        expect(convert_arr(await evaluate("'abracadabra'.split('a', 0)"))).toEqual(["", "br", "c", "d", "br"]);
    });

    test("when limit is a positive integer, the size of the result is no more than n - 1 and trailing empty strings are included", async () => {
        expect(convert_arr(await evaluate("'abracadabra'.split('', 3)"))).toEqual(["a", "b", "racadabra"]);
        expect(convert_arr(await evaluate("'abracadabra'.split('a', 3)"))).toEqual(["", "br", "cadabra"]);
        expect(convert_arr(await evaluate("'abracadabra'.split('', 30)"))).toEqual(["a", "b", "r", "a", "c", "a", "d", "a", "b", "r", "a", ""]);
        expect(convert_arr(await evaluate("'abracadabra'.split('a', 30)"))).toEqual(["", "br", "c", "d", "br", ""]);
        expect(convert_arr(await evaluate("'abracadabra'.split('', 1)"))).toEqual(["abracadabra"]);
        expect(convert_arr(await evaluate("'abracadabra'.split('a', 1)"))).toEqual(["abracadabra"]);
    });

    test("when limit is negative, there is no limit on the size of the array, and trailing empty strings are not omitted", async () => {
        expect(convert_arr(await evaluate("'abracadabra'.split('', -1)"))).toEqual(["a", "b", "r", "a", "c", "a", "d", "a", "b", "r", "a", ""]);
        expect(convert_arr(await evaluate("'abracadabra'.split('a', -1)"))).toEqual(["", "br", "c", "d", "br", ""]);
    });
});
