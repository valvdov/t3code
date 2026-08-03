/**
 * AgySettings — re-export shim. The schema itself lives in
 * `@t3tools/contracts` (packages/contracts/src/agySettings.ts) so the web
 * settings UI can consume the same definition. Server-side modules keep
 * importing from this path.
 *
 * @module provider/Drivers/AgySettings
 */
export { AgySettings } from "@t3tools/contracts";
