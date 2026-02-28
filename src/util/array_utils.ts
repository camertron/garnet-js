import { RValue, Runtime } from "../runtime";
import { spaceship_compare } from "../runtime/comparable";
import { RubyString } from "../../src/runtime/string";
import { RubyArray } from "../../src/runtime/array";

const partition = async (
    array: RValue[],
    compare_fn: (a: RValue, b: RValue) => Promise<number>,
    left: number = 0,
    right: number = array.length - 1,
): Promise<number> => {
    const pivot = array[Math.floor((right + left) / 2)];
    let i = left;
    let j = right;

    while (i <= j) {
        while (await compare_fn(array[i], pivot) < 0) i ++;
        while (await compare_fn(array[j], pivot) > 0) j --;

        if (i <= j) {
            [array[i], array[j]] = [array[j], array[i]];
            i ++;
            j --;
        }
    }

    return i;
}

export const quick_sort = async (
    array: RValue[],
    compare_fn: (a: RValue, b: RValue) => Promise<number> = async (a: RValue, b: RValue) => spaceship_compare(a, b, true),
    left: number = 0,
    right: number = array.length - 1
) => {
    let index;

    if (array.length > 1) {
        index = await partition(array, compare_fn, left, right);

        if (left < index - 1) await quick_sort(array, compare_fn, left, index - 1);
        if (index < right) await quick_sort(array, compare_fn, index, right);
    }
}

const schwartzian_partition = async (
    array: [RValue, RValue][],
    compare_fn: (a: RValue, b: RValue) => Promise<number>,
    left: number = 0,
    right: number = array.length - 1
): Promise<number> => {
    const pivot = array[Math.floor((right + left) / 2)];
    let i = left;
    let j = right;

    while (i <= j) {
        while (await compare_fn(array[i][0], pivot[0]) < 0) i ++;
        while (await compare_fn(array[j][0], pivot[0]) > 0) j --;

        if (i <= j) {
            [array[i], array[j]] = [array[j], array[i]];
            i ++;
            j --;
        }
    }

    return i;
}

export const schwartzian_quick_sort = async (
    array: [RValue, RValue][],
    compare_fn: (a: RValue, b: RValue) => Promise<number> = async (a: RValue, b: RValue) => spaceship_compare(a, b, true),
    left: number = 0,
    right: number = array.length - 1
) => {
    let index;

    if (array.length > 1) {
        index = await schwartzian_partition(array, compare_fn, left, right);

        if (left < index - 1) await schwartzian_quick_sort(array, compare_fn, left, index - 1);
        if (index < right) await schwartzian_quick_sort(array, compare_fn, index, right);
    }
}

export const flatten_string_array = async (arr: RValue[]): Promise<string[]> => {
    const paths: string[] = [];

    for (const elem of arr) {
        switch (elem.klass) {
            case await RubyString.klass():
                paths.push(elem.get_data<string>());
                break;

            case await RubyArray.klass():
                paths.push(...await flatten_string_array(elem.get_data<RubyArray>().elements));
                break;

            default:
                await Runtime.assert_type(elem, await RubyString.klass());
                break;
        }
    }

    return paths;
}
