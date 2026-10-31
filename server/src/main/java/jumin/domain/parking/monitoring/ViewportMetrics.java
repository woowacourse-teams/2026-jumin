package jumin.domain.parking.monitoring;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntSupplier;
import org.springframework.stereotype.Component;

@Component
public class ViewportMetrics {

    private final MeterRegistry registry;

    public ViewportMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    public void count(String metric, String outcome, double amount) {
        registry.counter("parking.viewport." + metric, "outcome", outcome).increment(amount);
    }

    public void time(String stage, long startedAt) {
        registry.timer("parking.viewport.stage", "stage", stage)
                .record(Math.max(0, System.nanoTime() - startedAt), TimeUnit.NANOSECONDS);
    }

    public void registerRequests(AtomicInteger active, int limit) {
        gauge("requests.active", active::get);
        gauge("requests.limit", () -> limit);
    }

    public void registerLoader(Map<?, ?> loads) {
        gauge("loader.flights", loads::size);
    }

    public void registerRedis(IntSupplier active) {
        gauge("redis.active", active);
    }

    public void registerDatabase(AtomicInteger active, AtomicInteger queued,
                                 AtomicInteger sourceActive, AtomicInteger fallbackActive) {
        gauge("db.active", active::get);
        gauge("db.queued", queued::get);
        gauge("db.pending", () -> active.get() + queued.get());
        Gauge.builder("parking.viewport.db.stage.active", sourceActive, AtomicInteger::get)
                .tag("stage", "source").register(registry);
        Gauge.builder("parking.viewport.db.stage.active", fallbackActive, AtomicInteger::get)
                .tag("stage", "fallback").register(registry);
    }

    private void gauge(String metric, IntSupplier value) {
        Gauge.builder("parking.viewport." + metric, value, IntSupplier::getAsInt)
                .strongReference(true).register(registry);
    }
}
