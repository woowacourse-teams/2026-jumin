package jumin.domain.parking.viewport;

import java.util.List;
import java.util.Map;

public interface ViewportCellStore extends AutoCloseable {

    Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline);

    void putMany(List<ViewportCell> cells, ViewportDeadline deadline);

    @Override
    default void close() {
    }
}
