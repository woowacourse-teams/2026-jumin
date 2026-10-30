package jumin.domain.parking.viewport;

import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class ViewportSquareGrid {

    public static final int MIN_SIZE_METERS = 100;
    public static final int MAX_SIZE_METERS = 20_000;
    private static final double RADIUS = 6_378_137.0;
    private static final double MAX_LATITUDE = 85.0511287798066;

    public boolean supports(double latitude, double longitude) {
        return Double.isFinite(latitude) && Double.isFinite(longitude)
                && latitude >= -MAX_LATITUDE && latitude <= MAX_LATITUDE
                && longitude >= -180 && longitude <= 180;
    }

    public long cellId(double latitude, double longitude, int sizeMeters) {
        validateSize(sizeMeters);
        if (!supports(latitude, longitude)) {
            throw new IllegalArgumentException("사각형 그리드의 지원 좌표가 아닙니다.");
        }
        return encode(column(longitude, sizeMeters), row(latitude, sizeMeters));
    }

    public List<Long> cover(ViewportBounds bounds, int sizeMeters, int maxCells) {
        validateSize(sizeMeters);
        if (maxCells < 1 || maxCells > 256) {
            throw new IllegalArgumentException("사각형 그리드의 셀 개수 한도가 유효하지 않습니다.");
        }
        if (!supports(bounds.south(), bounds.west()) || !supports(bounds.north(), bounds.east())) {
            return List.of();
        }
        int west = column(bounds.west(), sizeMeters);
        int east = column(bounds.east(), sizeMeters);
        int south = row(bounds.south(), sizeMeters);
        int north = row(bounds.north(), sizeMeters);
        long columns = (long) east - west + 1;
        long rows = (long) north - south + 1;
        long count = columns * rows;
        if (columns <= 0 || rows <= 0 || count > maxCells) {
            return List.of();
        }
        return enumerateCells(west, east, south, north, count);
    }

    private static List<Long> enumerateCells(int west, int east, int south, int north, long count) {
        List<Long> cells = new ArrayList<>((int) count);
        for (int x = west; x <= east; x++) {
            for (int y = south; y <= north; y++) {
                cells.add(encode(x, y));
            }
        }
        cells.sort(Long::compare);
        return List.copyOf(cells);
    }

    private static int column(double longitude, int sizeMeters) {
        return (int) StrictMath.floor(RADIUS * StrictMath.toRadians(longitude) / sizeMeters);
    }

    private static int row(double latitude, int sizeMeters) {
        double sine = StrictMath.sin(StrictMath.toRadians(latitude));
        double y = RADIUS * 0.5 * (StrictMath.log1p(sine) - StrictMath.log1p(-sine));
        return (int) StrictMath.floor(y / sizeMeters);
    }

    private static long encode(int column, int row) {
        return ((long) column << 32) | Integer.toUnsignedLong(row);
    }

    private static void validateSize(int sizeMeters) {
        if (sizeMeters < MIN_SIZE_METERS || sizeMeters > MAX_SIZE_METERS) {
            throw new IllegalArgumentException("사각형 그리드 크기는 100~20000 투영 미터여야 합니다.");
        }
    }
}
