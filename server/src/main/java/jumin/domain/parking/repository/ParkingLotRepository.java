package jumin.domain.parking.repository;

import jakarta.persistence.QueryHint;
import java.util.List;
import java.util.Optional;
import jumin.domain.parking.entity.ParkingLot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

public interface ParkingLotRepository extends JpaRepository<ParkingLot, Long> {

    @Query(value = """
            select parking_lot.*
            from parking_lots parking_lot
            where parking_lot.active = true
              and parking_lot.location is not null
              and parking_lot.latitude between -90 and 90
              and parking_lot.longitude between -180 and 180
              and strpos(lower(parking_lot.name), lower(:query)) > 0
            order by (lower(parking_lot.name) = lower(:query)) desc,
                     (strpos(lower(parking_lot.name), lower(:query)) = 1) desc,
                     parking_lot.name, parking_lot.id
            limit 15
            """, nativeQuery = true)
    @QueryHints(@QueryHint(name = "jakarta.persistence.query.timeout", value = "1000"))
    List<ParkingLot> findActiveByNameContaining(@Param("query") String query);

    @Query(value = """
            select parking_lot.*
            from parking_lots parking_lot
            where parking_lot.id = :parkingLotId
              and parking_lot.active = true
              and parking_lot.location is not null
            """, nativeQuery = true)
    Optional<ParkingLot> findActiveWithLocationById(@Param("parkingLotId") Long parkingLotId);

    @Query(value = """
            select parking_lot.*
            from parking_lots parking_lot
            where parking_lot.id = :parkingLotId
              and parking_lot.active = true
            """, nativeQuery = true)
    Optional<ParkingLot> findActiveById(@Param("parkingLotId") Long parkingLotId);

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
                    :radiusMeters,
                    false
              )
            """, nativeQuery = true)
    List<ParkingLot> findActiveWithinRadius(
            @Param("latitude") double latitude,
            @Param("longitude") double longitude,
            @Param("radiusMeters") int radiusMeters
    );

}
