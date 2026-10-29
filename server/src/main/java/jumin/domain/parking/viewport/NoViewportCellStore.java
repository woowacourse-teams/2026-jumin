package jumin.domain.parking.viewport;

import java.util.List;
import java.util.Map;

public class NoViewportCellStore implements ViewportCellStore {

    @Override
    public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
        return Map.of();
    }

    @Override
    public void putMany(List<ViewportCell> cells, ViewportDeadline deadline) {
    }
}
