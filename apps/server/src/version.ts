import packageJson from "../package.json" with { type: "json" };

declare const __T3CODE_BUILD_VERSION__: string | undefined;

export const APP_VERSION =
  typeof __T3CODE_BUILD_VERSION__ === "string" && __T3CODE_BUILD_VERSION__.trim().length > 0
    ? __T3CODE_BUILD_VERSION__.trim()
    : packageJson.version;
