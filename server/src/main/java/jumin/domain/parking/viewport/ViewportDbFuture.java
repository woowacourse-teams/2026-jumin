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
        cancelQueued.run();
        return super.cancel(false);
    }

    CompletableFuture<Void> workCompletion() {
        return workCompletion;
    }
}
