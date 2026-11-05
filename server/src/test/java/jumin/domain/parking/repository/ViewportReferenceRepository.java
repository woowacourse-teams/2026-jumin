package jumin.domain.parking.repository;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.entity.ParkingLot;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface ViewportReferenceRepository extends Repository<ParkingLot, Long> {

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
              and (:isPublic = false or parking_lot.is_public = true)
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

    default ParkingLotViewportResponses searchViewport(ParkingLotViewportRequest request, Clock clock) {
        int day = LocalDate.ofInstant(clock.instant(), ZoneId.of("Asia/Seoul")).getDayOfWeek().getValue();
        List<ParkingLotViewportResponse> rows = findActiveWithinViewport(request.westLongitude(),
                request.southLatitude(), request.eastLongitude(), request.northLatitude(), request.freeOnly(),
                request.excludeMechanical(), request.isPublic(), day).stream()
                .map(lot -> new ParkingLotViewportResponse(lot.getId(), lot.getLatitude(), lot.getLongitude(),
                        score(lot.getCapacity())))
                .toList();
        return ParkingLotViewportResponses.from(rows);
    }

    private static double score(Integer capacity) {
        if (capacity == null || capacity <= 0) {
            return 0.0;
        }
        return capacity / (capacity + 50.0);
    }
}
