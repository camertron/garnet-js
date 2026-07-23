import {beforeAll, describe, expect, test} from '@jest/globals';
import * as Garnet from "../garnet";
import {evaluate} from "../test_helpers";
import {RubyArray} from "../garnet";

beforeAll(() => {
    return Garnet.init();
});

afterAll(() => {
    return Garnet.deinit();
});

describe("next", () => {
    test("breaking mid-loop with the value of an expression", async () => {
        const code = `
            def foo
              5
            end
            
            def bar
              3
            end
            
            [1, 2, 3].map do |x|
              next x + foo + bar
              raise "kaboom!"
            end
        `;

        const result = await evaluate(code);
        expect(result.klass).toBe(await RubyArray.klass());
        const elements = result.get_data<RubyArray>().elements;
        expect(elements.length).toEqual(3);
        expect(elements[0].data).toEqual(9);
        expect(elements[1].data).toEqual(10);
        expect(elements[2].data).toEqual(11);
    });
});
