package jumin.db.scripts;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import javax.sql.DataSource;
import jumin.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@DataJpaTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ApplyParkingAvailabilityMappingsSqlTest {

    @Autowired
    private DataSource dataSource;
    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void clearData() {
        jdbc.execute("truncate parking_lots restart identity cascade");
    }

    @Test
    @DisplayName("검증된 별칭 중 원천당 한 주차장을 선택하고 재실행해도 연결과 이력을 유지한다")
    void selects_one_verified_parking_lot_and_preserves_history_on_replay() throws Exception {
        // given
        long preferred = insertLot("세종로 공영주차장(시)", "서울특별시 종로구 세종대로 지하 189", true);
        insertLot("세종로", "서울 종로구 세종대로 189", true);

        // when
        apply();

        // then
        assertThat(jdbc.queryForObject("select parking_lot_id from parking_availability_mappings", Long.class))
                .isEqualTo(preferred);
        jdbc.update("""
                insert into parking_availability_history
                    (parking_lot_id, provider, external_id, observation_key, capacity, occupied, available, fetched_at)
                values (?, 'SEOUL', '171721', 'existing', 100, 88, 12, now())
                """, preferred);
        var mappings = jdbc.queryForList("select * from parking_availability_mappings order by id");
        var history = jdbc.queryForList("select * from parking_availability_history order by id");

        // when
        apply();

        // then
        assertThat(jdbc.queryForList("select * from parking_availability_mappings order by id")).isEqualTo(mappings);
        assertThat(jdbc.queryForList("select * from parking_availability_history order by id")).isEqualTo(history);
    }

    @Test
    @DisplayName("비활성·이름 변경·지도 검증 제외 항목은 저장하지 않고 나중에 적재한 검증 주차장은 연결한다")
    void skips_unverified_candidates_and_fills_mapping_after_later_import() throws Exception {
        // given
        long inactive = insertLot("세종로 공영주차장(시)", "서울특별시 종로구 세종대로 지하 189", false);
        insertLot("변경된 세종로", "서울 종로구 세종대로 189", true);
        insertLot("만덕2동사앞 복개 공영주차장", "부산 북구 만덕동 272-2", true);

        // when
        apply();

        // then
        assertThat(jdbc.queryForObject("select count(*) from parking_availability_mappings", Integer.class)).isZero();

        // when
        jdbc.update("update parking_lots set active = true where id = ?", inactive);
        apply();

        // then
        assertThat(jdbc.queryForObject("select parking_lot_id from parking_availability_mappings", Long.class))
                .isEqualTo(inactive);
    }

    @Test
    @DisplayName("다른 원천으로 수동 연결한 매핑은 덮어쓰지 않는다")
    void preserves_manual_mapping_to_another_source() throws Exception {
        // given
        long id = insertLot("세종로 공영주차장(시)", "서울특별시 종로구 세종대로 지하 189", true);
        jdbc.update("""
                insert into parking_availability_mappings
                    (parking_lot_id, provider, external_id, expected_name, expected_address)
                values (?, 'SEOUL', 'MANUAL', '세종로 공영주차장(시)', '서울특별시 종로구 세종대로 지하 189')
                """, id);

        // when
        apply();

        // then
        assertThat(jdbc.queryForObject("select external_id from parking_availability_mappings", String.class))
                .isEqualTo("MANUAL");
    }

    private long insertLot(String name, String address, boolean active) {
        return jdbc.queryForObject("""
                insert into parking_lots (source, source_external_id, name, address, active,
                    source_checked_at, created_at, updated_at)
                values ('DATA_GO_KR', 'mapping-test', ?, ?, ?, now(), now(), now()) returning id
                """, Long.class, name, address, active);
    }

    private void apply() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/scripts/apply_parking_availability_mappings.sql"));
        }
    }
}
