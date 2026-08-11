/** 방문 시간 입력 화면과 시간 선택 오버레이. */

import { useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';

import { api, ApiClientError } from '../../api';
import { calendar } from '../../assets';
import {
  colors,
  DialogSheet,
  ErrorText,
  Header,
  Muted,
  PrimaryButton,
  Screen,
  SecondaryButton,
} from '../../components';
import {
  addVisitMinutes,
  deriveVisit,
  formatDuration,
  refreshNearbyVisit,
  sortParkingLots,
  syncVisitFromResponse,
  todayInSeoul,
  validateVisit,
  type VisitDraft,
} from '../../domain';
import { MapView } from '../../map';
import { closeOverlay, navigate } from '../../router';
import { AssetIcon, BottomSheet, SheetHandle, Title, apiMessage } from '../shared';
import { useOverlay, useSearchSession } from '../../contexts';

export const VisitRow = styled.div<{ error?: boolean }>`
  display: grid;
  min-height: 73px;
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: center;
  margin-bottom: 8px;
  padding: 0 14px;
  border: 1.5px solid ${({ error }) => (error ? colors.danger : colors.line)};
  border-radius: 16px;
  background: ${colors.background};
`;

export const VisitValueButton = styled.button`
  min-height: 71px;
  border: 0;
  background: transparent;
  color: ${colors.text};
  font-size: 32px;
  font-weight: 850;
  text-align: right;
`;

export const QuickButtons = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 10px 0 18px;
`;

export const QuickButton = styled(SecondaryButton)`
  min-height: 37px;
  min-width: 0;
  padding-inline: 8px;
  border: 0;
  border-radius: 10px;
  background: ${colors.tint};
`;

export const TimeSelects = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  margin: 14px 0 22px;
`;

export const TimeSelect = styled.select`
  width: 100%;
  min-height: 58px;
  padding: 0 14px;
  border: 1.5px solid ${colors.primary};
  border-radius: 12px;
  background: #fff;
  font-size: 20px;
  font-weight: 800;
  text-align: center;
`;

export const VisitScreen = () => {
  const { session, setSession } = useSearchSession();
  const { openTimePicker: onOpenPicker } = useOverlay();
  const onBack = () => navigate(session.visitDraft?.source === 'SEARCH' ? '/destination' : '/');
  const draft = session.visitDraft!;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const updateDraft = (next: VisitDraft) => setSession((value) => ({ ...value, visitDraft: next }));
  const quickAdd = (minutes: number) => {
    const next = addVisitMinutes(draft, minutes);
    if (next) updateDraft(next);
  };

  const submit = async () => {
    const currentDraft = draft.source === 'NEARBY' ? refreshNearbyVisit(draft) : draft;
    if (currentDraft !== draft) updateDraft(currentDraft);
    const validation = validateVisit(currentDraft);
    if (validation) {
      setError(validation);
      document.getElementById(validation.field)?.focus();
      return;
    }
    const visit = deriveVisit(currentDraft)!;
    const destination = session.destination!;
    setSubmitting(true);
    setError(null);
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    try {
      const response = await api.searchParkingLots(
        {
          destinationName: destination.name,
          destinationLatitude: destination.location.latitude,
          destinationLongitude: destination.location.longitude,
          entryAt: visit.entryAt,
          exitAt: visit.exitAt,
        },
        controllerRef.current.signal,
      );
      // 최초 노출은 균형순 1위다.
      const [balancedTop] = sortParkingLots(response.parkingLots, 'BALANCED');
      const confirmed = response.searchCondition;
      setSession((value) => ({
        ...value,
        visitDraft: syncVisitFromResponse(currentDraft, confirmed),
        confirmedVisit: {
          entryAt: confirmed.entryAt,
          exitAt: confirmed.exitAt,
          durationMinutes: confirmed.durationMinutes,
        },
        response,
        selectedCategory: 'BALANCED',
        selectedParkingLotId: balancedTop?.parkingLotId ?? null,
      }));
      navigate('/results');
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      const apiError = caught instanceof ApiClientError ? caught : null;
      const field =
        apiError?.code === 'INVALID_ENTRY_AT'
          ? 'entryAt'
          : apiError?.code === 'INVALID_EXIT_AT'
            ? 'exitAt'
            : apiError?.code === 'INVALID_TIME_RANGE'
              ? 'timeRange'
              : undefined;
      setError({
        ...(field ? { field } : {}),
        message: field ? '입차·출차 시간을 다시 확인해주세요.' : apiMessage(caught),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const visit = deriveVisit(draft);
  const canAdd = (minutes: number) => Boolean(addVisitMinutes(draft, minutes));

  return (
    <Screen css={{ position: 'relative', paddingBottom: 0 }}>
      <Header title={session.destination!.name} onBack={onBack} />
      <MapView
        center={session.destination!.location}
        destination={session.destination!.location}
        height="calc(100dvh - var(--header-height))"
      />
      <BottomSheet>
        <SheetHandle />
        <div css={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title>언제 주차하세요?</Title>
          <label
            css={{
              display: 'flex',
              minHeight: 33,
              alignItems: 'center',
              gap: 6,
              padding: '0 8px',
              borderRadius: 10,
              background: colors.background,
              fontSize: 13,
            }}
          >
            <AssetIcon src={calendar} alt="" css={{ width: 16, height: 16 }} />
            <input
              type="date"
              aria-label="방문 날짜"
              min={todayInSeoul()}
              value={draft.visitDate}
              disabled={draft.source === 'NEARBY'}
              onChange={(event) => updateDraft({ ...draft, visitDate: event.target.value })}
              css={{ border: 0, background: 'transparent', fontWeight: 700 }}
            />
          </label>
        </div>
        <VisitRow error={error?.field === 'entryAt'}>
          <span>{draft.source === 'NEARBY' ? '도착' : '입차'}</span>
          <VisitValueButton
            id="entryAt"
            type="button"
            disabled={draft.source === 'NEARBY'}
            onClick={() => onOpenPicker('ENTRY', draft.entryTime)}
          >
            {draft.entryTime ?? '—:—'}
          </VisitValueButton>
        </VisitRow>
        <VisitRow error={error?.field === 'exitAt' || error?.field === 'timeRange'}>
          <span>출차</span>
          <VisitValueButton id="exitAt" type="button" onClick={() => onOpenPicker('EXIT', draft.exitTime)}>
            {draft.exitTime ?? '—:—'}
          </VisitValueButton>
        </VisitRow>
        {error && <ErrorText id="timeRange">{error.message}</ErrorText>}
        {visit && <Muted>{formatDuration(visit.durationMinutes)} 이용</Muted>}
        <QuickButtons>
          {[30, 60, 120].map((minutes) => (
            <QuickButton key={minutes} type="button" disabled={!canAdd(minutes)} onClick={() => quickAdd(minutes)}>
              +{minutes < 60 ? `${minutes}분` : `${minutes / 60}시간`}
            </QuickButton>
          ))}
        </QuickButtons>
        <PrimaryButton type="button" disabled={submitting} onClick={() => void submit()}>
          {submitting ? '추천을 찾고 있어요…' : '추천 받기'}
        </PrimaryButton>
      </BottomSheet>
    </Screen>
  );
};

export const TimePicker = () => {
  const { picker: pickerValue, setPicker: onChange, confirmPicker: onConfirm } = useOverlay();
  const picker = pickerValue!;
  const onClose = closeOverlay;

  return (
    <DialogSheet title={picker.kind === 'ENTRY' ? '입차 시간' : '출차 시간'} onClose={onClose}>
      <TimeSelects>
        <TimeSelect
          aria-label="시"
          value={picker.hour}
          onChange={(event) => onChange({ ...picker, hour: event.target.value })}
        >
          {Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0')).map((hour) => (
            <option key={hour}>{hour}</option>
          ))}
        </TimeSelect>
        <strong>:</strong>
        <TimeSelect
          aria-label="분"
          value={picker.minute}
          onChange={(event) => onChange({ ...picker, minute: event.target.value })}
        >
          {['00', '10', '20', '30', '40', '50'].map((minute) => (
            <option key={minute}>{minute}</option>
          ))}
        </TimeSelect>
      </TimeSelects>
      <div css={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <SecondaryButton type="button" onClick={onClose}>
          취소
        </SecondaryButton>
        <PrimaryButton type="button" onClick={onConfirm}>
          확인
        </PrimaryButton>
      </div>
    </DialogSheet>
  );
};
