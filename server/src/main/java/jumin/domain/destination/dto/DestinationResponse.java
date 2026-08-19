package jumin.domain.destination.dto;

public record DestinationResponse(
    String destinationId,
    String name,
    String address,
    String roadAddress,
    double latitude,
    double longitude,
    String provider
) {

    public static DestinationResponse from(
        String destinationId,
        String name,
        String address,
        String roadAddress,
        double latitude,
        double longitude
    ) {
        return new DestinationResponse(
            destinationId,
            name,
            address,
            roadAddress,
            latitude,
            longitude,
            "NAVER"
        );
    }
}
