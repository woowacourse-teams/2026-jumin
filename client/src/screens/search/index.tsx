/** 목적지 검색 화면. */

import { useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';

import { api } from '../../api';
import { close, picoError, pin, search } from '../../assets';
import { BottomNav, colors, IconButton, LoadingBlock, Muted, Screen, SecondaryButton } from '../../components';
import { formatDistance, type Coordinate, type DestinationCandidate } from '../../domain';
import { AssetIcon, CandidateAddress, CandidateName, CenterState, ErrorPico, apiMessage } from '../shared';

export const SearchHeader = styled.div`
  position: sticky;
  z-index: 4;
  top: 0;
  display: flex;
  min-height: calc(74px + env(safe-area-inset-top));
  align-items: flex-end;
  gap: 6px;
  padding: env(safe-area-inset-top) 12px 10px 8px;
  background: #fff;
`;

export const SearchInputWrap = styled.div`
  display: flex;
  height: 53px;
  flex: 1;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 1.5px solid ${colors.primary};
  border-radius: 16px;
`;

export const SearchInput = styled.input`
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 16px;

  &::placeholder {
    color: #a0a6b5;
  }
`;

export const ClearButton = styled.button`
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  background: transparent;

  img {
    width: 20px;
    height: 20px;
    padding: 6px;
    border-radius: 50%;
    background: #c4ccd8;
  }
`;

export const CandidateList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const CandidateButton = styled.button<{ active: boolean }>`
  display: grid;
  width: 100%;
  min-height: 68px;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 7px 20px;
  border: 0;
  border-bottom: 1px solid ${colors.line};
  background: ${({ active }) => (active ? colors.tint : '#fff')};
  text-align: left;
`;

export const PlaceIcon = styled.span`
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  background: ${colors.tint};

  img {
    width: 18px;
    height: 18px;
  }
`;

export const SearchScreen = ({
  currentLocation,
  onSelect,
  onBack,
  onNearby,
  onHome,
  onRecent,
}: {
  currentLocation: Coordinate | null;
  onSelect: (candidate: DestinationCandidate) => void;
  onBack: () => void;
  onNearby: () => void;
  onHome: () => void;
  onRecent: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [candidates, setCandidates] = useState<DestinationCandidate[]>([]);
  const [message, setMessage] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [retry, setRetry] = useState(0);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setStatus('LOADING');
      void api
        .searchDestinations(normalized, currentLocation ?? undefined, controller.signal)
        .then((response) => {
          setCandidates(response.destinations);
          setActiveIndex(-1);
          setStatus('SUCCESS');
          setMessage(
            response.destinations.length
              ? `${response.destinations.length}개의 검색 결과가 있어요.`
              : '검색 결과가 없어요.',
          );
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setStatus('ERROR');
          setMessage(apiMessage(error));
        });
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [currentLocation, query, retry]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!candidates.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % candidates.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? candidates.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      onSelect(candidates[activeIndex]!);
    } else if (event.key === 'Escape') {
      setCandidates([]);
      setActiveIndex(-1);
    }
  };

  return (
    <Screen bottomNav>
      <SearchHeader>
        <IconButton type="button" aria-label="뒤로 가기" onClick={onBack}>
          ‹
        </IconButton>
        <SearchInputWrap>
          <AssetIcon src={search} alt="" />
          <SearchInput
            ref={inputRef}
            role="combobox"
            aria-expanded={candidates.length > 0}
            aria-controls="destination-list"
            aria-activedescendant={activeIndex >= 0 ? `destination-option-${activeIndex}` : undefined}
            autoComplete="off"
            placeholder="어디에 방문하세요?"
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              if (next.trim().length < 2) {
                setStatus('IDLE');
                setCandidates([]);
                setActiveIndex(-1);
              }
            }}
            onKeyDown={onKeyDown}
          />
          {query && (
            <ClearButton type="button" aria-label="검색어 지우기" onClick={() => setQuery('')}>
              <img src={close} alt="" />
            </ClearButton>
          )}
        </SearchInputWrap>
      </SearchHeader>
      <div aria-live="polite" className="sr-only">
        {status === 'LOADING' ? '검색 중입니다.' : message}
      </div>
      {status === 'LOADING' && <LoadingBlock>장소를 찾고 있어요…</LoadingBlock>}
      {status === 'SUCCESS' && candidates.length === 0 && <CenterState>검색 결과가 없어요.</CenterState>}
      {status === 'ERROR' && (
        <CenterState>
          <div>
            <ErrorPico src={picoError} alt="" />
            <p>{message}</p>
            <SecondaryButton type="button" onClick={() => setRetry((value) => value + 1)}>
              다시 시도
            </SecondaryButton>
          </div>
        </CenterState>
      )}
      {candidates.length > 0 && (
        <CandidateList id="destination-list" role="listbox">
          {candidates.map((candidate, index) => (
            <li
              key={candidate.destinationId}
              id={`destination-option-${index}`}
              role="option"
              aria-selected={activeIndex === index}
            >
              <CandidateButton
                type="button"
                active={activeIndex === index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onSelect(candidate)}
              >
                <PlaceIcon aria-hidden>
                  <img src={pin} alt="" />
                </PlaceIcon>
                <span>
                  <CandidateName>{candidate.name}</CandidateName>
                  <CandidateAddress>{candidate.roadAddress ?? candidate.address}</CandidateAddress>
                </span>
                {candidate.distanceFromCurrentLocationMeters !== null && (
                  <Muted>{formatDistance(candidate.distanceFromCurrentLocationMeters)}</Muted>
                )}
              </CandidateButton>
            </li>
          ))}
        </CandidateList>
      )}
      <BottomNav active="HOME" onNearby={onNearby} onHome={onHome} onRecent={onRecent} />
    </Screen>
  );
};
