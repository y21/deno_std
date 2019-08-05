// Copyright 2018-2019 the Deno authors. All rights reserved. MIT license.
const { run, stat, makeTempDir, remove, env, readAll } = Deno;

import { test, runIfMain, TestFunction } from "../testing/mod.ts";
import { assert, assertEquals } from "../testing/asserts.ts";
import { BufReader } from "../io/bufio.ts";
import { TextProtoReader } from "../textproto/mod.ts";
import * as path from "../fs/path.ts";
import * as fs from "../fs/mod.ts";
import { install, isRemoteUrl } from "./mod.ts";

let fileServer: Deno.Process;
const isWindows = Deno.platform.os === "win";

// copied from `http/file_server_test.ts`
async function startFileServer(): Promise<void> {
  fileServer = run({
    args: [
      Deno.execPath,
      "run",
      "--allow-read",
      "--allow-net",
      "http/file_server.ts",
      ".",
      "--cors"
    ],
    stdout: "piped"
  });
  // Once fileServer is ready it will write to its stdout.
  const r = new TextProtoReader(new BufReader(fileServer.stdout!));
  const s = await r.readLine();
  assert(s !== Deno.EOF && s.includes("server listening"));
}

function killFileServer(): void {
  fileServer.close();
  fileServer.stdout!.close();
}

function installerTest(t: TestFunction, useOriginHomeDir = false): void {
  const fn = async (): Promise<void> => {
    await startFileServer();
    const tempDir = await makeTempDir();
    const envVars = env();
    const originalHomeDir = envVars["HOME"];
    if (!useOriginHomeDir) {
      envVars["HOME"] = tempDir;
    }

    try {
      await t();
    } finally {
      killFileServer();
      await remove(tempDir, { recursive: true });
      envVars["HOME"] = originalHomeDir;
    }
  };

  test(fn);
}

installerTest(async function installBasic(): Promise<void> {
  await install(
    "echo_test",
    "http://localhost:4500/installer/testdata/echo.ts",
    []
  );

  const { HOME } = env();
  const filePath = path.resolve(HOME, ".deno/bin/echo_test");
  const fileInfo = await stat(filePath);
  assert(fileInfo.isFile());

  if (isWindows) {
    assertEquals(
      await fs.readFileStr(filePath + ".cmd"),
      /* eslint-disable max-len */
      `% This executable is generated by Deno. Please don't modify it unless you know what it means. %
@IF EXIST "%~dp0\deno.exe" (
  "%~dp0\deno.exe" "run" "http://localhost:4500/installer/testdata/echo.ts" %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.TS;=;%
  "deno" "run" "http://localhost:4500/installer/testdata/echo.ts" %*
)
`
      /* eslint-enable max-len */
    );
  }

  assertEquals(
    await fs.readFileStr(filePath),
    /* eslint-disable max-len */
    `#!/bin/sh
# This executable is generated by Deno. Please don't modify it unless you know what it means.
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")

case \`uname\` in
  *CYGWIN*) basedir=\`cygpath -w "$basedir"\`;;
esac

if [ -x "$basedir/deno" ]; then
  "$basedir/deno" "run" "http://localhost:4500/installer/testdata/echo.ts" "$@"
  ret=$?
else
  "deno" "run" "http://localhost:4500/installer/testdata/echo.ts" "$@"
  ret=$?
fi
exit $ret
`
    /* eslint-enable max-len */
  );
});

installerTest(async function installCustomDir(): Promise<void> {
  const tempDir = await makeTempDir();

  await install(
    "echo_test",
    "http://localhost:4500/installer/testdata/echo.ts",
    [],
    tempDir
  );

  const filePath = path.resolve(tempDir, "echo_test");
  const fileInfo = await stat(filePath);
  assert(fileInfo.isFile());

  if (isWindows) {
    assertEquals(
      await fs.readFileStr(filePath + ".cmd"),
      /* eslint-disable max-len */
      `% This executable is generated by Deno. Please don't modify it unless you know what it means. %
@IF EXIST "%~dp0\deno.exe" (
  "%~dp0\deno.exe" "run" "http://localhost:4500/installer/testdata/echo.ts" %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.TS;=;%
  "deno" "run" "http://localhost:4500/installer/testdata/echo.ts" %*
)
`
      /* eslint-enable max-len */
    );
  }

  assertEquals(
    await fs.readFileStr(filePath),
    /* eslint-disable max-len */
    `#!/bin/sh
# This executable is generated by Deno. Please don't modify it unless you know what it means.
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")

case \`uname\` in
  *CYGWIN*) basedir=\`cygpath -w "$basedir"\`;;
esac

if [ -x "$basedir/deno" ]; then
  "$basedir/deno" "run" "http://localhost:4500/installer/testdata/echo.ts" "$@"
  ret=$?
else
  "deno" "run" "http://localhost:4500/installer/testdata/echo.ts" "$@"
  ret=$?
fi
exit $ret
`
    /* eslint-enable max-len */
  );
});

installerTest(async function installLocalModule(): Promise<void> {
  let localModule = path.join(Deno.cwd(), "installer", "testdata", "echo.ts");
  await install("echo_test", localModule, []);

  const { HOME } = env();
  const filePath = path.resolve(HOME, ".deno/bin/echo_test");
  const fileInfo = await stat(filePath);
  assert(fileInfo.isFile());

  if (isWindows) {
    localModule = localModule.replace(/\\/g, "\\\\");
  }

  if (isWindows) {
    assertEquals(
      await fs.readFileStr(filePath + ".cmd"),
      /* eslint-disable max-len */
      `% This executable is generated by Deno. Please don't modify it unless you know what it means. %
@IF EXIST "%~dp0\deno.exe" (
  "%~dp0\deno.exe" "run" "${localModule}" %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.TS;=;%
  "deno" "run" "${localModule}" %*
)
`
      /* eslint-enable max-len */
    );
  }

  assertEquals(
    await fs.readFileStr(filePath),
    /* eslint-disable max-len */
    `#!/bin/sh
# This executable is generated by Deno. Please don't modify it unless you know what it means.
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")

case \`uname\` in
  *CYGWIN*) basedir=\`cygpath -w "$basedir"\`;;
esac

if [ -x "$basedir/deno" ]; then
  "$basedir/deno" "run" "${localModule}" "$@"
  ret=$?
else
  "deno" "run" "${localModule}" "$@"
  ret=$?
fi
exit $ret
`
    /* eslint-enable max-len */
  );
});

installerTest(async function installWithFlags(): Promise<void> {
  await install(
    "echo_test",
    "http://localhost:4500/installer/testdata/echo.ts",
    ["--allow-net", "--allow-read", "--foobar"]
  );

  const { HOME } = env();
  const filePath = path.resolve(HOME, ".deno/bin/echo_test");

  if (isWindows) {
    assertEquals(
      await fs.readFileStr(filePath + ".cmd"),
      /* eslint-disable max-len */
      `% This executable is generated by Deno. Please don't modify it unless you know what it means. %
@IF EXIST "%~dp0\deno.exe" (
  "%~dp0\deno.exe" "run" "--allow-net" "--allow-read" "http://localhost:4500/installer/testdata/echo.ts" "--foobar" %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.TS;=;%
  "deno" "run" "--allow-net" "--allow-read" "http://localhost:4500/installer/testdata/echo.ts" "--foobar" %*
)
`
      /* eslint-enable max-len */
    );
  }

  assertEquals(
    await fs.readFileStr(filePath),
    /* eslint-disable max-len */
    `#!/bin/sh
# This executable is generated by Deno. Please don't modify it unless you know what it means.
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")

case \`uname\` in
  *CYGWIN*) basedir=\`cygpath -w "$basedir"\`;;
esac

if [ -x "$basedir/deno" ]; then
  "$basedir/deno" "run" "--allow-net" "--allow-read" "http://localhost:4500/installer/testdata/echo.ts" "--foobar" "$@"
  ret=$?
else
  "deno" "run" "--allow-net" "--allow-read" "http://localhost:4500/installer/testdata/echo.ts" "--foobar" "$@"
  ret=$?
fi
exit $ret
`
    /* eslint-enable max-len */
  );
});

installerTest(async function installLocalModuleAndRun(): Promise<void> {
  const localModule = path.join(Deno.cwd(), "installer", "testdata", "echo.ts");
  await install("echo_test", localModule, ["hello"]);

  const { HOME } = env();
  const filePath = path.resolve(HOME, ".deno/bin/echo_test");
  const fileInfo = await stat(filePath);
  assert(fileInfo.isFile());

  const ps = run({
    args: ["echo_test" + (isWindows ? ".cmd" : ""), "foo"],
    stdout: "piped"
  });

  if (!ps.stdout) {
    assert(!!ps.stdout, "There should have stdout.");
    return;
  }

  let thrown = false;

  try {
    const b = await readAll(ps.stdout);

    const s = new TextDecoder("utf-8").decode(b);

    assertEquals(s, "hello, foo");
  } catch (err) {
    console.error(err);
    thrown = true;
  } finally {
    await remove(filePath);
    ps.close();
  }

  assert(!thrown, "It should not throw an error");
}, true); // set true to install module in your real $HOME dir.

installerTest(async function installAndMakesureItCanRun(): Promise<void> {
  await install(
    "echo_test",
    "http://localhost:4500/installer/testdata/echo.ts",
    ["hello"]
  );

  const { HOME } = env();
  const filePath = path.resolve(HOME, ".deno/bin/echo_test");
  const fileInfo = await stat(filePath);
  assert(fileInfo.isFile());

  const ps = run({
    args: ["echo_test" + (isWindows ? ".cmd" : ""), "foo"],
    stdout: "piped"
  });

  if (!ps.stdout) {
    assert(!!ps.stdout, "There should have stdout.");
    return;
  }

  let thrown = false;

  try {
    const b = await readAll(ps.stdout);

    const s = new TextDecoder("utf-8").decode(b);

    assertEquals(s, "hello, foo");
  } catch (err) {
    console.error(err);
    thrown = true;
  } finally {
    await remove(filePath);
    ps.close();
  }

  assert(!thrown, "It should not throw an error");
}, true); // set true to install module in your real $HOME dir.

installerTest(async function installAndMakesureArgsRight(): Promise<void> {
  await install(
    "args_test",
    "http://localhost:4500/installer/testdata/args.ts",
    ["arg1", "--flag1"]
  );

  const { HOME } = env();
  const filePath = path.resolve(HOME, ".deno/bin/args_test");
  const fileInfo = await stat(filePath);
  assert(fileInfo.isFile());

  const ps = run({
    args: ["args_test" + (isWindows ? ".cmd" : ""), "arg2", "--flag2"],
    stdout: "piped"
  });

  if (!ps.stdout) {
    assert(!!ps.stdout, "There should have stdout.");
    return;
  }

  let thrown = false;

  try {
    const b = await readAll(ps.stdout);

    const s = new TextDecoder("utf-8").decode(b);

    const obj = JSON.parse(s);

    assertEquals(obj[0], "arg1");
    assertEquals(obj[1], "--flag1");
    assertEquals(obj[2], "arg2");
    assertEquals(obj[3], "--flag2");
  } catch (err) {
    console.error(err);
    thrown = true;
  } finally {
    await remove(filePath);
    ps.close();
  }

  assert(!thrown, "It should not throw an error");
}, true); // set true to install module in your real $HOME dir.

test(function testIsRemoteUrl(): void {
  assert(isRemoteUrl("https://deno.land/std/http/file_server.ts"));
  assert(isRemoteUrl("http://deno.land/std/http/file_server.ts"));
  assert(!isRemoteUrl("file:///dev/deno_std/http/file_server.ts"));
  assert(!isRemoteUrl("./dev/deno_std/http/file_server.ts"));
});

runIfMain(import.meta);