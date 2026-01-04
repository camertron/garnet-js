import { Runtime } from "../runtime"

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_module("ObjectSpace");

    inited = true;
};
