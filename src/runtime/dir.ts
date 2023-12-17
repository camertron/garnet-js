import { Class, ObjectClass, Runtime, RValue, String } from "../runtime";

export class Dir {
    private static wd: string;
    private static wd_val: RValue;

    static getwd() {
        return this.wd;
    }

    static getwd_val() {
        return this.wd_val;
    }

    static setwd(new_wd: string) {
        this.wd = new_wd;
        this.wd_val = String.new(this.wd);
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("Dir", ObjectClass, (klass: Class) => {
        klass.define_native_singleton_method("getwd", (self: RValue): RValue => {
            return Dir.getwd_val();
        });

        klass.define_native_singleton_method("pwd", (self: RValue): RValue => {
            return Dir.getwd_val();
        });
    });

    inited = true;
};
