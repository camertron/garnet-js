import { Module, Runtime } from "../runtime"

let inited = false;

export const init = async () => {
    if (inited) return;

    Runtime.define_module("Pathname", (mod: Module): void => {
    });

    inited = true;
};
