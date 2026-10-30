package jumin.domain.parking.viewport;

import java.util.List;
import jumin.config.ViewportCacheProperties;
import org.springframework.stereotype.Component;

@Component
public class ViewportCellCover {

    private final ViewportSquareGrid grid;
    private final ViewportCacheProperties properties;

    public ViewportCellCover(ViewportSquareGrid grid, ViewportCacheProperties properties) {
        this.grid = grid;
        this.properties = properties;
    }

    public List<Long> cover(ViewportBounds bounds) {
        if (isOutsideCacheRegion(bounds) || exceedsViewportLimits(bounds)) {
            return List.of();
        }
        return grid.cover(bounds, properties.getGridSizeMeters(), properties.getMaxCells());
    }

    public boolean belongsTo(ViewportItem item, ViewportCellKey key) {
        return grid.cellId(item.latitude(), item.longitude(), key.gridSizeMeters()) == key.cellId();
    }

    private static boolean isOutsideCacheRegion(ViewportBounds bounds) {
        return bounds.west() < 124 || bounds.east() > 132 || bounds.south() < 33 || bounds.north() > 39;
    }

    private boolean exceedsViewportLimits(ViewportBounds bounds) {
        return bounds.east() - bounds.west() > properties.getMaxWidthDegrees()
                || bounds.north() - bounds.south() > properties.getMaxHeightDegrees();
    }

}
