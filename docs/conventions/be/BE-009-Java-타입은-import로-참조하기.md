<!-- review-to-conventions:RULE-CONV-JAVA-IMPORT:begin -->
# Java 타입은 import로 참조하기

타입을 import하고 코드 본문에서는 단순 타입명으로 참조한다.

- 범위: 서버 Java 구현과 테스트의 타입 참조
- 상태: 후보 · 논의 동의 · 구현 반영

**설명용 예시**

변경 전

```java
var values = java.util.List.of("A", "B");
```

변경 후

```java
import java.util.List;

var values = List.of("A", "B");
```

근거: 긴 패키지 경로를 호출부에서 덜어 코드의 타입과 동작을 읽기 쉽게 한다. (추론)

- 반례·반론: PR118의 제보 서비스 테스트에는 org.mockito.ArgumentMatchers.any() 완전명 호출도 있었다. 허용 예외로 동의한 근거는 없고, 이 역사적 파일은 고정 최종 트리에서 같은 경로로 찾지 못했다.
- 한계: 동일한 단순 이름의 타입이 충돌할 때의 처리 방식은 이 리뷰들에서 정하지 않았다.

출처: [PR66](https://github.com/woowacourse-teams/2026-jumin/pull/66#discussion_r3910858661) · [PR66·2](https://github.com/woowacourse-teams/2026-jumin/pull/66#discussion_r3911457115) · [PR118](https://github.com/woowacourse-teams/2026-jumin/blob/edb0487c08d6216877b6c3c8fcc6e7397338210d/server%2Fsrc%2Ftest%2Fjava%2Fjumin%2Fdomain%2Fparking%2Fservice%2FParkingReviewServiceTest.java)
<!-- review-to-conventions:RULE-CONV-JAVA-IMPORT:end -->
