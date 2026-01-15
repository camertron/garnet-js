import { RValue } from "../runtime";
import { Hash } from "../runtime/hash";
import { RubyArray } from "../runtime/array";

/**
 * Extract kwargs from args when the KW_SPLAT_FWD flag is set.
 * This happens when arguments are forwarded with `...`.
 *
 * When forwarding with `...`, the args are wrapped in an array, and the kwargs hash
 * (if present) is the last element of that array.
 *
 * When there are other arguments before the `...`, they are passed as separate arguments,
 * and the forwarded arguments are in the last argument as an array.
 */
export async function extract_kwargs_from_forwarded_args(args: RValue[]): Promise<[RValue[], Hash | undefined]> {
    if (args.length === 0) {
        return [args, undefined];
    }

    const last_arg = args[args.length - 1];
    let extracted_args: RValue[];
    let kwargs: Hash | undefined = undefined;

    // when forwarding with `...`, the args are wrapped in an array
    if (last_arg.klass === await RubyArray.klass()) {
        const arr = last_arg.get_data<RubyArray>();

        // check if the last element of the array is a Hash (the kwargs)
        if (arr.elements.length > 0 && arr.elements[arr.elements.length - 1].klass === await Hash.klass()) {
            kwargs = arr.elements[arr.elements.length - 1].get_data<Hash>();
            // remove the kwargs hash from the array and use the remaining elements as args
            extracted_args = arr.elements.slice(0, arr.elements.length - 1);
        } else {
            // no kwargs, just use all array elements as args
            extracted_args = arr.elements;
        }

        // If there are other arguments before the forwarded array, prepend them
        if (args.length > 1) {
            extracted_args = [...args.slice(0, args.length - 1), ...extracted_args];
        }
    } else {
        // not an array, extract kwargs directly (NOTE: shouldn't actually happen with `...` but handle it just in case)
        kwargs = last_arg.get_data<Hash>();
        extracted_args = args.slice(0, args.length - 1);
    }

    return [extracted_args, kwargs];
}

