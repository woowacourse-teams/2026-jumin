package jumin.domain.destination.client;

public record ReverseGeocodingResult(
        String buildingName,
        String roadAddress
) {

    public ReverseGeocodingResult {
        buildingName = normalize(buildingName);
        roadAddress = normalize(roadAddress);
    }

    public static ReverseGeocodingResult empty() {
        return new ReverseGeocodingResult("", "");
    }

    private static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return value.trim();
    }
}
