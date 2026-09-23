package jumin.domain.walking.service;

import org.springframework.stereotype.Component;

@Component
public class WalkingDurationCalculator {

    private static final int WALKING_SPEED_METERS_PER_HOUR = 4_000;

    public Integer calculateMinutes(Integer distanceMeters) {
        if (distanceMeters == null) {
            return null;
        }

        return (distanceMeters * 60 + WALKING_SPEED_METERS_PER_HOUR - 1)
                / WALKING_SPEED_METERS_PER_HOUR;
    }
}
