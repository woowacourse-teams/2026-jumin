package jumin.domain.destination.model;

import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;

public record DestinationSearchQuery(
        String text
) {

    private static final int MIN_QUERY_LENGTH = 2;

    public DestinationSearchQuery {
        if (text == null) {
            throw new BusinessException(ErrorCode.INVALID_QUERY);
        }

        text = text.trim();
        if (text.length() < MIN_QUERY_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_QUERY);
        }
    }
}
