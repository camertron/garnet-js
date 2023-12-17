import { Hash, Module, Runtime, String } from "../runtime"

export const init = () => {
    const config_rvalue = Hash.new();
    const config = config_rvalue.get_data<Hash>();

    config.set(String.new("EXEEXT"), String.new("")); // change this for windows?
    config.set(String.new("RUBY_INSTALL_NAME"), String.new("ruby"));

    Runtime.define_module("RbConfig", (mod: Module): void => {
        mod.constants["CONFIG"] = config_rvalue;
    });
};
