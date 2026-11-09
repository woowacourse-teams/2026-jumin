package jumin.domain.parking.model;

import jumin.domain.parking.service.ViewportSquareGrid;

public record ViewportMappingState(int gridSizeMeters, boolean ready) {

    public ViewportMappingState {
        if (gridSizeMeters < ViewportSquareGrid.MIN_SIZE_METERS
                || gridSizeMeters > ViewportSquareGrid.MAX_SIZE_METERS) {
            throw new IllegalArgumentException("viewport 격자 크기가 유효하지 않습니다.");
        }
    }
}
