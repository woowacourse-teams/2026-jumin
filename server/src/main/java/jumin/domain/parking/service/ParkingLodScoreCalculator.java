package jumin.domain.parking.service;

import jumin.domain.parking.entity.ParkingLot;
import org.springframework.stereotype.Component;

@Component
public class ParkingLodScoreCalculator {

    private static final double CAPACITY_REFERENCE = 50.0;

    public double calculate(ParkingLot parkingLot) {
        return calculateCapacityScore(parkingLot.getCapacity());
    }

    private double calculateCapacityScore(Integer capacity) {
        if (capacity == null || capacity <= 0) {
            return 0.0;
        }

        return capacity / (capacity + CAPACITY_REFERENCE);
    }
}
