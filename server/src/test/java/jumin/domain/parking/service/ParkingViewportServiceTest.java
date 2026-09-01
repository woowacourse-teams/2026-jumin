package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import jumin.domain.parking.dto.ParkingViewportRequest;
import jumin.domain.parking.dto.ParkingViewportResponse;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ParkingViewportServiceTest {

    private ParkingLotRepository parkingLotRepository;
    private ParkingViewportService service;

    @BeforeEach
    void setUp() {
        parkingLotRepository = mock(ParkingLotRepository.class);
        service = new ParkingViewportService(parkingLotRepository);
    }

    @Test
    @DisplayName("viewport 주차장을 marker용 응답으로 변환한다")
    void maps_parking_lots_to_viewport_response() {
        // given
        ParkingLot parkingLot = mock(ParkingLot.class);
        when(parkingLot.getId()).thenReturn(1L);
        when(parkingLot.getName()).thenReturn("시청 주차장");
        when(parkingLot.getAddress()).thenReturn("서울특별시 중구 세종대로 110");
        when(parkingLot.getLatitude()).thenReturn(37.5665);
        when(parkingLot.getLongitude()).thenReturn(126.9780);
        when(parkingLotRepository.findActiveWithinViewport(
                126.9700,
                37.5600,
                126.9900,
                37.5750
        )).thenReturn(List.of(parkingLot));

        // when
        ParkingViewportResponse result = service.search(new ParkingViewportRequest(
                126.9700,
                37.5600,
                126.9900,
                37.5750
        ));

        // then
        assertThat(result.totalCount()).isEqualTo(1);
        assertThat(result.parkingLots()).hasSize(1);
        assertThat(result.parkingLots().getFirst().name()).isEqualTo("시청 주차장");
        assertThat(result.parkingLots().getFirst().location().latitude()).isEqualTo(37.5665);
    }

    @Test
    @DisplayName("서쪽 경도가 동쪽 경도보다 크면 DB를 호출하지 않고 400 오류를 반환한다")
    void rejects_reversed_longitude_bounds() {
        // given
        ParkingViewportRequest request = new ParkingViewportRequest(
                126.9900,
                37.5600,
                126.9700,
                37.5750
        );

        // when & then
        assertThatThrownBy(() -> service.search(request))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        verifyNoInteractions(parkingLotRepository);
    }

    @Test
    @DisplayName("북쪽 위도가 남쪽 위도보다 작으면 DB를 호출하지 않고 400 오류를 반환한다")
    void rejects_reversed_latitude_bounds() {
        // given
        ParkingViewportRequest request = new ParkingViewportRequest(
                126.9700,
                37.5750,
                126.9900,
                37.5600
        );

        // when & then
        assertThatThrownBy(() -> service.search(request))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        verifyNoInteractions(parkingLotRepository);
    }
}
