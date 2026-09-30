package jumin.domain.admin.parking.model;

public record ParkingDbRow(long id, ParkingLotValues lot, ParkingOperationValues operation) {

    public ParkingKey key() {
        return new ParkingKey(lot.name(), lot.address());
    }
}
