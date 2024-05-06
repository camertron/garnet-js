import { is_node } from "../env";
import { Module, Runtime } from "../runtime"
import { Hash } from "../runtime/hash";
import { vmfs } from "../vmfs";
import { String } from "../runtime/string";

let url: typeof import("node:url");

if (is_node) {
    url = await import("node:url");
}

let inited = false;

export const init = async () => {
    if (inited) return;

    const config_rvalue = await Hash.new();
    const config = config_rvalue.get_data<Hash>();

    await config.set(await String.new("EXEEXT"), await String.new("")); // change this for windows?
    await config.set(await String.new("RUBY_INSTALL_NAME"), await String.new("ruby"));

    if (is_node) {
        await config.set(
            await String.new("bindir"),
            await String.new(vmfs.real_path(vmfs.join_paths(url.fileURLToPath(import.meta.url), "..", "..", "..", "exe")))
        );
    }

    Runtime.define_module("RbConfig", (mod: Module): void => {
        mod.constants["CONFIG"] = config_rvalue;
    });

    inited = true;
};
