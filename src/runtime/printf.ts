import { ArgumentError, NotImplementedError } from "../errors";
import { RValue } from "../garnet";
import { Object } from "../runtime/object";
import { String } from "../runtime/string";

const printf_pattern = (
    "(?!\\\\)" +                  // string does not start with an escape character
    "%" +                         // literal percent sign
    "((?:[ #+-0*]|\\d+\\$)+)?" +  // Flag. Any of space, #, +, -, 0, *, or n$ meaning nth argument.
    "(-?\\d+)?" +                 // Width. Possibly negative integer.
    "(\\.\\d)?" +                 // Precision. A dot followed by a non-negative integer.
    "([bBdiuoxXaAeEfgGcps])"      // Type specifier.
);

const printf_re = new RegExp(printf_pattern, "g");

export const right_pad = (str: string, pad_char: string, length: number): string => {
    if (str.length >= length) return str;
    const leading = pad_char.repeat(length - str.length);
    return `${leading}${str}`;
}

export const left_pad = (str: string, pad_char: string, length: number): string => {
    if (str.length >= length) return str;
    const trailing = pad_char.repeat(length - str.length);
    return `${str}${trailing}`;
}

const format_int = async (idx: number, self: RValue, args: RValue[], flags: string, orig_width: string, precision: number): Promise<string> => {
    if (idx >= args.length) {
        throw new ArgumentError("too few arguments");
    }

    let width;

    if (flags.indexOf("*") > -1) {
        width = (await Object.send(self, "Integer", [args[idx]])).get_data<number>();
        idx ++;
    } else {
        width = parseInt(orig_width)!;
    }

    const val = (await Object.send(self, "Integer", [args[idx]])).get_data<number>();
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

export const sprintf = async (pattern: RValue, objects: RValue[]): Promise<RValue> => {
    const pattern_str = pattern.get_data<string>();
    const chunks = [];
    let last_pos = 0;
    let idx = 0;

    Array.from(pattern_str.matchAll(printf_re)).forEach(async (match) => {
        const cur_pos = match.index!

        if (cur_pos > last_pos) {
            chunks.push(pattern_str.slice(last_pos, cur_pos));
        }

        const [_, flags_field, width, precision_field, type] = match;
        const precision = precision_field && precision_field.length > 0 ? parseInt(precision_field.slice(1)) : 0;
        const flags = flags_field || "";

        switch (type) {
            case "d":
            case "i":
            case "u":
                chunks.push(format_int(idx, pattern, objects, flags, width, precision));
                idx ++;
                break;

            case "f":
                // @TODO: flesh this out
                chunks.push(objects[idx].get_data<number>().toString());
                idx ++;
                break;

            case "s":
                chunks.push((await Object.send(objects[idx], "to_s")).get_data<string>());
                idx ++;
                break;

            case "p":
                chunks.push((await Object.send(objects[idx], "inspect")).get_data<string>());
                idx ++;
                break;

            case "%":
                chunks.push("%");
                break;

            default:
                throw new NotImplementedError(`format type specifier '${type}' not yet implemented`);
        }

        last_pos = cur_pos + match[0].length;
    });

    if (last_pos < pattern_str.length - 1) {
        chunks.push(pattern_str.slice(last_pos));
    }

    const result = chunks.join("").replace("%%", "%");
    return await String.new(result);
}
