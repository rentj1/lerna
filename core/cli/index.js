"use strict";

const dedent = require("dedent");
const isCI = require("is-ci");
const log = require("npmlog");
const yargs = require("yargs/yargs");
const globalOptions = require("@lerna/global-options");

const addCmd = require("@lerna/add/command");
const bootstrapCmd = require("@lerna/bootstrap/command");
const changedCmd = require("@lerna/changed/command");
const cleanCmd = require("@lerna/clean/command");
const createCmd = require("@lerna/create/command");
const diffCmd = require("@lerna/diff/command");
const execCmd = require("@lerna/exec/command");
const importCmd = require("@lerna/import/command");
const initCmd = require("@lerna/init/command");
const linkCmd = require("@lerna/link/command");
const listCmd = require("@lerna/list/command");
const publishCmd = require("@lerna/publish/command");
const runCmd = require("@lerna/run/command");

module.exports = lernaCLI;

/**
 * Essentially a factory that returns a yargs() instance that can
 * be used to call parse() immediately (as in ../lerna) or by
 * unit tests to encapsulate instantiation with "real" arguments.
 *
 * @param {Array = []} argv
 * @param {String = process.cwd()} cwd
 */
function lernaCLI(argv, cwd) {
  const cli = yargs(argv, cwd);
  let progress; // --no-progress always disables

  if (isCI || !process.stderr.isTTY) {
    log.disableColor();
    progress = false;
  } else if (!process.stdout.isTTY) {
    // stdout is being piped, don't log non-errors or progress bars
    progress = false;

    cli.check(parsedArgv => {
      // eslint-disable-next-line no-param-reassign
      parsedArgv.loglevel = "error";

      // return truthy or else it blows up
      return parsedArgv;
    });
  } else if (process.stderr.isTTY) {
    log.enableColor();
    log.enableUnicode();
  }

  return globalOptions(cli)
    .usage("Usage: $0 <command> [options]")
    .config({ ci: isCI, progress })
    .completion("completion", (current, parsedArgv) => {
      // console.error("\ncurrent %j", current);
      // console.error("parsedArgv\n%O", parsedArgv);
      // console.error("COMP_CWORD %j", process.env.COMP_CWORD);
      // console.error("COMP_LINE  %j", process.env.COMP_LINE);
      // console.error("COMP_POINT %j", process.env.COMP_POINT);

      // const command = cli.getCommandInstance();
      // const usage = cli.getUsageInstance();
      const args = parsedArgv._.slice();

      if (current.indexOf("--") === 0) {
        args.push(current);
      }

      // get the partial line and partial word,
      // if the point isn't at the end.
      // ie, tabbing at: npm foo b|ar
      const w = +process.env.COMP_CWORD;
      const words = args.map(unescape);
      const word = words[w] || current;
      const line = process.env.COMP_LINE;
      const point = +process.env.COMP_POINT;
      const partialLine = line.substr(0, point);
      const partialWords = words.slice(0, w);
      // console.error("partialLine %j", partialLine);
      // console.error("partialWords %j", partialWords);
      // console.error("partialWord %j", args[w]);
      // console.error("   words[w] %j", words[w]);

      // figure out where in that last word the point is, if it exists
      let partialWord = args[w];
      if (partialWord) {
        let i = partialWord.length;

        while (partialWord.substr(0, i) !== partialLine.substr(-1 * i) && i > 0) {
          i += 1;
        }

        partialWord = unescape(partialWord.substr(0, i));
        partialWords.push(partialWord);
      }

      const opts = {
        words,
        w,
        word,
        line,
        lineLength: line.length,
        point,
        partialLine,
        partialWords,
        partialWord,
        raw: args,
      };

      const cb = wrapResult(opts);

      // console.error(opts);
      // console.error(command.getCommandHandlers());
      // const cmds = new Set(command.getCommands());
      // console.error(usage.getCommands());
      // console.error(cli.parsed);

      if (partialWords.slice(0, -1).indexOf("--") === -1) {
        const config = cli.getOptions();

        opts.shorthands = new Set(Object.keys(config.alias));
        opts.configNames = new Set(Object.keys(config.key));
        config.hiddenOptions.forEach(name => opts.configNames.delete(name));
        opts.allConfs = new Set([...opts.configNames, ...opts.shorthands]);
        opts.flags = new Set(config.boolean);
        // console.error(hiddenOptions);
        // console.error(Object.keys(key));
        // console.error(Object.keys(alias));
        opts.isFlag = makeFlagPredicate(opts.flags, opts.shorthands);

        if (word.charAt(0) === "-") {
          return configCompl(opts, cb);
        }

        if (words[w - 1] && words[w - 1].charAt(0) === "-" && !opts.isFlag(words[w - 1])) {
          // awaiting a value for a non-bool config.
          // don't even try to do this for now
          return configValueCompl(opts, cb);
        }
      }

      // no command yet
      if (w === 1) {
        return cb(cli.getCommandInstance().getCommands());
      }

      // allow filesystem fallthrough
      return [];
    })
    .command(addCmd)
    .command(bootstrapCmd)
    .command(changedCmd)
    .command(cleanCmd)
    .command(createCmd)
    .command(diffCmd)
    .command(execCmd)
    .command(importCmd)
    .command(initCmd)
    .command(linkCmd)
    .command(listCmd)
    .command(publishCmd)
    .command(runCmd)
    .demandCommand(1, "A command is required. Pass --help to see all available commands and options.")
    .recommendCommands()
    .strict()
    .fail((msg, err) => {
      // certain yargs validations throw strings :P
      const actual = err || new Error(msg);
      // console.error(actual);
      // console.error(cli.parsed);

      // ValidationErrors are already logged, as are package errors
      if (actual.name !== "ValidationError" && !actual.pkg) {
        // the recommendCommands() message is too terse
        if (/Did you mean/.test(actual.message)) {
          log.error("lerna", `Unknown command "${cli.parsed.argv._[0]}"`);
        }

        log.error("lerna", actual.message);
      }

      // exit non-zero so the CLI can be usefully chained
      cli.exit(actual.code || 1, actual);
    })
    .alias("h", "help")
    .alias("v", "version")
    .wrap(cli.terminalWidth()).epilogue(dedent`
      When a command fails, all logs are written to lerna-debug.log in the current working directory.

      For more information, find our manual at https://github.com/lerna/lerna
    `);

  function unescape(w) {
    if (w.charAt(0) === "'") {
      return w.replace(/^'|'$/g, "");
    }
    return w.replace(/\\ /g, " ");
  }

  function escape(w) {
    if (!w.match(/\s+/)) {
      return w;
    }
    return `'${w}'`;
  }

  // The command should respond with an array.  Loop over that,
  // wrapping quotes around any that have spaces, and writing
  // them to stdout.  Use console.log, not the outfd config.
  // If any of the items are arrays, then join them with a space.
  // Ie, returning ['a', 'b c', ['d', 'e']] would allow it to expand
  // to: 'a', 'b c', or 'd' 'e'
  function wrapResult(opts) {
    return result => {
      let compls = result;

      if (!Array.isArray(compls)) {
        compls = compls ? [compls] : [];
      }

      compls = compls.map(c => {
        if (Array.isArray(c)) {
          return c.map(escape).join(" ");
        }
        return escape(c);
      });

      if (opts.partialWord) {
        compls = compls.filter(c => c.indexOf(opts.partialWord) === 0);
      }

      return compls;
    };
  }

  // the current word has a dash.  Return the config names,
  // with the same number of dashes as the current word has.
  function configCompl(opts, cb) {
    const split = opts.word.match(/^(-+)((?:no-)*)(.*)$/);
    const dashes = split[1];
    const no = split[2];
    const flags = Array.from(opts.configNames).filter(opts.isFlag);
    // console.error(flags);

    return cb(
      Array.from(opts.allConfs)
        .map(c => dashes + c)
        .concat(flags.map(f => dashes + (no || "no-") + f))
    );
  }

  // expand with the valid values of various config values.
  // not yet implemented.
  function configValueCompl(opts, cb) {
    // console.error("configValue", opts);
    return cb(null, []);
  }

  // check if the thing is a flag or not.
  function makeFlagPredicate(flags, shorthands) {
    return word => {
      // shorthands never take args.
      const split = word.match(/^(-*)((?:no-)+)?(.*)$/);
      const no = split[2];
      const conf = split[3];

      return no || flags.has(conf) || shorthands.has(conf);
    };
  }
}
