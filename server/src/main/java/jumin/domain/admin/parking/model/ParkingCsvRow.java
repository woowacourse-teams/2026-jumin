package jumin.domain.admin.parking.model;

public record ParkingCsvRow(long rowNumber, ParkingLotValues lot, ParkingOperationValues operation) {

    public ParkingKey key() {
        return new ParkingKey(lot.name(), lot.address());
    }
}
