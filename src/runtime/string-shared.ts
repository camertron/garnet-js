import { Module, Qfalse, Qnil, Qtrue, Runtime, RValue} from "../runtime";
import { Object } from "../runtime/object";
import { RubyString } from "../runtime/string";
import { Range } from "../runtime/range";
import { Integer } from "../runtime/integer";
import { Regexp } from "../runtime/regexp";
import { NotImplementedError } from "../errors";

const slice = async (self: RValue, args: RValue[]): Promise<string | null> => {
    const data = self.get_data<string>();

    if (args[0].klass === (await Object.find_constant("Range"))!) {
        const range = args[0].get_data<Range>();

        let start_pos: number, end_pos: number;

        if (range.begin.klass === await Integer.klass()) {
            start_pos = range.begin.get_data<number>();
        } else if (range.begin === Qnil) {
            start_pos = 0;
        } else {
            await Runtime.assert_type(range.begin, await Integer.klass());
        }

        if (range.end.klass === await Integer.klass()) {
            end_pos = range.end.get_data<number>();
        } else if (range.end === Qnil) {
            end_pos = -1;
        } else {
            await Runtime.assert_type(range.end, await Integer.klass());
        }

        if (start_pos! < 0) {
            start_pos = data.length + start_pos!;
        }

        if (end_pos! < 0) {
            end_pos = data.length + end_pos!;
        }

        if (start_pos! > end_pos!) {
            return "";
        }

        if (range.exclude_end) {
            return data.substring(start_pos!, end_pos!);
        } else {
            return data.substring(start_pos!, end_pos! + 1);
        }
    } else if (args[0].klass === await RubyString.klass()) {
        if (data.indexOf(args[0].get_data<string>()) > -1) {
            return args[0].get_data<string>();
        } else {
            return null;
        }
    } else if (args[0].klass === await Regexp.klass()) {
        throw new NotImplementedError("String#[](Regexp) is not yet implemented");
    } else {
        await Runtime.assert_type(args[0], await Integer.klass());
        const start = args[0].get_data<number>();

        if (args.length > 1) {
            await Runtime.assert_type(args[1], await Integer.klass());
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

export const mix_shared_string_methods_into = async (mod: Module) => {
    mod.define_native_method("slice!", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const substring = await slice(self, args);

        if (substring !== null) {
            self.data = substring
            return self;
    }

        return Qnil;
    });

    mod.define_native_method("slice", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const substring = await slice(self, args);
        return substring !== null ? RubyString.new(substring) : Qnil;
    });

    await mod.alias_method("[]", "slice");

    mod.define_native_method("end_with?", async (self: RValue, args: RValue[]): Promise<RValue> => {
        await Runtime.assert_type(args[0] || Qnil, await RubyString.klass());

        const data = self.get_data<string>();
        const search_str = args[0].get_data<string>();

        return data.endsWith(search_str) ? Qtrue : Qfalse;
    });
}
