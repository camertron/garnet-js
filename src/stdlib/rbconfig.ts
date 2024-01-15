import { fileURLToPath } from "url";
import { isNode } from "../env";
import { Module, Runtime, String } from "../runtime"
import { Hash } from "../runtime/hash";
import { vmfs } from "../vmfs";

let inited = false;

export const init = () => {
    if (inited) return;

    const config_rvalue = Hash.new();
    const config = config_rvalue.get_data<Hash>();

    config.set(String.new("EXEEXT"), String.new("")); // change this for windows?
    config.set(String.new("RUBY_INSTALL_NAME"), String.new("ruby"));

    if (isNode) {
        config.set(String.new("bindir"), String.new(vmfs.real_path(vmfs.join_paths(fileURLToPath(import.meta.url), "..", "..", "..", "exe"))));
    }

    Runtime.define_module("RbConfig", (mod: Module): void => {
        mod.constants["CONFIG"] = config_rvalue;
    });

    inited = true;
};
