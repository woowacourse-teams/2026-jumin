package jumin.domain.parking.viewport;

import jumin.config.ViewportCacheProperties;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ViewportWriteCoordinator {

    private final ViewportMappingRepository mappings;
    private final ViewportCacheProperties properties;

    public ViewportWriteCoordinator(ViewportMappingRepository mappings, ViewportCacheProperties properties) {
        this.mappings = mappings;
        this.properties = properties;
    }

    public ViewportMappingState beforeSourceWrite() {
        return mappings.lockForWrite();
    }

    public void afterSourceWrite(ViewportMappingState previous) {
        if (!previous.ready()) {
            return;
        }
        boolean valid = mappings.repairAndVerify(previous.gridSizeMeters());
        mappings.publishState(previous.gridSizeMeters(), valid);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ViewportMappingState prepare() {
        mappings.lockForWrite();
        boolean valid = mappings.repairAndVerify(properties.getGridSizeMeters());
        return mappings.publishState(properties.getGridSizeMeters(), valid);
    }
}
