import chalk from "chalk";
import EventEmitter from "events";
import execa from "execa";
import getStream from "get-stream";
import logTransformer from "strong-log-transformer";
import pFinally from "p-finally";
import stripEof from "strip-eof";

// Keep track of how many live children we have.
let children = 0;

// This is used to alert listeners when all children have exited.
const emitter = new EventEmitter();

// when streaming children are spawned, use this color for prefix
const colorWheel = [
  "cyan",
  "magenta",
  "blue",
  "yellow",
  "green",
  "red",
];
const NUM_COLORS = colorWheel.length;

export default class ChildProcessUtilities {
  static exec(command, args, opts, callback) {
    const options = Object.assign({
      // only stderr is piped for possible error reporting
      stdio: ["ignore", "ignore", "pipe"],
    }, opts);

    return _spawn(command, args, options, callback);
  }

  static execSync(command, args, opts) {
    return execa.sync(command, args, opts).stdout;
  }

  static spawn(command, args, opts, callback) {
    const options = Object.assign({
      stdio: "inherit",
    }, opts);

    return _spawn(command, args, options, callback);
  }

  static spawnStreaming(command, args, opts, prefix, callback) {
    const options = Object.assign({
      stdio: ["ignore", "pipe", "pipe"],
    }, opts);

    const colorName = colorWheel[children % NUM_COLORS];
    const color = chalk[colorName];
    const spawned = _spawn(command, args, options, callback);

    const prefixedStdout = logTransformer({ tag: `${color.bold(prefix)}:` });
    const prefixedStderr = logTransformer({ tag: `${color(prefix)}:`, mergeMultiline: true });

    // Avoid "Possible EventEmitter memory leak detected" warning due to piped stdio
    if (children > process.stdout.listenerCount("close")) {
      process.stdout.setMaxListeners(children);
      process.stderr.setMaxListeners(children);
    }

    spawned.stdout.pipe(prefixedStdout).pipe(process.stdout);
    spawned.stderr.pipe(prefixedStderr).pipe(process.stderr);

    return spawned;
  }

  static getChildProcessCount() {
    return children;
  }

  static onAllExited(callback) {
    emitter.on("empty", callback);
  }
}

function registerChild() {
  children++;

  // sentinel to insure the bookKeeper is only called once,
  // even if 'exit' _and_ 'error' events are fired.
  let accountedFor = false;

  function bookKeeper() {
    // istanbul ignore else
    if (accountedFor === false) {
      accountedFor = true;
      children -= 1;

      if (children === 0) {
        // yield thread to allow child process callbacks to drain first
        setImmediate(() => {
          emitter.emit("empty");
        });
      }
    }
  }

  return bookKeeper;
}

function readStream(stream) {
  if (!stream) {
    return Promise.resolve(null);
  }

  return getStream(stream).then(stripEof);
}

function annotateError(error, child, callback) {
  Promise.all([
    readStream(child.stdout),
    readStream(child.stderr),
  ]).then(([stdout, stderr]) => {
    error.stdout = stdout;
    error.stderr = stderr;
    callback(error);
  });
}

function _spawn(command, args, opts, callback) {
  const child = execa(command, args, opts);
  const didFinish = registerChild();

  if (callback) {
    // re-implement half of execa() to avoid unnecessary buffering, lol :P
    child.once("error", (error) => {
      didFinish();

      annotateError(error, child, callback);
    });

    child.once("exit", (code, signal) => {
      didFinish();

      if (code !== 0 || signal !== null) {
        const error = { code, signal };
        annotateError(error, child, callback);
      } else if (child.stdout) {
        readStream(child.stdout).then((stdout) => {
          callback(null, stdout);
        });
      } else {
        callback();
      }
    });
  } else {
    pFinally(child, didFinish).catch(() => {});
  }

  return child;
}
