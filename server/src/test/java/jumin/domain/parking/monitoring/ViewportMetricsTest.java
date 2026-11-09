package jumin.domain.parking.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportMetricsTest {

    @Test
    @DisplayName("같은 단계의 동시 기록은 기존 타이머 하나에 모이고 다른 단계와 구분된다")
    void repeated_stage_timings_share_the_registered_timer() {
        // given
        var registry = new SimpleMeterRegistry();
        var metrics = new ViewportMetrics(registry);

        // when
        IntStream.range(0, 100).parallel().forEach(ignored -> metrics.time("cache_initial", System.nanoTime()));
        metrics.time("source", System.nanoTime());

        // then
        assertThat(registry.find("parking.viewport.stage").tag("stage", "cache_initial").timers()).hasSize(1);
        assertThat(registry.get("parking.viewport.stage").tag("stage", "cache_initial").timer().count())
                .isEqualTo(100);
        assertThat(registry.get("parking.viewport.stage").tag("stage", "source").timer().count()).isEqualTo(1);
    }

    @Test
    @DisplayName("기존 지표 이름과 stage 태그를 유지하며 현재 자원 사용량을 읽는다")
    void gauges_preserve_names_tags_and_live_values() {
        // given
        var registry = new SimpleMeterRegistry();
        var metrics = new ViewportMetrics(registry);
        var redis = new AtomicInteger();
        var active = new AtomicInteger();
        var queued = new AtomicInteger();
        var source = new AtomicInteger();
        var fallback = new AtomicInteger();
        Map<String, Object> loads = new HashMap<>();
        metrics.registerRedis(redis::get);
        metrics.registerLoader(loads);
        metrics.registerDatabase(active, queued, source, fallback);

        // when
        redis.set(2);
        active.set(4);
        queued.set(5);
        source.set(1);
        fallback.set(3);
        loads.put("cell", new Object());

        // then
        assertThat(registry.get("parking.viewport.redis.active").gauge().value()).isEqualTo(2);
        assertThat(registry.get("parking.viewport.loader.flights").gauge().value()).isEqualTo(1);
        assertThat(registry.get("parking.viewport.db.active").gauge().value()).isEqualTo(4);
        assertThat(registry.get("parking.viewport.db.queued").gauge().value()).isEqualTo(5);
        assertThat(registry.get("parking.viewport.db.pending").gauge().value()).isEqualTo(9);
        assertThat(registry.get("parking.viewport.db.stage.active").tag("stage", "source").gauge().value())
                .isEqualTo(1);
        assertThat(registry.get("parking.viewport.db.stage.active").tag("stage", "viewport").gauge().value())
                .isEqualTo(3);

        // when
        active.set(0);
        queued.set(0);
        loads.clear();

        // then
        assertThat(registry.get("parking.viewport.db.pending").gauge().value()).isZero();
        assertThat(registry.get("parking.viewport.loader.flights").gauge().value()).isZero();
    }
}
