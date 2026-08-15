package jumin.domain.parking.service;

import org.springframework.stereotype.Component;

@Component
public class GeoDistanceCalculator {

    private static final double EARTH_RADIUS_METERS = 6_371_000;

    public int distanceMeters(Coordinate from, Coordinate to) {
        double fromLatitude = Math.toRadians(from.latitude());
        double toLatitude = Math.toRadians(to.latitude());
        double latitudeDelta = Math.toRadians(to.latitude() - from.latitude());
        double longitudeDelta = Math.toRadians(to.longitude() - from.longitude());

        double haversine = Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
                + Math.cos(fromLatitude) * Math.cos(toLatitude)
                * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
        double clampedHaversine = Math.min(1.0, haversine);
        double centralAngle = 2 * Math.atan2(
                Math.sqrt(clampedHaversine),
                Math.sqrt(1 - clampedHaversine));

        return (int) Math.round(EARTH_RADIUS_METERS * centralAngle);
    }
}
