import { useEffect, useState } from 'react';

/**
 * 값이 null이 된 뒤에도 lingerMs 동안은 직전 값을 돌려준다.
 *
 * 닫히는 전환이 끝날 때까지 화면을 마운트해 두어야 할 때 사용한다.
 * 값이 다시 생기면 기다리지 않고 바로 새 값을 돌려준다.
 *
 * 빌드가 .ts 파일의 화살표 함수 제네릭(<T>)을 JSX로 해석하므로 함수 선언으로 둔다.
 */
export function useLingeringValue<T>(value: T | null, lingerMs: number): T | null {
  const [lastValue, setLastValue] = useState(value);

  // 값이 있는 동안에는 렌더링 중에 직전 값을 맞춰 둔다.
  if (value !== null && value !== lastValue) {
    setLastValue(value);
  }

  useEffect(() => {
    if (value !== null) return;

    const timer = window.setTimeout(() => setLastValue(null), lingerMs);
    return () => window.clearTimeout(timer);
  }, [value, lingerMs]);

  return value ?? lastValue;
}
