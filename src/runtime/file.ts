import { ErrnoENOENT } from "../errors";
import { Class, IOClass, Qnil, RValue, Runtime, StringClass, String, Qtrue, Qfalse } from "../runtime"
import { vmfs } from "../vmfs";
import { Dir } from "./dir";

const path_from_realpath_args = (args: RValue[]): string => {
    Runtime.assert_type(args[0], StringClass);
    let path = args[0].get_data<string>();

    if (args.length > 1 && vmfs.is_relative(path)) {
        Runtime.assert_type(args[1], StringClass);
        const dir = args[1].get_data<string>();
        path = vmfs.join_paths(dir, path);
    }

    return path;
}

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
        klass.define_native_singleton_method("realdirpath", (self: RValue, args: RValue[]): RValue => {
            let path = path_from_realpath_args(args);
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
        klass.define_native_singleton_method("realpath", (_self: RValue, args: RValue[]): RValue => {
            const path = path_from_realpath_args(args);
            return String.new(vmfs.real_path(path));
        });

        /* Converts a pathname to an absolute pathname. Relative paths are referenced from the current working directory
         * of the process unless dir_string is given, in which case it will be used as the starting point. The given
         * pathname may start with a "~", which expands to the process owner’s home directory (the environment variable
         * HOME must be set correctly). "~user" expands to the named user’s home directory.
         */
        klass.define_native_singleton_method("expand_path", (_self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], StringClass);
            const path = args[0].get_data<string>();

            // already an absolute path, so return it
            if (!vmfs.is_relative(path)) {
                return args[0];
            }

            let dir;
            if (args.length > 1) {
                Runtime.assert_type(args[1], StringClass);
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
        klass.define_native_singleton_method("file?", (_self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], StringClass);
            const path = args[0].get_data<string>();
            return vmfs.is_file(path) ? Qtrue : Qfalse;
        });

        /* With string object given, returns true if path is a string path leading to a directory, or to
         * a symbolic link to a directory; false otherwise
         */
        klass.define_native_singleton_method("directory?", (_self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], StringClass);
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
        klass.define_native_singleton_method("executable?", (_self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], StringClass);
            const path = args[0].get_data<string>();
            return vmfs.is_executable(path) ? Qtrue : Qfalse;
        });

        klass.define_native_singleton_method("join", (_self: RValue, args: RValue[]): RValue => {
            const paths = args.map((arg) => {
                Runtime.assert_type(arg, StringClass);
                return arg.get_data<string>();
            });

            return String.new(vmfs.join_paths(...paths));
        });

        /* Return true if the named file exists. */
        klass.define_native_singleton_method("exist?", (_self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], StringClass);
            const path = args[0].get_data<string>();
            return vmfs.path_exists(path) ? Qtrue : Qfalse;
        });
    });
};
