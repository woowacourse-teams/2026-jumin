package jumin.domain.parkingavailability.service;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import jumin.TestcontainersConfiguration;
import jumin.domain.parkingavailability.client.AvailabilityClient;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;
import jumin.domain.parkingavailability.repository.AvailabilityRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(properties = "parking.availability.enabled=false")
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@EnabledIfEnvironmentVariable(named = "RUN_PARKING_AVAILABILITY_LIVE", matches = "true")
class AvailabilityCollectorLiveTest {

    private static final ClassPathResource MAPPING_SQL =
            new ClassPathResource("db/scripts/apply_parking_availability_mappings.sql");

    @Autowired
    private List<AvailabilityClient> clients;
    @Autowired
    private AvailabilityRepository repository;
    @Autowired
    private DataSource dataSource;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private ObjectMapper mapper;

    @Test
    @Timeout(180)
    @DisplayName("실제 서울·부산 API 전체 응답을 수집하여 로컬 DB의 현재값·이력과 중복 방지를 확인한다")
    void collects_real_sources_and_persists_current_and_history() throws Exception {
        // given
        prepareVerifiedMappings();
        Map<AvailabilityProvider, List<AvailabilityObservation>> captured = new EnumMap<>(AvailabilityProvider.class);
        List<AvailabilityClient> capturingClients = clients.stream().map(client -> capture(client, captured)).toList();
        List<ProviderResult> results = new ArrayList<>();

        SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        try {
            AvailabilityCollector collector = new AvailabilityCollector(capturingClients, repository, metrics);

            // when
            collector.collect();

            // then
            assertThat(captured).containsOnlyKeys(AvailabilityProvider.values());
            for (AvailabilityProvider provider : AvailabilityProvider.values()) {
                assertThat(metrics.counter("parking.availability.collection", "provider", provider.name(),
                        "result", "success").count()).as(provider + " 수집·저장 성공").isEqualTo(1);
                results.add(verifyStoredValues(provider, captured.get(provider)));
            }
        } finally {
            metrics.close();
        }

        Path report = Path.of("build", "parking-live-verification", "result.json");
        Files.createDirectories(report.getParent());
        Files.writeString(report, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(results));
    }

    private AvailabilityClient capture(AvailabilityClient delegate,
                                       Map<AvailabilityProvider, List<AvailabilityObservation>> captured) {
        return new AvailabilityClient() {
            @Override
            public AvailabilityProvider provider() {
                return delegate.provider();
            }

            @Override
            public List<AvailabilityObservation> fetch() {
                List<AvailabilityObservation> observations = delegate.fetch();
                captured.put(provider(), observations);
                return observations;
            }
        };
    }

    private ProviderResult verifyStoredValues(AvailabilityProvider provider, List<AvailabilityObservation> observations) {
        Map<String, AvailabilityObservation> source = observations.stream()
                .collect(Collectors.toMap(AvailabilityObservation::externalId, row -> row));
        List<StoredObservation> stored = jdbc.query("""
                select availability.*, parking.name
                from parking_availability availability
                join parking_lots parking on parking.id = availability.parking_lot_id
                where availability.provider = ? order by availability.external_id
                """, this::storedObservation, provider.name());
        assertThat(stored).as(provider + " 실제 API의 DB 저장 결과").isNotEmpty();
        for (StoredObservation row : stored) {
            AvailabilityObservation original = source.get(row.externalId());
            assertThat(original).isNotNull();
            assertThat(row.capacity()).isEqualTo(original.capacity());
            assertThat(row.occupied()).isEqualTo(original.occupied());
            assertThat(row.available()).isEqualTo(original.available());
            assertThat(row.sourceUpdatedAt()).isEqualTo(original.sourceUpdatedAt());
            assertThat(Math.abs(Duration.between(row.fetchedAt(), original.fetchedAt()).toNanos()))
                    .isLessThan(1_000_000);
        }
        long historyBefore = historyCount(provider);
        assertThat(historyBefore).isEqualTo(stored.size());

        // when
        int duplicateHistory = repository.saveAll(observations);

        // then
        assertThat(duplicateHistory).isZero();
        assertThat(historyCount(provider)).isEqualTo(historyBefore);
        assertThat(jdbc.queryForObject("""
                select count(*) from parking_availability_history history
                where history.provider = ? and not exists (
                    select 1 from parking_availability_mappings mapping
                    where mapping.parking_lot_id = history.parking_lot_id
                      and mapping.provider = history.provider and mapping.external_id = history.external_id
                )
                """, Long.class, provider.name())).isZero();
        long mappings = jdbc.queryForObject("select count(*) from parking_availability_mappings where provider = ?",
                Long.class, provider.name());
        return new ProviderResult(provider, observations.size(), mappings, stored.size(), historyBefore,
                duplicateHistory, stored.stream().limit(3).toList());
    }

    private StoredObservation storedObservation(ResultSet row, int rowNum) throws SQLException {
        Timestamp updatedAt = row.getTimestamp("source_updated_at");
        return new StoredObservation(row.getString("external_id"), row.getString("name"),
                row.getInt("capacity"), row.getInt("occupied"), row.getInt("available"),
                updatedAt == null ? null : updatedAt.toInstant(), row.getTimestamp("fetched_at").toInstant());
    }

    private long historyCount(AvailabilityProvider provider) {
        return jdbc.queryForObject("select count(*) from parking_availability_history where provider = ?",
                Long.class, provider.name());
    }

    private void prepareVerifiedMappings() throws Exception {
        String script = MAPPING_SQL.getContentAsString(StandardCharsets.UTF_8);
        Matcher start = Pattern.compile("(?i)create\\s+temporary\\s+table\\s+availability_mapping_seed").matcher(script);
        Matcher end = Pattern.compile("(?i)delete\\s+from\\s+parking_availability_mappings").matcher(script);
        if (!start.find() || !end.find()) {
            throw new IllegalStateException("검증된 매핑 SQL에서 테스트 데이터를 읽을 수 없습니다.");
        }
        String seed = script.substring(start.start(), end.start());
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            ScriptUtils.executeSqlScript(connection, new ByteArrayResource(seed.getBytes(StandardCharsets.UTF_8)));
            try (var statement = connection.createStatement()) {
                statement.executeUpdate("""
                        insert into parking_lots (source, source_external_id, name, address, capacity,
                            source_checked_at, created_at, updated_at)
                        select 'DATA_GO_KR', external_id, parking_name, parking_address, 100, now(), now(), now()
                        from availability_mapping_seed where exclusion_reason is null
                        on conflict do nothing
                        """);
            }
            connection.commit();
            connection.setAutoCommit(true);
            ScriptUtils.executeSqlScript(connection, MAPPING_SQL);
        }
    }

    record ProviderResult(AvailabilityProvider provider, int fetched, long mappings, int current, long history,
                          int duplicateHistory, List<StoredObservation> samples) {
    }

    record StoredObservation(String externalId, String name, int capacity, int occupied, int available,
                             Instant sourceUpdatedAt, Instant fetchedAt) {
    }
}
