package jumin.domain.admin.parking.model;

import java.time.Instant;
import jumin.domain.parking.entity.ParkingDataSource;

public record ParkingLotValues(
        ParkingDataSource source,
        String sourceExternalId,
        String name,
        String sido,
        String sigungu,
        String address,
        Double latitude,
        Double longitude,
        Integer capacity,
        boolean active,
        Instant sourceCheckedAt
) {
    public ParkingLotValues {
        sourceExternalId = ParkingKey.normalize(sourceExternalId);
        name = ParkingKey.normalize(name);
        sido = ParkingKey.normalize(sido);
        sigungu = ParkingKey.normalize(sigungu);
        address = ParkingKey.normalize(address);
        if (latitude != null && latitude == 0.0) {
            latitude = 0.0;
        }
        if (longitude != null && longitude == 0.0) {
            longitude = 0.0;
        }
    }
}
