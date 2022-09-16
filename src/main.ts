import { Module, ModuleClass, RValue } from "./runtime";

const Main = new RValue(ModuleClass.klass, new Module(null));
export default Main;
