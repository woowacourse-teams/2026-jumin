package jumin.domain.parking.cache;

import java.util.List;
import java.util.Map;
import jumin.domain.parking.model.ViewportCell;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;

public interface ViewportCellStore extends AutoCloseable {

    static ViewportCellStore disabled() {
        return new ViewportCellStore() {
            @Override
            public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
                return Map.of();
            }

            @Override
            public void putMany(List<ViewportCell> cells, ViewportDeadline deadline) {
            }
        };
    }

    Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline);

    void putMany(List<ViewportCell> cells, ViewportDeadline deadline);

    @Override
    default void close() {
    }
}
