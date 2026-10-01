import { jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
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
