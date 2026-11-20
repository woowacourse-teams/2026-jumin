// use_figma에 넘길 코드를 만든다. detect.js에 대상·기준 지문(snapshot.json)·범위를 채워 출력한다.
// 사용법: node make-call.mjs <components|screens> [--init] [--only 이름,이름]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [target, ...rest] = process.argv.slice(2);
if (!["components", "screens"].includes(target)) {
  console.error(
    "사용법: node make-call.mjs <components|screens> [--init] [--only 이름,이름]",
  );
  process.exit(1);
}
const init = rest.includes("--init");
const onlyIndex = rest.indexOf("--only");
const onlyValue = onlyIndex >= 0 ? rest[onlyIndex + 1] : undefined;
if (onlyIndex >= 0 && (!onlyValue || onlyValue.startsWith("--"))) {
  console.error(
    "--only 뒤에 이름을 적어 주세요. 예: --only Button 또는 --only Button,Chip",
  );
  process.exit(1);
}
const terms = onlyValue
  ? onlyValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

const pages = JSON.parse(readFileSync(path.join(dir, "pages.json"), "utf8"));
const snapshotPath = path.join(dir, "snapshot.json");
const snapshot = existsSync(snapshotPath)
  ? JSON.parse(readFileSync(snapshotPath, "utf8"))
  : null;
if (!init && !snapshot) {
  console.error("snapshot.json이 없습니다. 먼저 --init으로 기준을 만드세요.");
  process.exit(1);
}

// 기준에 이름이 정확히 같은 항목이 있으면 그것만 고르고("=" 접두사), 없으면 이름에 포함된 것을 고른다.
const knownNames = Object.values(
  snapshot?.[target === "components" ? "components" : "screens"] ?? {},
).map((v) => v.name.toLowerCase());
const only = terms
  ? terms.map((x) => (knownNames.includes(x.toLowerCase()) ? "=" + x : x))
  : null;
if (only)
  console.error(
    `범위: ${only.map((x) => (x.startsWith("=") ? `${x.slice(1)}(정확히 일치)` : `${x}(포함)`)).join(", ")}`,
  );

const pageName = target === "components" ? "Component" : "Screens (코드 기준)";
const page = pages.pages.find((p) => p.name === pageName);
const hashes = (group) =>
  Object.fromEntries(
    Object.entries(snapshot?.[group] ?? {}).map(([id, v]) => [
      id,
      typeof v === "string" ? v : v.hash,
    ]),
  );
const base =
  target === "components"
    ? {
        collections: snapshot?.collections ?? {},
        styles: snapshot?.styles ?? {},
        components: hashes("components"),
      }
    : { screens: hashes("screens") };

const strip = (code) =>
  code
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
const other = target === "components" ? "screens" : "components";
const source = readFileSync(
  path.join(dir, "scripts", "detect.js"),
  "utf8",
).replace(new RegExp(`// @${other}-start[\\s\\S]*?// @${other}-end\\n`), "");
const body = strip(source)
  .replace("__TARGET__", JSON.stringify(target))
  .replace("__MODE__", JSON.stringify(init ? "init" : "diff"))
  .replace("__BASE__", JSON.stringify(base))
  .replace("__ONLY__", JSON.stringify(only))
  .replace("__PAGE__", JSON.stringify(page.nodeId))
  .replace("__SECTIONS__", JSON.stringify(page.sections.map((s) => s.nodeId)));
if (/__[A-Z]+__/.test(body)) {
  console.error("채우지 못한 자리표시자가 있습니다.");
  process.exit(1);
}
process.stdout.write(body);
