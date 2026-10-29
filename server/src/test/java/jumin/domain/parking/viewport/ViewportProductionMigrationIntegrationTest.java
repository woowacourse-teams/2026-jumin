package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

class ViewportProductionMigrationIntegrationTest {

    @Test
    @DisplayName("기존 V12 데이터베이스에서 정식 V13·V14와 캐시 V15를 순서대로 적용하고 기존 데이터를 보존한다")
    void upgrades_existing_v12_database_and_guards_legacy_writes_after_prepare() throws SQLException {
        // given
        DockerImageName image = DockerImageName.parse("pgrouting/pgrouting:18-3.6-3.8")
                .asCompatibleSubstituteFor("postgres");
        try (PostgreSQLContainer postgres = new PostgreSQLContainer(image)
                .withDatabaseName("jumin")
                .withUsername("jumin")
                .withPassword("jumin")) {
            postgres.start();
            Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                    .target("12").load().migrate();
            try (Connection connection = DriverManager.getConnection(
                    postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
                 Statement sql = connection.createStatement()) {
                sql.executeUpdate("""
                        INSERT INTO parking_lots
                            (id, source, source_external_id, name, address, latitude, longitude, capacity,
                             active, source_checked_at, created_at, updated_at)
                        VALUES (123, 'DATA_GO_KR', 'existing', 'existing lot', 'existing address',
                                37.5, 127.0, 40, TRUE, NOW(), NOW(), NOW())
                        """);
                sql.executeUpdate("""
                        INSERT INTO parking_operations
                            (parking_lot_id, weekday_paid, saturday_paid, holiday_paid,
                             source_checked_at, created_at, updated_at)
                        VALUES (123, FALSE, TRUE, TRUE, NOW(), NOW(), NOW())
                        """);

                // when
                Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                        .load().migrate();

                // then
                try (ResultSet rows = sql.executeQuery("""
                        SELECT l.id, l.capacity, l.is_public, l.viewport_grid_cell, o.weekday_paid,
                               s.projection_ready, s.grid_size_meters
                        FROM parking_lots l JOIN parking_operations o ON o.parking_lot_id = l.id
                        CROSS JOIN parking_viewport_cache_state s WHERE l.id = 123 AND s.id = 1
                        """)) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getLong("id")).isEqualTo(123);
                    assertThat(rows.getInt("capacity")).isEqualTo(40);
                    assertThat(rows.getObject("is_public")).isNull();
                    assertThat(rows.getObject("viewport_grid_cell")).isNull();
                    assertThat(rows.getBoolean("weekday_paid")).isFalse();
                    assertThat(rows.getBoolean("projection_ready")).isFalse();
                    assertThat(rows.getInt("grid_size_meters")).isEqualTo(1000);
                    assertThat(rows.next()).isFalse();
                }
                try (ResultSet rows = sql.executeQuery("""
                        SELECT version, checksum FROM flyway_schema_history
                        WHERE version IN ('13', '14', '15') ORDER BY installed_rank
                        """)) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getString("version")).isEqualTo("13");
                    assertThat(rows.getInt("checksum")).isEqualTo(-447172372);
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getString("version")).isEqualTo("14");
                    assertThat(rows.getInt("checksum")).isEqualTo(1974929536);
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getString("version")).isEqualTo("15");
                    assertThat(rows.getInt("checksum")).isEqualTo(-717044611);
                    assertThat(rows.next()).isFalse();
                }
                assertThat(sql.executeUpdate("UPDATE parking_lots SET capacity = 41 WHERE id = 123")).isEqualTo(1);
                assertThat(sql.executeUpdate("UPDATE parking_viewport_cache_state SET projection_ready = TRUE WHERE id = 1"))
                        .isEqualTo(1);
                assertThatThrownBy(() -> sql.executeUpdate("UPDATE parking_lots SET capacity = 42 WHERE id = 123"))
                        .isInstanceOf(SQLException.class)
                        .hasMessageContaining("viewport writer protocol is required");
                try (ResultSet rows = sql.executeQuery("SELECT capacity FROM parking_lots WHERE id = 123")) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getInt("capacity")).isEqualTo(41);
                }
            }
        }
    }
}
