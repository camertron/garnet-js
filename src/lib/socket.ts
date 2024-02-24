import { IOClass, Runtime } from "../garnet";
import { ObjectClass } from "../runtime";

let inited = false;

export const init = () => {
    if (inited) return;

    const BasicSocket = Runtime.define_class("BasicSocket", IOClass);
    Runtime.define_class("Socket", BasicSocket)

    inited = true;
}
