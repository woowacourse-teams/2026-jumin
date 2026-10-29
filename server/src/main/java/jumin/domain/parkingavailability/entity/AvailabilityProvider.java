package jumin.domain.parkingavailability.entity;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum AvailabilityProvider {
    SEOUL("서울"),
    BUSAN("부산");

    private final String displayName;
}
