export interface Logger {
  log(msg: string): void;
  ok(msg: string): void;
  warn(msg: string): void;
  err(msg: string): void;
}

export interface LoggerOptions {
  quiet?: boolean;
  color?: boolean;
  sink?: (msg: string) => void;
}

const COLORS = {
  reset: '[0m',
  blue: '[34m',
  green: '[32m',
  yellow: '[33m',
  red: '[31m',
};

export function createLogger(opts: LoggerOptions = {}): Logger {
  const color = opts.color ?? (Boolean(process.stdout?.isTTY) && !process.env.NO_COLOR);
  const sink = opts.sink ?? ((m: string) => console.log(m));
  const paint = (c: keyof typeof COLORS, label: string) =>
    color ? `${COLORS[c]}${label}${COLORS.reset}` : label;

  const emit = (label: string, msg: string) => {
    if (opts.quiet) return;
    sink(`${label} ${msg}`);
  };

  return {
    log: (msg) => emit(paint('blue', '[shotr]'), msg),
    ok: (msg) => emit(paint('green', '[ ok ]'), msg),
    warn: (msg) => emit(paint('yellow', '[warn]'), msg),
    err: (msg) => emit(paint('red', '[fail]'), msg),
  };
}

/** A logger that discards everything — handy for tests. */
export const silentLogger: Logger = {
  log: () => {},
  ok: () => {},
  warn: () => {},
  err: () => {},
};
