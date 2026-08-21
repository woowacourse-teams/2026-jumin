import type { Destination } from '../../../../api/contracts';
import { RecentHistoryRow } from '../../../../shared/components/RecentHistoryRow';

interface Props {
  destination: Destination;
  onSelect: (destination: Destination) => void;
  onRemove: (destinationId: string) => void;
}

export const RecentSearchRow = ({ destination, onSelect, onRemove }: Props) => (
  <RecentHistoryRow
    title={destination.name}
    address={destination.roadAddress ?? destination.address}
    removeLabel={`${destination.name} 삭제`}
    onSelect={() => onSelect(destination)}
    onRemove={() => onRemove(destination.destinationId)}
  />
);
