package jumin.domain.parking.viewport;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

@Component
public class ViewportMetrics {

    private final MeterRegistry registry;
    private final Map<String, Timer> timers = new ConcurrentHashMap<>();

    public ViewportMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    public void count(String metric, String outcome, double amount) {
        registry.counter("parking.viewport." + metric, "outcome", outcome).increment(amount);
    }

    public void time(String stage, long startedAt) {
        timers.computeIfAbsent(stage, key -> registry.timer("parking.viewport.stage", "stage", key))
                .record(Math.max(0, System.nanoTime() - startedAt), TimeUnit.NANOSECONDS);
    }

    public MeterRegistry registry() {
        return registry;
    }
}
