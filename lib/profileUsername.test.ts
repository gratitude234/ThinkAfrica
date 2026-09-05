import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RESERVED_PROFILE_PATHS,
  getProfileUsernameError,
  normalizeProfileUsername,
} from "./profileUsername";

const APP_DIR = path.join(process.cwd(), "app");

/** A route group folder, `(main)`, contributes no segment to the URL. */
const isRouteGroup = (name: string) => name.startsWith("(") && name.endsWith(")");

/** Dynamic, catch-all, parallel and private folders are not literal segments. */
const isNotALiteralSegment = (name: string) =>
  name.startsWith("[") || name.startsWith("@") || name.startsWith("_");

/**
 * Only a segment someone could actually type as a username can shadow one.
 * `getProfileUsernameError` rejects everything outside this shape, so a
 * hyphenated route like `editorial-standards` is unreachable as a name.
 */
const isUsernameShaped = (name: string) => /^[a-z0-9_]+$/.test(name);

function servesARoute(dir: string): boolean {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /^(page|route)\.(t|j)sx?$/.test(entry.name)) return true;
    if (entry.isDirectory() && servesARoute(path.join(dir, entry.name))) return true;
  }
  return false;
}

/**
 * Every literal first segment of a URL the app serves, looking through route
 * groups the way the router does.
 */
function collectTopLevelSegments(dir: string): string[] {
  const segments: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (isRouteGroup(entry.name)) {
      segments.push(...collectTopLevelSegments(full));
      continue;
    }
    if (isNotALiteralSegment(entry.name)) continue;
    if (!servesARoute(full)) continue;
    segments.push(entry.name);
  }
  return segments;
}

describe("RESERVED_PROFILE_PATHS", () => {
  it("covers every live top-level route a username could shadow", () => {
    expect(statSync(APP_DIR).isDirectory()).toBe(true);

    const shadowable = collectTopLevelSegments(APP_DIR)
      .filter(isUsernameShaped)
      .sort();

    // Guards the walk itself: if the filtering ever silently matched nothing,
    // the assertion below would pass on an empty list.
    expect(shadowable.length).toBeGreaterThan(20);

    const unreserved = shadowable.filter(
      (segment) => !RESERVED_PROFILE_PATHS.has(segment)
    );

    // A member who claims one of these keeps the name and loses their profile:
    // the static route wins and `/<name>` never reaches `[username]`.
    expect(unreserved).toEqual([]);
  });

  it("rejects a reserved name and accepts an ordinary one", () => {
    expect(getProfileUsernameError("login")).toMatch(/reserved/i);
    expect(getProfileUsernameError("ada_okafor")).toBeNull();
  });

  it("rejects names outside the permitted shape before checking the list", () => {
    expect(getProfileUsernameError("Ada Okafor")).toMatch(/lowercase/i);
    expect(getProfileUsernameError("")).toMatch(/Choose a username/i);
    expect(normalizeProfileUsername("  Ada Okafor ".trim())).toBe("adaokafor");
  });
});
