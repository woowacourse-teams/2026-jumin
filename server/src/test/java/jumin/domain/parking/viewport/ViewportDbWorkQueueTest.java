package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportDbWorkQueueTest {

    @Test
    @DisplayName("원본 worker와 큐가 포화돼도 metadata 예약 용량이 작동하고 전체 동시 작업은 3을 넘지 않는다")
    void reserves_metadata_without_increasing_total_workers() throws Exception {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        CountDownLatch sourceStarted = new CountDownLatch(2);
        CountDownLatch metadataStarted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger active = new AtomicInteger();
        AtomicInteger peak = new AtomicInteger();
        try (ViewportDbWorkQueue queue = new ViewportDbWorkQueue(3, 1, 1, 1, new ViewportMetrics(registry))) {
            Callable<Integer> source = blocked(sourceStarted, release, active, peak);
            var first = queue.submit("source", source);
            var second = queue.submit("source", source);
            assertThat(sourceStarted.await(5, TimeUnit.SECONDS)).isTrue();
            var queuedFallback = queue.submit("fallback", () -> 7);
            var rejectedSource = queue.submit("source", () -> 8);

            assertThatThrownBy(() -> rejectedSource.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(ViewportUnavailableException.class);
            assertThat(registry.get("parking.viewport.db.queued").gauge().value()).isEqualTo(1);
            assertThat(registry.get("parking.viewport.db.stage.queued").tag("stage", "fallback")
                    .gauge().value()).isEqualTo(1);

            var metadata = queue.submit("version", blocked(metadataStarted, release, active, peak));
            assertThat(metadataStarted.await(5, TimeUnit.SECONDS)).isTrue();
            var queuedMetadata = queue.submit("version", () -> 9);
            var rejectedMetadata = queue.submit("version", () -> 10);
            assertThatThrownBy(() -> rejectedMetadata.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(ViewportUnavailableException.class);
            assertThat(peak).hasValue(3);
            assertThat(registry.get("parking.viewport.db.queued").gauge().value()).isEqualTo(2);
            assertThat(registry.get("parking.viewport.db.stage.rejected").tag("stage", "version")
                    .counter().count()).isEqualTo(1);
            release.countDown();
            assertThat(first.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(second.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(metadata.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(queuedFallback.get(5, TimeUnit.SECONDS)).isEqualTo(7);
            assertThat(queuedMetadata.get(5, TimeUnit.SECONDS)).isEqualTo(9);
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("대기 작업 취소는 큐를 즉시 반환하지만 실행 중 작업의 완료 신호는 실제 종료까지 유지한다")
    void cancellation_removes_only_queued_work() throws Exception {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ViewportDbWorkQueue queue = new ViewportDbWorkQueue(1, 1, 1, 1, new ViewportMetrics(registry))) {
            var running = queue.submit("source", () -> {
                started.countDown();
                assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                return 1;
            });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var queued = queue.submit("fallback", ViewportDeadline.after(Duration.ofSeconds(5)), () -> 2);
            assertThat(registry.get("parking.viewport.db.deadline.pending").gauge().value()).isEqualTo(1);
            assertThat(queued.cancel(false)).isTrue();
            assertThat(queued.workCompletion().get(5, TimeUnit.SECONDS)).isNull();
            assertThat(registry.get("parking.viewport.db.queued").gauge().value()).isZero();
            assertThat(registry.get("parking.viewport.db.pending").gauge().value()).isEqualTo(1);
            assertThat(registry.get("parking.viewport.db.deadline.pending").gauge().value()).isZero();
            var replacement = queue.submit("version", () -> 3);
            assertThat(replacement).isNotCompleted();
            assertThat(running.cancel(false)).isTrue();
            assertThat(running.workCompletion()).isNotCompleted();
            assertThat(replacement).isNotCompleted();
            release.countDown();
            assertThat(replacement.get(5, TimeUnit.SECONDS)).isEqualTo(3);
            assertThat(running.workCompletion().get(5, TimeUnit.SECONDS)).isNull();
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("metadata 예약이 0이면 기존처럼 원본과 버전 조회가 같은 bounded worker를 공유한다")
    void zero_reservation_shares_all_workers() throws Exception {
        CountDownLatch started = new CountDownLatch(2);
        CountDownLatch release = new CountDownLatch(1);
        try (ViewportDbWorkQueue queue = new ViewportDbWorkQueue(2, 0, 1, 1,
                new ViewportMetrics(new SimpleMeterRegistry()))) {
            Callable<Integer> source = blocked(started, release, new AtomicInteger(), new AtomicInteger());
            var first = queue.submit("source", source);
            var second = queue.submit("fallback", source);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var metadata = queue.submit("version", () -> 4);
            assertThat(metadata).isNotCompleted();
            assertThatThrownBy(() -> queue.submit("source", () -> 5).get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(ViewportUnavailableException.class);
            release.countDown();
            assertThat(first.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(second.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(metadata.get(5, TimeUnit.SECONDS)).isEqualTo(4);
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("종료와 제출이 경합해도 모든 대기 결과와 작업 완료 신호가 끝난다")
    void close_racing_with_submission_completes_all_queued_futures() throws Exception {
        for (int iteration = 0; iteration < 30; iteration++) {
            CountDownLatch started = new CountDownLatch(1);
            CountDownLatch release = new CountDownLatch(1);
            CountDownLatch race = new CountDownLatch(1);
            SimpleMeterRegistry registry = new SimpleMeterRegistry();
            try (ViewportDbWorkQueue queue = new ViewportDbWorkQueue(1, 0, 8, 8,
                    new ViewportMetrics(registry));
                 var threads = Executors.newVirtualThreadPerTaskExecutor()) {
                var running = queue.submit("source", () -> {
                    started.countDown();
                    try {
                        release.await();
                    } catch (InterruptedException ignored) {
                        // Simulates JDBC work that remains alive after shutdown's interrupt.
                        release.await();
                    }
                    return 1;
                });
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                List<ViewportDbFuture<Integer>> initial = new ArrayList<>();
                for (int index = 0; index < 4; index++) {
                    initial.add(queue.submit("source", ViewportDeadline.after(Duration.ofSeconds(5)), () -> 2));
                }
                CompletableFuture<ViewportDbFuture<Integer>> submitted = CompletableFuture.supplyAsync(() -> {
                    await(race);
                    return queue.submit("version", ViewportDeadline.after(Duration.ofSeconds(5)), () -> 3);
                }, threads);
                CompletableFuture<Void> shutdown = CompletableFuture.runAsync(() -> {
                    await(race);
                    queue.close();
                }, threads);
                race.countDown();
                var racingFuture = submitted.get(5, TimeUnit.SECONDS);
                shutdown.get(5, TimeUnit.SECONDS);
                initial.add(racingFuture);
                for (var queued : initial) {
                    assertThat(queued).isCompletedExceptionally();
                    assertThat(queued.workCompletion().get(5, TimeUnit.SECONDS)).isNull();
                }
                assertThat(running).isCompletedExceptionally();
                assertThat(running.workCompletion()).isNotCompleted();
                assertThat(registry.get("parking.viewport.db.deadline.pending").gauge().value()).isZero();
                release.countDown();
                running.workCompletion().get(5, TimeUnit.SECONDS);
            } finally {
                release.countDown();
            }
        }
    }

    @Test
    @DisplayName("대기 source deadline이 만료되면 큐와 timer를 회수하고 후속 작업을 허용한다")
    void expired_source_releases_queue_without_interrupting_running_work() throws Exception {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicLong remaining = new AtomicLong(TimeUnit.SECONDS.toNanos(5));
        ViewportDeadline runningDeadline = mock(ViewportDeadline.class);
        when(runningDeadline.remainingNanos()).thenAnswer(ignored -> remaining.get());
        try (ViewportDbWorkQueue queue = new ViewportDbWorkQueue(1, 0, 1, 1, new ViewportMetrics(registry))) {
            var running = queue.submit("source", runningDeadline, () -> {
                started.countDown();
                assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                return 1;
            });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var expired = queue.submit("source", ViewportDeadline.after(Duration.ofMillis(50)), () -> 2);
            assertThatThrownBy(() -> expired.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(ViewportUnavailableException.class)
                    .satisfies(failure -> assertThat(((ViewportUnavailableException) failure.getCause()).getReason())
                            .isEqualTo(ViewportUnavailableException.Reason.DB_DEADLINE));
            assertThat(expired.workCompletion().get(5, TimeUnit.SECONDS)).isNull();
            assertThat(registry.get("parking.viewport.db.queued").gauge().value()).isZero();
            assertThat(registry.get("parking.viewport.db.pending").gauge().value()).isEqualTo(1);
            assertThat(registry.get("parking.viewport.db.deadline.pending").gauge().value()).isZero();
            var replacement = queue.submit("version", ViewportDeadline.after(Duration.ofSeconds(5)), () -> 3);
            remaining.set(0);
            assertThat(running).isNotCompleted();
            assertThat(running.workCompletion()).isNotCompleted();
            assertThat(replacement).isNotCompleted();
            release.countDown();
            assertThat(running.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(replacement.get(5, TimeUnit.SECONDS)).isEqualTo(3);
            assertThat(running.workCompletion().get(5, TimeUnit.SECONDS)).isNull();
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("큐 취소의 결과와 작업 완료 콜백이 서로 join해도 교착하지 않는다")
    void queued_cancel_delivers_mutually_waiting_callbacks_without_deadlock() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (ViewportDbWorkQueue queue = new ViewportDbWorkQueue(1, 0, 1, 1,
                new ViewportMetrics(new SimpleMeterRegistry()))) {
            var running = queue.submit("source", () -> {
                started.countDown();
                release.await();
                return 1;
            });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var queued = queue.submit("fallback", ViewportDeadline.after(Duration.ofSeconds(5)), () -> 2);
            CompletableFuture<Void> resultCallback = queued.handle((value, failure) -> {
                queued.workCompletion().join();
                return null;
            });
            CompletableFuture<Void> workCallback = queued.workCompletion().thenRun(() -> {
                try {
                    queued.join();
                } catch (CancellationException expected) {
                    // Both callbacks have observed the other completed signal.
                }
            });
            CompletableFuture<Boolean> cancellation = new CompletableFuture<>();
            Thread.ofVirtual().start(() -> cancellation.complete(queued.cancel(false)));
            assertThat(cancellation.get(5, TimeUnit.SECONDS)).isTrue();
            assertThat(resultCallback.get(5, TimeUnit.SECONDS)).isNull();
            assertThat(workCallback.get(5, TimeUnit.SECONDS)).isNull();
            release.countDown();
            assertThat(running.get(5, TimeUnit.SECONDS)).isEqualTo(1);
        } finally {
            release.countDown();
        }
    }

    private static Callable<Integer> blocked(CountDownLatch started, CountDownLatch release,
                                             AtomicInteger active, AtomicInteger peak) {
        return () -> {
            int current = active.incrementAndGet();
            peak.accumulateAndGet(current, Math::max);
            started.countDown();
            try {
                assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                return 1;
            } finally {
                active.decrementAndGet();
            }
        };
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("test latch timed out");
            }
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(failure);
        }
    }
}
