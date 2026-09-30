package jumin.domain.parking.repository;

import java.util.List;
import jumin.domain.parking.entity.ParkingLotReview;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ParkingLotReviewRepository extends JpaRepository<ParkingLotReview, Long> {

    @EntityGraph(attributePaths = "parkingLot")
    List<ParkingLotReview> findAllByOrderByCreatedAtDesc();

}
