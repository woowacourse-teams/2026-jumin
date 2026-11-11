// 활성 모달의 바깥쪽은 사용자 조작이 막혀 있는데, MCP의 입력 도구는
// 가려진 요소에도 값을 넣을 수 있다. 실제로 모달인 경우에만 이를 구분한다.
export function findAppFrame(context, wrapperOrigin, appOrigin) {
  try {
    const pages = context.pages().filter((page) => {
      try {
        return new URL(page.url()).origin === wrapperOrigin;
      } catch {
        return false;
      }
    });
    if (pages.length !== 1) return null;
    const page = pages[0];
    const frames = page.frames().filter((frame) => {
      try {
        return (
          frame.parentFrame() === page.mainFrame() && new URL(frame.url()).origin === appOrigin
        );
      } catch {
        return false;
      }
    });
    return frames.length === 1 ? frames[0] : null;
  } catch {
    return null;
  }
}

export async function findBlockingModal(context, wrapperOrigin, appOrigin) {
  try {
    const frame = findAppFrame(context, wrapperOrigin, appOrigin);
    if (!frame) return null;
    return await frame.evaluate(() => {
      const root = document.querySelector('#root');
      const dialogs = [
        ...document.querySelectorAll('dialog, [role="dialog"], [role="alertdialog"]'),
      ]
        .filter((dialog) => {
          const style = getComputedStyle(dialog);
          if (
            !dialog.getClientRects().length ||
            style.visibility === 'hidden' ||
            style.display === 'none' ||
            dialog.closest('[aria-hidden="true"], [inert]')
          )
            return false;
          return (
            dialog.getAttribute('aria-modal') === 'true' ||
            dialog.matches(':modal') ||
            (root?.getAttribute('aria-hidden') === 'true' && !root.contains(dialog))
          );
        })
        .map((dialog) => ({
          role: dialog.getAttribute('role') || 'dialog',
          label: dialog.getAttribute('aria-label') || '',
        }))
        .filter(({ role, label }) => ['dialog', 'alertdialog'].includes(role) && label);
      return dialogs.length === 1 ? dialogs[0] : null;
    });
  } catch {
    // 화면 이동 중이거나 유일한 모달을 식별할 수 없으면 근거 없이 차단하지 않는다.
    return null;
  }
}

// 클릭 전후 동일한 입력란임을 유일한 참조와 접근성 이름으로 확인한다.
export function inputTargetSignature(snapshot, target) {
  if (typeof snapshot !== 'string' || typeof target !== 'string') return null;
  const lines = snapshot
    .split('\n')
    .flatMap((line) =>
      [...line.matchAll(/\[ref=([a-zA-Z0-9_-]+)\]/g)]
        .filter((match) => match[1] === target)
        .map(() => line),
    );
  if (lines.length !== 1) return null;
  const match = lines[0].match(
    /^\s*-\s*(textbox|searchbox|combobox|spinbutton)(?:\s+("(?:\\.|[^"\\])*"))?(?=\s|:|$)/,
  );
  return match ? `${match[1]}:${match[2] || ''}` : null;
}

// MCP 참조는 그대로 보존한다. 중복 참조나 모호한 계층은 판정하지 않는다.
export function modalTargetScope(snapshot, modal, target) {
  if (
    typeof snapshot !== 'string' ||
    !modal?.label ||
    !['dialog', 'alertdialog'].includes(modal.role) ||
    typeof target !== 'string' ||
    !/^[a-zA-Z0-9_-]+$/.test(target)
  )
    return 'unavailable';
  const lines = snapshot.split('\n');
  const refs = [];
  const dialogs = [];
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(/\[ref=([a-zA-Z0-9_-]+)\]/g))
      if (match[1] === target) refs.push(index);
    const match = line.match(/^\s*-\s*(dialog|alertdialog)\s+("(?:\\.|[^"\\])*")(?=\s|:|$)/);
    if (!match || match[1] !== modal.role) continue;
    try {
      if (JSON.parse(match[2]) === modal.label) dialogs.push(index);
    } catch {
      // 인용 형식이 불명확하면 차단 근거로 사용하지 않는다.
    }
  }
  if (refs.length !== 1 || dialogs.length !== 1) return 'unavailable';
  const modalIndex = dialogs[0];
  const targetIndex = refs[0];
  if (targetIndex === modalIndex) return 'inside';
  if (targetIndex < modalIndex) return 'outside';
  const indent = lines[modalIndex].match(/^\s*/)[0].length;
  for (let i = modalIndex + 1; i <= targetIndex; i++) {
    if (!/^\s*-\s/.test(lines[i])) continue;
    if (lines[i].match(/^\s*/)[0].length <= indent) return 'outside';
  }
  return 'inside';
}
