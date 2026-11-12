const allowedParking = ['가람 주차장', '다온 주차장'];

// 확인 가능한 화면과 세션 증거가 없으면 실패로 단정하지 않는다.
export function classifyObservation(scenario, observation) {
  const result = {
    verification: 'unavailable',
    verificationReason: 'insufficient_evidence',
    destinationStatus: 'unavailable',
    searchedDestination: null,
    selectedParking: null,
  };
  if (
    !observation ||
    !observation.destinationKnown ||
    (observation.destination !== null && typeof observation.destination !== 'string')
  )
    return result;
  const destinationStatus =
    observation.destination === null || observation.destination.trim() === ''
      ? 'not_searched'
      : observation.destination === '가상역'
        ? 'matched'
        : 'mismatch';
  result.destinationStatus = destinationStatus;
  result.searchedDestination = destinationStatus === 'matched' ? '가상역' : null;

  if (observation.path === '/' && observation.searchVisible) {
    return {
      ...result,
      verification: 'not_met',
      verificationReason:
        destinationStatus === 'not_searched'
          ? 'destination_not_searched'
          : 'result_screen_not_open',
    };
  }
  if (observation.path !== '/results') return result;
  if (observation.missingVisible && !observation.resultsVisible) {
    if (destinationStatus === 'not_searched') {
      return { ...result, verification: 'not_met', verificationReason: 'destination_not_searched' };
    }
    if (destinationStatus === 'mismatch') {
      return { ...result, verification: 'not_met', verificationReason: 'wrong_destination' };
    }
    return result;
  }
  if (
    destinationStatus !== 'matched' ||
    observation.missingVisible ||
    !observation.resultsVisible ||
    !observation.destinationVisible ||
    !observation.listVisible
  )
    return result;

  if (scenario === 'parking-list') {
    const selected = observation.statusVisible
      ? allowedParking.find((parking) => observation.statusText === `선택 완료: ${parking}`) || null
      : null;
    return {
      ...result,
      verification: 'passed',
      verificationReason: 'goal_observed',
      selectedParking: selected,
    };
  }
  if (scenario !== 'parking-selection' || !observation.statusVisible) return result;
  if (observation.statusText === '아직 선택하지 않았습니다.') {
    return { ...result, verification: 'not_met', verificationReason: 'not_selected' };
  }
  const selected = allowedParking.find(
    (parking) => observation.statusText === `선택 완료: ${parking}`,
  );
  if (!selected) return result;
  return {
    ...result,
    verification: 'passed',
    verificationReason: 'goal_observed',
    selectedParking: selected,
  };
}

// 선호 일치는 선택된 가상 항목과 알려진 속성만 비교한다. 읽기·비교 행동의 증거는 아니다.
export function assessPreference(scenario, persona, verification) {
  const criterion = persona?.criterion || null;
  if (!criterion || scenario.verification !== 'parking-selection') {
    return { status: 'not_applicable', criterion };
  }
  if (
    verification.verification !== 'passed' ||
    !verification.selectedParking ||
    !scenario.preferences?.[criterion]
  ) {
    return { status: 'unavailable', criterion };
  }
  return {
    status:
      scenario.preferences[criterion] === verification.selectedParking ? 'matched' : 'not_matched',
    criterion,
  };
}
