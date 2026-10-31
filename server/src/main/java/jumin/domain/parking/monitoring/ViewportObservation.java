package jumin.domain.parking.monitoring;

import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;

@Slf4j
public class ViewportObservation {

    private final ViewportMetrics metrics;
    private final String requestId = MDC.get("request.id");
    private int ownSourceSql;
    private final AtomicBoolean finished = new AtomicBoolean();
    private boolean eligible;
    private boolean firstLookupRecorded;
    private boolean firstFullHit;
    private boolean storeBypassed;
    private boolean consumedSource;
    private boolean follower;
    private boolean fallback;

    public ViewportObservation(ViewportMetrics metrics) {
        this.metrics = metrics;
    }

    public void eligible() {
        eligible = true;
    }

    public void firstLookup(int targets, int hits) {
        if (firstLookupRecorded) {
            return;
        }
        firstLookupRecorded = true;
        firstFullHit = hits == targets;
        metrics.count("cells", "hit", hits);
        metrics.count("cells", "miss", targets - hits);
    }

    public void firstLookupFailed() {
        firstLookupRecorded = true;
        storeBypassed = true;
    }

    public void storeBypassed() {
        storeBypassed = true;
    }

    public void sourceStarted() {
        ownSourceSql++;
    }

    public void consume(boolean source, boolean shared) {
        consumedSource |= source;
        follower |= source && shared;
    }

    public void fallback() {
        fallback = true;
    }

    public void finish(boolean success) {
        if (!finished.compareAndSet(false, true)) {
            return;
        }
        boolean full = firstFullHit && !fallback && !storeBypassed && success;
        boolean independent = success && !fallback && ownSourceSql == 0 && !consumedSource;
        recordOutcome(success);
        if (eligible) {
            metrics.count("logical", "full_store_hit_" + full, 1);
            metrics.count("logical", "source_independent_" + independent, 1);
            metrics.count("logical", "no_own_source_sql_" + (ownSourceSql == 0), 1);
            metrics.count("logical", "follower_" + follower, 1);
        }
        if (fallback) {
            metrics.count("logical", "fallback", 1);
        }
        log.atInfo().setMessage("viewport cache request completed")
                .addKeyValue("requestId", requestId)
                .addKeyValue("eligible", eligible).addKeyValue("success", success)
                .addKeyValue("fullStoreHit", full).addKeyValue("sourceIndependent", independent)
                .addKeyValue("ownSourceSql", ownSourceSql).addKeyValue("sourceFollower", follower)
                .addKeyValue("fallback", fallback)
                .addKeyValue("storeBypassed", storeBypassed).log();
    }

    private void recordOutcome(boolean success) {
        metrics.count("logical", eligible ? "eligible" : "ineligible", 1);
        metrics.count("logical", success ? "success" : "failure", 1);
    }
}
