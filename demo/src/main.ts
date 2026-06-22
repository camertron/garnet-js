import "./style.css";
import "./assets/lequire-webfont.woff";
import "./assets/lequire-webfont.woff2";
import "./assets/garnet-logotype.svg";
import onigmo_url from "./assets/onigmo.wasm";
import prism_url from "./assets/prism.wasm";

import * as Garnet from "@camertron/garnet-js/src/garnet";
import { Terminal } from "xterm";
import { LocalEchoAddon } from "@gytx/xterm-local-echo";

declare global {
  interface Window {
    garnet_wasm_modules: {[key: string]: string};
  }
}

const locator_map: {[key: string]: string} = {
  onigmo: onigmo_url,
  prism: prism_url,
}

Garnet.WASM.register_module_resolver((locator: string): string => {
  if (locator_map[locator]) {
    return locator_map[locator]
  } else {
    throw new Error(`Could not resolve WASM module named ${locator}`);
  }
});

await Garnet.init();

class IRBIO implements Garnet.IO {
  static new(local_echo: LocalEchoAddon): Garnet.RValue {
    return new Garnet.RValue(Garnet.IOClass, new IRBIO(local_echo));
  }

  private local_echo: LocalEchoAddon;

  constructor(local_echo: LocalEchoAddon) {
    this.local_echo = local_echo;
  }

  puts(val: string): void {
    this.local_echo.println(val);
  }

  write(val: string): void {
    this.local_echo.print(val);
  }

  is_tty(): boolean {
    return true;
  }
}

const ec = Garnet.ExecutionContext.current;
const terminal = new Terminal({cursorBlink: true, fontSize: 18, theme: {foreground: "#007ACD"}});
const el = document.querySelector(".Console-input")! as HTMLElement;
terminal.open(el);
const local_echo = new LocalEchoAddon();
terminal.loadAddon(local_echo);

ec.globals["$stdout"] = IRBIO.new(local_echo);
ec.globals["$stderr"] = IRBIO.new(local_echo);

// for remembering locals across top frame evals
ec.globals["$__GARNET_DEMO_LOCALS"] = await Garnet.Hash.new();

// Infinite loop of reading lines
const prompt = "irb> ";
const readLine = async () => {
  let input = await local_echo.read(prompt);

  if (input.trim().length > 0) {
    try {
      const toplevel_binding = Garnet.ObjectClass
        .get_data<Garnet.Class>()
        .constants["TOPLEVEL_BINDING"]
        ?.get_data<Garnet.Binding>();

      if (toplevel_binding) {
        // "remember" locals
        const local_names = toplevel_binding.local_variables();
        const local_reads = [];

        for (const [local_idx, local_name] of local_names.entries()) {
          const stack_index = toplevel_binding.parent_frame!.stack_index + local_idx;

          ec.globals["$__GARNET_DEMO_LOCALS"].get_data<Garnet.Hash>().set_by_symbol(
            local_name,
            ec.stack.at(stack_index)?.rval || Garnet.Qnil,
          );

          const local_name_sym = Garnet.Symbol.inspect(local_name);

          local_reads.push(`${local_name} = $__GARNET_DEMO_LOCALS[${local_name_sym}]`);
        }

        input = `${local_reads.join(";")};${input}`;
      }

      const result = await Garnet.evaluate(input);
      local_echo.println(`=> ${(await Garnet.Object.send(result, "inspect")).get_data<string>()}`)
    } catch (e) {
      if (e instanceof Garnet.RubyError) {
        local_echo.println(Garnet.ExecutionContext.print_backtrace_to_string(e));
      } else if (e instanceof Error) {
        local_echo.println(`Unhandled JavaScript error: ${e.message}`);
        if (e.stack) local_echo.println(e.stack);
      }
    }
  }

  readLine();
};

readLine();

const textarea = document.querySelector(".xterm-helper-textarea")! as HTMLElement;
textarea.focus();

import { gsap } from "gsap";

const randomInRange = (max: number, min: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min
const BASE_SIZE = 1;
const VELOCITY_INC = 1.01;
const VELOCITY_INIT_INC = 1.025;
const SIZE_INC = 1.01;
const RAD = Math.PI / 180;

type StarState = {
  alpha: number
  angle: number
  active: boolean
  iX?: number
  iY?: number
  iVX?: number
  iVY?: number
  x: number
  vX: number
  y: number
  vY: number
  size: number
}

/**
 * Class for storing the particle metadata
 * position, size, length, speed etc.
 */
class Star {
  STATE: StarState;
  INIT_STATE = {
    alpha: Math.random(),
    angle: randomInRange(0, 360) * RAD,
    active: false,
  };

  reset() {
    this.STATE = this.make_new_state();
  }

  make_new_state(): StarState {
    const angle = randomInRange(0, 360) * (Math.PI / 180);
    const vX = Math.cos(angle);
    const vY = Math.sin(angle);
    const travelled =
      Math.random() > 0.5
        ? Math.random() * Math.max(window.innerWidth, window.innerHeight) + (Math.random() * (window.innerWidth * 0.24))
        : Math.random() * (window.innerWidth * 0.25);
    return {
      ...this.INIT_STATE,
      iX: undefined,
      iY: undefined,
      active: travelled ? true : false,
      x: Math.floor(vX * travelled) + window.innerWidth / 2,
      vX,
      y: Math.floor(vY * travelled) + window.innerHeight / 2,
      vY,
      size: BASE_SIZE,
    };
  }

  constructor() {
    this.STATE = this.make_new_state();
  }
}

const generateStarPool = (size: number) => new Array(size).fill(null).map(() => new Star());

// Class for the actual app
// Not too much happens in here
// Initiate the drawing process and listen for user interactions 👍
class Hyperspace {
  private STATE = {
    stars: generateStarPool(300),
    bgAlpha: 0,
    sizeInc: SIZE_INC,
    velocity: VELOCITY_INC,
    initiating: false,
  };

  private canvas: HTMLCanvasElement;
  private context;

  constructor() {
    this.canvas = document.querySelector(".Hyperspace-canvas")!;
    this.context = this.canvas.getContext('2d')!;
    this.setup();
    this.render();
  }

  render() {
    const context = this.context;
    const {
      bgAlpha,
      velocity,
      sizeInc,
      stars,
      initiating,
    } = this.STATE;

    // Clear the canvas
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);

    if (bgAlpha > 0) {
      context.fillStyle = `rgba(31, 58, 157, ${bgAlpha})`;
      context.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }

    // 1. Shall we add a new star
    const nonActive = stars.filter(s => !s.STATE.active);
    if (!initiating && nonActive.length > 0) {
      // Introduce a star
      nonActive[0].STATE.active = true;
    }

    // 2. Update the stars and draw them.
    for (const star of stars.filter(s => s.STATE.active)) {
      const { active, x, y, iX, iY, iVX, iVY, size, vX, vY } = star.STATE;
      // Check if the star needs deactivating
      if (
        ((iX || x) < 0 ||
          (iX || x) > window.innerWidth ||
          (iY || y) < 0 ||
          (iY || y) > window.innerHeight) &&
        active &&
        !initiating
      ) {
        star.reset();
      } else if (active) {
        const newIX = initiating ? (iX ?? 0) : (iX ?? 0) + (iVX ?? 0);
        const newIY = initiating ? (iY ?? 0) : (iY ?? 0) + (iVY ?? 0);
        const newX = x + vX;
        const newY = y + vY;
        // Just need to work out if it overtakes the original line that's all
        const caught =
          (vX < 0 && newIX < x) ||
          (vX > 0 && newIX > x) ||
          (vY < 0 && newIY < y) ||
          (vY > 0 && newIY > y);
        star.STATE = {
          ...star.STATE,
          iX: caught ? undefined : newIX,
          iY: caught ? undefined : newIY,
          iVX: caught ? undefined : (iVX ?? 0) * VELOCITY_INIT_INC,
          iVY: caught ? undefined : (iVY ?? 0 ) * VELOCITY_INIT_INC,
          x: newX,
          vX: star.STATE.vX * velocity,
          y: newY,
          vY: star.STATE.vY * velocity,
          size: initiating ? size : size * (iX || iY ? SIZE_INC : sizeInc),
        };

        let color = `rgba(255, 255, 255, ${star.STATE.alpha})`;

        context.strokeStyle = color;
        context.lineWidth = size;
        context.beginPath();
        context.moveTo(star.STATE.iX || x, star.STATE.iY || y);
        context.lineTo(star.STATE.x, star.STATE.y);
        context.stroke();
      }
    }

    requestAnimationFrame(this.render.bind(this));
  }

  initiate() {
    if (this.STATE.initiating) return;

    this.STATE = {
      ...this.STATE,
      initiating: true,
    };

    gsap.to(this.STATE, {duration: 0.25, velocity: VELOCITY_INIT_INC, bgAlpha: 0.3});

    // When we initiate, stop the XY origin from moving so that we draw
    // longer lines until the jump
    for (const star of this.STATE.stars.filter(s => s.STATE.active)) {
      star.STATE = {
        ...star.STATE,
        iX: star.STATE.x,
        iY: star.STATE.y,
        iVX: star.STATE.vX,
        iVY: star.STATE.vY,
      };
    }
  }

  setup() {
    this.context.lineCap = 'round';
    this.canvas.height = window.innerHeight;
    this.canvas.width = window.innerWidth;
  }

  reset() {
    this.STATE = {
      ...this.STATE,
      stars: generateStarPool(300)
    };

    this.setup();
  }
}

const hyperspace = new Hyperspace();

window.addEventListener(
  'resize', () => {
    hyperspace.reset();
  }
);
