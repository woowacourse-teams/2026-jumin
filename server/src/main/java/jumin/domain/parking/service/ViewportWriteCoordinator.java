package jumin.domain.parking.service;

import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.model.ViewportMappingState;
import jumin.domain.parking.repository.ViewportRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ViewportWriteCoordinator {

    private final ViewportRepository mappings;
    private final ViewportCacheProperties properties;

    public ViewportWriteCoordinator(ViewportRepository mappings, ViewportCacheProperties properties) {
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
