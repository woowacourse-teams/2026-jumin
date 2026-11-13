package jumin.domain.parking.dto;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class ParkingLotViewportResponseTest {

    @Test
    @DisplayName("지도 응답은 요청자의 좋아요 상태를 JSON 불리언으로 반환한다")
    void serializes_liked_by_me_as_boolean() {
        // 개인화된 응답과 요청자를 지정하지 않은 기본 응답의 계약을 보호한다.
        ObjectMapper mapper = new ObjectMapper();
        var liked = mapper.valueToTree(new ParkingLotViewportResponse(1L, 37.5, 127.0, 0.5, true));
        var unliked = mapper.valueToTree(new ParkingLotViewportResponse(1L, 37.5, 127.0, 0.5));

        assertThat(liked.get("likedByMe").isBoolean()).isTrue();
        assertThat(liked.get("likedByMe").asBoolean()).isTrue();
        assertThat(unliked.get("likedByMe").isBoolean()).isTrue();
        assertThat(unliked.get("likedByMe").asBoolean()).isFalse();
        assertThat(liked.get("score").asDouble()).isEqualTo(0.5);
    }
}
