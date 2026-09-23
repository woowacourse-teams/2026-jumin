package jumin.domain.walking.repository;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import jumin.domain.walking.dto.WalkingDistanceQueryResult;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class WalkingDistanceRepository {

    private static final int GRAPH_SEARCH_RADIUS_METERS = 800;
    private static final String FIND_DISTANCES_SQL = loadSql("sql/walking/find-distances.sql");
    private static final String HAS_USABLE_NETWORK_SQL = loadSql("sql/walking/has-usable-network.sql");

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public List<WalkingDistanceQueryResult> findDistances(
            double latitude,
            double longitude,
            List<Long> parkingLotIds,
            int maxSnapDistanceMeters
    ) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("latitude", latitude)
            .addValue("longitude", longitude)
            .addValue("parkingLotIds", parkingLotIds)
            .addValue("maxSnapDistanceMeters", maxSnapDistanceMeters)
            .addValue("graphSearchRadiusMeters", GRAPH_SEARCH_RADIUS_METERS);

        return jdbcTemplate.query(
            FIND_DISTANCES_SQL,
            parameters,
            (resultSet, rowNumber) -> new WalkingDistanceQueryResult(
                resultSet.getLong("parking_lot_id"),
                resultSet.getInt("distance_meters")
            )
        );
    }

    public boolean hasUsableNetwork() {
        Boolean result = jdbcTemplate.queryForObject(
            HAS_USABLE_NETWORK_SQL,
            new MapSqlParameterSource(),
            Boolean.class
        );
        return Boolean.TRUE.equals(result);
    }

    private static String loadSql(String path) {
        try (InputStream inputStream = new ClassPathResource(path).getInputStream()) {
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new IllegalStateException("SQL 리소스를 읽을 수 없습니다: " + path, exception);
        }
    }
}
