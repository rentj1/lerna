// file under test
import ChildProcessUtilities from "../src/ChildProcessUtilities";

describe("ChildProcessUtilities", () => {
  describe(".execSync()", () => {
    it("should execute a command in a child process and return the result", () => {
      expect(ChildProcessUtilities.execSync("echo", ["execSync"])).toBe("execSync");
    });

    it("does not error when stdout is ignored", () => {
      expect(() => ChildProcessUtilities.execSync("echo", ["ignored"], { stdio: "ignore" })).not.toThrow();
    });
  });

  describe(".exec()", () => {
    it("executes command in a child process and passes stdout to callback result when piped", (done) => {
      ChildProcessUtilities.exec("echo", ["foo"], { stdio: "pipe" }, (err, stdout) => {
        try {
          expect(err).toBe(null);
          expect(stdout).toBe("foo");
          done();
        } catch (ex) {
          done.fail(ex);
        }
      });
    });

    it("does not pipe stdout by default", (done) => {
      ChildProcessUtilities.exec("echo", ["foo"], null, (err, stdout) => {
        try {
          expect(stdout).toBe(undefined);
          done();
        } catch (ex) {
          done.fail(ex);
        }
      });
    });

    it("does not require a callback, instead returning a Promise", () => {
      return ChildProcessUtilities.exec("echo", ["Promise"], { stdio: "pipe" }).then((result) => {
        expect(result.stdout).toBe("Promise");
      });
    });

    it("passes error object to callback", (done) => {
      ChildProcessUtilities.exec("nowImTheModelOfAModernMajorGeneral", [], {}, (err) => {
        try {
          expect(err.message).toMatch(/\bnowImTheModelOfAModernMajorGeneral\b/);
          done();
        } catch (ex) {
          done.fail(ex);
        }
      });
    });

    it("calls callback with error when process is killed", (done) => {
      const cp = ChildProcessUtilities.exec("echo", ["foo"], {}, (err) => {
        try {
          expect(err.signal).toBe("SIGINT");
          expect(err).toHaveProperty("stderr", "");
          done();
        } catch (ex) {
          done.fail(ex);
        }
      });

      cp.kill("SIGINT");
    });

    it("passes Promise rejection through", () => {
      return ChildProcessUtilities.exec("theVeneratedVirginianVeteranWhoseMenAreAll", []).catch((err) => {
        expect(err.message).toMatch(/\btheVeneratedVirginianVeteranWhoseMenAreAll\b/);
      });
    });

    it("registers child processes that are created", () => {
      const echoOne = ChildProcessUtilities.exec("echo", ["one"], { stdio: "pipe" });
      expect(ChildProcessUtilities.getChildProcessCount()).toBe(1);

      const echoTwo = ChildProcessUtilities.exec("echo", ["two"], { stdio: "pipe" });
      expect(ChildProcessUtilities.getChildProcessCount()).toBe(2);

      return Promise.all([
        echoOne,
        echoTwo,
      ]).then(([one, two]) => {
        expect(one.stdout).toBe("one");
        expect(two.stdout).toBe("two");
      });
    });
  });

  describe(".spawn()", () => {
    it("should spawn a command in a child process that always inherits stdio", () => {
      const child = ChildProcessUtilities.spawn("echo", ["-n"]);
      expect(child.stdio).toEqual([null, null, null]);

      return child.then((result) => {
        expect(result.code).toBe(0);
        expect(result.signal).toBe(null);
      });
    });
  });

  describe(".onAllExited()", () => {
    it("fires callback when all child processes have exited", (done) => {
      const callback = jest.fn();

      ChildProcessUtilities.exec("echo", ["-n"]);
      ChildProcessUtilities.exec("echo", ["-n"], null, callback);
      ChildProcessUtilities.exec("echo", ["-n"], null, callback);
      ChildProcessUtilities.exec("echo", ["-n"]);

      ChildProcessUtilities.onAllExited(() => {
        // cheesy timeout lets contentious timers drain before asserting
        setTimeout(() => {
          expect(callback).toHaveBeenCalledTimes(2);
          done();
        }, 10);
      });
    });
  });
});
