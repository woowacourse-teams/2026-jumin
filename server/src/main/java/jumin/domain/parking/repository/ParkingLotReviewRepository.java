package jumin.domain.parking.repository;

import java.util.List;
import jumin.domain.parking.entity.ParkingLotReview;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ParkingLotReviewRepository extends JpaRepository<ParkingLotReview, Long> {

    @Query("""
            select review
            from ParkingLotReview review
            join fetch review.parkingLot
            order by review.createdAt desc
            """)
    List<ParkingLotReview> findAllWithParkingLotOrderByCreatedAtDesc();

}
