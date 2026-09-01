package jumin.domain.destination.client;

public record ReverseGeocodingResult(
        String buildingName,
        String roadAddress,
        String lotAddress,
        String administrativeAddress
) {

    public ReverseGeocodingResult(String buildingName, String roadAddress) {
        this(buildingName, roadAddress, "", "");
    }

    public ReverseGeocodingResult {
        buildingName = normalize(buildingName);
        roadAddress = normalize(roadAddress);
        lotAddress = normalize(lotAddress);
        administrativeAddress = normalize(administrativeAddress);
    }

    public static ReverseGeocodingResult empty() {
        return new ReverseGeocodingResult("", "", "", "");
    }

    private static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return value.trim();
    }
}
