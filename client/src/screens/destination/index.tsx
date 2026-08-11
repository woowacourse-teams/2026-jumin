/** 목적지 확정 화면. */

import { Header, Muted, PrimaryButton, Screen } from '../../components';
import { type SearchSession } from '../../domain';
import { MapView } from '../../map';
import { BottomSheet, SheetHandle, Title } from '../shared';

export const DestinationScreen = ({
  session,
  onBack,
  onNext,
}: {
  session: SearchSession;
  onBack: () => void;
  onNext: () => void;
}) => {
  const destination = session.destination!;
  return (
    <Screen css={{ position: 'relative', paddingBottom: 0 }}>
      <Header title="목적지 확인" onBack={onBack} />
      <MapView
        center={destination.location}
        destination={destination.location}
        height="calc(100dvh - var(--header-height))"
      />
      <BottomSheet>
        <SheetHandle />
        <Title>{destination.name}</Title>
        <Muted>{destination.address}</Muted>
        <div css={{ height: 18 }} />
        <PrimaryButton type="button" onClick={onNext}>
          다음
        </PrimaryButton>
      </BottomSheet>
    </Screen>
  );
};
