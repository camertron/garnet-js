import { Class, Module, ModuleClass, RValue } from "./runtime";

const Main = new RValue(ModuleClass.get_data<Class>(), new Module("main"));
export default Main;
