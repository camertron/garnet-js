import { ArgumentError } from "../errors";
import { Qnil, RValue } from "../runtime";
import { Hash } from "./hash";

type DigitTuples = {
    "0": [],
    "*": [],
    "1": [unknown],
    "2": [unknown, unknown],
    "3": [unknown, unknown, unknown],
    "4": [unknown, unknown, unknown, unknown],
    "5": [unknown, unknown, unknown, unknown, unknown],
    "6": [unknown, unknown, unknown, unknown, unknown, unknown],
    "7": [unknown, unknown, unknown, unknown, unknown, unknown, unknown],
    "8": [unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown],
    "9": [unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown]
};

type TupleOfLength<N extends number, T, R extends unknown[] = []> =
    R['length'] extends N ? R : TupleOfLength<N, T, [T, ...R]>;

// Helper type to track position in pattern: 'required' | 'optional' | 'splat' | 'trailing'
type ScannedArgsImpl<
    S extends string,
    T,
    R extends unknown[] = [],
    Position extends 'required' | 'optional' | 'splat' | 'trailing' = 'required'
> =
    S extends `${infer First}${infer Rest}`
        ? First extends '*'
            ? ScannedArgsImpl<Rest, T, [...R, T[]], 'splat'>
            : First extends keyof DigitTuples
                ? Position extends 'required'
                    // First digit: required args (type T)
                    ? ScannedArgsImpl<Rest, T, [...R, ...TupleOfLength<DigitTuples[First]['length'], T>], 'optional'>
                    : Position extends 'optional'
                        // Second digit: optional args (type T | undefined)
                        ? ScannedArgsImpl<Rest, T, [...R, ...TupleOfLength<DigitTuples[First]['length'], T | undefined>], 'splat'>
                        : Position extends 'splat'
                            // After splat: trailing required args (type T)
                            ? ScannedArgsImpl<Rest, T, [...R, ...TupleOfLength<DigitTuples[First]['length'], T>], 'trailing'>
                            : R
                : R
        : R;

export type ScannedArgs<S extends string, T> = ScannedArgsImpl<S, T>;

export class ArgSignature {
    public required_args: number = 0;
    public optional_args: number = 0;
    public needs_splat = false;
    public trailing_required_args = 0;

    static signature_cache = new Map<string, ArgSignature>();

    static get(pattern: string): ArgSignature {
        const signature = this.signature_cache.get(pattern);
        if (signature) return signature;

        const new_signature = this.parse(pattern);
        this.signature_cache.set(pattern, new_signature);

        return new_signature;
    }

    private static parse(pattern: string): ArgSignature {
        const pattern_parts = pattern.split("");
        const signature = new ArgSignature();

        if (pattern_parts[0] && pattern_parts[0].match(/[0-9]/)) {
            signature.required_args = parseInt(pattern_parts.shift()!);
        }

        if (pattern_parts[0] && pattern_parts[0].match(/[0-9]/)) {
            signature.optional_args = parseInt(pattern_parts.shift()!);
        }

        if (pattern_parts[0] === "*") {
            pattern_parts.shift();
            signature.needs_splat = true;
        }

        if (pattern_parts[0] && pattern_parts[0].match(/[0-9]/)) {
            signature.trailing_required_args = parseInt(pattern_parts.shift()!);
        }

        return signature;
    }
}

export const Args = {
    /* scan is analogous to MRI's rb_scan_args. It's designed to accept a JavaScript array of
    * positional arguments and coerce them into an array of required, optional, and splatted
    * arguments. This is done by way of a pattern string of at most 6 characters. Each character
    * corresponds to a type of positional argument, and are interpreted in the following order:
    *
    * 1. The number of leading mandatory arguments: a digit
    * 2. The number of optional arguments: a digit
    * 3. A splatted argument: *
    * 4. The number of trailing mandatory arguments: a digit
    *
    * I should note that rb_scan_args also includes the : character for keyword arguments and the
    * & character for a block argument. Since Garnet automatically passes keyword and block arguments
    * separately, scan does not support them.
    *
    * Each character is optional, so you can leave out the characters for things you don't need.
    * Be aware that the parsing of the format string is greedy: 1* describes a method with one
    * mandatory argument and a splat. If you want one optional argument and a splat you must
    * specify 01* instead.
    *
    * If the number of required args in the pattern string doesn't match the number of provided args,
    * scan will throw the same ArgumentError MRI would throw, eg "wrong number of arguments (given x,
    * expected y)."
    *
    * The return value is a tuple containing the number of arguments requested. Required args are first,
    * followed by optional args. Missing optional args are returned as nils. Next is a single Ruby array
    * containing splatted args (may me empty). Finally, trailing required args are included at the end.
    */
    scan: async<S extends string> (pattern: S, args: RValue[]): Promise<ScannedArgs<S, RValue>> => {
        const signature = ArgSignature.get(pattern);
        const min = signature.required_args + signature.trailing_required_args;
        const max = signature.needs_splat ? Infinity : min + signature.optional_args;
        const argc = args ? args.length : 0;

        Args.check_arity(argc, min, max);

        // dup so we don't mess with the caller
        args = [...args];

        const required_args = args.splice(0, signature.required_args);

        const trailing_required_args = args.slice(
            args.length - signature.trailing_required_args,
            signature.trailing_required_args
        );

        const optional_args: Array<RValue | undefined> = args.splice(0, signature.optional_args);

        // fill in missing optional args with nil
        for (let i = 0; i < signature.optional_args - optional_args.length; i ++) {
            optional_args.push(undefined);
        }

        const splat_args = args;

        const result = [
            ...required_args,
            ...optional_args,
            ...(signature.needs_splat ? [splat_args] : []),
            ...trailing_required_args
        ];

        return result as ScannedArgs<S, RValue>;
    },

    check_arity: (argc: number, min: number, max: number) => {
        const max_lower = max === Infinity ? min : max;
        const max_upper = max === Infinity ? max : max_lower;

        if (argc < min || argc > max_upper) {
            const arg_range = min !== max_lower ? `${min}..${max_lower}` : `${min}`;
            throw new ArgumentError(
                `wrong number of arguments (given ${argc}, expected ${arg_range}${max_upper > max_lower ? "+" : ""})`
            );
        }
    },

    get_kwarg: async (key: string, kwargs?: Hash, default_value?: RValue) => {
        if (kwargs && await kwargs.has_symbol(key)) {
            return kwargs.get_by_symbol(key);
        } else {
            return default_value || Qnil;
        }
    }
}
