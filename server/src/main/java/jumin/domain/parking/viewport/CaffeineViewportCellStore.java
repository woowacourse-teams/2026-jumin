package jumin.domain.parking.viewport;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Expiry;
import com.github.benmanes.caffeine.cache.Scheduler;
import com.github.benmanes.caffeine.cache.Ticker;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.FunctionCounter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.DoubleSupplier;
import jumin.config.ViewportCacheProperties;

public class CaffeineViewportCellStore implements ViewportCellStore {

    private final Cache<ViewportCellKey, ViewportCell> cache;
    private final ViewportCacheProperties properties;
    private final ViewportCellCodec codec;
    private final ViewportMetrics metrics;

    public CaffeineViewportCellStore(ViewportCacheProperties properties, ViewportCellCodec codec,
                                     ViewportMetrics metrics) {
        this(properties, codec, metrics, Ticker.systemTicker(), () -> ThreadLocalRandom.current().nextDouble());
    }

    CaffeineViewportCellStore(ViewportCacheProperties properties, ViewportCellCodec codec,
                              ViewportMetrics metrics, Ticker ticker, DoubleSupplier random) {
        this.properties = properties;
        this.codec = codec;
        this.metrics = metrics;
        cache = Caffeine.newBuilder().maximumWeight(properties.getMaximumWeight())
                .weigher((ViewportCellKey key, ViewportCell cell) -> Math.toIntExact(cell.estimatedHeapBytes()))
                .ticker(ticker).scheduler(Scheduler.systemScheduler())
                .expireAfter(new Expiry<ViewportCellKey, ViewportCell>() {
                    @Override
                    public long expireAfterCreate(ViewportCellKey key, ViewportCell cell, long currentTime) {
                        return lifetime(cell);
                    }

                    @Override
                    public long expireAfterUpdate(ViewportCellKey key, ViewportCell cell, long currentTime,
                                                  long currentDuration) {
                        return lifetime(cell);
                    }

                    @Override
                    public long expireAfterRead(ViewportCellKey key, ViewportCell cell, long currentTime,
                                                long currentDuration) {
                        return currentDuration;
                    }

                    private long lifetime(ViewportCell cell) {
                        long base = (cell.items().isEmpty() ? properties.getEmptyTtl() : properties.getTtl()).toNanos();
                        return Math.max(1, (long) (base * (1 + (random.getAsDouble() * 2 - 1)
                                * properties.getTtlJitter())));
                    }
                }).recordStats().build();
        Gauge.builder("parking.viewport.cache.entries", cache, Cache::estimatedSize).register(metrics.registry());
        Gauge.builder("parking.viewport.cache.estimated_weight", cache,
                value -> value.policy().eviction().orElseThrow().weightedSize().orElse(0))
                .register(metrics.registry());
        FunctionCounter.builder("parking.viewport.cache.evictions", cache, value -> value.stats().evictionCount())
                .register(metrics.registry());
        FunctionCounter.builder("parking.viewport.cache.eviction_weight", cache, value -> value.stats().evictionWeight())
                .register(metrics.registry());
        FunctionCounter.builder("parking.viewport.cache.internal_hit", cache, value -> value.stats().hitCount())
                .register(metrics.registry());
        FunctionCounter.builder("parking.viewport.cache.internal_miss", cache, value -> value.stats().missCount())
                .register(metrics.registry());
    }

    @Override
    public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
        deadline.requireRemaining();
        if (keys.size() > properties.getMaxCells()) {
            throw new ViewportStoreBudgetException("cache batch key 한도를 초과했습니다.");
        }
        long bytes = 0;
        Map<ViewportCellKey, ViewportCell> result = new LinkedHashMap<>();
        for (ViewportCellKey key : keys) {
            ViewportCell value = cache.getIfPresent(key);
            if (value != null) {
                bytes += value.estimatedHeapBytes();
                if (bytes > properties.getMaxRequestBytes()) {
                    throw new ViewportStoreBudgetException("cache batch byte 한도를 초과했습니다.");
                }
                result.put(key, value);
            }
        }
        return Map.copyOf(result);
    }

    @Override
    public void putMany(List<ViewportCell> cells, ViewportDeadline deadline) {
        deadline.requireRemaining();
        if (cells.size() > properties.getMaxCells()) {
            throw new ViewportStoreBudgetException("cache 저장 batch 한도를 초과했습니다.");
        }
        if (cells.stream().mapToLong(ViewportCell::estimatedHeapBytes).sum() > properties.getMaxRequestBytes()) {
            throw new ViewportStoreBudgetException("cache 저장 batch byte 한도를 초과했습니다.");
        }
        for (ViewportCell cell : cells) {
            if (cell.items().size() <= properties.getMaxCellRows()
                    && codec.encodedSize(cell) <= properties.getMaxValueBytes()
                    && cell.estimatedHeapBytes() <= properties.getMaxRequestBytes()
                    && cell.estimatedHeapBytes() <= properties.getMaximumWeight()) {
                cache.put(cell.key(), cell);
            } else {
                metrics.count("store", "oversize_skipped", 1);
            }
        }
    }

    void cleanUp() {
        cache.cleanUp();
    }

    @Override
    public void close() {
        cache.invalidateAll();
        cache.cleanUp();
    }
}
