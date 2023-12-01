import { RuntimeError } from "../errors";
import { Class, Qnil, RValue, RegexpClass } from "../runtime";
import * as wasmFFI from 'wasm-ffi';

const { Wrapper, Struct, types, ccall } = wasmFFI.default;

const CompileInfo = new Struct({
    num_of_elements: "int32",
    pattern_enc: "uint32",
    target_enc: "uint32",
    syntax: "uint32",
    option: "uint32",
    case_fold_flag: "uint32"
});

const RegexpPtr = new Struct({
    value: "uint32"
});

type CompileInfoType = {
    num_of_elements: number;
    pattern_enc: EncodingPtrType;
    target_enc: EncodingPtrType;
    syntax: SyntaxPtrType;
    option: number;
    case_fold_flag: number;
}

const ErrorInfo = new Struct({
    enc: "uint32",
    par: "uint32",
    par_end: "uint32"
});

const Region = new Struct({
    allocated: "uint32",
    num_regs: "uint32",
    beg: "uint32",
    end: "uint32"
});

type RegionType = {
    allocated: number;
    num_regs: number;
    beg: number;
    end: number;
}

const OnigmoWrapper = new Wrapper({});

type RegexpPtrType = number;
type RegexpPtrPtrType = number;
type StringPtrType = number;
type CompileInfoPtrType = number;
type ErrorInfoPtrType = number;
type RegionPtrType = number;
type EncodingPtrType = number;
type SyntaxPtrType = number;

type ErrorCode = number;
type Position = number;

enum RegionFreeScheme {
    CONTENTS_ONLY = 0,
    SELF = 1
}

export interface Onigmo {
    exports: OnigmoExports
}

interface OnigmoExports {
    onig_new_deluxe(regexp_ptr: RegexpPtrPtrType, pattern: StringPtrType, pattern_end: StringPtrType, compile_info: CompileInfoPtrType, error_info: ErrorInfoPtrType): ErrorCode;
    onig_search(regexp: RegexpPtrType, str: StringPtrType, str_end: StringPtrType, str_start: StringPtrType, range: StringPtrType, region: RegionPtrType, options: number): ErrorCode | Position;
    onig_free(regexp: RegexpPtrType): void;

    onig_region_new(): RegionPtrType;
    onig_region_free(region: RegionPtrType, free_type: RegionFreeScheme): void;

    onig_error_code_to_str(out_str: StringPtrType, error_code: ErrorCode, error_info: ErrorInfoPtrType): void;

    OnigEncodingUTF_16LE: EncodingPtrType;
    OnigSyntaxRuby: SyntaxPtrType;
    OnigDefaultCaseFoldFlag: number;

    memory: WebAssembly.Memory;

    // libc
    malloc(size: number): number;
    free(ptr: number): void;
}

// compile options
const ONIG_OPTION_NONE = 0;
const ONIG_OPTION_IGNORECASE = 1;
const ONIG_OPTION_EXTEND = ONIG_OPTION_IGNORECASE << 1;
const ONIG_OPTION_MULTILINE = ONIG_OPTION_EXTEND << 1;

// exit codes
const ONIG_NORMAL = 0;
const ONIG_MISMATCH = -1;
const ONIG_NO_SUPPORT_CONFIG = -2;

// general constants
const ONIG_MAX_ERROR_MESSAGE_LEN = 90

export class Regexp {
    public static onigmo: Onigmo;

    static new(pattern: string, options: string): RValue {
        return new RValue(RegexpClass, compile(pattern, options));
    }

    static make_compile_info(): CompileInfoType {
        return new CompileInfo({
            num_of_elements: 5,
            pattern_enc: this.onigmo.exports.OnigEncodingUTF_16LE,
            target_enc: this.onigmo.exports.OnigEncodingUTF_16LE,
            syntax: this.onigmo.exports.OnigSyntaxRuby,
            option: ONIG_OPTION_NONE,
            case_fold_flag: this.onigmo.exports.OnigDefaultCaseFoldFlag
        });
    }

    private regexp: RegexpPtrType;

    constructor(regexp: RegexpPtrType) {
        this.regexp = regexp;
    }

    search(str: string, pos: number = 0): number | null {
        if (pos >= str.length) {
            return null;
        }

        const str_ptr = OnigmoWrapper.utils.writeArray(utf16_bytes_from(str));
        const str_end_ptr = str_ptr + (str.length * 2);
        const region_ptr = Regexp.onigmo.exports.onig_region_new();

        const exit_code_or_position = Regexp.onigmo.exports.onig_search(
            this.regexp, str_ptr, str_end_ptr, str_ptr + (pos * 2), str_end_ptr, region_ptr, ONIG_OPTION_NONE
        );

        Regexp.onigmo.exports.free(str_ptr);
        Regexp.onigmo.exports.onig_region_free(region_ptr, RegionFreeScheme.CONTENTS_ONLY);

        if (exit_code_or_position <= -2) {
            const error_msg = error_code_to_string(exit_code_or_position);
            throw new RuntimeError(error_msg);
        } else if (exit_code_or_position == ONIG_MISMATCH) {
            return null;
        } else {
            return exit_code_or_position;
        }
    }

    scan(str: string, callback: (matches: [number, number][]) => boolean): void {
        const str_ptr = OnigmoWrapper.utils.writeArray(utf16_bytes_from(str));
        const str_end_ptr = str_ptr + (str.length * 2);
        const region_ptr = Regexp.onigmo.exports.onig_region_new();
        const memory = new DataView(Regexp.onigmo.exports.memory.buffer);
        let last_pos = 0;

        while (true) {
            const exit_code_or_position = Regexp.onigmo.exports.onig_search(
                this.regexp, str_ptr, str_end_ptr, str_ptr + last_pos, str_end_ptr, region_ptr, ONIG_OPTION_NONE
            );

            if (exit_code_or_position <= -2) {
                const error_msg = error_code_to_string(exit_code_or_position);
                throw new RuntimeError(error_msg);
            } else if (exit_code_or_position == ONIG_MISMATCH) {
                break;
            }

            const num_regs = memory.getUint32(region_ptr + 4, true);
            const beg_addr = memory.getUint32(region_ptr + 8, true);
            const end_addr = memory.getUint32(region_ptr + 12, true);
            const regs: [number, number][] = [];

            for (let i = 0; i < num_regs; i ++) {
                const beg = memory.getUint32(beg_addr + (i * 4), true);
                const end = memory.getUint32(end_addr + (i * 4), true);
                regs.push([beg / 2, end / 2]);
            }

            if (!callback(regs)) {
                break;
            }

            last_pos = memory.getUint32(end_addr, true);
        }

        Regexp.onigmo.exports.onig_region_free(region_ptr, RegionFreeScheme.CONTENTS_ONLY);
    }
}

const compile = (pattern: string, options: string): Regexp => {
    OnigmoWrapper.use(Regexp.onigmo);

    const compile_info = Regexp.make_compile_info();
    const compile_info_ptr: CompileInfoPtrType = OnigmoWrapper.utils.writeStruct(compile_info);
    const regexp_ptr_ptr: RegexpPtrPtrType = OnigmoWrapper.utils.writeStruct(new RegexpPtr());
    const errorinfo_ptr: ErrorInfoPtrType = OnigmoWrapper.utils.writeStruct(new ErrorInfo());
    const pattern_ptr = OnigmoWrapper.utils.writeArray(utf16_bytes_from(pattern));
    const pattern_end_ptr = pattern_ptr + (pattern.length * 2);

    const error_code: ErrorCode = Regexp.onigmo.exports.onig_new_deluxe(
        regexp_ptr_ptr, pattern_ptr, pattern_end_ptr, compile_info_ptr, errorinfo_ptr
    );

    if (error_code == ONIG_NORMAL) {
        const regexp_ptr: RegexpPtrType = OnigmoWrapper.utils.readPointer(regexp_ptr_ptr, types.pointer("uint32")).deref();

        Regexp.onigmo.exports.free(compile_info_ptr);
        Regexp.onigmo.exports.free(regexp_ptr_ptr);
        Regexp.onigmo.exports.free(errorinfo_ptr);

        return new Regexp(regexp_ptr);
    } else {
        const err_msg = error_code_to_string(error_code, errorinfo_ptr);

        Regexp.onigmo.exports.free(compile_info_ptr);
        Regexp.onigmo.exports.free(regexp_ptr_ptr);
        Regexp.onigmo.exports.free(errorinfo_ptr);

        throw new RuntimeError(err_msg);
    }
}

const error_code_to_string = (error_code: ErrorCode, errorinfo_ptr?: ErrorInfoPtrType): string => {
    const err_msg_ptr = Regexp.onigmo.exports.malloc(ONIG_MAX_ERROR_MESSAGE_LEN);
    const err_msg_len = Regexp.onigmo.exports.onig_error_code_to_str(err_msg_ptr, error_code, errorinfo_ptr || 0);
    const err_msg = OnigmoWrapper.utils.readString(err_msg_ptr);
    Regexp.onigmo.exports.free(err_msg_ptr);
    return err_msg;
}

const utf16_bytes_from = (str: string): Uint8Array => {
    const result: number[] = [];

    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);
        result.push(charCode & 0x00ff);
        result.push((charCode & 0xff00) >> 8);
    }

    result.push(0);

    return new Uint8Array(result);
}

export const defineRegexpBehaviorOn = ((klass: Class) => {
});
