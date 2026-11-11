// 접근성 스냅샷은 메모리에서만 분석하고 고정된 범주만 반환한다.
export function summarizeInitialScreen(snapshot) {
  if (typeof snapshot !== 'string' || !snapshot.trim()) return null;
  const lines = snapshot.split('\n');
  const frames = lines.flatMap((line, index) =>
    /^\s*-\s*iframe "서비스 이용 경험 설문지"/.test(line) ? [{ line, index }] : [],
  );
  let surveyFrameContent = 'unavailable';
  if (frames.length === 1) {
    const indent = frames[0].line.match(/^\s*/)[0].length;
    surveyFrameContent = 'not_observed';
    for (const line of lines.slice(frames[0].index + 1)) {
      if (!/^\s*-\s/.test(line)) continue;
      if (line.match(/^\s*/)[0].length <= indent) break;
      if (/^\s*-\s*(?:button|textbox|link|heading|paragraph|generic|checkbox|radio)\b/.test(line)) {
        surveyFrameContent = 'observed';
        break;
      }
    }
  }
  return {
    surveyModal: /^\s*-\s*dialog "서비스 이용 경험 설문"/m.test(snapshot),
    surveyClose: /^\s*-\s*button "서비스 이용 경험 설문 닫기"[^\n]*\[ref=[a-zA-Z0-9_-]+\]/m.test(
      snapshot,
    ),
    surveyFrame: /^\s*-\s*iframe "서비스 이용 경험 설문지"/m.test(snapshot),
    surveyFrameContent,
    refCount: [...snapshot.matchAll(/\[ref=[a-zA-Z0-9_-]+\]/g)].length,
    firstRequestContainsSnapshot: null,
    firstPromptTokens: null,
  };
}

export function summarizeActionReference(snapshot, target) {
  const unknown = { reference: 'unavailable', location: 'unavailable', state: 'unavailable' };
  if (
    typeof snapshot !== 'string' ||
    typeof target !== 'string' ||
    !/^[a-zA-Z0-9_-]+$/.test(target)
  )
    return unknown;
  const lines = snapshot.split('\n');
  const found = lines.flatMap((line, i) =>
    [...line.matchAll(/\[ref=([a-zA-Z0-9_-]+)\]/g)]
      .filter((m) => m[1] === target)
      .map(() => ({ line, i })),
  );
  if (found.length !== 1)
    return { ...unknown, reference: found.length ? 'ambiguous' : 'not_found' };
  const { line, i } = found[0];
  const state = /\[disabled\]/.test(line)
    ? 'disabled'
    : /\[readonly\]/.test(line)
      ? 'readonly'
      : 'not_marked_disabled';
  const modal = lines
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => /^\s*-\s*dialog "서비스 이용 경험 설문"/.test(value));
  let location = 'unavailable';
  if (modal.length === 1) {
    const { value, index } = modal[0];
    const indent = value.match(/^\s*/)[0].length;
    const ownIndent = line.match(/^\s*/)[0].length;
    let inside = i > index && ownIndent > indent;
    for (let n = index + 1; inside && n < i; n++) {
      if (/^\s*-\s/.test(lines[n]) && lines[n].match(/^\s*/)[0].length <= indent) inside = false;
    }
    location = inside ? 'inside_survey_modal' : 'outside_survey_modal';
  }
  return { reference: 'unique', location, state };
}
