package jumin.domain.parking.repository;

import java.util.List;
import jumin.domain.parking.entity.ParkingLot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ParkingLotRepository extends JpaRepository<ParkingLot, Long> {

    @Query(value = """
            select parking_lot.*
            from parking_lots parking_lot
            where parking_lot.active = true
              and parking_lot.location is not null
              and parking_lot.name is not null
              and parking_lot.address is not null
              and ST_DWithin(
                    parking_lot.location,
                    ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
                    :radiusMeters
              )
            """, nativeQuery = true)
    List<ParkingLot> findActiveWithinRadius(
            @Param("latitude") double latitude,
            @Param("longitude") double longitude,
            @Param("radiusMeters") int radiusMeters
    );
}
