package jumin.domain.parking.viewport;

import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;

public record ViewportBounds(double west, double south, double east, double north) {

    public ViewportBounds {
        if (!Double.isFinite(west) || !Double.isFinite(south)
                || !Double.isFinite(east) || !Double.isFinite(north)
                || west < -180 || east > 180 || south <= -90 || north >= 90
                || west >= east || south >= north) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
    }

    public static ViewportBounds from(ParkingLotViewportRequest request) {
        if (request.westLongitude() == null || request.southLatitude() == null
                || request.eastLongitude() == null || request.northLatitude() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
        return new ViewportBounds(request.westLongitude(), request.southLatitude(),
                request.eastLongitude(), request.northLatitude());
    }

    public boolean contains(double latitude, double longitude) {
        return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
    }
}
