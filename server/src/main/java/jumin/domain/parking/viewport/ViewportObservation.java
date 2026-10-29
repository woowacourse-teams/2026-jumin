package jumin.domain.parking.viewport;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;

@Slf4j
public class ViewportObservation {

    private final ViewportMetrics metrics;
    private final String requestId = MDC.get("request.id");
    private final AtomicInteger work = new AtomicInteger(1);
    private final AtomicInteger ownSourceSql = new AtomicInteger();
    private final AtomicBoolean finished = new AtomicBoolean();
    private volatile boolean eligible;
    private volatile boolean firstLookupRecorded;
    private volatile boolean firstFullHit;
    private volatile boolean storeBypassed;
    private volatile boolean consumedSource;
    private volatile boolean follower;
    private volatile boolean fallback;
    private volatile boolean retry;
    private volatile boolean success;

    public ViewportObservation(ViewportMetrics metrics) {
        this.metrics = metrics;
    }

    public void eligible() {
        eligible = true;
    }

    public void firstLookup(int targets, int hits) {
        if (!firstLookupRecorded) {
            firstLookupRecorded = true;
            firstFullHit = hits == targets;
            metrics.count("cells", "hit", hits);
            metrics.count("cells", "miss", targets - hits);
        }
    }

    public void firstLookupFailed() {
        // An unsuccessful first lookup has no measurable hit or miss count.
        firstLookupRecorded = true;
        storeBypassed = true;
    }

    public void storeBypassed() {
        storeBypassed = true;
    }

    public void sourceStarted() {
        ownSourceSql.incrementAndGet();
    }

    public void consume(boolean source, boolean shared) {
        consumedSource |= source;
        follower |= source && shared;
    }

    public void fallback() {
        fallback = true;
    }

    public void retry() {
        retry = true;
        metrics.count("requests", "version_retry", 1);
    }

    public void track(CompletableFuture<?> future) {
        work.incrementAndGet();
        CompletableFuture<?> completion = future instanceof ViewportDbFuture<?> db
                ? db.workCompletion() : future;
        completion.whenComplete((value, failure) -> release());
    }

    public void finish(boolean successful) {
        if (finished.compareAndSet(false, true)) {
            success = successful;
            release();
        }
    }

    private void release() {
        if (work.decrementAndGet() != 0) {
            return;
        }
        boolean full = firstFullHit && !fallback && !retry && !storeBypassed && success;
        boolean independent = success && !fallback && ownSourceSql.get() == 0 && !consumedSource;
        metrics.count("logical", eligible ? "eligible" : "ineligible", 1);
        metrics.count("logical", success ? "success" : "failure", 1);
        if (eligible) {
            metrics.count("logical", "full_store_hit_" + full, 1);
            metrics.count("logical", "source_independent_" + independent, 1);
            metrics.count("logical", "no_own_source_sql_" + (ownSourceSql.get() == 0), 1);
            metrics.count("logical", "follower_" + follower, 1);
        }
        if (fallback) {
            metrics.count("logical", "fallback", 1);
        }
        log.atInfo().setMessage("viewport cache request completed")
                .addKeyValue("requestId", requestId)
                .addKeyValue("eligible", eligible).addKeyValue("success", success)
                .addKeyValue("fullStoreHit", full).addKeyValue("sourceIndependent", independent)
                .addKeyValue("ownSourceSql", ownSourceSql.get()).addKeyValue("sourceFollower", follower)
                .addKeyValue("fallback", fallback).addKeyValue("versionRetry", retry)
                .addKeyValue("storeBypassed", storeBypassed).log();
    }
}
