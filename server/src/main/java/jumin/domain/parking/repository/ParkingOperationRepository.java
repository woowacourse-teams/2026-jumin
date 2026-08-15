package jumin.domain.parking.repository;

import java.util.Collection;
import java.util.List;
import jumin.domain.parking.entity.ParkingOperation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ParkingOperationRepository extends JpaRepository<ParkingOperation, Long> {

    List<ParkingOperation> findAllByParkingLotIdIn(Collection<Long> parkingLotIds);
}
