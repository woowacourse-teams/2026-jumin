package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportDbSharedDeadlineTest {

    @Test
    @DisplayName("owner timeout은 공유 source를 취소하지 않지만 공유 작업 deadline이 지나면 큐와 follower를 회수한다")
    void shared_source_expires_after_owner_times_out() throws Exception {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setRequestTimeout(Duration.ofSeconds(1));
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ViewportMetrics metrics = new ViewportMetrics(registry);
        CountDownLatch running = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch submitted = new CountDownLatch(1);
        AtomicReference<ViewportDbFuture<Map<ViewportCellKey, ViewportCell>>> source = new AtomicReference<>();
        ViewportCellKey key = new ViewportCellKey("shared-deadline", 1, 1,
                new ViewportVersion(UUID.randomUUID(), 1, 1000, true), 1);

        try (ViewportDbWorkQueue queue = new ViewportDbWorkQueue(1, 0, 1, 1, metrics);
             var threads = Executors.newVirtualThreadPerTaskExecutor();
             ViewportCellLoader loader = new ViewportCellLoader(new NoViewportCellStore(), repository, properties, metrics)) {
            var busy = queue.submit("source", () -> {
                running.countDown();
                release.await();
                return 1;
            });
            assertThat(running.await(5, TimeUnit.SECONDS)).isTrue();
            when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
                ViewportDeadline jobDeadline = invocation.getArgument(1);
                var pending = queue.submit("source", jobDeadline,
                        () -> Map.of(key, new ViewportCell(key, List.of())));
                source.set(pending);
                submitted.countDown();
                return pending;
            });
            var owner = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key), Map.of(),
                    ViewportDeadline.after(Duration.ofMillis(50)), new ViewportObservation(metrics)), threads);
            assertThat(submitted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> owner.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(ViewportUnavailableException.class);
            assertThat(source.get()).isNotCompleted();

            var follower = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key), Map.of(),
                    ViewportDeadline.after(Duration.ofSeconds(5)), new ViewportObservation(metrics)), threads);
            long limit = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (registry.counter("parking.viewport.flights", "outcome", "follower_registered").count() == 0) {
                assertThat(System.nanoTime()).isLessThan(limit);
                Thread.sleep(1);
            }
            assertThatThrownBy(() -> follower.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(ViewportUnavailableException.class)
                    .satisfies(failure -> assertThat(((ViewportUnavailableException) failure.getCause()).getReason())
                            .isEqualTo(ViewportUnavailableException.Reason.DB_DEADLINE));
            assertThat(source.get().workCompletion().get(5, TimeUnit.SECONDS)).isNull();
            assertThat(registry.get("parking.viewport.db.queued").gauge().value()).isZero();
            verify(repository, times(1)).load(anyList(), any(), any());

            var replacement = queue.submit("source", ViewportDeadline.after(Duration.ofSeconds(5)), () -> 3);
            assertThat(replacement).isNotCompleted();
            release.countDown();
            assertThat(busy.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(replacement.get(5, TimeUnit.SECONDS)).isEqualTo(3);
        } finally {
            release.countDown();
        }
    }
}
