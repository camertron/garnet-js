import { ArgumentError, IndexError, NotImplementedError, RangeError } from "../errors";
import { Array as RubyArray, Class, Qnil, RValue, StringClass, String as RubyString, IntegerClass, Runtime, Float, Qtrue, Qfalse, RegexpClass, NumericClass } from "../runtime";
import { hash_string } from "../util/string_utils";
import { Integer } from "./integer";
import { Regexp } from "./regexp";
import { Range } from "./range";
import { Object } from "./object";
import { ExecutionContext } from "../execution_context";
import { Encoding } from "./encoding";
import { Kernel } from "./kernel";

export const defineStringBehaviorOn = (klass: Class) => {
    klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
        const str = args[0];

        if (str) {
            Runtime.assert_type(str, StringClass);
            self.data = str.data;
        }

        return Qnil;
    });

    klass.define_native_method("hash", (self: RValue): RValue => {
        return Integer.new(hash_string(self.get_data<string>()));
    });

    klass.define_native_method("to_s", (self: RValue): RValue => {
        return self;
    });

    klass.alias_method("to_str", "to_s");

    klass.define_native_method("inspect", (self: RValue): RValue => {
        const str = self.get_data<string>();
        const escaped_str = str
            .replace(/\"/g, "\\\"")
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n");
        return RubyString.new(`"${escaped_str}"`);
    });

    klass.define_native_method("*", (self: RValue, args: RValue[]): RValue => {
        const multiplier = args[0];
        Runtime.assert_type(multiplier, NumericClass);  // @TODO: handle floats (yes, you can multiply strings by floats, oh ruby)
        return RubyString.new(self.get_data<string>().repeat(multiplier.get_data<number>()));
    });

    klass.define_native_method("split", (self: RValue, args: RValue[]): RValue => {
        let delim;

        if (args.length > 0) {
            delim = args[0].get_data<string>();
        } else {
            delim = " ";
        }

        const str = self.get_data<string>();

        return RubyArray.new(str.split(delim).map((elem) => RubyString.new(elem)));
    });

    klass.define_native_method("gsub", (self: RValue, args: RValue[], block?: RValue): RValue => {
        const str = self.get_data<string>();
        const pattern = args[0].get_data<Regexp | string>();
        const replacement = args[1].get_data<string>();

        if (pattern instanceof Regexp) {
            const matches: [number, number][] = [];

            pattern.scan(str, (match: [number, number][]): boolean => {
                matches.push(match[0]);
                return true;
            });

            const chunks = [];
            let last_pos = 0;

            for (let i = 0; i < matches.length; i ++) {
                chunks.push(str.slice(last_pos, matches[i][0]));
                chunks.push(replacement);
                last_pos = matches[i][1];
            }

            chunks.push(str.slice(last_pos, str.length));

            return RubyString.new(chunks.join(""));
        }

        return self;
    });

    klass.define_native_method("to_i", (self: RValue): RValue => {
        const str = self.get_data<string>();

        if (str.indexOf(".") > 0) {
            return Float.new(parseFloat(str));
        } else {
            return Integer.get(parseInt(str));
        }
    });

    klass.define_native_method("to_sym", (self: RValue, args: RValue[]): RValue => {
        return Runtime.intern(self.get_data<string>());
    });

    const printf_pattern = (
        "(?!\\\\)" +                  // string does not start with an escape character
        "%" +                         // literal percent sign
        "((?:[ #+-0*]|\\d+\\$)+)?" +  // Flag. Any of space, #, +, -, 0, *, or n$ meaning nth argument.
        "(-?\\d+)?" +                 // Width. Possibly negative integer.
        "(\\.\\d)?" +                 // Precision. A dot followed by a non-negative integer.
        "([bBdiuoxXaAeEfgGcps])"      // Type specifier.
    );

    const printf_re = new RegExp(printf_pattern, "g");

    const right_pad = (str: string, pad_char: string, length: number): string => {
        if (str.length >= length) return str;
        const leading = pad_char.repeat(length - str.length);
        return `${leading}${str}`;
    }

    const left_pad = (str: string, pad_char: string, length: number): string => {
        if (str.length >= length) return str;
        const trailing = pad_char.repeat(length - str.length);
        return `${str}${trailing}`;
    }

    const format_int = (idx: number, self: RValue, args: RValue[], flags: string, orig_width: string, precision: number): string => {
        if (idx >= args.length) {
            throw new ArgumentError("too few arguments");
        }

        let width;

        if (flags.indexOf("*") > -1) {
            width = Object.send(self, "Integer", [args[idx]]).get_data<number>();
            idx ++;
        } else {
            width = parseInt(orig_width)!;
        }

        const val = Object.send(self, "Integer", [args[idx]]).get_data<number>();
        let result = val.toString();

        if (val >= 0) {
            // the + takes precedence if space is also specified
            if (flags.indexOf("+") > -1) {
                result = `+${result}`;
            } else if (flags.indexOf(" ") > -1) {
                result = ` ${result}`;
            }
        }

        if (result.length < precision) {
            result = right_pad(result, "0", precision);
        }

        if (result.length >= width) {
            return result;
        }

        let pad_char = " ";

        if (flags.indexOf("0") > -1) {
            pad_char = "0";
        }

        if (flags.indexOf("-") > -1) {
            return left_pad(result, pad_char, width);
        } else {
            return right_pad(result, pad_char, width);
        }
    }

    klass.define_native_method("%", (self: RValue, args: RValue[]): RValue => {
        const pattern = self.get_data<string>();
        const chunks = [];
        let last_pos = 0;
        let idx = 0;

        args = Object.send(self, "Array", args).get_data<RubyArray>().elements;

        Array.from(pattern.matchAll(printf_re)).forEach((match) => {
            const cur_pos = match.index!

            if (cur_pos > last_pos) {
                chunks.push(pattern.slice(last_pos, cur_pos));
            }

            const [_, flags_field, width, precision_field, type] = match;
            const precision = precision_field && precision_field.length > 0 ? parseInt(precision_field.slice(1)) : 0;
            const flags = flags_field || "";

            switch (type) {
                case "d":
                case "i":
                case "u":
                    chunks.push(format_int(idx, self, args, flags, width, precision));
                    idx ++;
                    break;

                case "f":
                    // @TODO: flesh this out
                    chunks.push(args[idx].get_data<number>().toString());
                    idx ++;
                    break;

                case "s":
                    chunks.push(Object.send(args[idx], "to_s").get_data<string>());
                    idx ++;
                    break;

                case "p":
                    chunks.push(Object.send(args[idx], "inspect").get_data<string>());
                    idx ++;
                    break;

                case "%":
                    chunks.push("%");
                    break;

                default:
                    throw new NotImplementedError(`format type specifier '${type}' not yet implemented`);
            }

            last_pos = cur_pos + match.length - 1;
        });

        if (last_pos < pattern.length - 1) {
            chunks.push(pattern.slice(last_pos));
        }

        const result = chunks.join("").replace("%%", "%");
        return RubyString.new(result);
    });

    klass.define_native_method("==", (self: RValue, args: RValue[]): RValue => {
        if (args[0].klass != StringClass) {
            return Qfalse;
        }

        if (self.get_data<string>() === args[0].get_data<string>()) {
            return Qtrue;
        } else {
            return Qfalse;
        }
    });

    klass.define_native_method("!=", (self: RValue, args: RValue[]): RValue => {
        if (args[0].klass != StringClass) {
            return Qtrue;
        }

        if (self.get_data<string>() !== args[0].get_data<string>()) {
            return Qtrue;
        } else {
            return Qfalse;
        }
    });

    klass.define_native_method("+", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], StringClass);
        return RubyString.new(self.get_data<string>() + args[0].get_data<string>());
    });

    klass.define_native_method("empty?", (self: RValue): RValue => {
        return self.get_data<string>().length === 0 ? Qtrue : Qfalse;
    });

    klass.define_native_method("size", (self: RValue): RValue => {
        return Integer.get(self.get_data<string>().length);
    });

    klass.alias_method("length", "size");

    klass.define_native_method("[]", (self: RValue, args: RValue[]): RValue => {
        const data = self.get_data<string>();

        if (args[0].klass == Runtime.constants["Range"]) {
            const range = args[0].get_data<Range>();

            Runtime.assert_type(range.begin, IntegerClass);
            Runtime.assert_type(range.end, IntegerClass);

            let start_pos = range.begin.get_data<number>();

            if (start_pos < 0) {
                start_pos = data.length + start_pos;
            }

            let end_pos = range.end.get_data<number>();

            if (end_pos < 0) {
                end_pos = data.length + end_pos;
            }

            if (start_pos > end_pos) {
                return Qnil;
            }

            if (range.exclude_end) {
                return RubyString.new(data.substring(start_pos, end_pos));
            } else {
                return RubyString.new(data.substring(start_pos, end_pos + 1));
            }
        } else if (args[0].klass === StringClass) {
            if (data.indexOf(args[0].get_data<string>()) > 0) {
                return RubyString.new(args[0].get_data<string>());
            } else {
                return Qnil;
            }
        } else if (args[0].klass === RegexpClass) {
            throw new NotImplementedError("String#[](Regexp) is not yet implemented");
        } else {
            Runtime.assert_type(args[0], IntegerClass);
            const start = args[0].get_data<number>();

            if (args.length > 1) {
                Runtime.assert_type(args[1], IntegerClass);
                const len = args[1].get_data<number>();
                return RubyString.new(data.substring(start, start + len));
            } else {
                if (start < data.length) {
                    return RubyString.new(data.charAt(start));
                } else {
                    return Qnil;
                }
            }
        }
    });

    klass.define_native_method("[]=", (self: RValue, args: RValue[]): RValue => {
        const data = self.get_data<string>();
        let replacement_pos = 1;
        let start_pos, end_pos

        if (args[0].klass == Runtime.constants["Range"]) {
            const range = args[0].get_data<Range>();

            Runtime.assert_type(range.begin, IntegerClass);
            Runtime.assert_type(range.end, IntegerClass);

            start_pos = range.begin.get_data<number>();

            if (start_pos < 0) {
                start_pos = data.length + start_pos;
            }

            end_pos = range.end.get_data<number>();

            if (end_pos < 0) {
                end_pos = data.length + end_pos;
            }

            if (start_pos > end_pos) {
                return Qnil;
            }

            if (!range.exclude_end) {
                end_pos += 1
            }
        } else if (args[0].klass === StringClass) {
            const substring = args[0].get_data<string>();
            const idx = data.indexOf(substring);

            if (idx > -1) {
                start_pos = idx;
                end_pos = start_pos + args[0].get_data<string>().length;
            } else {
                throw new IndexError("string not matched");
            }
        } else if (args[0].klass === RegexpClass) {
            throw new NotImplementedError("String#[]=(Regexp) is not yet implemented");
        } else {
            Runtime.assert_type(args[0], IntegerClass);
            start_pos = args[0].get_data<number>();

            if (args.length > 2) {
                Runtime.assert_type(args[1], IntegerClass);
                end_pos = args[1].get_data<number>();
                replacement_pos = 2;
            } else {
                if (start_pos >= data.length) {
                    return Qnil;
                }

                end_pos = data.length - 1;
            }
        }

        Runtime.assert_type(args[replacement_pos], StringClass);
        const replacement = args[replacement_pos].get_data<string>();

        self.data = `${data.slice(0, start_pos)}${replacement}${data.slice(end_pos)}`;
        return args[replacement_pos];
    });

    klass.define_native_method("ljust", (self: RValue, args: RValue[]): RValue => {
        const data = self.get_data<string>();
        Runtime.assert_type(args[0], IntegerClass);
        const size = args[0].get_data<number>();

        let pad_str;

        if (args.length > 1) {
            Runtime.assert_type(StringClass, args[1]);
            pad_str = args[1].get_data<string>();
        } else {
            pad_str = " ";
        }

        return RubyString.new(left_pad(data, pad_str, size));
    });

    klass.define_native_method("dup", (self: RValue): RValue => {
        return RubyString.new(self.get_data<string>());
    });

    klass.define_native_method("replace", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], StringClass);
        self.data = args[0].get_data<string>();
        return self;
    });

    klass.alias_method("initialize_copy", "replace");

    klass.define_native_method("start_with?", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0] || Qnil, StringClass);

        const data = self.get_data<string>();
        const search_str = args[0].get_data<string>();

        return data.startsWith(search_str) ? Qtrue : Qfalse;
    });

    klass.define_native_method("end_with?", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0] || Qnil, StringClass);

        const data = self.get_data<string>();
        const search_str = args[0].get_data<string>();

        return data.endsWith(search_str) ? Qtrue : Qfalse;
    });

    klass.define_native_method("=~", (self: RValue, args: RValue[]): RValue => {
        if (args[0].klass === RegexpClass) {
            const regexp = args[0].get_data<Regexp>();
            const result = regexp.search(self.get_data<string>());
            return result ? Integer.get(result) : Qnil;
        } else {
            return Object.send(args[0], "=~", [self]);
        }
    });

    // this is designed to be used only by << and concat below
    const append_to = (str: RValue, val: RValue): void => {
        const encoding = RubyString.get_encoding(str);

        if (val.klass === IntegerClass) {
            const num = val.get_data<number>();

            if (!encoding.codepoint_valid(num)) {
                throw new RangeError(`${num} out of char range`);
            }

            if (num >= 128 && num <= 255 && encoding.name === "US-ASCII") {
                RubyString.set_encoding(str, Encoding.binary);
            }

            str.data = str.get_data<string>() + encoding.codepoint_to_utf16(num);
        } else {
            str.data = str.get_data<string>() + Runtime.coerce_to_string(val);
        }
    }

    klass.define_native_method("<<", (self: RValue, args: RValue[]): RValue => {
        Object.check_frozen(self);
        append_to(self, args[0]);
        return self;
    });

    klass.define_native_method("concat", (self: RValue, args: RValue[]): RValue => {
        Object.check_frozen(self);

        const self_data = self.get_data<string>();

        for (const arg of args) {
            if (arg.object_id === self.object_id) {
                // concating self uses the previous value of self
                self.data = self.get_data<string>() + self_data;
            } else {
                append_to(self, arg);
            }
        }

        return self;
    });

    klass.define_native_method("include?", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], StringClass);
        return self.get_data<string>().indexOf(args[0].get_data<string>()) > -1 ? Qtrue : Qfalse;
    });

    const chomp_re_map: {[key: string]: RegExp} = {
        /* When line_sep is "\n", removes the last one or two characters if they are "\r", "\n",
         * or "\r\n" (but not "\n\r")
         */
        "\n": /\r?\n?$/,

        /* When line_sep is '' (an empty string), removes multiple trailing occurrences of "\n"
         * or "\r\n" (but not "\r" or "\n\r")
         */
        "": /(?:\n|\r\n)*$/
    };

    klass.define_native_method("chomp", (self: RValue, args: RValue[]): RValue => {
        const data = self.get_data<string>();
        const line_sep = args[0] || ExecutionContext.current.globals["$/"];
        const line_sep_str = line_sep.get_data<string>();
        const remove_re = chomp_re_map[line_sep_str];

        if (remove_re) {
            return RubyString.new(data.replace(remove_re, ""));
        } else {
            if (data.endsWith(line_sep_str)) {
                return RubyString.new(data.slice(0, data.length - line_sep_str.length));
            } else {
                return RubyString.new(data);
            }
        }
    });

    klass.define_native_method("upcase", (self: RValue): RValue => {
        return RubyString.new(self.get_data<string>().toUpperCase());
    });

    klass.define_native_method("downcase", (self: RValue): RValue => {
        return RubyString.new(self.get_data<string>().toLowerCase());
    });

    klass.define_native_method("encoding", (self: RValue): RValue => {
        return RubyString.get_encoding_rval(self);
    });

    klass.define_native_method("encode!", (self: RValue, args: RValue[]): RValue => {
        if (!Kernel.is_a(args[0], Runtime.constants["Encoding"])) {
            throw new ArgumentError("String#encode! must be passed an Encoding instance for the time being");
        }

        RubyString.set_encoding(self, args[0]);
        return self;
    });

    klass.define_native_method("encode", (self: RValue, args: RValue[]): RValue => {
        if (!Kernel.is_a(args[0], Runtime.constants["Encoding"])) {
            throw new ArgumentError("String#encode must be passed an Encoding instance for the time being");
        }

        const new_str = RubyString.new(self.get_data<string>());
        RubyString.set_encoding(new_str, args[0]);
        return new_str;
    });
};
