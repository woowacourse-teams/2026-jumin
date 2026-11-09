<!-- review-to-conventions:RULE-CONV-OPTIONAL-NEWLINE:begin -->
# 조회 뒤 Optional 처리는 다음 줄에 쓰기

조회 호출 뒤 줄을 나눠 Optional 후처리를 이어 쓴다.

- 범위: 서버 Repository 조회와 바로 이어지는 Optional 후처리
- 상태: 후보 · 논의 제안 · 구현 반영

**설명용 예시**

변경 전

```java
var operation = repository.findById(id).orElse(null);
```

변경 후

```java
var operation = repository.findById(id)
        .orElse(null);
```

근거: 같은 메서드 안의 조회 코드 모양을 맞추고 조회와 부재 처리를 구분한다. (추론)

- 한계: 리뷰의 제안과 구현은 확인했지만 팀 전체의 모든 체이닝 규칙으로 합의한 것은 확인하지 못했다.

출처: [PR36](https://github.com/woowacourse-teams/2026-jumin/pull/36#discussion_r3829362101) · [dbe8f238](https://github.com/woowacourse-teams/2026-jumin/commit/dbe8f23828324835fc2ce6b8e0ee7d13d43bf3b9) · [PR36·2](https://github.com/woowacourse-teams/2026-jumin/blob/c48d582641c2a34f4586cb40f97befa0620f083f/server/src/main/java/jumin/domain/parking/service/ParkingLotDetailService.java#L32)
<!-- review-to-conventions:RULE-CONV-OPTIONAL-NEWLINE:end -->
