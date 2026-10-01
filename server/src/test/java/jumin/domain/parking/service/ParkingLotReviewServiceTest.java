package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import jumin.domain.parking.dto.ParkingReviewRequest;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingLotReview;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.domain.parking.repository.ParkingLotReviewRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class ParkingLotReviewServiceTest {

    private final ParkingLotReviewRepository parkingLotReviewRepository = mock(ParkingLotReviewRepository.class);
    private final ParkingLotRepository parkingLotRepository = mock(ParkingLotRepository.class);
    private ParkingLotReviewService parkingLotReviewService;

    @BeforeEach
    void setUp() {
        parkingLotReviewService = new ParkingLotReviewService(parkingLotReviewRepository, parkingLotRepository);
    }

    @Test
    @DisplayName("활성 주차장에 제보를 연결해 저장한다")
    void saves_review_for_active_parking_lot() {
        ParkingLot parkingLot = mock(ParkingLot.class);
        when(parkingLotRepository.findActiveById(123L)).thenReturn(Optional.of(parkingLot));

        parkingLotReviewService.create(new ParkingReviewRequest(123L, null));

        ArgumentCaptor<ParkingLotReview> reviewCaptor = ArgumentCaptor.forClass(ParkingLotReview.class);
        verify(parkingLotReviewRepository).save(reviewCaptor.capture());
        assertThat(reviewCaptor.getValue().getParkingLot()).isSameAs(parkingLot);
        assertThat(reviewCaptor.getValue().getDetail()).isNull();
    }

    @Test
    @DisplayName("주차장이 없거나 비활성이면 404용 예외를 던지고 저장하지 않는다")
    void does_not_save_review_when_parking_lot_is_not_active() {
        when(parkingLotRepository.findActiveById(123L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> parkingLotReviewService.create(new ParkingReviewRequest(123L, null)))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.PARKING_LOT_NOT_FOUND);
        verify(parkingLotReviewRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }
}
