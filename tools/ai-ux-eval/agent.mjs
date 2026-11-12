export class EvaluationError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

// 브라우저가 살아 있고 화면을 다시 읽은 MCP 오류만 모델에 돌려준다.
export class RecoverableToolError extends Error {
  constructor(feedback) {
    super('복구 가능한 MCP 도구 오류');
    this.feedback = feedback;
  }
}

export function composeTask(scenario, persona) {
  const common = `공통 과제: ${scenario.goal}`;
  return persona?.description ? `${common}\n우선 관점: ${persona.description}` : common;
}

const schemas = {
  browser_snapshot: { type: 'object', properties: {}, additionalProperties: false },
  browser_click: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description:
          '현재 스냅샷의 [ref=...]에 표시된 참조값을 그대로 사용합니다. 대괄호와 ref=는 제외하세요.',
      },
      element: { type: 'string', description: '대상의 짧은 설명' },
    },
    required: ['target'],
    additionalProperties: false,
  },
  browser_type: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description:
          '현재 스냅샷의 입력란 [ref=...]에 표시된 참조값을 그대로 사용합니다. 대괄호와 ref=는 제외하세요.',
      },
      element: { type: 'string', description: '입력란의 짧은 설명' },
      text: { type: 'string', description: '입력할 텍스트' },
    },
    required: ['target', 'text'],
    additionalProperties: false,
  },
  browser_navigate: {
    type: 'object',
    properties: { url: { type: 'string', description: '현재 가상 화면의 로컬 URL' } },
    required: ['url'],
    additionalProperties: false,
  },
};

function toolDefinitions(available, localMode) {
  const tools = Object.entries(schemas).map(([name, parameters]) => {
    const definition = available.find((tool) => tool.name === name);
    if (!definition)
      throw new EvaluationError('environment_error', `필요한 MCP 도구가 없습니다: ${name}`);
    return {
      type: 'function',
      function: {
        name,
        description: definition.description,
        parameters:
          localMode && name === 'browser_navigate'
            ? {
                ...parameters,
                properties: { url: { type: 'string', description: '허용된 로컬 화면 주소' } },
              }
            : parameters,
      },
    };
  });
  tools.push({
    type: 'function',
    function: {
      name: 'report_completion',
      description:
        '과제를 마쳤다고 판단하거나 더 진행할 수 없을 때 본인의 판단을 보고하고 종료합니다.',
      parameters: {
        type: 'object',
        properties: { success: { type: 'boolean', description: '과제를 마쳤다고 판단하면 true' } },
        required: ['success'],
        additionalProperties: false,
      },
    },
  });
  return tools;
}

function validateCall(call, fixtureOrigin, allowedNavigation) {
  const { name, arguments: args } = call?.function || {};
  if (typeof name === 'string' && name !== 'report_completion' && !Object.hasOwn(schemas, name)) {
    throw new EvaluationError('forbidden_tool', '허용되지 않은 도구 호출입니다.');
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new EvaluationError('tool_error', '모델이 잘못된 도구 인자를 반환했습니다.');
  }
  const keys = Object.keys(args);
  if (name === 'report_completion' && keys.length === 1 && typeof args.success === 'boolean') {
    return { name, args };
  }
  if (name === 'browser_snapshot' && keys.length === 0) return { name, args };
  if (name === 'browser_navigate' && typeof args.url === 'string') {
    let url;
    try {
      url = new URL(args.url);
    } catch {
      throw new EvaluationError('tool_error', '화면 주소를 해석할 수 없습니다.');
    }
    if (url.origin !== fixtureOrigin || !allowedNavigation(url) || url.username || url.password)
      throw new EvaluationError('forbidden_access', '허용되지 않은 화면 주소입니다.');
    if (keys.length === 1) return { name, args: { url: url.href } };
  }
  if (name === 'browser_click' || name === 'browser_type') {
    const allowed = name === 'browser_type' ? ['target', 'element', 'text'] : ['target', 'element'];
    const targetOk =
      typeof args.target === 'string' && args.target.length > 0 && args.target.length <= 200;
    const elementOk =
      args.element === undefined ||
      (typeof args.element === 'string' && args.element.length <= 200);
    const textOk =
      name !== 'browser_type' || (typeof args.text === 'string' && args.text.length <= 120);
    if (keys.every((key) => allowed.includes(key)) && targetOk && elementOk && textOk)
      return { name, args };
  }
  throw new EvaluationError('tool_error', '허용되지 않거나 형식이 잘못된 도구 호출입니다.');
}

export async function runAgent({
  scenario,
  persona,
  fixtureUrl,
  initialSnapshot,
  maxActions,
  maxConsecutiveErrors = 3,
  allowedNavigation = (url) => ['/', '/results'].includes(url.pathname) && !url.search && !url.hash,
  localMode = false,
  available,
  chat,
  callTool,
  signal,
  decisions,
  onDecision = () => {},
  onToolDisposition = () => {},
  onRecovery = () => {},
  stats = { rejectedToolCalls: 0 },
}) {
  const tools = toolDefinitions(available, localMode);
  const taskReminder = localMode ? `${composeTask(scenario, persona)}\n` : '';
  const messages = [
    {
      role: 'system',
      content:
        'You control a browser using tools. Call exactly one tool per turn and use the returned screen before deciding again. Do not reply with a plan or claim that an action happened without using a tool. Use report_completion to state your own judgment when finished or unable to proceed.' +
        (localMode
          ? ' When a modal dialog blocks the screen, only elements inside that dialog can be used until it is resolved. Examine the current screen and choose your next action. If the task specifies a named destination or item, distinguish it from similarly named alternatives. Before reporting completion, verify each stated goal using the current screen.'
          : ''),
    },
    {
      role: 'user',
      content: `${composeTask(scenario, persona)}\n현재 화면 주소: ${fixtureUrl}\n현재 화면과 직전 도구 결과를 확인하고 한 번에 도구 하나만 호출하세요. 계획만 말하지 말고 도구로 행동하세요. 도구 결과를 받은 뒤 다음 행동을 결정하세요. 과제 종료 시 report_completion으로 본인의 판단을 보고하세요.\n\n현재 화면:\n${initialSnapshot}`,
    },
  ];
  let count = 0;
  let deliveredToolResults = 0;
  let consecutiveErrors = 0;
  let recoveryPending = false;
  stats.actions = 0;
  stats.recoverableErrors = 0;
  stats.recoveryAttempts = 0;
  stats.recoveredActions = 0;
  stats.consecutiveErrors = 0;
  stats.rejectedToolCalls ??= 0;
  const countAction = () => {
    count = Math.min(count + 1, maxActions);
    stats.actions = count;
  };
  const recordFailure = () => {
    consecutiveErrors += 1;
    stats.consecutiveErrors = consecutiveErrors;
  };
  let modelTurn = 0;
  let reminded = false;
  let rejectedCall = false;
  while (count < maxActions) {
    const feedback = deliveredToolResults;
    modelTurn += 1;
    const message = await chat(messages, tools, signal, modelTurn);
    if (
      !message ||
      typeof message !== 'object' ||
      (message.tool_calls != null && !Array.isArray(message.tool_calls))
    ) {
      throw new EvaluationError('model_error', '로컬 모델 응답 형식이 잘못됐습니다.');
    }
    if (!message.tool_calls || message.tool_calls.length === 0) {
      if (!reminded) {
        messages.push({ role: 'assistant', content: message.content || '' });
        messages.push({
          role: 'user',
          content: `${taskReminder}도구를 호출해 행동하거나 report_completion으로 명시적으로 종료하세요.`,
        });
        reminded = true;
        continue;
      }
      return { termination: 'model_stopped', modelClaim: null, actions: count };
    }
    if (message.tool_calls.length !== 1) {
      for (const call of message.tool_calls)
        if (call?.function?.name !== 'report_completion') countAction();
      for (const call of message.tool_calls) {
        try {
          validateCall(call, new URL(fixtureUrl).origin, allowedNavigation);
        } catch (error) {
          if (['forbidden_tool', 'forbidden_access'].includes(error?.reason)) {
            recordFailure();
            stats.rejectedToolCalls += message.tool_calls.length;
            message.tool_calls.forEach((_, callIndex) =>
              onToolDisposition({
                modelTurn,
                callIndex,
                execution: 'not_executed',
                reason: error.reason,
                durationMs: 0,
                feedback: null,
              }),
            );
            throw error;
          }
        }
      }
      recordFailure();
      stats.rejectedToolCalls += message.tool_calls.length;
      message.tool_calls.forEach((_, callIndex) =>
        onToolDisposition({
          modelTurn,
          callIndex,
          execution: 'not_executed',
          reason: 'multiple_calls',
          durationMs: 0,
          feedback:
            rejectedCall || count >= maxActions || consecutiveErrors >= maxConsecutiveErrors
              ? null
              : '아무 도구도 실행되지 않았습니다. 도구를 하나만 선택해 다시 호출하세요.',
        }),
      );
      if (consecutiveErrors >= maxConsecutiveErrors)
        throw new EvaluationError('consecutive_error_limit', '연속 도구 오류 제한에 도달했습니다.');
      if (rejectedCall) {
        throw new EvaluationError('tool_error', '모델은 한 번에 도구 하나만 호출해야 합니다.');
      }
      if (count >= maxActions) break;
      messages.push({
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.tool_calls,
      });
      for (const call of message.tool_calls) {
        messages.push({
          role: 'tool',
          tool_name: call?.function?.name || '',
          content: '아무 도구도 실행되지 않았습니다. 도구를 하나만 선택해 다시 호출하세요.',
        });
      }
      rejectedCall = true;
      continue;
    }
    let validCall;
    if (message.tool_calls[0]?.function?.name !== 'report_completion') countAction();
    try {
      validCall = validateCall(
        message.tool_calls[0],
        new URL(fixtureUrl).origin,
        allowedNavigation,
      );
    } catch (error) {
      stats.rejectedToolCalls += 1;
      recordFailure();
      onToolDisposition({
        modelTurn,
        callIndex: 0,
        execution: 'not_executed',
        reason: ['forbidden_tool', 'forbidden_access'].includes(error?.reason)
          ? error.reason
          : 'invalid_call',
        durationMs: 0,
        feedback:
          rejectedCall ||
          count >= maxActions ||
          consecutiveErrors >= maxConsecutiveErrors ||
          ['forbidden_tool', 'forbidden_access'].includes(error?.reason)
            ? null
            : '도구를 실행하지 않았습니다. 허용된 도구와 올바른 인자를 확인해 다시 호출하세요.',
      });
      if (
        !(error instanceof EvaluationError) ||
        ['forbidden_tool', 'forbidden_access'].includes(error.reason)
      )
        throw error;
      if (consecutiveErrors >= maxConsecutiveErrors)
        throw new EvaluationError('consecutive_error_limit', '연속 도구 오류 제한에 도달했습니다.');
      if (rejectedCall) throw error;
      if (count >= maxActions) break;
      messages.push({
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.tool_calls,
      });
      messages.push({
        role: 'tool',
        tool_name: message.tool_calls[0]?.function?.name || '',
        content: '도구를 실행하지 않았습니다. 허용된 도구와 올바른 인자를 확인해 다시 호출하세요.',
      });
      rejectedCall = true;
      continue;
    }
    const { name, args } = validCall;
    reminded = false;
    rejectedCall = false;
    const decision = { turn: decisions.length + 1, tool: name, previousToolResults: feedback };
    decisions.push(decision);
    onDecision(decision);
    if (name === 'report_completion') {
      onToolDisposition({
        modelTurn,
        callIndex: 0,
        execution: 'local',
        result: { success: args.success },
        durationMs: 0,
      });
      return { termination: 'model_finished', modelClaim: args.success, actions: count };
    }
    let result;
    try {
      result = await callTool(name, args, signal, modelTurn);
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof RecoverableToolError) {
        recordFailure();
        stats.recoverableErrors += 1;
        const limitReached = consecutiveErrors >= maxConsecutiveErrors;
        const canRetry = !limitReached && count < maxActions;
        if (canRetry) stats.recoveryAttempts += 1;
        onRecovery({
          modelTurn,
          name,
          status: 'feedback',
          consecutiveErrors,
          recoveryAttempts: stats.recoveryAttempts,
          feedback: canRetry ? error.feedback : null,
          delivered: canRetry,
          reason: limitReached ? 'consecutive_error_limit' : canRetry ? 'retry' : 'action_limit',
        });
        if (limitReached) {
          throw new EvaluationError(
            'consecutive_error_limit',
            '연속 도구 오류 제한에 도달했습니다.',
          );
        }
        if (!canRetry) break;
        recoveryPending = true;
        messages.push({
          role: 'assistant',
          content: message.content || '',
          tool_calls: message.tool_calls,
        });
        messages.push({ role: 'tool', tool_name: name, content: error.feedback });
        deliveredToolResults += 1;
        messages.push({
          role: 'user',
          content: `${taskReminder}도구 오류와 현재 화면을 확인하고 다음 행동을 직접 선택하세요.`,
        });
        continue;
      }
      recordFailure();
      if (error instanceof EvaluationError) throw error;
      throw new EvaluationError('tool_error', `MCP 도구 실행 실패: ${name}`);
    }
    if (recoveryPending) {
      stats.recoveredActions += 1;
      onRecovery({
        modelTurn,
        name,
        status: 'action_succeeded',
        recoveredActions: stats.recoveredActions,
      });
    }
    recoveryPending = false;
    consecutiveErrors = 0;
    stats.consecutiveErrors = 0;
    deliveredToolResults += 1;
    messages.push({
      role: 'assistant',
      content: message.content || '',
      tool_calls: message.tool_calls,
    });
    messages.push({ role: 'tool', tool_name: name, content: result });
    messages.push({
      role: 'user',
      content: `${taskReminder}방금 도구 결과를 확인하고 필요한 다음 도구 하나를 호출하세요. 목표를 마쳤거나 진행할 수 없다면 report_completion으로 본인의 판단을 보고하세요.`,
    });
  }
  return { termination: 'action_limit', modelClaim: null, actions: count };
}
