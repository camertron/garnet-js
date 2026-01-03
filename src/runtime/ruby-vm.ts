import { ObjectClass, Runtime } from "../runtime"

let inited = false;

export const init = () => {
  if (inited) return;

    Runtime.define_class("RubyVM", ObjectClass);

    inited = true;
}
