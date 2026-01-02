import * as fs from "fs";
import * as path from "path";
import { is_browser, is_node } from "./env";

import { Trie } from "./util/trie";
import { Dir } from "./runtime/dir";
import { ErrnoENOENT } from "./errors";

interface IFileHandle {
    offset(): number;
    is_readable(): boolean;
    is_writable(): boolean;
    read(length: number): Uint8Array;
    write(bytes: Uint8Array): void;
    close(): void;
}

abstract class FileSystem {
    // paths
    abstract root_path(): string;
    abstract path_exists(path: string): boolean;
    abstract is_file(path: string): boolean;
    abstract is_directory(path: string): boolean;
    abstract is_relative(path: string): boolean;
    abstract is_executable(path: string): boolean;
    abstract real_path(path: string): string;

    join_paths(...paths: string[]): string {
        return join_paths(this.separator, ...paths);
    }

    split_path(path: string): string[] {
        return path.split(VirtualFileSystem.SEPARATOR);
    }

    dirname(path: string): string {
        // strip trailing separators
        let segments = this.split_path(path);

        // remove trailing empty segments i.e. the ones from trailing slashes
        while (segments.length > 0 && segments[segments.length - 1] === '') {
            segments.pop();
        }

        // remove the last component, i.e. what dirname is supposed to do
        if (segments.length > 0) {
            segments.pop();
        }

        // if empty, return current directory for relative paths and root for absolute paths
        if (segments.length === 0) {
            return ".";
        } else if (segments.length === 1 && segments[0] === '') {
            return this.root_path();
        }

        return this.join_paths(...segments);
    }

    basename(path: string): string {
        const segments = this.split_path(path);
        return segments[segments.length - 1];
    }

    abstract get separator(): string;

    // operations
    abstract each_child_path(base_path: string, cb: (child_path: string) => Promise<void>): void;
    abstract open(path: string): IFileHandle;
    abstract read(path: string): Uint8Array;
    abstract write(path: string, bytes: Uint8Array): void;

    normalize_path(path: string): string {
        const orig_segments = this.split_path(path);
        const segments: string[] = [];
        const is_absolute = path.startsWith(this.separator);

        for (let segment of orig_segments) {
            if (segment == "..") {
                // don't pop past the root for absolute paths
                if (segments.length > 0 && !(is_absolute && segments.length === 1 && segments[0] === '')) {
                    segments.pop();
                }

                // For absolute paths that try to go above root, we stay at root;
                // For relative paths, we keep the '..' if we can't go up further
                else if (!is_absolute) {
                    segments.push(segment);
                }
            } else if (segment != ".") {
                segments.push(segment);
            }
        }

        // ensure absolute paths still have their leading separator
        if (is_absolute && (segments.length === 0 || segments[0] !== '')) {
            segments.unshift('');
        }

        return this.join_paths(...segments);
    }
}

const leading_separator_re_map: Map<string, RegExp> = new Map();
const trailing_separator_re_map: Map<string, RegExp> = new Map();

const get_leading_separator_re = (separator: string): RegExp => {
    if (!leading_separator_re_map.has(separator)) {
        leading_separator_re_map.set(separator, new RegExp(`^\.?${separator}+`));
    }

    return leading_separator_re_map.get(separator)!;
}

const get_trailing_separator_re = (separator: string): RegExp => {
    if (!trailing_separator_re_map.has(separator)) {
        trailing_separator_re_map.set(separator, new RegExp(`${separator}+$`));
    }

    return trailing_separator_re_map.get(separator)!;
}

const join_paths = (separator: string, ...paths: string[]): string => {
    if (paths.length == 0) {
        return "";
    } else if (paths.length == 1) {
        return paths[0];
    }

    const first_seg = remove_trailing_separators(paths[0], separator);
    const last_seg = remove_leading_separators(paths[paths.length - 1], separator);
    const segments = [first_seg];

    for (let i = 1; i < paths.length - 1; i ++) {
        segments.push(remove_separators(paths[i], separator));
    }

    segments.push(last_seg);

    return segments.join(separator);
};

const remove_separators = (str: string, separator: string): string => {
    return remove_trailing_separators(remove_leading_separators(str, separator), separator);
};

const remove_trailing_separators = (str: string, separator: string): string => {
    return str.replace(get_trailing_separator_re(separator), "");
};

const remove_leading_separators = (str: string, separator: string): string => {
    return str.replace(get_leading_separator_re(separator), "");
};

export class ENOENT extends Error {
    public code = "ENOENT";
    public errno = -2;
}

class VirtualFileSystem extends FileSystem {
    static ROOT_PATH: string = "/";
    static SEPARATOR: string = "/";

    private files: Trie<string, Uint8Array>;

    constructor() {
        super();

        this.files = new Trie();
    }

    get separator(): string {
        return VirtualFileSystem.SEPARATOR;
    }

    // NOTE: this does not resolve symlinks because the virtual file system has no
    // concept of them yet
    real_path(orig_path: string): string {
        let path = orig_path;

        if (this.is_relative(path)) {
            path = this.join_paths(Dir.getwd(), path);
        }

        path = this.normalize_path(path);

        if (this.path_exists(path)) {
            return path;
        } else {
            throw new ErrnoENOENT(`No such file or directory - ${orig_path}`);
        }
    }

    root_path(): string {
        return VirtualFileSystem.ROOT_PATH;
    }

    path_exists(path: string): boolean {
        path = this.normalize_path(path);
        return this.files.has_path(this.split_path(path));
    }

    is_file(path: string): boolean {
        path = this.normalize_path(path);
        return this.files.has(this.split_path(path));
    }

    is_directory(path: string): boolean {
        path = this.normalize_path(path);
        const segments = this.split_path(path);
        return this.files.has_path(segments) && !this.files.has(segments);
    }

    is_executable(path: string): boolean {
        return false;
    }

    is_relative(path: string): boolean {
        return !path.startsWith(VirtualFileSystem.SEPARATOR);
    }

    each_child_path(base_path: string, cb: (child_path: string) => Promise<void>) {
        throw new Error("Method not implemented.");
    }

    open(path: string): IFileHandle {
        throw new Error("Method not implemented.");
    }

    read(path: string): Uint8Array {
        const key = this.split_path(path);
        if (this.files.has(key)) {
            return this.files.get(key)!;
        } else {
            throw new ENOENT(`no such file or directory, open '${path}'`);
        }
    }

    write(path: string, bytes: Uint8Array): void {
        path = this.normalize_path(path);
        const key = this.split_path(path);
        this.files.set(key, bytes);
    }
}

class NodeFileSystem extends FileSystem {
    get separator(): string {
        return path.sep;
    }

    root_path(): string {
        return VirtualFileSystem.ROOT_PATH;
    }

    is_relative(path: string): boolean {
        return !path.startsWith(VirtualFileSystem.SEPARATOR);
    }

    path_exists(path: string): boolean {
        return fs.existsSync(path);
    }

    is_file(path: string): boolean {
        if (this.path_exists(path)) {
            return fs.statSync(path).isFile();
        } else {
            return false;
        }
    }

    is_directory(path: string): boolean {
        if (this.path_exists(path)) {
            return fs.statSync(path).isDirectory();
        } else {
            return false;
        }
    }

    is_executable(path: string): boolean {
        try {
            fs.accessSync(path, fs.constants.X_OK);
            return true;
        } catch (e) {
            return false;
        }
    }

    real_path(orig_path: string): string {
        let path = orig_path;

        if (this.is_relative(path)) {
            path = this.join_paths(Dir.getwd(), path);
        }

        try {
            return fs.realpathSync(path);
        } catch (e) {
            if (e instanceof Error && "code" in e && e["code"] === "ENOENT") {
                throw new ErrnoENOENT(`No such file or directory - ${orig_path}`);
            }

            throw e;
        }
    }

    async each_child_path(base_path: string, cb: (child_path: string) => Promise<void>) {
        for (const file of fs.readdirSync(base_path)) {
            await cb(file);
        }
    }

    open(path: string): IFileHandle {
        throw new Error("Method not implemented.");
    }

    read(path: string): Uint8Array {
        return fs.readFileSync(path);
    }

    write(path: string, bytes: Uint8Array) {
        throw new Error("Method not implemented.");
    }
}

export const vmfs: FileSystem = ( () => {
    if (is_browser) {
        return new VirtualFileSystem();
    } else if (is_node) {
        return new NodeFileSystem();
    } else {
        throw new Error("Running in an unsupported environment!");
    }
})();
