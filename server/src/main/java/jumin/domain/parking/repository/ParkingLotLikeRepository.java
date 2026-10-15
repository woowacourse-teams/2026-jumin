package jumin.domain.parking.repository;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class ParkingLotLikeRepository {

    private final JdbcTemplate jdbcTemplate;

    public boolean lockActiveParkingLot(Long parkingLotId) {
        return !jdbcTemplate.queryForList(
                """
                select id
                from parking_lots
                where id = ? and active = true
                for update
                """,
                Long.class,
                parkingLotId
        ).isEmpty();
    }

    public void insertIfAbsent(Long parkingLotId, UUID anonymousId) {
        jdbcTemplate.update(
                """
                insert into parking_likes (parking_lot_id, anonymous_id)
                values (?, ?)
                on conflict (parking_lot_id, anonymous_id) do nothing
                """,
                parkingLotId,
                anonymousId
        );
    }

    public void delete(Long parkingLotId, UUID anonymousId) {
        jdbcTemplate.update(
                """
                delete from parking_likes
                where parking_lot_id = ? and anonymous_id = ?
                """,
                parkingLotId,
                anonymousId
        );
    }

    public long countByParkingLotId(Long parkingLotId) {
        return jdbcTemplate.queryForObject(
                """
                select count(*)
                from parking_likes
                where parking_lot_id = ?
                """,
                Long.class,
                parkingLotId
        );
    }

    public ParkingLotLikeResult findSummary(Long parkingLotId, UUID anonymousId) {
        return jdbcTemplate.queryForObject(
                """
                select count(*) as like_count,
                       exists (
                           select 1
                           from parking_likes
                           where parking_lot_id = ? and anonymous_id = ?
                       ) as liked_by_me
                from parking_likes
                where parking_lot_id = ?
                """,
                (resultSet, rowNum) -> new ParkingLotLikeResult(
                        resultSet.getLong("like_count"),
                        resultSet.getBoolean("liked_by_me")
                ),
                parkingLotId,
                anonymousId,
                parkingLotId
        );
    }

}
