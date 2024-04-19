import { Module, Qfalse, Qnil, Qtrue, Runtime, RValue} from "../runtime";
import { Object } from "../runtime/object";
import { String } from "../runtime/string";
import { Range } from "../runtime/range";
import { Integer } from "../runtime/integer";
import { Regexp } from "../runtime/regexp";
import { NotImplementedError } from "../errors";

const slice = (self: RValue, args: RValue[]): string | null => {
    const data = self.get_data<string>();

    if (args[0].klass == Object.find_constant("Range")!) {
        const range = args[0].get_data<Range>();

        let start_pos: number, end_pos: number;

        if (range.begin.klass === Integer.klass) {
            start_pos = range.begin.get_data<number>();
        } else if (range.begin === Qnil) {
            start_pos = 0;
        } else {
            Runtime.assert_type(range.begin, Integer.klass);
        }

        if (range.end.klass === Integer.klass) {
            end_pos = range.end.get_data<number>();
        } else if (range.end === Qnil) {
            end_pos = -1;
        } else {
            Runtime.assert_type(range.end, Integer.klass);
        }

        if (start_pos! < 0) {
            start_pos = data.length + start_pos!;
        }

        if (end_pos! < 0) {
            end_pos = data.length + end_pos!;
        }

        if (start_pos! > end_pos!) {
            return null;
        }

        if (range.exclude_end) {
            return data.substring(start_pos!, end_pos!);
        } else {
            return data.substring(start_pos!, end_pos! + 1);
        }
    } else if (args[0].klass === String.klass) {
        if (data.indexOf(args[0].get_data<string>()) > -1) {
            return args[0].get_data<string>();
        } else {
            return null;
        }
    } else if (args[0].klass === Regexp.klass) {
        throw new NotImplementedError("String#[](Regexp) is not yet implemented");
    } else {
        Runtime.assert_type(args[0], Integer.klass);
        const start = args[0].get_data<number>();

        if (args.length > 1) {
            Runtime.assert_type(args[1], Integer.klass);
            const len = args[1].get_data<number>();
            return data.substring(start, start + len);
        } else {
            if (start < data.length) {
                return data.charAt(start);
            } else {
                return null;
            }
        }
    }
};

export const mix_shared_string_methods_into = (mod: Module) => {
    mod.define_native_method("slice!", (self: RValue, args: RValue[]): RValue => {
        const substring = slice(self, args);

        if (substring) {
            self.data = substring
            return self;
    }

        return Qnil;
    });

    mod.define_native_method("slice", (self: RValue, args: RValue[]): RValue => {
        const substring = slice(self, args);
        return substring ? String.new(substring) : Qnil;
    });

    mod.alias_method("[]", "slice");

    mod.define_native_method("end_with?", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0] || Qnil, String.klass);

        const data = self.get_data<string>();
        const search_str = args[0].get_data<string>();

        return data.endsWith(search_str) ? Qtrue : Qfalse;
    });
}
