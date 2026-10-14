const ANONYMOUS_ID_KEY = 'guestId';

export const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getGuestId = (): string => {
  try {
    const storedId = localStorage.getItem(ANONYMOUS_ID_KEY);
    if (storedId && UUID_V4_PATTERN.test(storedId)) return storedId;

    const guestId = crypto.randomUUID();
    localStorage.setItem(ANONYMOUS_ID_KEY, guestId);

    return guestId;
  } catch (cause) {
    throw new Error('익명 ID를 저장하지 못했어요. 브라우저 저장소 사용을 허용해주세요.', {
      cause,
    });
  }
};
