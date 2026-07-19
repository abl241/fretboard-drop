import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

const xcodeApp = "/Applications/Xcode.app";

if (!existsSync(xcodeApp)) {
  console.error(`
Xcode is not installed.

iOS simulators and App Store builds require the full Xcode app from the Mac App Store:
  https://apps.apple.com/app/xcode/id497799835

Command Line Tools alone are not enough.

After installing Xcode:
  1. Open Xcode once and accept the license
  2. Xcode → Settings → Platforms → install iOS (if prompted)
  3. Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  4. Run: pnpm run ios:open
`);
  process.exit(1);
}

try {
  const developerDir = execSync("xcode-select -p", { encoding: "utf8" }).trim();
  if (!developerDir.includes("Xcode.app")) {
    console.error(`
Xcode is installed but your Mac is still using Command Line Tools.

Run this once, then try again:
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
`);
    process.exit(1);
  }
} catch {
  console.error("Could not read active developer directory (xcode-select).");
  process.exit(1);
}
