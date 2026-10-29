package jumin.domain.parking.viewport;

import java.util.concurrent.CompletableFuture;

final class ViewportDbFuture<T> extends CompletableFuture<T> {

    private final CompletableFuture<Void> workCompletion = new CompletableFuture<>();
    private Runnable cancelQueued = () -> { };

    void onCancel(Runnable cancelQueued) {
        this.cancelQueued = cancelQueued;
    }

    @Override
    public boolean cancel(boolean mayInterruptIfRunning) {
        // A queued job can be removed before its result callbacks run. Running SQL is
        // never interrupted here: its workCompletion remains open until it really exits.
        cancelQueued.run();
        return super.cancel(false);
    }

    CompletableFuture<Void> workCompletion() {
        return workCompletion;
    }
}
