package jumin.domain.parking.repository;

import java.util.List;
import java.util.Optional;
import jumin.domain.parking.entity.ParkingLot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ParkingLotRepository extends JpaRepository<ParkingLot, Long> {

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

    @Query(value = """
            select parking_lot.*
            from parking_lots parking_lot
            where parking_lot.active = true
              and parking_lot.location is not null
              and parking_lot.name is not null
              and parking_lot.address is not null
              and parking_lot.location && ST_MakeEnvelope(
                    :westLongitude,
                    :southLatitude,
                    :eastLongitude,
                    :northLatitude,
                    4326
              )::geography
              and parking_lot.longitude between :westLongitude and :eastLongitude
              and parking_lot.latitude between :southLatitude and :northLatitude
              and (:freeOnly = false or exists (
                    select 1
                    from parking_operations operation
                    where operation.parking_lot_id = parking_lot.id
                      and (
                          (:dayOfWeek between 1 and 5 and operation.weekday_paid = false)
                          or (:dayOfWeek = 6 and operation.saturday_paid = false)
                          or (:dayOfWeek = 7 and operation.holiday_paid = false)
                      )
              ))
              and (:excludeMechanical = false or parking_lot.mechanical = false)
              and (:isPublic = false or parking_lot.public_parking = true)
            order by parking_lot.id
            """, nativeQuery = true)
    List<ParkingLot> findActiveWithinViewport(
            @Param("westLongitude") double westLongitude,
            @Param("southLatitude") double southLatitude,
            @Param("eastLongitude") double eastLongitude,
            @Param("northLatitude") double northLatitude,
            @Param("freeOnly") boolean freeOnly,
            @Param("excludeMechanical") boolean excludeMechanical,
            @Param("isPublic") boolean isPublic,
            @Param("dayOfWeek") int dayOfWeek
    );
}
