import { Class, ObjectClass, Runtime, RValue, String } from "../runtime";

export class Dir {
    private static wd: string;

    static getwd() {
        return Dir.wd;
    }

    static setwd(new_wd: string) {
        Dir.wd = new_wd;
    }
}

// Runtime.define_class("Dir", ObjectClass, (klass: Class) => {
//     klass.define_native_singleton_method("getwd", (self: RValue): RValue => {
//         if (self.iv_exists("__wd")) {
//             let wd = self.iv_get("__wd");

//             if (wd.get_data<string>() != Dir.getwd()) {
//                 wd = String.new(Dir.getwd());
//                 self.iv_set("__wd", wd);
//             }

//             return wd;
//         } else {
//             const wd = String.new(Dir.getwd());
//             self.iv_set("__wd", wd);
//             return wd;
//         }
//     });
// });
