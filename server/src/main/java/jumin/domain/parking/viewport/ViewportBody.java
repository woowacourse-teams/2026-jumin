package jumin.domain.parking.viewport;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

public final class ViewportBody implements AutoCloseable {

    private final Object value;
    private final AtomicBoolean closed = new AtomicBoolean();
    private Consumer<Boolean> completion = ignored -> { };

    public ViewportBody(Object value) {
        this.value = value;
    }

    public Object value() {
        return value;
    }

    public ViewportBody onCompletion(Consumer<Boolean> completion) {
        this.completion = completion;
        return this;
    }

    public void complete(boolean success) {
        if (closed.compareAndSet(false, true)) {
            completion.accept(success);
        }
    }

    @Override
    public void close() {
        complete(false);
    }
}
