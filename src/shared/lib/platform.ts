/** The desktop OS the app runs on: window controls and the name of the password store differ. */
export type Os = "windows" | "macos" | "linux";

function detect(): Os {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  if (/Windows/i.test(ua)) return "windows";
  return "linux";
}

export const os: Os = detect();
