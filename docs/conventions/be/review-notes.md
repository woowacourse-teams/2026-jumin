# 보류·거절 기록

원본 기록에서 해당 영역의 항목을 복사했습니다.

| ID | 이유 |
|---|---|
| RULE-HELD-BOOLEAN-IS | 국소 코드 작성 컨벤션으로 분류되지 않음; PR30에서는 nullable 상태 필드의 is 접두사가 predicate처럼 읽힌다는 이유로 saturdayPaid를 유지했다. PR178에서는 nullable 공영 여부에 is 접두사를 반영했다. 범위가 다른 선택을 전역 명명 규칙으로 합치지 않는다. |
| RULE-HELD-POSITIVE-PREDICATE | 국소 코드 작성 컨벤션으로 분류되지 않음; PR22의 실패형 predicate 제안은 팀 회의 결과 기존 이름 유지로 끝났고, PR133의 긍정형 제안도 analytics_opt_out의 의미를 보존하는 쪽으로 철회됐다. 의미와 관계없이 접두사 방향을 통일하지 않는다. |
| RULE-HELD-WITHDRAWN-DTO-FORMAT | 국소 코드 작성 컨벤션으로 분류되지 않음; PR118의 줄바꿈 지적은 지적자가 잘못 본 것으로 인정하고 철회했다. 이 댓글로 DTO 전체의 서식 규칙을 만들지 않는다. |
