import { ObjectClass, Runtime } from "../runtime";

let inited = false;

export const init = () => {
    if (inited) return;

    // Jesus I hope I don't have to implement this any time soon 😱
    Runtime.define_class("Thread", ObjectClass);

    inited = true;
};
