package jumin.domain.parking.repository;

import jumin.domain.parking.entity.ParkingOperation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ParkingOperationRepository extends JpaRepository<ParkingOperation, Long> {
}
