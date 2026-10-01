import { jest } from '@jest/globals';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderWithProviders } from '../../../__tests__/renderWithProviders';
import { server } from '../../../__tests__/msw/server';
import { AdminPage } from './AdminPage';

const SESSION_KEY = 'jumin-admin-session-v1';
const ACCESS_TOKEN = 'admin-integration-test-token';
const CSV_CONTENT = 'parking_lots.name\n테스트 주차장\n';
const FILE_SHA256 = 'a'.repeat(64);

const loginResponse = {
  accessToken: ACCESS_TOKEN,
  tokenType: 'Bearer',
  expiresInSeconds: 1800,
};

const importResponse = {
  fileName: 'parking.CSV',
  fileSha256: FILE_SHA256,
  csvRowCount: 51,
  summary: {
    addedCount: 11,
    updatedCount: 12,
    reactivatedCount: 13,
    deactivatedCount: 14,
    unchangedCount: 15,
  },
};

const reviewsResponse = {
  reviews: [
    {
      reviewId: 32,
      parkingLotId: 204,
      parkingLotName: '공영 주차장',
      parkingLotAddress: '서울시 강남구 테헤란로 10',
      detail: '주차 요금이 변경되었습니다.\n확인해 주세요.',
      createdAt: '2026-10-01T00:02:03.123456',
    },
    {
      reviewId: 31,
      parkingLotId: 102,
      parkingLotName: '공영 주차장',
      parkingLotAddress: '서울시 송파구 올림픽로 20',
      detail: '운영 시간이 변경되었습니다.',
      createdAt: '2026-09-30T23:59:58',
    },
  ],
};

const storeSession = (expiresAt = Date.now() + 30 * 60 * 1000) => {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: ACCESS_TOKEN, expiresAt }));
};

const renderAuthenticatedPage = () => {
  storeSession();
  return renderWithProviders(<AdminPage />);
};

const createCsvFile = (name = 'parking.CSV') => new File([CSV_CONTENT], name, { type: 'text/csv' });

const selectCsv = async (file = createCsvFile()) => {
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(screen.getByLabelText('CSV 파일'), file);
  return user;
};

const createPendingRequest = () => {
  let resolveRequest!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveRequest = resolve;
  });

  return { promise, resolveRequest };
};

describe('관리자 로그인', () => {
  it('관리자 ID만 공백을 제거해 전송하고 같은 탭에서 새로 열면 세션을 복원한다', async () => {
    // given
    let submittedBody: unknown;
    server.use(
      http.post('/api/admin/auth/login', async ({ request }) => {
        submittedBody = await request.json();
        return HttpResponse.json(loginResponse);
      }),
    );
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<AdminPage />);
    const beforeLogin = Date.now();

    // when
    await user.type(screen.getByLabelText('관리자 ID'), '  admin  ');
    await user.type(screen.getByLabelText('비밀번호'), ' password with spaces ');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    // then
    expect(await screen.findByRole('heading', { name: '주차장 CSV 동기화' })).toBeInTheDocument();
    expect(submittedBody).toEqual({
      loginId: 'admin',
      password: ' password with spaces ',
    });
    const storedSession = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as {
      accessToken: string;
      expiresAt: number;
    };
    expect(storedSession.accessToken).toBe(ACCESS_TOKEN);
    expect(storedSession.expiresAt).toBeGreaterThanOrEqual(beforeLogin + 1800 * 1000);
    expect(storedSession.expiresAt).toBeLessThanOrEqual(Date.now() + 1800 * 1000);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();

    // when
    unmount();
    renderWithProviders(<AdminPage />);

    // then
    expect(screen.getByRole('heading', { name: '주차장 CSV 동기화' })).toBeInTheDocument();
    expect(screen.queryByLabelText('비밀번호')).not.toBeInTheDocument();
  });

  it.each<[string, string]>([
    ['잘못된 JSON', '{broken'],
    ['만료된 세션', JSON.stringify({ accessToken: ACCESS_TOKEN, expiresAt: 1 })],
    ['빈 토큰', JSON.stringify({ accessToken: '', expiresAt: Date.now() + 60_000 })],
    ['잘못된 만료 시각', JSON.stringify({ accessToken: ACCESS_TOKEN, expiresAt: 'tomorrow' })],
  ])('%s은 삭제하고 로그인 화면을 보여준다', (_label, storedValue) => {
    // given
    sessionStorage.setItem(SESSION_KEY, storedValue);

    // when
    renderWithProviders(<AdminPage />);

    // then
    expect(screen.getByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('로그인 실패 메시지를 보여주고 다시 로그인할 수 있다', async () => {
    // given
    server.use(
      http.post('/api/admin/auth/login', () =>
        HttpResponse.json({ message: '관리자 인증에 실패했습니다.' }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    // when
    await user.type(screen.getByLabelText('관리자 ID'), 'admin');
    await user.type(screen.getByLabelText('비밀번호'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    // then
    expect(await screen.findByRole('alert')).toHaveTextContent('관리자 인증에 실패했습니다.');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: '로그인' })).toBeEnabled();

    // given
    server.use(http.post('/api/admin/auth/login', () => HttpResponse.json(loginResponse)));

    // when
    await user.type(screen.getByLabelText('비밀번호'), 'correct-password');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    // then
    expect(await screen.findByRole('heading', { name: '주차장 CSV 동기화' })).toBeInTheDocument();
  });

  it('잘못된 로그인 성공 응답은 세션으로 저장하지 않고 오류를 한 번 안내한다', async () => {
    // given
    let requests = 0;
    server.use(
      http.post('/api/admin/auth/login', () => {
        requests += 1;
        return HttpResponse.json({ accessToken: 'invalid-response-token' });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);

    // when
    await user.type(screen.getByLabelText('관리자 ID'), 'admin');
    await user.type(screen.getByLabelText('비밀번호'), 'password');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    // then
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(requests).toBe(1);
  });

  it('로그인 처리 중에는 입력과 중복 전송을 막는다', async () => {
    // given
    const pending = createPendingRequest();
    let requests = 0;
    server.use(
      http.post('/api/admin/auth/login', async () => {
        requests += 1;
        await pending.promise;
        return HttpResponse.json(loginResponse);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />);
    await user.type(screen.getByLabelText('관리자 ID'), 'admin');
    await user.type(screen.getByLabelText('비밀번호'), 'password');

    // when
    try {
      await user.dblClick(screen.getByRole('button', { name: '로그인' }));
      await waitFor(() => expect(requests).toBe(1));

      // then
      expect(screen.getByLabelText('관리자 ID')).toBeDisabled();
      expect(screen.getByLabelText('비밀번호')).toBeDisabled();
      expect(screen.getByRole('button', { name: '로그인 중…' })).toBeDisabled();
    } finally {
      pending.resolveRequest();
    }
    expect(await screen.findByRole('heading', { name: '주차장 CSV 동기화' })).toBeInTheDocument();
    expect(requests).toBe(1);
  });

  it('로그아웃하면 저장된 세션을 제거하고 로그인 화면으로 돌아간다', async () => {
    // given
    renderAuthenticatedPage();
    const user = userEvent.setup();

    // when
    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    // then
    expect(screen.getByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.getByLabelText('비밀번호')).toHaveValue('');
  });
});

describe('관리자 주차장 CSV 동기화', () => {
  it('화면에서 세션이 만료되면 서버 요청 전에 로그인 화면으로 돌아간다', async () => {
    // given
    let requests = 0;
    server.use(
      http.post('/api/admin/parking/csv/import', () => {
        requests += 1;
        return HttpResponse.json(importResponse);
      }),
    );
    const expiresAt = Date.now() + 60_000;
    storeSession(expiresAt);
    renderWithProviders(<AdminPage />);
    const user = await selectCsv();
    const now = jest.spyOn(Date, 'now').mockReturnValue(expiresAt);

    try {
      // when
      await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));

      // then
      expect(screen.getByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
      expect(requests).toBe(0);
    } finally {
      now.mockRestore();
    }
  });

  it('대문자 CSV 확장자도 허용하고 Bearer와 multipart 파일을 전송해 결과를 보여준다', async () => {
    // given
    let authorization: string | null = null;
    let contentType: string | null = null;
    let submittedFile: FormDataEntryValue | null = null;
    server.use(
      http.post('/api/admin/parking/csv/import', async ({ request }) => {
        authorization = request.headers.get('Authorization');
        contentType = request.headers.get('Content-Type');
        const formData = await request.formData();
        submittedFile = formData.get('file');
        return HttpResponse.json(importResponse);
      }),
    );
    renderAuthenticatedPage();
    const user = await selectCsv();

    // when
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));

    // then
    expect(await screen.findByText(FILE_SHA256)).toBeInTheDocument();
    expect(authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(contentType).toMatch(/^multipart\/form-data;\s*boundary=/);
    expect(submittedFile).toMatchObject({ name: 'parking.CSV', type: 'text/csv' });
    expect(await (submittedFile as unknown as File).text()).toBe(CSV_CONTENT);
    for (const label of ['추가', '수정', '재활성화', '비활성화', '변경 없음']) {
      expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
    }
    for (const count of ['11', '12', '13', '14', '15', '51']) {
      expect(screen.getByText(count, { exact: true })).toBeInTheDocument();
    }
    for (const label of ['파일명', 'SHA-256', 'CSV 행 수']) {
      expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
    }
  });

  it.each<[string, () => File]>([
    ['CSV가 아닌 파일', () => new File(['data'], 'parking.txt', { type: 'text/plain' })],
    ['빈 파일', () => new File([], 'parking.csv', { type: 'text/csv' })],
    [
      '10MiB를 초과하는 파일',
      () => new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'parking.csv', { type: 'text/csv' }),
    ],
  ])('%s은 서버 요청 없이 안내한다', async (_label, createFile) => {
    // given
    let requests = 0;
    server.use(
      http.post('/api/admin/parking/csv/import', () => {
        requests += 1;
        return HttpResponse.json(importResponse);
      }),
    );
    renderAuthenticatedPage();

    // when
    const user = await selectCsv(createFile());
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));

    // then
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(requests).toBe(0);
  });

  it('정확히 10MiB인 파일은 동기화 요청을 허용한다', async () => {
    // given
    let requests = 0;
    let submittedSize: number | undefined;
    server.use(
      http.post('/api/admin/parking/csv/import', async ({ request }) => {
        requests += 1;
        const formData = await request.formData();
        const uploadedFile = formData.get('file');
        if (uploadedFile && typeof uploadedFile !== 'string') {
          submittedSize = uploadedFile.size;
        }
        return HttpResponse.json(importResponse);
      }),
    );
    const maximumSize = 10 * 1024 * 1024;
    const file = new File([new Uint8Array(maximumSize)], 'parking.csv', { type: 'text/csv' });
    renderAuthenticatedPage();
    const user = await selectCsv(file);

    // when
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));

    // then
    expect(await screen.findByText(FILE_SHA256)).toBeInTheDocument();
    expect(submittedSize).toBe(maximumSize);
    expect(requests).toBe(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('파일을 다시 선택하면 이전 결과와 오류를 지운다', async () => {
    // given
    server.use(http.post('/api/admin/parking/csv/import', () => HttpResponse.json(importResponse)));
    renderAuthenticatedPage();
    const user = await selectCsv();
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));
    await screen.findByText(FILE_SHA256);

    // when
    await user.upload(screen.getByLabelText('CSV 파일'), createCsvFile('new-parking.csv'));

    // then
    expect(screen.queryByText(FILE_SHA256)).not.toBeInTheDocument();

    // given
    server.use(
      http.post('/api/admin/parking/csv/import', () =>
        HttpResponse.json({ message: '이미 동기화 중입니다.' }, { status: 409 }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));
    await screen.findByRole('alert');

    // when
    await user.upload(screen.getByLabelText('CSV 파일'), createCsvFile('fixed-parking.csv'));

    // then
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(FILE_SHA256)).not.toBeInTheDocument();
  });

  it('인증 만료 응답이면 세션을 지우고 로그인 화면으로 돌아간다', async () => {
    // given
    server.use(
      http.post('/api/admin/parking/csv/import', () =>
        HttpResponse.json({ message: '관리자 인증이 필요합니다.' }, { status: 401 }),
      ),
    );
    renderAuthenticatedPage();
    const user = await selectCsv();

    // when
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));

    // then
    expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('관리자 인증이 필요합니다.');
  });

  it('CSV 검증 오류는 서버 메시지와 필드별 오류를 보여준다', async () => {
    // given
    server.use(
      http.post('/api/admin/parking/csv/import', () =>
        HttpResponse.json(
          {
            message: 'CSV 데이터를 확인해주세요.',
            errors: [
              { field: 'headers.parking_lots.name', message: '필수 헤더가 없습니다.' },
              { field: 'rows[2].parking_lots.latitude', message: '유효한 좌표여야 합니다.' },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    renderAuthenticatedPage();
    const user = await selectCsv();

    // when
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));

    // then
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('CSV 데이터를 확인해주세요.');
    expect(alert).toHaveTextContent('headers.parking_lots.name');
    expect(alert).toHaveTextContent('필수 헤더가 없습니다.');
    expect(alert).toHaveTextContent('rows[2].parking_lots.latitude');
    expect(alert).toHaveTextContent('유효한 좌표여야 합니다.');
  });

  it.each<[number, string]>([
    [409, '다른 CSV를 동기화하고 있습니다.'],
    [413, 'CSV 파일 크기가 허용 범위를 초과했습니다.'],
    [415, '지원하지 않는 CSV 파일 형식입니다.'],
  ])('%i 응답의 안내를 보존하고 자동으로 재전송하지 않는다', async (status, message) => {
    // given
    let requests = 0;
    server.use(
      http.post('/api/admin/parking/csv/import', () => {
        requests += 1;
        return HttpResponse.json({ message }, { status });
      }),
    );
    renderAuthenticatedPage();
    const user = await selectCsv();

    // when
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));

    // then
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'CSV 동기화' })).toBeEnabled();
    expect(requests).toBe(1);
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it.each<[string, () => Response]>([
    ['HTML 프록시 오류', () => HttpResponse.html('<h1>Bad Gateway</h1>', { status: 502 })],
    ['네트워크 오류', () => HttpResponse.error()],
    ['잘못된 성공 응답', () => HttpResponse.json({ fileName: 'parking.CSV' })],
  ])('%s은 결과로 표시하지 않고 직접 재시도할 수 있다', async (_label, createResponse) => {
    // given
    let requests = 0;
    server.use(
      http.post('/api/admin/parking/csv/import', () => {
        requests += 1;
        return createResponse();
      }),
    );
    renderAuthenticatedPage();
    const user = await selectCsv();

    // when
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));

    // then
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(FILE_SHA256)).not.toBeInTheDocument();
    expect(requests).toBe(1);
    expect(screen.getByRole('button', { name: 'CSV 동기화' })).toBeEnabled();

    // given
    server.use(
      http.post('/api/admin/parking/csv/import', () => {
        requests += 1;
        return HttpResponse.json(importResponse);
      }),
    );

    // when
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));

    // then
    expect(await screen.findByText(FILE_SHA256)).toBeInTheDocument();
    expect(requests).toBe(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('동기화 중에는 파일 변경, 로그아웃과 중복 전송을 막는다', async () => {
    // given
    const pending = createPendingRequest();
    let requests = 0;
    server.use(
      http.post('/api/admin/parking/csv/import', async () => {
        requests += 1;
        await pending.promise;
        return HttpResponse.json(importResponse);
      }),
    );
    renderAuthenticatedPage();
    const user = await selectCsv();

    // when
    try {
      await user.dblClick(screen.getByRole('button', { name: 'CSV 동기화' }));
      await waitFor(() => expect(requests).toBe(1));

      // then
      expect(screen.getByLabelText('CSV 파일')).toBeDisabled();
      expect(screen.getByRole('button', { name: '로그아웃' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '동기화 중…' })).toBeDisabled();
    } finally {
      pending.resolveRequest();
    }
    expect(await screen.findByText(FILE_SHA256)).toBeInTheDocument();
    expect(requests).toBe(1);
  });
});

describe('관리자 주차장 제보 목록', () => {
  it('CSV 탭으로 시작하고 제보 탭 첫 진입에만 조회하며 새로 열면 CSV 탭으로 돌아간다', async () => {
    // given
    let requests = 0;
    server.use(
      http.get('/api/admin/parking/review', () => {
        requests += 1;
        return HttpResponse.json(reviewsResponse);
      }),
    );
    const { unmount } = renderAuthenticatedPage();
    const user = userEvent.setup();

    // then
    expect(screen.getByRole('tab', { name: 'CSV 동기화', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'CSV 동기화' })).toBeVisible();
    expect(requests).toBe(0);

    // when
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));
    await screen.findByRole('article', { name: '제보 32' });
    await user.click(screen.getByRole('tab', { name: 'CSV 동기화' }));
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));

    // then
    expect(screen.getByRole('tabpanel', { name: '제보 목록' })).toBeVisible();
    expect(screen.getByRole('article', { name: '제보 32' })).toBeInTheDocument();
    expect(requests).toBe(1);

    // when
    unmount();
    renderWithProviders(<AdminPage />);

    // then
    expect(screen.getByRole('tab', { name: 'CSV 동기화', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(requests).toBe(1);
  });

  it('Bearer 인증으로 조회하고 같은 이름의 주차장도 ID와 서버 순서대로 구분해서 표시한다', async () => {
    // given
    let authorization: string | null = null;
    server.use(
      http.get('/api/admin/parking/review', ({ request }) => {
        authorization = request.headers.get('Authorization');
        return HttpResponse.json(reviewsResponse);
      }),
    );
    renderAuthenticatedPage();
    const user = userEvent.setup();

    // when
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));
    const first = await screen.findByRole('article', { name: '제보 32' });
    const second = screen.getByRole('article', { name: '제보 31' });

    // then
    expect(authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(screen.getByRole('heading', { name: '주차장 제보 목록' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toEqual([first, second]);
    expect(within(first).getByText('공영 주차장')).toBeInTheDocument();
    expect(first).toHaveTextContent('주차장 ID 204');
    expect(first).toHaveTextContent('제보 ID 32');
    expect(first).toHaveTextContent('서울시 강남구 테헤란로 10');
    expect(first).toHaveTextContent('2026.10.01 00:02:03');
    expect(first).toHaveTextContent('주차 요금이 변경되었습니다. 확인해 주세요.');
    expect(second).toHaveTextContent('주차장 ID 102');
    expect(second).toHaveTextContent('제보 ID 31');
    expect(second).toHaveTextContent('서울시 송파구 올림픽로 20');
    expect(second).toHaveTextContent('2026.09.30 23:59:58');
    expect(screen.getByRole('tabpanel', { name: '제보 목록' })).toHaveTextContent(/2\s*건/);
  });

  it('주소와 내용이 null이거나 공백이면 안내하고 500자의 원문과 줄바꿈을 보존한다', async () => {
    // given
    const detail = `${'가'.repeat(249)}\n${'나'.repeat(250)}`;
    server.use(
      http.get('/api/admin/parking/review', () =>
        HttpResponse.json({
          reviews: [
            { ...reviewsResponse.reviews[0], parkingLotAddress: null, detail: null },
            { ...reviewsResponse.reviews[1], parkingLotAddress: '  \n ', detail: ' \n\t ' },
            { ...reviewsResponse.reviews[1], reviewId: 30, detail },
          ],
        }),
      ),
    );
    renderAuthenticatedPage();
    const user = userEvent.setup();

    // when
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));
    await screen.findByRole('article', { name: '제보 30' });

    // then
    expect(screen.getAllByText('주소 정보 없음')).toHaveLength(2);
    expect(screen.getAllByText('제보 내용 없음')).toHaveLength(2);
    const content = within(screen.getByRole('article', { name: '제보 30' })).getByText(detail, {
      normalizer: (value) => value,
    });
    expect(content.textContent).toBe(detail);
    expect(content.textContent).toHaveLength(500);
  });

  it('빈 목록도 유지하고 새로고침을 눌렀을 때 새 제보와 전체 건수를 갱신한다', async () => {
    // given
    let requests = 0;
    server.use(
      http.get('/api/admin/parking/review', () => {
        requests += 1;
        if (requests === 1) return HttpResponse.json({ reviews: [] });
        return HttpResponse.json(reviewsResponse);
      }),
    );
    renderAuthenticatedPage();
    const user = userEvent.setup();

    // when
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));

    // then
    expect(await screen.findByText('접수된 제보가 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: '제보 목록' })).toHaveTextContent(/0\s*건/);

    // when
    await user.click(screen.getByRole('tab', { name: 'CSV 동기화' }));
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));

    // then
    expect(screen.getByText('접수된 제보가 없습니다.')).toBeInTheDocument();
    expect(requests).toBe(1);

    // when
    await user.click(screen.getByRole('button', { name: '새로고침' }));

    // then
    expect(await screen.findByRole('article', { name: '제보 32' })).toBeInTheDocument();
    expect(screen.queryByText('접수된 제보가 없습니다.')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: '제보 목록' })).toHaveTextContent(/2\s*건/);
    expect(requests).toBe(2);
  });

  it('최초 조회와 새로고침 중 상태를 안내하고 연속 요청은 한 번만 보낸다', async () => {
    // given
    const initial = createPendingRequest();
    const refresh = createPendingRequest();
    let requests = 0;
    server.use(
      http.get('/api/admin/parking/review', async () => {
        requests += 1;
        await (requests === 1 ? initial.promise : refresh.promise);
        return HttpResponse.json(reviewsResponse);
      }),
    );
    renderAuthenticatedPage();
    const user = userEvent.setup();

    try {
      // when
      await user.dblClick(screen.getByRole('tab', { name: '제보 목록' }));
      await waitFor(() => expect(requests).toBe(1));

      // then
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '로그아웃' })).toBeEnabled();
      expect(screen.queryByText('접수된 제보가 없습니다.')).not.toBeInTheDocument();

      // when
      initial.resolveRequest();
      await screen.findByRole('article', { name: '제보 32' });
      await user.dblClick(screen.getByRole('button', { name: '새로고침' }));
      await waitFor(() => expect(requests).toBe(2));

      // then
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByRole('article', { name: '제보 32' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '로그아웃' })).toBeEnabled();
    } finally {
      initial.resolveRequest();
      refresh.resolveRequest();
    }
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(requests).toBe(2);
  });

  it('첫 조회 실패 시 서버 오류를 표시하고 직접 재시도한다', async () => {
    // given
    let requests = 0;
    server.use(
      http.get('/api/admin/parking/review', () => {
        requests += 1;
        if (requests === 1) {
          return HttpResponse.json(
            { message: '제보 목록을 조회할 권한이 없습니다.' },
            { status: 403 },
          );
        }
        return HttpResponse.json(reviewsResponse);
      }),
    );
    renderAuthenticatedPage();
    const user = userEvent.setup();

    // when
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));

    // then
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('제보 목록을 조회할 권한이 없습니다.');
    expect(screen.queryByText('접수된 제보가 없습니다.')).not.toBeInTheDocument();
    expect(requests).toBe(1);

    // when
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    // then
    expect(await screen.findByRole('article', { name: '제보 32' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requests).toBe(2);
  });

  it.each<[string, () => Response]>([
    ['HTML 프록시 오류', () => HttpResponse.html('<h1>Bad Gateway</h1>', { status: 502 })],
    ['네트워크 오류', () => HttpResponse.error()],
    ['잘못된 성공 응답', () => HttpResponse.json({ reviews: [{ reviewId: 32 }] })],
  ])('%s이면 조회 오류를 한 번 안내하고 자동 재시도하지 않는다', async (_label, createResponse) => {
    // given
    let requests = 0;
    server.use(
      http.get('/api/admin/parking/review', () => {
        requests += 1;
        return createResponse();
      }),
    );
    renderAuthenticatedPage();
    const user = userEvent.setup();

    // when
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));

    // then
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText('접수된 제보가 없습니다.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled();
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
    expect(requests).toBe(1);
  });

  it('새로고침 실패 시 기존 목록을 보존하고 재시도 성공 후 안내를 지운다', async () => {
    // given
    let requests = 0;
    server.use(
      http.get('/api/admin/parking/review', () => {
        requests += 1;
        if (requests === 2) {
          return HttpResponse.json({ message: '제보를 불러올 수 없습니다.' }, { status: 503 });
        }
        if (requests === 3) return HttpResponse.json({ reviews: [reviewsResponse.reviews[1]] });
        return HttpResponse.json(reviewsResponse);
      }),
    );
    renderAuthenticatedPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));
    await screen.findByRole('article', { name: '제보 32' });

    // when
    await user.click(screen.getByRole('button', { name: '새로고침' }));

    // then
    expect(await screen.findByRole('alert')).toHaveTextContent('제보를 불러올 수 없습니다.');
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(requests).toBe(2);

    // when
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    // then
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(screen.getByRole('article', { name: '제보 31' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requests).toBe(3);
  });

  it.each(['첫 진입', '새로고침', '저장된 목록 재진입'])(
    '%s 전에 세션이 만료되면 조회하지 않고 로그아웃한다',
    async (action) => {
      // given
      let requests = 0;
      server.use(
        http.get('/api/admin/parking/review', () => {
          requests += 1;
          return HttpResponse.json(reviewsResponse);
        }),
      );
      const expiresAt = Date.now() + 60_000;
      storeSession(expiresAt);
      renderWithProviders(<AdminPage />);
      const user = userEvent.setup();
      if (action !== '첫 진입') {
        await user.click(screen.getByRole('tab', { name: '제보 목록' }));
        await screen.findByRole('article', { name: '제보 32' });
      }
      if (action === '저장된 목록 재진입') {
        await user.click(screen.getByRole('tab', { name: 'CSV 동기화' }));
      }
      const now = jest.spyOn(Date, 'now').mockReturnValue(expiresAt);

      try {
        // when
        if (action === '새로고침') {
          await user.click(screen.getByRole('button', { name: '새로고침' }));
        } else {
          await user.click(screen.getByRole('tab', { name: '제보 목록' }));
        }

        // then
        expect(screen.getByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
        expect(screen.queryByRole('article')).not.toBeInTheDocument();
        expect(requests).toBe(action === '첫 진입' ? 0 : 1);
      } finally {
        now.mockRestore();
      }
    },
  );

  it('조회 401 응답은 CSV와 목록 상태까지 지우고 다시 로그인하면 새로 조회한다', async () => {
    // given
    let requests = 0;
    server.use(
      http.post('/api/admin/auth/login', () => HttpResponse.json(loginResponse)),
      http.post('/api/admin/parking/csv/import', () => HttpResponse.json(importResponse)),
      http.get('/api/admin/parking/review', () => {
        requests += 1;
        if (requests === 2) {
          return HttpResponse.json({ message: '관리자 인증이 필요합니다.' }, { status: 401 });
        }
        if (requests === 3) return HttpResponse.json({ reviews: [] });
        return HttpResponse.json(reviewsResponse);
      }),
    );
    renderAuthenticatedPage();
    const user = await selectCsv();
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));
    await screen.findByText(FILE_SHA256);
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));
    await screen.findByRole('article', { name: '제보 32' });

    // when
    await user.click(screen.getByRole('button', { name: '새로고침' }));

    // then
    expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('관리자 인증이 필요합니다.');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();

    // when
    await user.type(screen.getByLabelText('관리자 ID'), 'admin');
    await user.type(screen.getByLabelText('비밀번호'), 'password');
    await user.click(screen.getByRole('button', { name: '로그인' }));
    await screen.findByRole('heading', { name: '주차장 CSV 동기화' });

    // then
    expect(screen.getByRole('tab', { name: 'CSV 동기화', selected: true })).toBeInTheDocument();
    expect((screen.getByLabelText('CSV 파일') as HTMLInputElement).files).toHaveLength(0);
    expect(screen.queryByText(FILE_SHA256)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // when
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));

    // then
    expect(await screen.findByText('접수된 제보가 없습니다.')).toBeInTheDocument();
    expect(requests).toBe(3);
  });

  it('탭 이탈은 조회를 취소하고 이전 응답이 새 조회 결과를 덮어쓰지 못한다', async () => {
    // given
    const pending = createPendingRequest();
    const firstResponse = createPendingRequest();
    let requests = 0;
    let aborted = false;
    server.use(
      http.get('/api/admin/parking/review', async ({ request }) => {
        requests += 1;
        if (requests === 1) {
          request.signal.addEventListener('abort', () => {
            aborted = true;
          });
          await pending.promise;
          firstResponse.resolveRequest();
          return HttpResponse.json(reviewsResponse);
        }
        return HttpResponse.json({ reviews: [reviewsResponse.reviews[1]] });
      }),
    );
    renderAuthenticatedPage();
    const user = userEvent.setup();

    try {
      // when
      await user.click(screen.getByRole('tab', { name: '제보 목록' }));
      await waitFor(() => expect(requests).toBe(1));
      await user.click(screen.getByRole('tab', { name: 'CSV 동기화' }));

      // then
      expect(aborted).toBe(true);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      // when
      await user.click(screen.getByRole('tab', { name: '제보 목록' }));
      await screen.findByRole('article', { name: '제보 31' });
      await act(async () => {
        pending.resolveRequest();
        await firstResponse.promise;
      });

      // then
      expect(screen.getAllByRole('article')).toHaveLength(1);
      expect(screen.queryByRole('article', { name: '제보 32' })).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(requests).toBe(2);
    } finally {
      pending.resolveRequest();
    }
  });

  it('조회 중 로그아웃은 즉시 가능하며 취소된 응답이 새 로그인 상태에 섞이지 않는다', async () => {
    // given
    const pending = createPendingRequest();
    const firstResponse = createPendingRequest();
    let requests = 0;
    let aborted = false;
    server.use(
      http.post('/api/admin/auth/login', () => HttpResponse.json(loginResponse)),
      http.get('/api/admin/parking/review', async ({ request }) => {
        requests += 1;
        if (requests === 1) {
          request.signal.addEventListener('abort', () => {
            aborted = true;
          });
          await pending.promise;
          firstResponse.resolveRequest();
          return HttpResponse.json({ message: '이전 로그인 만료' }, { status: 401 });
        }
        return HttpResponse.json(reviewsResponse);
      }),
    );
    renderAuthenticatedPage();
    const user = userEvent.setup();

    try {
      // when
      await user.click(screen.getByRole('tab', { name: '제보 목록' }));
      await waitFor(() => expect(requests).toBe(1));
      await user.click(screen.getByRole('button', { name: '로그아웃' }));

      // then
      expect(screen.getByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
      expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
      expect(aborted).toBe(true);

      // when
      await user.type(screen.getByLabelText('관리자 ID'), 'admin');
      await user.type(screen.getByLabelText('비밀번호'), 'password');
      await user.click(screen.getByRole('button', { name: '로그인' }));
      await screen.findByRole('heading', { name: '주차장 CSV 동기화' });
      await user.click(screen.getByRole('tab', { name: '제보 목록' }));
      await screen.findByRole('article', { name: '제보 32' });
      await act(async () => {
        pending.resolveRequest();
        await firstResponse.promise;
      });

      // then
      expect(screen.getAllByRole('article')).toHaveLength(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
      expect(requests).toBe(2);
    } finally {
      pending.resolveRequest();
    }
  });

  it('화면을 떠나면 진행 중인 조회를 취소한다', async () => {
    // given
    const pending = createPendingRequest();
    let requests = 0;
    let aborted = false;
    server.use(
      http.get('/api/admin/parking/review', async ({ request }) => {
        requests += 1;
        request.signal.addEventListener('abort', () => {
          aborted = true;
        });
        await pending.promise;
        return HttpResponse.json(reviewsResponse);
      }),
    );
    const { unmount } = renderAuthenticatedPage();
    const user = userEvent.setup();

    try {
      // when
      await user.click(screen.getByRole('tab', { name: '제보 목록' }));
      await waitFor(() => expect(requests).toBe(1));
      unmount();

      // then
      expect(aborted).toBe(true);
    } finally {
      pending.resolveRequest();
    }
  });

  it('탭을 왕복해도 CSV 입력 요소와 파일 및 동기화 결과가 유지된다', async () => {
    // given
    server.use(
      http.get('/api/admin/parking/review', () => HttpResponse.json(reviewsResponse)),
      http.post('/api/admin/parking/csv/import', () => HttpResponse.json(importResponse)),
    );
    renderAuthenticatedPage();
    const file = createCsvFile();
    const user = await selectCsv(file);
    const input = screen.getByLabelText('CSV 파일') as HTMLInputElement;
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));
    await screen.findByText(FILE_SHA256);

    // when
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));
    await screen.findByRole('article', { name: '제보 32' });

    // then
    expect(input).toBeInTheDocument();
    expect(input).not.toBeVisible();
    expect(screen.getByText(FILE_SHA256)).not.toBeVisible();

    // when
    await user.click(screen.getByRole('tab', { name: 'CSV 동기화' }));

    // then
    expect(screen.getByLabelText('CSV 파일')).toBe(input);
    expect(input.files?.[0]).toBe(file);
    expect(screen.getByText(FILE_SHA256)).toBeVisible();
    expect(screen.getByRole('button', { name: 'CSV 동기화' })).toBeEnabled();
  });

  it('CSV 오류는 탭 전환 중 숨기고 CSV로 돌아오면 다시 보여준다', async () => {
    // given
    server.use(
      http.get('/api/admin/parking/review', () => HttpResponse.json(reviewsResponse)),
      http.post('/api/admin/parking/csv/import', () =>
        HttpResponse.json({ message: 'CSV를 확인해 주세요.' }, { status: 422 }),
      ),
    );
    renderAuthenticatedPage();
    const user = await selectCsv();
    await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));
    await screen.findByRole('alert');

    // when
    await user.click(screen.getByRole('tab', { name: '제보 목록' }));
    await screen.findByRole('article', { name: '제보 32' });

    // then
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // when
    await user.click(screen.getByRole('tab', { name: 'CSV 동기화' }));

    // then
    expect(screen.getByRole('alert')).toHaveTextContent('CSV를 확인해 주세요.');
  });

  it('CSV 동기화 중에는 제보 탭으로 전환하거나 제보를 조회할 수 없다', async () => {
    // given
    const pending = createPendingRequest();
    let requests = 0;
    server.use(
      http.get('/api/admin/parking/review', () => {
        requests += 1;
        return HttpResponse.json(reviewsResponse);
      }),
      http.post('/api/admin/parking/csv/import', async () => {
        await pending.promise;
        return HttpResponse.json(importResponse);
      }),
    );
    renderAuthenticatedPage();
    const user = await selectCsv();

    try {
      // when
      await user.click(screen.getByRole('button', { name: 'CSV 동기화' }));
      await user.click(screen.getByRole('tab', { name: '제보 목록' }));

      // then
      expect(screen.getByRole('tab', { name: '제보 목록' })).toBeDisabled();
      expect(screen.getByRole('tab', { name: 'CSV 동기화', selected: true })).toBeInTheDocument();
      expect(requests).toBe(0);
    } finally {
      pending.resolveRequest();
    }
    expect(await screen.findByText(FILE_SHA256)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '제보 목록' })).toBeEnabled();
  });

  it('키보드로 탭 초점을 이동하고 Enter와 Space로 선택한 탭을 연다', async () => {
    // given
    let requests = 0;
    server.use(
      http.get('/api/admin/parking/review', () => {
        requests += 1;
        return HttpResponse.json(reviewsResponse);
      }),
    );
    renderAuthenticatedPage();
    const user = userEvent.setup();
    const csvTab = screen.getByRole('tab', { name: 'CSV 동기화' });
    const reviewsTab = screen.getByRole('tab', { name: '제보 목록' });
    csvTab.focus();

    // when
    await user.keyboard('{ArrowRight}');

    // then
    expect(reviewsTab).toHaveFocus();
    expect(csvTab).toHaveAttribute('aria-selected', 'true');
    expect(requests).toBe(0);

    // when
    await user.keyboard('{Enter}');
    await screen.findByRole('article', { name: '제보 32' });

    // then
    expect(reviewsTab).toHaveAttribute('aria-selected', 'true');
    expect(csvTab).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel', { name: '제보 목록' })).toHaveAttribute(
      'id',
      reviewsTab.getAttribute('aria-controls'),
    );

    // when
    await user.keyboard('{ArrowLeft} ');

    // then
    expect(csvTab).toHaveFocus();
    expect(csvTab).toHaveAttribute('aria-selected', 'true');

    // when
    await user.keyboard('{End}');

    // then
    expect(reviewsTab).toHaveFocus();
    expect(csvTab).toHaveAttribute('aria-selected', 'true');

    // when
    await user.keyboard('{Home}');

    // then
    expect(csvTab).toHaveFocus();
    expect(csvTab).toHaveAttribute('aria-selected', 'true');
  });
});
