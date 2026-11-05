package jumin.domain.parking.service;

import static jumin.config.ViewportCacheProperties.GRID_SIZE_METERS;

import jumin.domain.parking.model.ViewportMappingState;
import jumin.domain.parking.repository.ViewportRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ViewportWriteCoordinator {

    private final ViewportRepository mappings;

    public ViewportWriteCoordinator(ViewportRepository mappings) {
        this.mappings = mappings;
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
        boolean valid = mappings.repairAndVerify(GRID_SIZE_METERS);
        return mappings.publishState(GRID_SIZE_METERS, valid);
    }
}
