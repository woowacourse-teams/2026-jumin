package jumin.domain.parking.controller;

import java.util.UUID;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;

final class GuestIdParser {

    private static final String UUID_V4 =
            "(?i)^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

    private GuestIdParser() {
    }

    static UUID parse(String guestId) {
        if (!guestId.matches(UUID_V4)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
        return UUID.fromString(guestId);
    }
}
