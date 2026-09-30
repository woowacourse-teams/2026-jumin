package jumin.domain.parking.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ParkingReviewRequest(
    @NotNull(message = "주차장 id는 필수입니다")
    Long parkingLotId,
    @Size(max = 500, message = "제보 내용은 최대 500자까지 작성 가능합니다.")
    String detail
){

}
