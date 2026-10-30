package jumin.domain.parking.viewport;

import java.util.List;
import java.util.Objects;

public record ViewportCell(ViewportCellKey key, List<ViewportItem> items) {

    public ViewportCell {
        Objects.requireNonNull(key);
        items = List.copyOf(items);
        for (int index = 1; index < items.size(); index++) {
            if (items.get(index - 1).id() >= items.get(index).id()) {
                throw new IllegalArgumentException("완전한 셀의 주차장 ID는 중복 없이 정렬되어야 합니다.");
            }
        }
    }

    public long estimatedHeapBytes() {
        return estimatedHeapBytes(items.size());
    }

    public static long estimatedHeapBytes(int rows) {
        return 320L + rows * 112L;
    }
}
