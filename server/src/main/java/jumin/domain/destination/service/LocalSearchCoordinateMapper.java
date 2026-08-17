package jumin.domain.destination.service;

public final class LocalSearchCoordinateMapper {

    private static final double WGS84_INTEGER_SCALE = 10_000_000;

    private LocalSearchCoordinateMapper() {
    }

    public static GeoCoordinate toGeoCoordinate(String mapx, String mapy) {
        double longitude = parseCoordinateValue(mapx) / WGS84_INTEGER_SCALE;
        double latitude = parseCoordinateValue(mapy) / WGS84_INTEGER_SCALE;

        if (!isValidCoordinate(latitude, longitude)) {
            throw new IllegalArgumentException("네이버 좌표가 WGS84 범위를 벗어났습니다.");
        }

        return new GeoCoordinate(latitude, longitude);
    }

    private static double parseCoordinateValue(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("네이버 좌표가 비어 있습니다.");
        }

        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("네이버 좌표를 숫자로 변환할 수 없습니다.", exception);
        }
    }

    private static boolean isValidCoordinate(double latitude, double longitude) {
        return Double.isFinite(latitude)
            && Double.isFinite(longitude)
            && latitude >= -90
            && latitude <= 90
            && longitude >= -180
            && longitude <= 180;
    }
}
