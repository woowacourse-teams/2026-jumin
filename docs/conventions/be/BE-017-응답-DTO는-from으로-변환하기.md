<!-- review-to-conventions:RULE-CONV-RESPONSE-DTO-FROM:begin -->
# 응답 DTO는 from으로 변환하기

응답 DTO의 필드 매핑은 DTO의 정적 팩토리 `from()`에 모으고 호출부에서 사용한다. 팩토리의 매개변수는 실제 변환 입력에 맞춘다.

- 범위: 서버 Java 응답 DTO와 그 생성 호출부
- 상태: 사용자 명시 채택

**설명용 예시**

변경 전

```java
new ParkingLotViewportResponse(item.id(), item.latitude(), item.longitude(),
        scores.calculate(item.capacity()));
```

변경 후

```java
ParkingLotViewportResponse.from(item, scores.calculate(item.capacity()));
```

```java
public static ParkingLotViewportResponse from(ViewportItem item, double score) {
    return new ParkingLotViewportResponse(
            item.id(),
            item.latitude(),
            item.longitude(),
            score
    );
}
```

근거: DB 직접 조회와 캐시 조회에서 반복되던 응답 필드 매핑을 한곳에서 관리한다. 점수 계산은 기존 협력 객체에서 수행하고 계산한 값을 전달한다.

- 한계: 사용하지 않는 엔티티용 팩토리를 복원하거나 별도 팩토리 클래스를 만들 필요는 없다.

출처: [PR401](https://github.com/woowacourse-teams/2026-jumin/pull/401#discussion_r4489141255) · 사용자 명시 채택
<!-- review-to-conventions:RULE-CONV-RESPONSE-DTO-FROM:end -->
