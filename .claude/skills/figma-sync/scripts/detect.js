// figma-sync: Figma 안에서 실행해 지문(hash)을 계산하고, 기준(BASE)과 다른 것만 돌려준다.
// make-call.mjs가 대상이 아닌 블록(@<대상>-start ~ -end)을 빼고, 자리표시자를 채워 use_figma 코드로 출력한다.
// 지문 계산(spec)이 바뀌면 snapshot.json 전체가 변경으로 잡히므로, 바꿨다면 기준을 다시 만든다.
const TARGET = __TARGET__; // "components" | "screens"
const MODE = __MODE__; // "diff" | "init"
const BASE = __BASE__;
const ONLY = __ONLY__;
const PAGE = __PAGE__;
const SECTIONS = __SECTIONS__;

// ---------- 공용: 노드 속성 요약과 지문 ----------
const h = (s) => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return (x >>> 0).toString(36);
};
const hex = (c, a) =>
  "#" +
  [c.r, c.g, c.b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("") +
  (a !== undefined && a < 1
    ? Math.round(a * 255)
        .toString(16)
        .padStart(2, "0")
    : "");
const allVars = await figma.variables.getLocalVariablesAsync();
const vName = Object.fromEntries(allVars.map((v) => [v.id, v.name]));
const styleName = {};
for (const s of await figma.getLocalTextStylesAsync()) styleName[s.id] = s.name;
for (const s of await figma.getLocalEffectStylesAsync())
  styleName[s.id] = s.name;
const paints = (ps) =>
  Array.isArray(ps)
    ? ps
        .filter((p) => p.visible !== false)
        .map((p) =>
          p.type !== "SOLID"
            ? p.type
            : p.boundVariables && p.boundVariables.color
              ? "$" + vName[p.boundVariables.color.id]
              : hex(p.color) +
                (p.opacity < 1 ? "@" + p.opacity.toFixed(2) : ""),
        )
    : "mixed";
const bv = (n, k) =>
  n.boundVariables && n.boundVariables[k]
    ? "$" + vName[n.boundVariables[k].id]
    : undefined;
const props = (defs) =>
  Object.entries(defs).map(
    ([k, d]) =>
      k.split("#")[0] +
      ":" +
      d.type +
      ":" +
      (d.variantOptions || [d.defaultValue]).join("|"),
  );

const spec = async (n, depth, budget) => {
  if (budget.n-- <= 0) return "…";
  const s = {
    t: n.type,
    n: n.name,
    wh: [Math.round(n.width), Math.round(n.height)],
  };
  if (n.visible === false) s.hidden = 1;
  if ("layoutMode" in n && n.layoutMode !== "NONE") {
    s.al = [
      n.layoutMode[0],
      n.paddingTop,
      n.paddingRight,
      n.paddingBottom,
      n.paddingLeft,
      n.itemSpacing,
      n.primaryAxisAlignItems,
      n.counterAxisAlignItems,
    ];
    const b = ["itemSpacing", "paddingTop", "paddingLeft", "minHeight"]
      .map((k) => bv(n, k))
      .filter(Boolean);
    if (b.length) s.alv = b;
    if (n.minHeight) s.minH = n.minHeight;
  }
  if ("cornerRadius" in n) {
    const r =
      bv(n, "topLeftRadius") ||
      (typeof n.cornerRadius === "number"
        ? n.cornerRadius
        : [
            n.topLeftRadius,
            n.topRightRadius,
            n.bottomRightRadius,
            n.bottomLeftRadius,
          ]);
    if (r) s.r = r;
  }
  if ("fills" in n) {
    const f = paints(n.fills);
    if (f.length) s.f = f;
  }
  if ("strokes" in n && n.strokes.length) {
    s.s = paints(n.strokes);
    s.sw =
      typeof n.strokeWeight === "number"
        ? n.strokeWeight
        : [
            n.strokeTopWeight,
            n.strokeRightWeight,
            n.strokeBottomWeight,
            n.strokeLeftWeight,
          ];
  }
  if (
    "effectStyleId" in n &&
    typeof n.effectStyleId === "string" &&
    n.effectStyleId
  )
    s.fx = styleName[n.effectStyleId];
  else if ("effects" in n && n.effects.length)
    s.fx = n.effects.map((e) =>
      [e.type, e.offset && e.offset.x, e.offset && e.offset.y, e.radius].join(
        " ",
      ),
    );
  if ("opacity" in n && n.opacity < 1) s.o = +n.opacity.toFixed(2);
  if (n.type === "TEXT") {
    s.ts =
      typeof n.textStyleId === "string" && n.textStyleId
        ? styleName[n.textStyleId]
        : [n.fontSize, n.fontName && n.fontName.style];
    s.c = n.characters.slice(0, 60);
  }
  if (
    n.type === "COMPONENT_SET" ||
    (n.type === "COMPONENT" && n.parent.type !== "COMPONENT_SET")
  )
    s.p = props(n.componentPropertyDefinitions);
  if (n.type === "INSTANCE") {
    const m = await n.getMainComponentAsync();
    s.m = m
      ? m.parent && m.parent.type === "COMPONENT_SET"
        ? m.parent.name + "/" + m.name
        : m.name
      : null;
    s.p = Object.entries(n.componentProperties).map(
      ([k, p]) => k.split("#")[0] + "=" + p.value,
    );
    s.ov = n.overrides
      .map((o) => o.overriddenFields.slice().sort().join(","))
      .sort();
    s.c = n
      .findAll((t) => t.type === "TEXT")
      .map((t) => t.characters)
      .join("|")
      .slice(0, 120);
    return s;
  }
  if ("children" in n && depth < 8) {
    s.ch = [];
    for (const c of n.children) s.ch.push(await spec(c, depth + 1, budget));
  }
  return s;
};
const sizeOf = (o) => JSON.stringify(o).length;
// 범위(ONLY): "="로 시작하는 항목은 이름이 정확히 같은 것만, 그 밖에는 이름에 포함된 것을 고른다.
const picked = (...names) =>
  !ONLY ||
  ONLY.some((x) =>
    names.some((name) =>
      x.startsWith("=")
        ? name.toLowerCase() === x.slice(1).toLowerCase()
        : name.toLowerCase().includes(x.toLowerCase()),
    ),
  );

// @components-start  변수 컬렉션, 텍스트·효과 스타일, 컴포넌트
if (TARGET === "components") {
  const out = {
    mode: MODE,
    collections: {},
    styles: {},
    added: [],
    changed: [],
    removed: [],
    next: { collections: {}, styles: {}, components: {} },
  };

  if (!ONLY) {
    const cols = await figma.variables.getLocalVariableCollectionsAsync();
    const colName = Object.fromEntries(cols.map((c) => [c.id, c.name]));
    const byCol = {};
    for (const v of allVars) {
      const x = Object.values(v.valuesByMode)[0];
      const value =
        x && x.type === "VARIABLE_ALIAS"
          ? "→" + vName[x.id]
          : x && typeof x === "object" && "r" in x
            ? hex(x, x.a)
            : x;
      (byCol[colName[v.variableCollectionId]] =
        byCol[colName[v.variableCollectionId]] || {})[v.name] = value;
    }
    for (const [name, values] of Object.entries(byCol)) {
      const hash = h(JSON.stringify(values));
      if (MODE === "init" || BASE.collections[name] !== hash)
        out.next.collections[name] = hash;
      if (MODE === "diff" && BASE.collections[name] !== hash)
        out.collections[name] = values;
    }
    const text = (await figma.getLocalTextStylesAsync()).map((s) => [
      s.name,
      s.fontName.family,
      s.fontName.style,
      s.fontSize,
      JSON.stringify(s.lineHeight),
      JSON.stringify(s.letterSpacing),
    ]);
    const effect = (await figma.getLocalEffectStylesAsync()).map((s) => [
      s.name,
      s.effects.map((e) =>
        [
          e.type,
          e.offset && e.offset.x,
          e.offset && e.offset.y,
          e.radius,
          e.spread || 0,
          e.color && hex(e.color, e.color.a),
        ].join(" "),
      ),
    ]);
    for (const [k, data] of [
      ["text", text],
      ["effect", effect],
    ]) {
      const hash = h(JSON.stringify(data));
      if (MODE === "init" || BASE.styles[k] !== hash) out.next.styles[k] = hash;
      if (MODE === "diff" && BASE.styles[k] !== hash) out.styles[k] = data;
    }
  }

  const page = await figma.getNodeByIdAsync(PAGE);
  await figma.setCurrentPageAsync(page);
  const codeOf = (c) => {
    if (c.name.startsWith("Icon/"))
      return "src/shared/components/ui/icons/index.ts";
    const label =
      c.parent &&
      c.parent.findChild &&
      c.parent.findChild(
        (n) => n.type === "TEXT" && n.characters.startsWith("코드"),
      );
    if (label) return label.characters.replace(/^코드\s+/, "");
    const m = (c.description || "").match(/코드\s+((?:src|assets)\/[\w./@-]+)/);
    return m ? m[1] : null;
  };
  const seen = new Set();
  for (const sid of SECTIONS) {
    const sec = await figma.getNodeByIdAsync(sid);
    for (const c of sec.findAllWithCriteria({
      types: ["COMPONENT_SET", "COMPONENT"],
    })) {
      if (c.type === "COMPONENT" && c.parent.type === "COMPONENT_SET") continue;
      if (!picked(c.name)) continue;
      seen.add(c.id);
      const hash = h(JSON.stringify(await spec(c, 0, { n: 400 })));
      const base = BASE.components[c.id];
      const entry = { name: c.name, section: sec.name, code: codeOf(c), hash };
      if (MODE === "init") {
        out.next.components[c.id] = entry;
        continue;
      }
      if (base === hash) continue;
      out.next.components[c.id] = entry;
      const detail = { id: c.id, ...entry, spec: await spec(c, 0, { n: 120 }) };
      (base === undefined ? out.added : out.changed).push(detail);
    }
  }
  if (MODE === "diff" && !ONLY)
    for (const id of Object.keys(BASE.components))
      if (!seen.has(id)) out.removed.push(id);
  if (MODE === "init") return out.next;
  const size = sizeOf(out);
  if (size > 60000)
    for (const d of [...out.added, ...out.changed])
      d.spec = "too large: get_design_context로 읽기";
  return out;
}
// @components-end

// @screens-start  화면 프레임 (인스턴스 안쪽은 보지 않는다)
const page = await figma.getNodeByIdAsync(PAGE);
await figma.setCurrentPageAsync(page);
const out = {
  mode: MODE,
  added: [],
  changed: [],
  removed: [],
  next: { screens: {} },
};
const seen = new Set();
for (const sid of SECTIONS) {
  const sec = await figma.getNodeByIdAsync(sid);
  for (const f of sec.children.filter((n) => n.type === "FRAME")) {
    if (!picked(f.name, sec.name + " " + f.name)) continue;
    seen.add(f.id);
    const hash = h(JSON.stringify(await spec(f, 0, { n: 1500 })));
    const base = BASE.screens[f.id];
    const entry = { name: f.name, section: sec.name, hash };
    if (MODE === "init") {
      out.next.screens[f.id] = entry;
      continue;
    }
    if (base === hash) continue;
    out.next.screens[f.id] = entry;
    (base === undefined ? out.added : out.changed).push({
      id: f.id,
      name: f.name,
      section: sec.name,
    });
  }
}
if (MODE === "diff" && !ONLY)
  for (const id of Object.keys(BASE.screens))
    if (!seen.has(id)) out.removed.push(id);
return MODE === "init" ? out.next : out;
// @screens-end
