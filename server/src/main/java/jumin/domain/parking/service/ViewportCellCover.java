package jumin.domain.parking.service;

import static jumin.config.ViewportCacheProperties.GRID_SIZE_METERS;
import static jumin.config.ViewportCacheProperties.MAX_CELLS;
import static jumin.config.ViewportCacheProperties.MAX_SPAN_DEGREES;

import java.util.List;
import jumin.domain.parking.model.ViewportBounds;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportItem;
import org.springframework.stereotype.Component;

@Component
public class ViewportCellCover {

    private final ViewportSquareGrid grid;

    public ViewportCellCover(ViewportSquareGrid grid) {
        this.grid = grid;
    }

    public List<Long> cover(ViewportBounds bounds) {
        if (isOutsideCacheRegion(bounds) || exceedsViewportLimits(bounds)) {
            return List.of();
        }
        return grid.cover(bounds, GRID_SIZE_METERS, MAX_CELLS);
    }

    public boolean belongsTo(ViewportItem item, ViewportCellKey key) {
        return grid.cellId(item.latitude(), item.longitude(), key.gridSizeMeters()) == key.cellId();
    }

    private static boolean isOutsideCacheRegion(ViewportBounds bounds) {
        return bounds.west() < 124 || bounds.east() > 132 || bounds.south() < 33 || bounds.north() > 39;
    }

    private boolean exceedsViewportLimits(ViewportBounds bounds) {
        double maximumSpan = MAX_SPAN_DEGREES;
        return bounds.east() - bounds.west() > maximumSpan
                || bounds.north() - bounds.south() > maximumSpan;
    }

}
