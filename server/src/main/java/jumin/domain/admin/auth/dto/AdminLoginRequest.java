package jumin.domain.admin.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AdminLoginRequest(
        @NotBlank(message = "관리자 ID는 필수입니다.") String loginId,
        @NotNull(message = "비밀번호는 필수입니다.")
        @Size(min = 1, message = "비밀번호는 필수입니다.") String password
) {
}
