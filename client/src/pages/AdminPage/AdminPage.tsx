import { css, injectGlobal } from '@emotion/css';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { z } from 'zod';

import brandMark from '../../../assets/icons/brandMark.svg';
import parkingGuide from '../../../assets/guideImage/guide3.png';

import {
  AdminApiError,
  importParkingCsv,
  loginAdmin,
  type ParkingCsvImportResponse,
} from './adminApi';

const SESSION_KEY = 'jumin-admin-session-v1';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SESSION_EXPIRED_MESSAGE = '로그인이 만료되었습니다. 다시 로그인해 주세요.';
const sessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.number().finite().positive(),
});

type AdminSession = z.infer<typeof sessionSchema>;

const clearStoredSession = () => {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // 브라우저가 저장소 접근을 막아도 메모리의 인증 상태는 초기화합니다.
    return;
  }
};

const loadSession = (): AdminSession | null => {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return null;

    const result = sessionSchema.safeParse(JSON.parse(stored));
    if (result.success && result.data.expiresAt > Date.now()) return result.data;
  } catch {
    // 손상된 저장값이나 사용할 수 없는 저장소는 로그인 상태로 복원하지 않습니다.
    clearStoredSession();
    return null;
  }

  clearStoredSession();
  return null;
};

const saveSession = (session: AdminSession) => {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // 저장소를 사용할 수 없을 때도 현재 화면에서 로그인과 업로드는 가능합니다.
    return;
  }
};

const validateFile = (file: File): AdminApiError | null => {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return new AdminApiError('.csv 확장자의 파일을 선택해 주세요.', null);
  }
  if (file.size === 0) {
    return new AdminApiError('빈 CSV 파일은 업로드할 수 없습니다.', null);
  }
  if (file.size > MAX_FILE_SIZE) {
    return new AdminApiError('CSV 파일은 최대 10MiB까지 업로드할 수 있습니다.', null);
  }
  return null;
};

const formatFileSize = (bytes: number) => {
  const formatter = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${formatter.format(bytes)}바이트`;
  if (bytes < 1024 * 1024) return `${formatter.format(bytes / 1024)}KiB`;
  return `${formatter.format(bytes / (1024 * 1024))}MiB`;
};

export const AdminPage = () => {
  const [session, setSession] = useState(loadSession);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<AdminApiError | null>(null);
  const [result, setResult] = useState<ParkingCsvImportResponse | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const requestPending = useRef(false);
  const pageRef = useRef<HTMLElement>(null);

  const logout = (message = '') => {
    clearStoredSession();
    setSession(null);
    setLoginId('');
    setPassword('');
    setLoginError(message);
    setFile(null);
    setUploadError(null);
    setResult(null);
    if (pageRef.current) pageRef.current.scrollTop = 0;
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (requestPending.current) return;
    if (!loginId.trim() || password.length === 0) {
      setLoginError('관리자 ID와 비밀번호를 입력해 주세요.');
      return;
    }

    requestPending.current = true;
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await loginAdmin({ loginId: loginId.trim(), password });
      const nextSession = {
        accessToken: response.accessToken,
        expiresAt: Date.now() + response.expiresInSeconds * 1000,
      };
      saveSession(nextSession);
      setSession(nextSession);
      setPassword('');
      if (pageRef.current) pageRef.current.scrollTop = 0;
    } catch (error) {
      if (error instanceof AdminApiError) {
        setLoginError(error.message);
        return;
      }
      setLoginError('로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      requestPending.current = false;
      setIsLoggingIn(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0] ?? null;
    setFile(selected);
    setResult(null);
    setUploadError(null);
    if (selected) setUploadError(validateFile(selected));
  };

  const handleImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (requestPending.current || !session || !file) return;
    if (session.expiresAt <= Date.now()) {
      logout(SESSION_EXPIRED_MESSAGE);
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    requestPending.current = true;
    setIsImporting(true);
    setUploadError(null);
    setResult(null);

    try {
      setResult(await importParkingCsv(file, session.accessToken));
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        logout(error.message);
        return;
      }
      if (error instanceof AdminApiError) {
        setUploadError(error);
        return;
      }
      setUploadError(
        new AdminApiError(
          '업로드 결과를 확인할 수 없습니다. 데이터가 반영되었을 수 있으니 확인 후 다시 업로드해 주세요.',
          null,
        ),
      );
    } finally {
      requestPending.current = false;
      setIsImporting(false);
    }
  };

  return (
    <main ref={pageRef} className={pageStyle} data-admin-page>
      <div className={contentStyle}>
        <header className={headerStyle}>
          <div className={brandStyle}>
            <img src={brandMark} alt="" width="32" height="36" draggable={false} />
            <span>주차의민족</span>
            <h1 className={adminLabelStyle}>관리자 페이지</h1>
          </div>
          {session && (
            <button
              className={secondaryButtonStyle}
              type="button"
              disabled={isImporting}
              onClick={() => logout()}
            >
              로그아웃
            </button>
          )}
        </header>

        {!session ? (
          <div className={loginLayoutStyle}>
            <div className={loginVisualStyle}>
              <p className={eyebrowStyle}>주차장을 찾는 가장 간단한 방법</p>
              <p className={heroTitleStyle}>
                더 편한 주차의 시작,
                <br />
                정확한 정보에서.
              </p>
              <p className={heroDescriptionStyle}>
                오늘의 주차장 정보를 관리하고
                <br />더 나은 주차 경험을 만들어 주세요.
              </p>
              <img className={heroMarkStyle} src={brandMark} alt="" draggable={false} />
              <img
                className={serviceImageStyle}
                src={parkingGuide}
                alt="주차의민족 지도와 주차장 추천 화면"
                draggable={false}
              />
            </div>
            <section className={loginCardStyle} aria-labelledby="admin-login-title">
              <p className={eyebrowStyle}>ADMIN</p>
              <h2 id="admin-login-title" className={loginTitleStyle}>
                관리자 로그인
              </h2>
              <p className={descriptionStyle}>관리자 계정으로 주차장 데이터를 관리하세요.</p>
              <form onSubmit={handleLogin} className={formStyle} aria-busy={isLoggingIn}>
                <label className={fieldStyle} htmlFor="admin-login-id">
                  관리자 ID
                  <input
                    id="admin-login-id"
                    className={inputStyle}
                    type="text"
                    autoComplete="username"
                    placeholder="관리자 ID를 입력해 주세요"
                    value={loginId}
                    onChange={(event) => setLoginId(event.target.value)}
                    disabled={isLoggingIn}
                    required
                  />
                </label>
                <label className={fieldStyle} htmlFor="admin-password">
                  비밀번호
                  <input
                    id="admin-password"
                    className={inputStyle}
                    type="password"
                    autoComplete="current-password"
                    placeholder="비밀번호를 입력해 주세요"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isLoggingIn}
                    required
                  />
                </label>
                {loginError && (
                  <p className={errorStyle} role="alert">
                    {loginError}
                  </p>
                )}
                <button className={primaryButtonStyle} type="submit" disabled={isLoggingIn}>
                  {isLoggingIn ? '로그인 중…' : '로그인'}
                </button>
                <p className={sessionNoticeStyle}>로그인은 현재 탭에서 최대 2시간 유지됩니다.</p>
              </form>
            </section>
          </div>
        ) : (
          <div className={workspaceStyle}>
            <section className={workspaceIntroStyle} aria-labelledby="admin-workspace-title">
              <p className={eyebrowStyle}>주차의민족 데이터 관리</p>
              <h2 id="admin-workspace-title" className={titleStyle}>
                <span>오늘도,</span> 더 정확한 주차 정보.
              </h2>
              <p className={heroDescriptionStyle}>
                CSV 파일 하나로 주차장 정보를 최신 상태로 유지하세요.
              </p>
              <img src={brandMark} alt="" className={workspaceMarkStyle} draggable={false} />
            </section>
            <div className={uploadLayoutStyle}>
              <section className={cardStyle} aria-labelledby="admin-import-title">
                <p className={eyebrowStyle}>CSV IMPORT</p>
                <h2 id="admin-import-title" className={sectionTitleStyle}>
                  주차장 CSV 동기화
                </h2>
                <p className={descriptionStyle}>전체 주차장 데이터가 담긴 파일을 선택해 주세요.</p>
                <form onSubmit={handleImport} className={formStyle} aria-busy={isImporting}>
                  <label
                    className={uploadZoneStyle}
                    htmlFor="admin-csv-file"
                    data-selected={Boolean(file)}
                    data-disabled={isImporting}
                  >
                    <input
                      id="admin-csv-file"
                      className={fileInputStyle}
                      type="file"
                      accept=".csv"
                      aria-label="CSV 파일"
                      aria-describedby="admin-csv-requirements"
                      onChange={handleFileChange}
                      disabled={isImporting}
                    />
                    <span className={uploadIconStyle} aria-hidden="true">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 15V3m0 0L7 8m5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <strong className={fileInfoStyle}>
                      {file ? file.name : 'CSV 파일을 선택해 주세요'}
                    </strong>
                    <span className={descriptionStyle}>
                      {file ? formatFileSize(file.size) : 'UTF-8 인코딩, 최대 10MiB'}
                    </span>
                    <span className={fileSelectStyle}>{file ? '파일 변경' : '파일 선택'}</span>
                  </label>
                  <p className={syncNoticeStyle}>CSV에 없는 기존 활성 주차장은 비활성화됩니다.</p>
                  <button
                    className={primaryButtonStyle}
                    type="submit"
                    disabled={!file || isImporting || Boolean(file && validateFile(file))}
                  >
                    {isImporting ? '동기화 중…' : 'CSV 동기화'}
                  </button>
                  {isImporting && (
                    <p className={descriptionStyle} role="status">
                      주차장 데이터를 동기화하고 있습니다. 완료될 때까지 기다려 주세요.
                    </p>
                  )}
                </form>
              </section>
              <aside className={guideCardStyle} aria-labelledby="admin-guide-title">
                <h2 id="admin-guide-title" className={guideTitleStyle}>
                  업로드 전 확인하세요
                </h2>
                <ul className={requirementsStyle} id="admin-csv-requirements">
                  <li>
                    <strong>파일 형식</strong>
                    <span>.csv, UTF-8 또는 UTF-8 BOM</span>
                  </li>
                  <li>
                    <strong>파일 크기</strong>
                    <span>최대 10MiB (10,485,760바이트)</span>
                  </li>
                  <li>
                    <strong>데이터 구성</strong>
                    <span>필수 헤더 37개와 데이터 행이 한 건 이상 필요합니다.</span>
                  </li>
                </ul>
                <div className={noticeStyle}>
                  <strong>전체 데이터를 동기화합니다</strong>
                  <p>
                    CSV에서 빠진 기존 활성 주차장은 비활성화됩니다. 일부 데이터만 담은 파일이 아닌
                    전체 CSV를 선택해 주세요.
                  </p>
                  <p>업로드가 완료되면 바로 반영됩니다.</p>
                </div>
              </aside>
            </div>

            {uploadError && (
              <section className={errorCardStyle} role="alert">
                <h2 className={sectionTitleStyle}>업로드 결과 안내</h2>
                <p>{uploadError.message}</p>
                {uploadError.errors.length > 0 && (
                  <ul className={validationListStyle}>
                    {uploadError.errors.map((error, index) => (
                      <li key={`${error.field}-${index}`}>
                        <code>{error.field}</code>
                        <span>{error.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {result && (
              <section className={cardStyle} aria-labelledby="admin-result-title">
                <p className={successStyle} role="status">
                  <span aria-hidden="true">✓</span>
                  CSV 동기화가 완료되었습니다.
                </p>
                <h2 id="admin-result-title" className={sectionTitleStyle}>
                  동기화 결과
                </h2>
                <dl className={summaryStyle}>
                  {[
                    ['추가', result.summary.addedCount],
                    ['수정', result.summary.updatedCount],
                    ['재활성화', result.summary.reactivatedCount],
                    ['비활성화', result.summary.deactivatedCount],
                    ['변경 없음', result.summary.unchangedCount],
                  ].map(([label, count]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
                </dl>
                <dl className={metadataStyle}>
                  <div>
                    <dt>파일명</dt>
                    <dd>{result.fileName}</dd>
                  </div>
                  <div>
                    <dt>CSV 행 수</dt>
                    <dd>{result.csvRowCount}</dd>
                  </div>
                  <div>
                    <dt>SHA-256</dt>
                    <dd className={hashStyle}>{result.fileSha256}</dd>
                  </div>
                </dl>
              </section>
            )}
          </div>
        )}
        <footer className={footerStyle}>
          <span>주차의민족</span>
          <span>주차장을 찾는 가장 간단한 방법</span>
        </footer>
      </div>
    </main>
  );
};

const applyAdminRootStyles = () => injectGlobal`
  #root:has([data-admin-page]) {
    width: 100%;
    max-width: none;
    height: 100vh;
    height: 100dvh;
    margin: 0;
    border-radius: 0;
  }
`;

applyAdminRootStyles();

const pageStyle = css`
  width: 100%;
  height: 100%;
  padding: calc(28px + env(safe-area-inset-top, 0px)) 32px
    calc(28px + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  color: #18233d;
  background: #f5f6fb;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  word-break: keep-all;

  @media (max-width: 600px) {
    padding: calc(20px + env(safe-area-inset-top, 0px)) 16px
      calc(24px + env(safe-area-inset-bottom, 0px));
  }
`;

const contentStyle = css`
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
`;

const headerStyle = css`
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 36px;

  @media (max-width: 600px) {
    gap: 8px;
    margin-bottom: 24px;
  }
`;

const brandStyle = css`
  display: flex;
  align-items: center;
  gap: 12px;
  color: #101b37;
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.8px;

  img {
    flex-shrink: 0;
  }

  @media (max-width: 600px) {
    flex-wrap: wrap;
    column-gap: 8px;
    row-gap: 4px;
    font-size: 18px;

    img {
      width: 25px;
      height: 28px;
    }
  }
`;

const adminLabelStyle = css`
  margin: 0 0 0 6px;
  padding-left: 18px;
  color: #697386;
  border-left: 1px solid #dfe4ef;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;

  @media (max-width: 600px) {
    margin-left: 0;
    padding-left: 8px;
    font-size: 11px;
  }
`;

const eyebrowStyle = css`
  margin: 0 0 12px;
  color: #4356d8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.4px;
`;

const titleStyle = css`
  position: relative;
  z-index: 1;
  margin: 0 0 12px;
  font-size: 30px;
  font-weight: 800;
  line-height: 1.35;
  letter-spacing: -1px;

  @media (max-width: 600px) {
    max-width: 240px;
    font-size: 26px;

    span {
      display: block;
    }
  }
`;

const loginLayoutStyle = css`
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 560px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e8f2;
  border-radius: 28px;
  box-shadow: 0 12px 40px rgb(31 45 102 / 5%);

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    border-radius: 22px;
  }
`;

const loginVisualStyle = css`
  position: relative;
  min-width: 0;
  overflow: hidden;
  padding: 44px 36px;
  color: #fff;
  background: #4356d8;

  & > p:first-child {
    position: relative;
    z-index: 1;
    color: #e1e5ff;
    letter-spacing: 0.3px;
  }

  @media (max-width: 760px) {
    min-height: 208px;
    padding: 28px;
  }

  @media (max-width: 400px) {
    padding: 24px;
  }
`;

const heroTitleStyle = css`
  position: relative;
  z-index: 1;
  margin: 26px 0 18px;
  font-size: 34px;
  font-weight: 800;
  line-height: 1.4;
  letter-spacing: -1.5px;

  @media (max-width: 760px) {
    margin: 16px 0 12px;
    font-size: 25px;
    letter-spacing: -1px;
  }

  @media (max-width: 400px) {
    font-size: 23px;
  }
`;

const heroDescriptionStyle = css`
  position: relative;
  z-index: 1;
  margin: 0;
  color: #e1e5ff;
  font-size: 14px;
  line-height: 1.7;

  @media (max-width: 760px) {
    font-size: 12px;
  }
`;

const heroMarkStyle = css`
  position: absolute;
  width: 220px;
  height: auto;
  left: -35px;
  bottom: -28px;
  filter: brightness(0) invert(1);
  opacity: 0.12;
  pointer-events: none;

  @media (max-width: 760px) {
    width: 160px;
    left: auto;
    right: -20px;
  }
`;

const serviceImageStyle = css`
  position: absolute;
  right: 38px;
  bottom: -35px;
  width: 218px;
  height: auto;
  border: 7px solid #fff;
  border-radius: 26px;
  box-shadow: 0 16px 40px rgb(16 27 55 / 24%);
  transform: rotate(-8deg);

  @media (max-width: 760px) {
    right: 28px;
    bottom: -50px;
    width: 160px;
    border-width: 5px;
    border-radius: 20px;
  }

  @media (max-width: 500px) {
    right: -24px;
    bottom: -30px;
    width: 130px;
    opacity: 0.4;
  }
`;

const loginCardStyle = css`
  align-self: center;
  min-width: 0;
  padding: 48px 44px;

  @media (max-width: 760px) {
    padding: 32px;
  }

  @media (max-width: 400px) {
    padding: 28px 24px;
  }
`;

const loginTitleStyle = css`
  margin: 0 0 12px;
  color: #101b37;
  font-size: 27px;
  font-weight: 800;
  letter-spacing: -0.8px;
`;

const cardStyle = css`
  min-width: 0;
  padding: 28px;
  background: #fff;
  border: 1px solid #e5e8f2;
  border-radius: 20px;

  @media (max-width: 600px) {
    padding: 24px 20px;
  }
`;

const workspaceStyle = css`
  display: grid;
  gap: 24px;
`;

const workspaceIntroStyle = css`
  position: relative;
  overflow: hidden;
  padding: 32px;
  color: #fff;
  background: #4356d8;
  border-radius: 24px;

  & > p:first-child {
    color: #e1e5ff;
    letter-spacing: 0.3px;
  }

  @media (max-width: 600px) {
    padding: 26px 24px;
    border-radius: 20px;

    & > p:last-of-type {
      max-width: 230px;
    }
  }
`;

const workspaceMarkStyle = css`
  position: absolute;
  width: 162px;
  height: auto;
  right: 36px;
  bottom: -32px;
  filter: brightness(0) invert(1);
  opacity: 0.13;
  pointer-events: none;

  @media (max-width: 600px) {
    right: -20px;
    width: 138px;
  }
`;

const uploadLayoutStyle = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 24px;
  align-items: start;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const sectionTitleStyle = css`
  margin: 0 0 10px;
  color: #101b37;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.6px;
`;

const descriptionStyle = css`
  margin: 0;
  color: #697386;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.7;
`;

const formStyle = css`
  display: grid;
  gap: 22px;
  margin-top: 28px;
`;

const fieldStyle = css`
  display: grid;
  min-width: 0;
  gap: 10px;
  font-size: 13px;
  font-weight: 700;
`;

const inputStyle = css`
  width: 100%;
  min-height: 50px;
  padding: 14px;
  color: #18233d;
  font: inherit;
  font-size: 14px;
  font-weight: 400;
  background: #fff;
  border: 1px solid #dfe4ef;
  border-radius: 12px;

  &::placeholder {
    color: #8a94a8;
  }

  &:focus-visible {
    border-color: #4356d8;
    outline: 3px solid #e1e5ff;
  }

  &:disabled {
    background: #f5f6fb;
  }
`;

const uploadZoneStyle = css`
  position: relative;
  display: flex;
  min-height: 236px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  padding: 24px 16px;
  text-align: center;
  background: #f8f9ff;
  border: 1.5px dashed #bac3ef;
  border-radius: 16px;
  cursor: pointer;

  &:hover:not([data-disabled='true']),
  &[data-selected='true'] {
    background: #f0f2ff;
    border-color: #4356d8;
  }

  &:focus-within {
    outline: 3px solid #4356d8;
    outline-offset: 3px;
  }

  &[data-disabled='true'] {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const fileInputStyle = css`
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: inherit;
`;

const uploadIconStyle = css`
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin-bottom: 8px;
  color: #4356d8;
  background: #e9ecff;
  border-radius: 16px;
`;

const fileInfoStyle = css`
  max-width: 100%;
  color: #18233d;
  font-size: 15px;
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

const fileSelectStyle = css`
  margin-top: 8px;
  padding: 8px 18px;
  color: #4356d8;
  font-size: 12px;
  font-weight: 700;
  background: #fff;
  border: 1px solid #d9def7;
  border-radius: 8px;
`;

const buttonStyle = css`
  display: flex;
  min-height: 50px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  border: 0;
  border-radius: 12px;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid #4356d8;
    outline-offset: 3px;
  }

  &:disabled {
    cursor: not-allowed;
  }
`;

const primaryButtonStyle = css`
  ${buttonStyle};
  color: #fff;
  background: #4356d8;

  &:hover:not(:disabled) {
    background: #3548c8;
  }

  &:disabled {
    color: #697386;
    background: #e9ecf4;
  }
`;

const secondaryButtonStyle = css`
  ${buttonStyle};
  min-height: 38px;
  flex-shrink: 0;
  padding: 8px 14px;
  color: #697386;
  font-size: 12px;
  background: #fff;
  border: 1px solid #dfe4ef;
  border-radius: 10px;

  &:hover:not(:disabled) {
    color: #4356d8;
    border-color: #bac3ef;
  }

  &:disabled {
    opacity: 0.55;
  }
`;

const sessionNoticeStyle = css`
  margin: -4px 0 0;
  color: #697386;
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
`;

const syncNoticeStyle = css`
  margin: -4px 0;
  color: #855522;
  font-size: 12px;
  line-height: 1.7;
`;

const guideCardStyle = css`
  ${cardStyle};
  padding: 24px;
`;

const guideTitleStyle = css`
  margin: 0 0 24px;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.4px;
`;

const requirementsStyle = css`
  display: grid;
  gap: 20px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  line-height: 1.7;

  li {
    display: grid;
    gap: 4px;
  }

  strong {
    color: #43506a;
  }

  span {
    color: #697386;
  }
`;

const noticeStyle = css`
  margin-top: 24px;
  padding: 16px;
  color: #855522;
  font-size: 12px;
  line-height: 1.8;
  background: #fff8ed;
  border: 1px solid #f4e5cb;
  border-radius: 12px;

  p {
    margin: 8px 0 0;
  }
`;

const errorStyle = css`
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
  line-height: 1.6;
`;

const errorCardStyle = css`
  ${cardStyle};
  color: #991b1b;
  background: #fff7f7;
  border-color: #fecaca;
  font-size: 14px;
  line-height: 1.6;
`;

const validationListStyle = css`
  display: grid;
  gap: 12px;
  padding-left: 20px;

  li {
    overflow-wrap: anywhere;
  }

  code {
    display: block;
    margin-bottom: 4px;
  }
`;

const successStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 20px;
  color: #247657;
  font-size: 13px;
  font-weight: 700;

  span {
    display: grid;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    place-items: center;
    background: #eaf7f1;
    border-radius: 50%;
  }
`;

const summaryStyle = css`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin: 24px 0;

  div {
    padding: 18px 16px;
    background: #f5f6fb;
    border-radius: 12px;
  }

  div:first-child,
  div:nth-child(2) {
    background: #f0f2ff;

    dd {
      color: #4356d8;
    }
  }

  dt {
    color: #697386;
    font-size: 12px;
  }

  dd {
    margin: 10px 0 0;
    min-width: 0;
    font-size: 30px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.8px;
    overflow-wrap: anywhere;
  }

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: 8px;

    div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
    }

    dd {
      margin: 0;
      font-size: 24px;
    }
  }
`;

const metadataStyle = css`
  display: grid;
  gap: 16px;
  margin: 0;
  padding-top: 24px;
  border-top: 1px solid #edf0f5;
  font-size: 13px;
  line-height: 1.6;

  div {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 16px;
  }

  dt {
    color: #697386;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  @media (max-width: 600px) {
    div {
      grid-template-columns: 1fr;
      gap: 4px;
    }
  }
`;

const hashStyle = css`
  font-family: monospace;
  font-size: 11px;
`;

const footerStyle = css`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 32px;
  padding-top: 20px;
  color: #697386;
  border-top: 1px solid #e5e8f2;
  font-size: 11px;

  span:first-child {
    font-weight: 700;
  }

  @media (max-width: 400px) {
    flex-direction: column;
    gap: 8px;
  }
`;
