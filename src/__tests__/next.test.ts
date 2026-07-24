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
    test("calling next mid-loop with the value of an expression", async () => {
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

    test("make sure next hits ensure", async () => {
        const code = `
            ensure_called_for = []

            doubled = [1, 2, 3].map do |x|
              next x * 2
            ensure
              ensure_called_for << x
            end

            [doubled, ensure_called_for]
        `;

        const result = await evaluate(code);
        const result_array = result.get_data<RubyArray>().elements;
        const doubled = result_array[0].get_data<RubyArray>().elements;

        expect(doubled.length).toEqual(3);

        expect(doubled[0].data).toEqual(2);
        expect(doubled[1].data).toEqual(4);
        expect(doubled[2].data).toEqual(6);

        const ensure_called_for = result_array[1].get_data<RubyArray>().elements;

        expect(ensure_called_for.length).toEqual(3);

        expect(ensure_called_for[0].data).toEqual(1);
        expect(ensure_called_for[1].data).toEqual(2);
        expect(ensure_called_for[2].data).toEqual(3);
    });

    // TODO: add tests for while/until/for using next
});
