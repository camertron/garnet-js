import { ErrnoENOENT, IOError, NameError } from "../errors";
import { Class, IOClass, RValue, Runtime, Qtrue, Qfalse, Qnil } from "../runtime"
import { IFileHandle, vmfs } from "../vmfs";
import { Dir } from "./dir";
import { RubyString } from "../runtime/string";
import { flatten_string_array } from "../util/array_utils";
import { is_node } from "../env";
import { Args } from "./arg-scanner";
import { Hash } from "./hash";
import { Object } from "../runtime/object";
import { Integer } from "./integer";
import { Encoding } from "../runtime/encoding";
import { ExecutionContext } from "../execution_context";

export class RubyFile {
    private static klass_: RValue;

    static subclass_new(klass: RValue, path: RValue, mode: RValue, perm: RValue, opts?: Hash): RValue {
        return new RValue(
            klass, new RubyFile(
                path.get_data<string>(),
                mode.get_data<string>(),
                perm.get_data<number>(),
                opts
            )
        );
    }

    static async new(path: RValue, mode: RValue, perm: RValue, opts?: Hash): Promise<RValue> {
        return this.subclass_new(await this.klass(), path, mode, perm, opts);
    }

    static async klass(): Promise<RValue> {
        if (!this.klass_) {
            const klass = await Object.find_constant("File");

            if (klass) {
                this.klass_ = klass;
            } else {
                throw new NameError("missing constant File");
            }
        }

        return this.klass_;
    }

    private static BUFFER_SIZE = 8 * 1024;

    public descriptor: IFileHandle | null
    public opts: Hash | undefined;
    public buffer_offset = 0;
    public buffer_len = 0;

    private _buffer: Uint8Array;

    constructor(path: string, mode: string, perm: number, opts?: Hash) {
        this.descriptor = vmfs.open(path, mode, perm);
        this.opts = opts; // not doing anything with this yet
        this.buffer_offset = -1;
        this.buffer_len = -1;
    }

    get buffer(): Uint8Array {
        if (!this._buffer) {
            this._buffer = new Uint8Array(RubyFile.BUFFER_SIZE);
        }

        return this._buffer;
    }

    gets(separator?: string): string | null {
        separator ||= ExecutionContext.current.globals["$/"].get_data<string>() || "\n";

        const encoding = Encoding.default_external.get_data<Encoding>();
        const separator_bytes = encoding.string_to_bytes(separator);
        const first_separator_byte = separator_bytes.at(0)!;
        const chunks = [];

        while (true) {
            if (this.is_eof()) break;

            chunks.push(...this.read_until(first_separator_byte));
            const candidate = this.read_bytes(separator_bytes.length);
            chunks.push(candidate);

            if (this.buffers_equal(candidate, separator_bytes)) {
                break;
            }
        }

        if (chunks.length === 0) {
            return null;
        }

        const result = this.combine_buffers(chunks);
        return encoding.bytes_to_string(result);
    }

    private buffers_equal(buf1: Uint8Array, buf2: Uint8Array): boolean {
        if (buf1.length !== buf2.length) return false;

        for (let i = 0; i < buf1.length; i ++) {
            if (buf1.at(i) !== buf2.at(i)) {
                return false;
            }
        }

        return true;
    }

    read_until(byte: number): Uint8Array[] {
        const result = [];

        while (true) {
            if (this.is_eof()) {
                break;
            }

            this.maybe_read_next_chunk();
            let index = this.buffer.indexOf(byte, this.buffer_offset);
            result.push(this.buffer.slice(this.buffer_offset, index < 0 ? this.buffer_len : index));

            if (index > -1) {
                this.buffer_offset = index;
                break;
            } else {
                this.buffer_offset = this.buffer_len;
            }
        }

        return result;
    }

    read_byte(): Uint8Array | null {
        if (this.is_eof()) {
            return null;
        }

        this.maybe_read_next_chunk();
        const byte = this.buffer.slice(this.buffer_offset, this.buffer_offset + 1);
        this.buffer_offset ++;

        return byte;
    }

    read_bytes(length: number): Uint8Array {
        let remaining = length;
        const result = [];

        while (remaining > 0) {
            if (this.is_eof()) break;

            this.maybe_read_next_chunk();

            const chunk = this.buffer.slice(this.buffer_offset, this.buffer_offset + remaining);
            result.push(chunk);
            this.buffer_offset += chunk.length;
            remaining -= chunk.length;
        }

        return this.combine_buffers(result);
    }

    private combine_buffers(buffers: Uint8Array[]): Uint8Array {
        if (buffers.length === 1) {
            return buffers[0];
        }

        let len = 0;

        for (let i = 0; i < buffers.length; i ++) {
            len += buffers[i].length;
        }

        const new_array = new Uint8Array(len);
        let offset = 0;

        for (let i = 0; i < buffers.length; i ++) {
            new_array.set(buffers[i], offset);
            offset += buffers[i].length;
        }

        return new_array;
    }

    private maybe_read_next_chunk() {
        if (this.buffer_offset < 0 || this.buffer_offset >= this.buffer.length) {
            this.buffer_len = this.descriptor!.read(this.buffer.length, this.buffer);
            this.buffer_offset = 0;
        }
    }

    private is_eof(): boolean {
        return this.buffer_len >= 0 && this.buffer_len < this.buffer.length && this.buffer_offset >= this.buffer_len;
    }
}

const path_from_realpath_args = async (args: RValue[]): Promise<string> => {
    await Runtime.assert_type(args[0], await RubyString.klass());
    let path = args[0].get_data<string>();

    if (args.length > 1 && vmfs.is_relative(path)) {
        await Runtime.assert_type(args[1], await RubyString.klass());
        const dir = args[1].get_data<string>();
        path = vmfs.join_paths(dir, path);
    }

    return path;
}

export const FNM_SHORTNAME = 0;
export const FNM_NOESCAPE = 1;
export const FNM_PATHNAME = 2;
export const FNM_DOTMATCH = 4;
export const FNM_EXTGLOB = 16;

export const init = async () => {
    Runtime.define_class("File", IOClass, async (klass: Class): Promise<void> => {
        klass.constants["SEPARATOR"] = await RubyString.new("/");
        klass.constants["Separator"] = await RubyString.new("/");

        // PATH_SEPARATOR is : on Unix-like systems, ; on Windows
        const isWindows = is_node && process.platform === "win32";
        klass.constants["PATH_SEPARATOR"] = await RubyString.new(isWindows ? ";" : ":");

        // ALT_SEPARATOR is \ on Windows, nil on Unix-like systems
        klass.constants["ALT_SEPARATOR"] = isWindows ? await RubyString.new("\\") : Qnil;

        /* Returns the real (absolute) pathname of pathname in the actual filesystem. The real pathname doesn’t contain
         * symlinks or useless dots.
         *
         * If dir_string is given, it is used as a base directory for interpreting relative pathname instead of the
         * current directory.
         *
         * The last component of the real pathname can be nonexistent.
         */
        klass.define_native_singleton_method("realdirpath", async (self: RValue, args: RValue[]): Promise<RValue> => {
            let path = await path_from_realpath_args(args);
            const orig_path = args[0].get_data<string>();

            try {
                path = vmfs.real_path(path);
            } catch (e) {
                if (e instanceof ErrnoENOENT) {
                    const dirname = vmfs.dirname(path);
                    const basename = vmfs.basename(path);

                    try {
                        path = vmfs.join_paths(vmfs.real_path(dirname), basename);
                    } catch (e2) {
                        if (e2 instanceof ErrnoENOENT) {
                            throw new ErrnoENOENT(`No such file or directory - ${orig_path}`);
                        }
                    }
                } else {
                    throw e;
                }
            }

            return RubyString.new(path);
        });

        /* Returns the real (absolute) pathname of pathname in the actual filesystem not containing symlinks or useless dots.
         *
         * If dir_string is given, it is used as a base directory for interpreting relative pathname instead of the current
         * directory.
         *
         * All components of the pathname must exist when this method is called.
         */
        klass.define_native_singleton_method("realpath", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            const path = await path_from_realpath_args(args);
            return await RubyString.new(vmfs.real_path(path));
        });

        /* Converts a pathname to an absolute pathname. Relative paths are referenced from the current working directory
         * of the process unless dir_string is given, in which case it will be used as the starting point. The given
         * pathname may start with a "~", which expands to the process owner’s home directory (the environment variable
         * HOME must be set correctly). "~user" expands to the named user’s home directory.
         */
        klass.define_native_singleton_method("expand_path", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await RubyString.klass());
            let path = args[0].get_data<string>();
            let dir: string;

            // if path is relative, we need to join it with the base directory
            if (vmfs.is_relative(path)) {
                if (args.length > 1) {
                    await Runtime.assert_type(args[1], await RubyString.klass());
                    dir = args[1].get_data<string>();
                } else {
                    dir = Dir.getwd()
                }

                // ensure dir is absolute
                if (vmfs.is_relative(dir)) {
                    dir = vmfs.join_paths(Dir.getwd(), dir);
                }
            } else {
                // path is already absolute, use root as the base
                dir = vmfs.root_path();
            }

            const path_parts = vmfs.split_path(path);
            let dir_parts = vmfs.split_path(dir);

            // when dir is "/", split gives ["", ""], but we want just [""]
            if (dir === "/" && dir_parts.length === 2 && dir_parts[0] === "" && dir_parts[1] === "") {
                dir_parts = [""];
            }

            for (const path_part of path_parts) {
                if (path_part === "..") {
                    // don't pop past the root
                    if (dir_parts.length > 1 || (dir_parts.length === 1 && dir_parts[0] !== '')) {
                        dir_parts.pop();
                    }
                } else {
                    if (path_part != "." && path_part != "") {
                        dir_parts.push(path_part);
                    }
                }
            }

            if (dir_parts.length == 0 || (dir_parts.length === 1 && dir_parts[0] === '')) {
                return RubyString.new("/");
            } else {
                return RubyString.new(vmfs.join_paths(...dir_parts));
            }
        });

        /* Returns true if the named file exists and is a regular file.
         *
         * file can be an IO object.
         *
         * If the file argument is a symbolic link, it will resolve the symbolic link and use the file
         * referenced by the link.
         */
        klass.define_native_singleton_method("file?", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await RubyString.klass());
            const path = args[0].get_data<string>();
            return vmfs.is_file(path) ? Qtrue : Qfalse;
        });

        /* With string object given, returns true if path is a string path leading to a directory, or to
         * a symbolic link to a directory; false otherwise
         */
        klass.define_native_singleton_method("directory?", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await RubyString.klass());
            const path = args[0].get_data<string>();
            return vmfs.is_directory(path) ? Qtrue : Qfalse;
        });

        /* Returns true if the named file is executable by the effective user and group id of this process.
         *
         * Windows does not support execute permissions separately from read permissions. On Windows, a file
         * is only considered executable if it ends in .bat, .cmd, .com, or .exe.
         *
         * Note that some OS-level security features may cause this to return true even though the file is
         * not executable by the effective user/group.
         */
        klass.define_native_singleton_method("executable?", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await RubyString.klass());
            const path = args[0].get_data<string>();
            return vmfs.is_executable(path) ? Qtrue : Qfalse;
        });

        klass.define_native_singleton_method("absolute_path?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [path_arg] = await Args.scan("1", args);
            await Runtime.assert_type(path_arg, await RubyString.klass());
            return !vmfs.is_relative(path_arg.get_data<string>()) ? Qtrue : Qfalse;
        });

        klass.define_native_singleton_method("join", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            const paths = await flatten_string_array(args);
            return await RubyString.new(vmfs.join_paths(...paths));
        });

        /* Return true if the named file exists. */
        klass.define_native_singleton_method("exist?", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await RubyString.klass());
            const path = args[0].get_data<string>();
            return vmfs.path_exists(path) ? Qtrue : Qfalse;
        });

        /* Returns all components of the filename given in file_name except the last one (after first
         * stripping trailing separators). The filename can be formed using both File::SEPARATOR and
         * File::ALT_SEPARATOR as the separator when File::ALT_SEPARATOR is not nil.
         */
        klass.define_native_singleton_method("dirname", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await RubyString.klass());
            const path_str = args[0].get_data<string>();

            return RubyString.new(vmfs.dirname(path_str));
        });

        klass.define_native_singleton_method("extname", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await RubyString.klass());
            const path_str = args[0].get_data<string>();

            return RubyString.new(vmfs.extname(path_str));
        });

        klass.define_native_singleton_method("read", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await RubyString.klass());
            // @TODO: use default encoding instead of hard-coding utf-8
            const decoder = new TextDecoder("utf-8");
            return RubyString.new(decoder.decode(vmfs.read(args[0].get_data<string>())));
        });

        const default_mode = await RubyString.new("r");
        const default_perm = await Integer.get(0o666);

        klass.define_native_singleton_method("new", async (self: RValue, args: RValue[], kwargs?: Hash): Promise<RValue> => {
            const [path_rval, mode_rval, perm_rval] = await Args.scan("12", args);

            // Coerce path to string - this will raise TypeError if path is nil
            const path_str_rval = await Runtime.coerce_to_string(path_rval);

            return RubyFile.subclass_new(
                self,
                path_str_rval,
                mode_rval || default_mode,
                perm_rval || default_perm,
                kwargs
            );
        });

        klass.define_native_singleton_method("open", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const file_rval = await Object.send(self, "new", args, kwargs);
            const file = file_rval.get_data<RubyFile>();
            let return_value = file_rval;

            if (block) {
                try {
                    return_value = await Object.send(block, "call", [file_rval]);
                } finally {
                    if (file.descriptor) {
                        file.descriptor.close();
                        file.descriptor = null;
                    }
                }
            }

            return return_value;
        });

        klass.define_native_method("close", (self: RValue, _args: RValue[]): RValue => {
            const file = self.get_data<RubyFile>();

            if (file && file.descriptor) {
                file.descriptor.close();
                file.descriptor = null;
            }

            return Qnil;
        });

        klass.define_native_method("gets", async (self: RValue, _args: RValue[]): Promise<RValue> => {
            const file = self.get_data<RubyFile>();
            const line = file.gets();
            return line ? await RubyString.new(line) : Qnil;
        });
    });
};
