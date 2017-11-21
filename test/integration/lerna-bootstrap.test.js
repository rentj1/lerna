import execa from "execa";
import fs from "fs-extra";
import getPort from "get-port";
import globby from "globby";
import normalizePath from "normalize-path";
import path from "path";
import tempy from "tempy";

import { LERNA_ROOTDIR } from "../helpers/constants";
import initFixture from "../helpers/initFixture";
import copyFixture from "../helpers/copyFixture";

const PATH_KEY = process.platform === "win32" ? "Path" : "PATH";
const PATH_VAL = process.env[PATH_KEY];

describe("lerna bootstrap", () => {
  const PREFIX = tempy.directory(); // auto-appends "/bin"
  const BINDIR = fs.mkdirpSync(path.join(PREFIX, "bin"));
  const LINKED = fs.mkdirpSync(path.join(PREFIX, "link"));
  fs.mkdirpSync(path.join(PREFIX, "lib", "node_modules"));
  console.log("PREFIX", PREFIX);

  const CLI_PATH = [BINDIR, PATH_VAL].join(path.delimiter);

  beforeAll(() => {
    execa.sync("yarn", ["link", "--link-folder", LINKED], { cwd: LERNA_ROOTDIR, env: { PREFIX } });
    // execa.sync("npm", ["link"], { cwd: LERNA_ROOTDIR, env: { npm_config_prefix: PREFIX } });
  });

  const makeCLI = (cwd) => {
    const opts = {
      cwd,
      env: {
        [PATH_KEY]: CLI_PATH,
      },
    };

    return (cmd, args) => execa(cmd, args, opts);
  };

  const RUN_TEST = [
    "run",
    "test",
    "--",
    // arguments to npm test
    "--silent",
    "--onload-script=false",
  ];

  describe("from CLI", () => {
    test.concurrent("bootstraps all packages", async () => {
      const cwd = await initFixture("BootstrapCommand/integration");
      const cli = makeCLI(cwd);
      const args = [
        "bootstrap",
      ];

      const { stderr } = await cli("lerna", args);
      expect(stderr).toMatchSnapshot("simple: stderr");

      const { stdout } = await cli("lerna", RUN_TEST);
      expect(stdout).toMatchSnapshot("simple: stdout");
    });

    test.concurrent("respects ignore flag", async () => {
      const cwd = await initFixture("BootstrapCommand/integration");
      const cli = makeCLI(cwd);
      const args = [
        "bootstrap",
        "--ignore",
        "@integration/package-1",
      ];

      const { stderr } = await cli("lerna", args);
      expect(stderr).toMatchSnapshot("ignore: stderr");
    });

    test.concurrent("git repo check is ignored by default", async () => {
      const cwd = tempy.directory();
      const cli = makeCLI(cwd);
      await copyFixture(cwd, "BootstrapCommand/integration");
      const args = [
        "bootstrap",
      ];

      const { stderr } = await cli("lerna", args);
      expect(stderr).toMatchSnapshot("simple-no-git-check: stdout");
    });

    test.concurrent("--npm-client yarn", async () => {
      const cwd = await initFixture("BootstrapCommand/integration");
      const cli = makeCLI(cwd);
      const args = [
        "bootstrap",
        "--npm-client",
        "yarn",
      ];

      const { stderr } = await cli("lerna", args);
      expect(stderr).toMatchSnapshot("--npm-client yarn: stderr");

      const lockfiles = await globby(["package-*/yarn.lock"], { cwd }).then(
        (globbed) => globbed.map((fp) => normalizePath(fp))
      );
      expect(lockfiles).toMatchSnapshot("--npm-client yarn: lockfiles");

      const { stdout } = await cli("lerna", RUN_TEST);
      expect(stdout).toMatchSnapshot("--npm-client yarn: stdout");
    });

    test.concurrent("passes remaining arguments to npm client", async () => {
      const cwd = await initFixture("BootstrapCommand/npm-client-args-1");
      const cli = makeCLI(cwd);
      const args = [
        "bootstrap",
        "--npm-client",
        path.resolve(cwd, "npm"),
        "--",
        "--no-optional",
      ];

      await cli("lerna", args);

      const npmDebugLog = fs.readFileSync(path.resolve(cwd, "npm-debug.log")).toString();
      expect(npmDebugLog).toMatchSnapshot("passes remaining arguments to npm client");
    });

    test.concurrent("passes remaining arguments + npmClientArgs to npm client", async () => {
      const cwd = await initFixture("BootstrapCommand/npm-client-args-2");
      const cli = makeCLI(cwd);
      const args = [
        "bootstrap",
        "--npm-client",
        path.resolve(cwd, "npm"),
        "--",
        "--no-optional",
      ];

      await cli("lerna", args);

      const npmDebugLog = fs.readFileSync(path.resolve(cwd, "npm-debug.log")).toString();
      expect(npmDebugLog).toMatchSnapshot("passes remaining arguments + npmClientArgs to npm client");
    });
  });

  describe("from npm script", async () => {
    test.concurrent("bootstraps all packages", async () => {
      const cwd = await initFixture("BootstrapCommand/integration-lifecycle");

      execa.sync("yarn", ["link", "lerna", "--link-folder", LINKED], { cwd, env: { PREFIX } });
      // execa.sync("npm", ["link", "lerna"], { cwd, env: { npm_config_prefix: PREFIX } });

      await execa("npm", [
        "install",
        "--no-package-lock",
        "--loglevel=warn",
      ], { cwd });

      const { stdout, stderr } = await execa("npm", [
        "test",
        "--silent",
        "--onload-script=false",
      ], { cwd });

      expect(stdout).toMatchSnapshot("npm postinstall: stdout");
      expect(stderr).toMatchSnapshot("npm postinstall: stderr");
    });

    test.skip("works with yarn install", async () => {
      const cwd = await initFixture("BootstrapCommand/integration-lifecycle");

      execa.sync("yarn", ["link", "lerna", "--link-folder", LINKED], { cwd, env: { PREFIX } });

      const port = await getPort({ port: 42042, host: '0.0.0.0' });
      const mutex = ["--mutex", `network:${port}`];

      // NOTE: yarn doesn't support linking binaries from transitive dependencies,
      // so it's important to test _both_ lifecycle variants.
      // TODO: ...eventually :P
      // FIXME: yarn doesn't understand file:// URLs... /sigh
      await execa("yarn", [
        "install",
        "--no-lockfile",
        ...mutex,
      ], { cwd });

      const { stdout, stderr } = await execa("yarn", [
        "test",
        "--silent",
        ...mutex,
      ], { cwd });

      expect(stdout).toMatchSnapshot("yarn postinstall: stdout");
      expect(stderr).toMatchSnapshot("yarn postinstall: stderr");
    });
  });
});
