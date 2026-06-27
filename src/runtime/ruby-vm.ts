import { ObjectClass, Runtime } from "../runtime"

let inited = false;

export const init = async () => {
  if (inited) return;

  await Runtime.define_class("RubyVM", ObjectClass);

  inited = true;
}
