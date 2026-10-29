package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.benmanes.caffeine.cache.Ticker;
import com.zaxxer.hikari.HikariDataSource;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicBoolean;
import java.nio.file.Path;
import java.nio.file.Files;
import java.nio.file.attribute.PosixFilePermissions;
import java.io.IOException;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.Resource;
import org.springframework.core.io.InputStreamResource;

class ViewportStoreContractTest {

    @Test
    @DisplayName("가중치 초과 퇴출을 계측하고 maintenance 뒤 저장 가중치를 예산 안으로 돌린다")
    void reports_weight_eviction() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxValueBytes(256);
        properties.setMaxRequestBytes(1024);
        properties.setMaximumWeight(640);
        ViewportMetrics metrics = metrics();
        try (CaffeineViewportCellStore store = new CaffeineViewportCellStore(properties,
                new ViewportCellCodec(256, 10), metrics)) {
            // when
            store.putMany(List.of(new ViewportCell(key(1), List.of()), new ViewportCell(key(2), List.of()),
                    new ViewportCell(key(3), List.of())), deadline());
            store.cleanUp();

            // then
            assertThat(metrics.registry().get("parking.viewport.cache.estimated_weight").gauge().value())
                    .isLessThanOrEqualTo(640);
            assertThat(metrics.registry().get("parking.viewport.cache.evictions").functionCounter().count())
                    .isGreaterThanOrEqualTo(1);
            assertThat(store.getMany(List.of(key(1), key(2), key(3)), deadline())).hasSizeLessThanOrEqualTo(2);
        }
    }

    @TempDir
    Path spoolRoot;

    @Test
    @DisplayName("기존 공개 디렉터리와 symlink root를 거절하고 대상 fixture를 변경하지 않는다")
    void rejects_untrusted_spool_root() throws Exception {
        // given
        Path publicDirectory = Files.createDirectory(spoolRoot.resolve("public"));
        Files.setPosixFilePermissions(publicDirectory, PosixFilePermissions.fromString("rwxr-xr-x"));
        Path privateTarget = Files.createDirectory(spoolRoot.resolve("target"),
                PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        Path marker = Files.writeString(privateTarget.resolve("innocuous.txt"), "fixture");
        Path symlink = Files.createSymbolicLink(spoolRoot.resolve("link"), privateTarget);

        // when & then
        for (Path unsafe : List.of(publicDirectory, symlink)) {
            try (ViewportSpool spool = new ViewportSpool(spoolProperties("reader"), new ParkingLodScoreCalculator(), unsafe);
                 ViewportSpool.Builder builder = spool.builder()) {
                assertThatThrownBy(() -> addSpoolRows(builder)).isInstanceOf(ViewportUnavailableException.class);
                assertThat(spool.reservedBytes()).isZero();
            }
        }
        assertThat(Files.readString(marker)).isEqualTo("fixture");
        assertThat(Files.getPosixFilePermissions(publicDirectory)).isEqualTo(PosixFilePermissions.fromString("rwxr-xr-x"));
    }

    @Test
    @DisplayName("문자 치환 시 충돌하던 reader 계정이 같은 root에서 동시에 전체 응답을 준비한다")
    void separates_distinct_reader_identities() throws Exception {
        // given
        try (ViewportSpool first = new ViewportSpool(spoolProperties("reader.slot.1"), new ParkingLodScoreCalculator(), spoolRoot);
             ViewportSpool second = new ViewportSpool(spoolProperties("reader_slot_1"), new ParkingLodScoreCalculator(), spoolRoot);
             ViewportSpool.Builder one = first.builder(); ViewportSpool.Builder two = second.builder()) {
            // when
            addSpoolRows(one);
            addSpoolRows(two);
            try (ViewportBody oneBody = one.build(); ViewportBody twoBody = two.build();
                 var oneStream = ((Resource) oneBody.value()).getInputStream();
                 var twoStream = ((Resource) twoBody.value()).getInputStream()) {
                // then
                assertThat(oneStream.readAllBytes()).isEqualTo(twoStream.readAllBytes());
            }
        }
    }

    @Test
    @DisplayName("응답 준비 후 경로가 사라져도 이미 연 파일 핸들로 전체 JSON을 응답한다")
    void streams_owned_handle_without_reopening_path() throws Exception {
        // given
        try (ViewportSpool spool = new ViewportSpool(spoolProperties("reader"), new ParkingLodScoreCalculator(), spoolRoot);
             ViewportSpool.Builder builder = spool.builder()) {
            addSpoolRows(builder);
            try (ViewportBody body = builder.build()) {
                Path file;
                try (var files = Files.walk(spoolRoot)) {
                    file = files.filter(path -> path.toString().endsWith(".json")).findFirst().orElseThrow();
                }

                // when
                Files.delete(file);
                Resource resource = (Resource) body.value();
                try (var input = resource.getInputStream()) {
                    // then
                    assertThat(resource).isExactlyInstanceOf(InputStreamResource.class);
                    assertThat(new String(input.readAllBytes(), StandardCharsets.UTF_8))
                            .startsWith("{\"totalCount\":10,\"parkingLots\":[").endsWith("]}");
                }
            }
            assertThat(spool.reservedBytes()).isZero();
        }
    }

    @Test
    @DisplayName("파일 삭제 실패 시 디스크 예약량을 보존하고 삭제 재시도 성공 뒤에만 돌려준다")
    void retains_quota_after_unlink_failure() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxRequestBytes(320);
        AtomicBoolean failDelete = new AtomicBoolean(true);
        try (ViewportSpool spool = new ViewportSpool(properties, new ParkingLodScoreCalculator(), spoolRoot) {
            @Override
            protected void deleteFile(Path path) throws IOException {
                if (failDelete.get()) {
                    throw new IOException("injected unlink failure");
                }
                super.deleteFile(path);
            }
        }) {
            ViewportSpool.Builder builder = spool.builder();
            for (int index = 0; index < 10; index++) {
                builder.add(item(index));
            }
            ViewportBody body = builder.build();
            long reserved = spool.reservedBytes();
            assertThat(reserved).isPositive();

            // when & then
            body.close();
            assertThat(spool.reservedBytes()).isEqualTo(reserved);
            spool.retryDeletes();
            assertThat(spool.reservedBytes()).isEqualTo(reserved);
            failDelete.set(false);
            spool.retryDeletes();
            assertThat(spool.reservedBytes()).isZero();
        }
    }

    @Test
    @DisplayName("재시작의 소유권 lock 확보 뒤에만 이전 파일을 정리하고 다른 인스턴스 파일은 보존한다")
    void recovers_abandoned_files_with_exclusive_ownership() throws Exception {
        // given
        ViewportCacheProperties firstProperties = new ViewportCacheProperties();
        firstProperties.setMaxRequestBytes(320);
        ViewportCacheProperties otherProperties = new ViewportCacheProperties();
        otherProperties.setMaxRequestBytes(320);
        otherProperties.setEnvironment("other");
        ViewportSpool previous = new ViewportSpool(firstProperties, new ParkingLodScoreCalculator(), spoolRoot);
        try (ViewportSpool other = new ViewportSpool(otherProperties, new ParkingLodScoreCalculator(), spoolRoot)) {
            ViewportSpool.Builder abandoned = previous.builder();
            ViewportSpool.Builder alive = other.builder();
            for (int index = 0; index < 10; index++) {
                abandoned.add(item(index));
                alive.add(item(index));
            }
            ViewportBody abandonedBody = abandoned.build();
            try (ViewportBody aliveBody = alive.build()) {
                previous.close();

                // when
                try (ViewportSpool restarted = new ViewportSpool(firstProperties, new ParkingLodScoreCalculator(), spoolRoot)) {
                    ViewportSpool.Builder fresh = restarted.builder();
                    for (int index = 0; index < 10; index++) {
                        fresh.add(item(index));
                    }
                    try (ViewportBody freshBody = fresh.build(); var files = Files.walk(spoolRoot)) {
                        // then
                        assertThat(files.filter(path -> path.toString().endsWith(".json")).count()).isEqualTo(2);
                    }
                    try (var input = ((Resource) aliveBody.value()).getInputStream()) {
                        assertThat(input.readAllBytes()).isNotEmpty();
                    }
                }
            } finally {
                abandonedBody.close();
                previous.close();
            }
        }
    }

    @Test
    @DisplayName("빈 셀과 일반 셀의 TTL을 구분하고 읽기는 만료 시각을 늘리지 않는다")
    void expires_without_access_extension() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        AtomicLong now = new AtomicLong();
        Ticker ticker = now::get;
        try (CaffeineViewportCellStore store = new CaffeineViewportCellStore(properties,
                new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows()),
                metrics(), ticker, () -> 0.5)) {
            ViewportCell empty = new ViewportCell(key(1), List.of());
            ViewportCell full = new ViewportCell(key(2), List.of(item(1)));
            store.putMany(List.of(empty, full), deadline());

            // when & then
            now.set(Duration.ofSeconds(59).toNanos());
            assertThat(store.getMany(List.of(empty.key(), full.key()), deadline())).hasSize(2);
            now.set(Duration.ofSeconds(61).toNanos());
            assertThat(store.getMany(List.of(empty.key(), full.key()), deadline())).containsOnlyKeys(full.key());
            now.set(Duration.ofSeconds(601).toNanos());
            assertThat(store.getMany(List.of(full.key()), deadline())).isEmpty();
        }
    }

    @Test
    @DisplayName("저장과 조회의 batch heap 한도가 같고 예산 초과는 부분 저장하지 않는다")
    void applies_same_batch_budget() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxValueBytes(256);
        properties.setMaxRequestBytes(320);
        try (ViewportCellStore store = new CaffeineViewportCellStore(properties, new ViewportCellCodec(256, 20), metrics())) {
            ViewportCell first = new ViewportCell(key(1), List.of());
            ViewportCell second = new ViewportCell(key(2), List.of());

            // when & then
            assertThatThrownBy(() -> store.putMany(List.of(first, second), deadline()))
                    .isInstanceOf(ViewportStoreException.class);
            assertThat(store.getMany(List.of(first.key()), deadline())).isEmpty();
            store.putMany(List.of(first), deadline());
            assertThat(store.getMany(List.of(first.key()), deadline())).containsOnlyKeys(first.key());
        }
    }

    @Test
    @DisplayName("JDBC URL의 역할과 timeout을 전용 값으로 바꾸되 primary 설정은 수정하지 않는다")
    void isolates_driver_settings() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setReadUsername("reader");
        properties.setReadPassword("read-only-test");
        try (HikariDataSource primary = new HikariDataSource()) {
            primary.setJdbcUrl("jdbc:postgresql://localhost/test?user=writer&password=writer-test&socketTimeout=90&targetServerType=preferSecondary&options=-c%20statement_timeout%3D0");
            primary.setUsername("primary");
            primary.addDataSourceProperty("ApplicationName", "primary");
            Properties before = new Properties();
            before.putAll(primary.getDataSourceProperties());

            // when
            var config = ViewportReadPoolConfiguration.create(primary, properties);

            // then
            assertThat(primary.getDataSourceProperties()).isEqualTo(before);
            assertThat(primary.getJdbcUrl()).contains("socketTimeout=90");
            assertThat(config.getJdbcUrl()).doesNotContain("user=", "password=", "socketTimeout=", "options=");
            assertThat(config.getUsername()).isEqualTo("reader");
            assertThat(config.getDataSourceProperties()).doesNotContainKeys("user", "password");
            assertThat(config.getDataSourceProperties().getProperty("socketTimeout")).isEqualTo("2");
            assertThat(config.getDataSourceProperties().getProperty("targetServerType")).isEqualTo("primary");
            assertThat(config.getJdbcUrl()).doesNotContain("targetServerType=");
            assertThat(config.getDataSourceProperties().getProperty("options")).endsWith("idle_session_timeout=5000");
            assertThat(config.getMaximumPoolSize()).isEqualTo(3);
            assertThat(config.getConnectionTimeout()).isEqualTo(1000);
            var observer = ViewportReadPoolConfiguration.observer(primary, properties);
            assertThat(observer.getConnectionTimeout()).isEqualTo(250);
            assertThat(observer.getMaximumPoolSize()).isOne();
        }
    }

    @Test
    @DisplayName("공유 Redis는 환경 명시와 별도 읽기 및 관측 계정 없이는 활성화되지 않는다")
    void validates_shared_namespace_and_credentials() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setEnabled(true);
        properties.setStore(ViewportCacheProperties.Store.REDIS);
        properties.setReadUsername("reader");
        properties.setReadPassword("reader-test");
        properties.setObserverUsername("observer");
        properties.setObserverPassword("observer-test");

        // when & then
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setEnvironment("test");
        properties.validate();
        properties.setObserverUsername("reader");
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("작은 fallback은 기존 DTO이고 큰 fallback은 전체 JSON을 파일로 준비해 정확한 long ID를 보존한다")
    void spools_complete_response_without_truncation() throws Exception {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxRequestBytes(320);
        try (ViewportSpool spool = new ViewportSpool(properties, new ParkingLodScoreCalculator())) {
        ViewportSpool.Builder small = spool.builder();
        small.add(item(1));
        try (ViewportBody result = small.build()) {
            assertThat(result.value()).isInstanceOf(ParkingLotViewportResponses.class);
        }
        ViewportSpool.Builder large = spool.builder();
        for (int index = 0; index < 100; index++) {
            large.add(item(9_007_199_254_740_993L + index));
        }

        // when
        try (ViewportBody result = large.build()) {
            Resource resource = (Resource) result.value();
            byte[] bytes;
            try (var input = resource.getInputStream()) {
                bytes = input.readAllBytes();
            }

            // then
            String json = new String(bytes, StandardCharsets.UTF_8);
            assertThat(json).startsWith("{\"totalCount\":100,\"parkingLots\":[");
            assertThat(json).contains("\"id\":9007199254740993", "\"id\":9007199254741092");
            assertThat(json.split("\\\"score\\\":", -1)).hasSize(101);
            assertThat(resource).isExactlyInstanceOf(InputStreamResource.class);
        }
        }
    }

    private static ViewportMetrics metrics() {
        return new ViewportMetrics(new SimpleMeterRegistry());
    }

    private static ViewportCacheProperties spoolProperties(String reader) {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxRequestBytes(320);
        properties.setReadUsername(reader);
        return properties;
    }

    private static void addSpoolRows(ViewportSpool.Builder builder) {
        for (int index = 0; index < 10; index++) {
            builder.add(item(index));
        }
    }

    private static ViewportCellKey key(long cell) {
        return new ViewportCellKey("test", 1, 1, new ViewportVersion(new UUID(0, 1), 1, 1000, true), cell);
    }

    private static ViewportItem item(long id) {
        return new ViewportItem(id, 37.5, 127, 50, false, true, false, false, false);
    }

    private static ViewportDeadline deadline() {
        return ViewportDeadline.after(Duration.ofSeconds(2));
    }
}
