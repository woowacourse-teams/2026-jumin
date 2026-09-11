package jumin.domain.walking.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.walking.repository.WalkingDistanceRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class WalkingDistanceServiceTest {

    private final WalkingDistanceRepository walkingDistanceRepository = mock(WalkingDistanceRepository.class);
    private final WalkingDistanceService service = new WalkingDistanceService(walkingDistanceRepository);

    @Test
    @DisplayName("보행망이 준비되지 않으면 직선거리로 대체하지 않고 명시적인 오류를 반환한다")
    void fails_when_walking_network_is_unavailable() {
        when(walkingDistanceRepository.hasUsableNetwork()).thenReturn(false);

        assertThatThrownBy(() -> service.findDistances(
                37.5665,
                126.9780,
                List.of(mock(ParkingLot.class))
        ))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.WALKING_NETWORK_UNAVAILABLE);
    }
}
