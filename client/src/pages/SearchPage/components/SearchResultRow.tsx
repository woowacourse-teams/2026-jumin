import { Stack } from '../../../shared/components/ui/Stack';
import { css } from '@emotion/css';
import type { Destination } from '../../../api/contracts';
import { color } from '../../../theme/color';
import { LocationIcon } from '../../../shared/components/ui/icons';
import { duration, easing } from '../../../theme/motion';
import { radius } from '../../../theme/radius';
import { typography } from '../../../theme/typography';

interface Props {
  query: string;
  destination: Destination;
  onSelect: (destination: Destination) => void;
}

export const SearchResultRow = ({ query, destination, onSelect }: Props) => {
  const matchIndex = destination.name.indexOf(query);

  return (
    <li
      className={css`
        border-bottom: 1px solid ${color.border.default};
      `}
    >
      <button
        className={css`
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          min-height: 68px;
          padding: 10px 20px;
          border: 0;
          background: ${color.background.default};
          text-align: left;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: background-color ${duration.fast} ${easing.out};

          &:focus-visible {
            background: ${color.background.subtle};
          }

          @media (hover: hover) {
            &:hover {
              background: ${color.background.subtle};
            }
          }

          &:active {
            background: ${color.background.pressed};
          }
        `}
        type="button"
        onClick={() => onSelect(destination)}
      >
        <span
          className={css`
            display: grid;
            width: 40px;
            height: 40px;
            flex-shrink: 0;
            place-items: center;
            border-radius: ${radius.sm};
            background: ${color.background.brandSubtle};
            color: ${color.text.brand};
          `}
          aria-hidden="true"
        >
          <LocationIcon size={18} />
        </span>
        <Stack
          as="span"
          gap={3}
          className={css`
            min-width: 0;
          `}
        >
          <strong
            className={css`
              overflow: hidden;
              ${typography.bodyStrong};
              color: ${color.text.primary};
              text-overflow: ellipsis;
              white-space: nowrap;

              mark {
                background: transparent;
                color: ${color.text.brand};
              }
            `}
          >
            {matchIndex < 0 ? (
              destination.name
            ) : (
              <>
                {destination.name.slice(0, matchIndex)}
                <mark>{destination.name.slice(matchIndex, matchIndex + query.length)}</mark>
                {destination.name.slice(matchIndex + query.length)}
              </>
            )}
          </strong>
          <span
            className={css`
              overflow: hidden;
              ${typography.bodySmall};
              color: ${color.text.secondary};
              text-overflow: ellipsis;
              white-space: nowrap;
            `}
          >
            {destination.roadAddress ?? destination.address}
          </span>
        </Stack>
      </button>
    </li>
  );
};
