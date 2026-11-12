// 이전 화면 본문은 전송하지 않고 현재 화면과 마지막 도구 응답, 범주형 행동 이력만 전달한다.
export function compactLocalMessages(messages, currentSnapshot, actionEvents, decisions) {
  if (!Array.isArray(messages) || messages.length < 2 || typeof currentSnapshot !== 'string')
    return messages;
  const system = messages[0];
  const initial = messages[1];
  if (system?.role !== 'system' || initial?.role !== 'user' || typeof initial.content !== 'string')
    return messages;
  const marker = '\n\n현재 화면:\n';
  const index = initial.content.indexOf(marker);
  if (index < 0) return messages;
  const history = (Array.isArray(decisions) ? decisions : []).map((entry) => ({
    tool: entry.tool,
  }));
  const actions = (Array.isArray(actionEvents) ? actionEvents : []).map((entry) => ({
    tool: entry.tool,
    target: entry.target,
    outcome: entry.outcome,
  }));
  const latestContainsScreen = messages.some(
    (item) =>
      item.role === 'tool' &&
      item === messages.findLast((x) => x.role === 'tool') &&
      typeof item.content === 'string' &&
      currentSnapshot &&
      item.content.includes(currentSnapshot),
  );
  const request = [
    { role: 'system', content: system.content },
    {
      role: 'user',
      content: `${initial.content.slice(0, index)}\n\n이전 도구 선택: ${JSON.stringify(history)}\n이전 행동 범주: ${JSON.stringify(actions)}${latestContainsScreen ? '' : `\n\n현재 화면:\n${currentSnapshot}`}`,
    },
  ];
  let lastTool = -1;
  for (let i = messages.length - 1; i >= 2; i--)
    if (messages[i]?.role === 'tool') {
      lastTool = i;
      break;
    }
  if (lastTool >= 0) {
    let assistant = lastTool - 1;
    while (assistant >= 2 && messages[assistant]?.role === 'tool') assistant--;
    if (
      messages[assistant]?.role === 'assistant' &&
      Array.isArray(messages[assistant].tool_calls)
    ) {
      request.push({ ...messages[assistant], content: '' });
      for (let i = assistant + 1; i <= lastTool; i++)
        if (messages[i]?.role === 'tool') {
          request.push({ ...messages[i] });
        }
    }
  }
  const tail = messages.at(-1);
  if (tail?.role === 'user' && tail !== initial && typeof tail.content === 'string')
    request.push({ role: 'user', content: tail.content });
  return request;
}
