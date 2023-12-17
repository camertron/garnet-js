import * as fs from "fs";
import { isBrowser, isNode } from "./env";

import { Trie } from "./util/trie";
import { Dir } from "./runtime/dir";
import { ErrnoENOENT } from "./errors";

interface IFileHandle {
    offset(): number;
    is_readable(): boolean;
    is_writable(): boolean;
    read(length: number): Buffer;
    write(bytes: Buffer): void;
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
        return join_paths(...paths);
    }

    split_path(path: string): string[] {
        return path.split(VirtualFileSystem.DELIMITER);
    }

    dirname(path: string): string {
        const segments = this.split_path(path);
        return this.join_paths(...segments.slice(0, segments.length - 1));
    }

    basename(path: string): string {
        const segments = this.split_path(path);
        return segments[segments.length - 1];
    }

    // operations
    abstract list(path: string): string[];
    abstract open(path: string): IFileHandle;
    abstract read(path: string): Buffer;
    abstract write(path: string, bytes: Buffer): void;
}

const join_paths = (...paths: string[]): string => {
    if (paths.length == 0) {
        return "";
    } else if (paths.length == 1) {
        return paths[0];
    }

    const first_seg = remove_trailing_delimiters(paths[0]);
    const last_seg = remove_leading_delimiters(paths[paths.length - 1]);
    const segments = [first_seg];

    for (let i = 1; i < paths.length - 1; i ++) {
        segments.push(remove_delimiters(paths[i]));
    }

    segments.push(last_seg);

    return segments.join("/");
};

const remove_delimiters = (str: string): string => {
    return remove_trailing_delimiters(remove_leading_delimiters(str));
};

const remove_trailing_delimiters = (str: string): string => {
    return str.replace(VirtualFileSystem.TRAILING_DELIM_RE, "");
};

const remove_leading_delimiters = (str: string): string => {
    return str.replace(VirtualFileSystem.LEADING_DELIM_RE, "")
};

class VirtualFileSystem extends FileSystem {
    static ROOT_PATH: string = "/";
    static DELIMITER: string = "/";
    static LEADING_DELIM_RE = new RegExp(`^\.?${this.DELIMITER}+`);
    static TRAILING_DELIM_RE = new RegExp(`${this.DELIMITER}+$`);

    private files: Trie<string, Buffer>;

    constructor() {
        super();

        this.files = new Trie();
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
        return path.startsWith(".");
    }

    list(path: string): string[] {
        throw new Error("Method not implemented.");
    }

    open(path: string): IFileHandle {
        throw new Error("Method not implemented.");
    }

    read(path: string): Buffer {
        throw new Error("Method not implemented.");
    }

    write(path: string, bytes: Buffer): void {
        path = this.normalize_path(path);
        const p = this.split_path(path);
        this.files.set(p, bytes);
    }

    private normalize_path(path: string): string {
        const orig_segments = this.split_path(path);
        const segments: string[] = [];

        for (let segment of orig_segments) {
            if (segment == "..") {
                segments.pop();
            } else if (segment != ".") {
                segments.push(segment);
            }
        }

        return this.join_paths(...segments);
    }
}

class NodeFileSystem extends FileSystem {
    root_path(): string {
        return VirtualFileSystem.ROOT_PATH;
    }

    is_relative(path: string): boolean {
        return !path.startsWith(VirtualFileSystem.DELIMITER);
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

    list(path: string): string[] {
        throw new Error("Method not implemented.");
    }

    open(path: string): IFileHandle {
        throw new Error("Method not implemented.");
    }

    read(path: string): Buffer {
        return fs.readFileSync(path);
    }

    write(path: string, bytes: Buffer) {
        throw new Error("Method not implemented.");
    }
}

export const vmfs: FileSystem = ( () => {
    if (isBrowser) {
        return new VirtualFileSystem();
    } else if (isNode) {
        return new NodeFileSystem();
    } else {
        throw new Error("Running in an unsupported environment!");
    }
})();
