import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { allowedDevBackend } from './local-safety.mjs';
import { jsonRequest } from './evaluation.mjs';

// 값 자체는 반환 결과나 오류에 싣지 않고 로컬 실행에 필요한 동안만 보관한다.
export async function inspectLocalEnvironment(
  options,
  { env = process.env, clientDir, signal = new AbortController().signal } = {},
) {
  let fileValues = {};
  try {
    fileValues = parseEnv(await readFile(`${clientDir}/.env`, 'utf8'));
  } catch (error) {
    // 환경 파일의 경로·원문이 원인 예외를 통해 노출되지 않도록 의도적으로 제거한다.
    // eslint-disable-next-line preserve-caught-error
    if (error.code !== 'ENOENT') throw new Error('클라이언트 환경 파일을 확인할 수 없습니다.');
  }
  const value = (name) => (Object.hasOwn(env, name) ? env[name] : fileValues[name]);
  const mapKey = String(value('NAVER_MAP_CLIENT_ID') || '').trim();
  const backendValue = String(value('API_PROXY_TARGET') || '').trim();
  const backendOrigin = backendValue ? allowedDevBackend(backendValue) : null;
  const requirements = {
    mapKeyConfigured: Boolean(mapKey),
    backendConfigured: Boolean(backendValue),
    backendAllowed: Boolean(backendOrigin),
    modelServerAvailable: false,
    modelAvailable: null,
    modelToolSupport: null,
    modelMetadataAvailable: null,
    otherModelsLoaded: null,
  };
  let modelInfo = null;
  try {
    const timeoutSignal = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
    const tags = await jsonRequest(`${options.ollamaOrigin}/api/tags`, {}, timeoutSignal);
    requirements.modelServerAvailable = true;
    const running = await jsonRequest(`${options.ollamaOrigin}/api/ps`, {}, timeoutSignal);
    if (Array.isArray(running.models))
      requirements.otherModelsLoaded = running.models.some((item) => item.name !== options.model);
    const selected = Array.isArray(tags.models)
      ? tags.models.find((item) => item.name === options.model)
      : null;
    if (Array.isArray(tags.models)) requirements.modelAvailable = Boolean(selected);
    if (selected) {
      const info = await jsonRequest(
        `${options.ollamaOrigin}/api/show`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: options.model }),
        },
        timeoutSignal,
      );
      modelInfo = {
        digest: selected.digest,
        capabilities: info.capabilities,
        runner: info.details?.runner,
        quantization: info.details?.quantization_level,
      };
      requirements.modelToolSupport = Array.isArray(modelInfo.capabilities)
        ? modelInfo.capabilities.includes('tools')
        : null;
      requirements.modelMetadataAvailable =
        /^[a-f0-9]{64}$/i.test(modelInfo.digest || '') &&
        /^[a-z0-9_.-]{1,80}$/i.test(modelInfo.runner || '') &&
        /^[a-z0-9_.-]{1,80}$/i.test(modelInfo.quantization || '');
    }
  } catch {
    if (signal.aborted) throw signal.reason;
  }
  return { mapKey, backendOrigin, requirements, modelInfo };
}
