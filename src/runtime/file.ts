import { ErrnoENOENT } from "../errors";
import { Class, IOClass, RValue, Runtime, Qtrue, Qfalse } from "../runtime"
import { vmfs } from "../vmfs";
import { Dir } from "./dir";
import { String } from "../runtime/string";

const path_from_realpath_args = async (args: RValue[]): Promise<string> => {
    Runtime.assert_type(args[0], await String.klass());
    let path = args[0].get_data<string>();

    if (args.length > 1 && vmfs.is_relative(path)) {
        Runtime.assert_type(args[1], await String.klass());
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

export const init = () => {
    Runtime.define_class("File", IOClass, (klass: Class): void => {
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

            return String.new(path);
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
            return await String.new(vmfs.real_path(path));
        });

        /* Converts a pathname to an absolute pathname. Relative paths are referenced from the current working directory
         * of the process unless dir_string is given, in which case it will be used as the starting point. The given
         * pathname may start with a "~", which expands to the process owner’s home directory (the environment variable
         * HOME must be set correctly). "~user" expands to the named user’s home directory.
         */
        klass.define_native_singleton_method("expand_path", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            Runtime.assert_type(args[0], await String.klass());
            const path = args[0].get_data<string>();

            // already an absolute path, so return it
            if (!vmfs.is_relative(path)) {
                return args[0];
            }

            let dir;
            if (args.length > 1) {
                Runtime.assert_type(args[1], await String.klass());
                dir = args[1].get_data<string>();
            } else {
                dir = Dir.getwd()
            }

            // ensure dir is absolute
            if (vmfs.is_relative(dir)) {
                dir = vmfs.join_paths(Dir.getwd(), dir);
            }

            const path_parts = vmfs.split_path(path);
            const dir_parts = vmfs.split_path(dir);

            for (const path_part of path_parts) {
                if (path_part === "..") {
                    dir_parts.pop();
                } else {
                    if (path_part != ".") {
                        dir_parts.push(path_part);
                    }
                }
            }

            if (dir_parts.length == 0) {
                return String.new("/");
            } else {
                return String.new(vmfs.join_paths(...dir_parts));
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
            Runtime.assert_type(args[0], await String.klass());
            const path = args[0].get_data<string>();
            return vmfs.is_file(path) ? Qtrue : Qfalse;
        });

        /* With string object given, returns true if path is a string path leading to a directory, or to
         * a symbolic link to a directory; false otherwise
         */
        klass.define_native_singleton_method("directory?", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            Runtime.assert_type(args[0], await String.klass());
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
            Runtime.assert_type(args[0], await String.klass());
            const path = args[0].get_data<string>();
            return vmfs.is_executable(path) ? Qtrue : Qfalse;
        });

        klass.define_native_singleton_method("join", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            const paths = await Promise.all(
                args.map(async (arg) => {
                    Runtime.assert_type(arg, await String.klass());
                    return arg.get_data<string>();
                })
            );

            return await String.new(vmfs.join_paths(...paths));
        });

        /* Return true if the named file exists. */
        klass.define_native_singleton_method("exist?", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            Runtime.assert_type(args[0], await String.klass());
            const path = args[0].get_data<string>();
            return vmfs.path_exists(path) ? Qtrue : Qfalse;
        });

        /* Returns all components of the filename given in file_name except the last one (after first
         * stripping trailing separators). The filename can be formed using both File::SEPARATOR and
         * File::ALT_SEPARATOR as the separator when File::ALT_SEPARATOR is not nil.
         */
        klass.define_native_singleton_method("dirname", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            Runtime.assert_type(args[0], await String.klass());
            const parts = vmfs.split_path(args[0].get_data<string>());

            while (parts.length > 0 && parts[parts.length - 1].length === 0) {
                parts.pop();
            }

            return String.new(vmfs.join_paths(...parts));
        });

        klass.define_native_singleton_method("read", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            Runtime.assert_type(args[0], await String.klass());
            // @TODO: use default encoding instead of hard-coding utf-8
            const decoder = new TextDecoder("utf-8");
            return String.new(decoder.decode(vmfs.read(args[0].get_data<string>())));
        });
    });
};
