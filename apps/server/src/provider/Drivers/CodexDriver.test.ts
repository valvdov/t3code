import { expect, it } from "@effect/vitest";

import { CodexProviderMaintenance, isCodexStandaloneCommandPath } from "./CodexDriver.ts";

const INSTALL_COMMAND =
  "curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh";

it("recognizes only the standalone Codex installer path", () => {
  expect(isCodexStandaloneCommandPath("/home/valvdov/.local/bin/codex")).toBe(true);
  expect(isCodexStandaloneCommandPath("C:\\Users\\valvdov\\.local\\bin\\codex")).toBe(true);
  expect(isCodexStandaloneCommandPath("/usr/local/bin/codex")).toBe(false);
  expect(isCodexStandaloneCommandPath("/opt/homebrew/bin/codex")).toBe(false);
  expect(isCodexStandaloneCommandPath("/home/valvdov/.local/bin/codex-wrapper")).toBe(false);
});

it("uses OpenAI's non-interactive installer for standalone Codex", () => {
  expect(
    CodexProviderMaintenance.resolve({
      binaryPath: "/home/valvdov/.local/bin/codex",
      platform: "linux",
      env: { PATH: "" },
    }),
  ).toEqual({
    provider: "codex",
    packageName: "@openai/codex",
    update: {
      command: `/bin/sh -c ${INSTALL_COMMAND}`,
      executable: "/bin/sh",
      args: ["-c", INSTALL_COMMAND],
      lockKey: "codex-standalone",
    },
  });
});

it("keeps package-managed Codex installs on their existing updater", () => {
  expect(
    CodexProviderMaintenance.resolve({
      binaryPath: "/usr/lib/node_modules/@openai/codex/bin/codex",
      platform: "linux",
      env: { PATH: "" },
    }).update,
  ).toMatchObject({
    executable: "npm",
    args: ["install", "-g", "--allow-scripts=@openai/codex", "@openai/codex@latest"],
    lockKey: "npm-global",
  });

  expect(
    CodexProviderMaintenance.resolve({
      binaryPath: "/opt/homebrew/bin/codex",
      platform: "darwin",
      env: { PATH: "" },
    }).update,
  ).toMatchObject({
    executable: "brew",
    args: ["upgrade", "codex"],
    lockKey: "homebrew",
  });
});
