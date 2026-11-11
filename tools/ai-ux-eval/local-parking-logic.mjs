// 원문 값은 받지 않고 독립 검증기가 산출한 범주와 개수만 유지한다.
export function sanitizeCandidateComparison(value) {
  if (
    !value ||
    value.scope !== 'rendered_full_list' ||
    !Number.isSafeInteger(value.count) ||
    value.count < 0 ||
    value.count > 10000 ||
    typeof value.selectedUnique !== 'boolean'
  )
    return null;
  const metric = (item) => {
    if (
      !item ||
      !Number.isSafeInteger(item.missing) ||
      item.missing < 0 ||
      item.missing > value.count
    )
      return { result: 'unavailable', missing: null, minimumTies: null };
    const enough = value.count >= 2 && value.selectedUnique && item.missing === 0;
    const validTies =
      Number.isSafeInteger(item.minimumTies) &&
      item.minimumTies >= 1 &&
      item.minimumTies <= value.count;
    return {
      result:
        enough && validTies && ['minimum', 'not_minimum'].includes(item.result)
          ? item.result
          : 'unavailable',
      missing: item.missing,
      minimumTies:
        enough && validTies && ['minimum', 'not_minimum'].includes(item.result)
          ? item.minimumTies
          : null,
    };
  };
  return {
    scope: 'rendered_full_list',
    count: value.count,
    selectedUnique: value.selectedUnique,
    fee: metric(value.fee),
    walking: metric(value.walking),
  };
}

// Facts are fixed categories from the same-session verifier; never include names or coordinates.
export function classifyParkingEvidence(facts, scenario = 'local-select-parking') {
  const oneHour = scenario === 'local-one-hour-parking';
  const duration =
    !oneHour && facts?.duration === 'one_hour'
      ? 'other'
      : ['one_hour', 'two_hours', 'other', 'unavailable'].includes(facts?.duration)
        ? facts.duration
        : 'unavailable';
  const searchSelection =
    typeof facts?.searchSelection === 'boolean' ? facts.searchSelection : null;
  const selectedParking =
    typeof facts?.selectedParking === 'boolean' ? facts.selectedParking : null;
  const directionsDialog =
    typeof facts?.directionsDialog === 'boolean' ? facts.directionsDialog : null;
  const screen =
    facts?.knownEarlyScreen === true
      ? 'early'
      : facts?.recommendScreen === true
        ? 'recommend'
        : 'unavailable';
  const evidence = {
    screen,
    duration,
    searchSelection,
    ...(oneHour
      ? {
          destinationMatch:
            facts?.destinationMatch === true &&
            facts?.destinationNameMatch !== false &&
            facts?.destinationAddressMatch !== false
              ? true
              : null,
          destinationNameMatch:
            typeof facts?.destinationNameMatch === 'boolean' ? facts.destinationNameMatch : null,
          destinationAddressMatch:
            typeof facts?.destinationAddressMatch === 'boolean'
              ? facts.destinationAddressMatch
              : null,
          destinationNameKind: ['exact', 'prefix', 'contains', 'different'].includes(
            facts?.destinationNameKind,
          )
            ? facts.destinationNameKind
            : 'unavailable',
        }
      : {}),
    selectedParking,
    directionsDialog,
    preference: 'unavailable',
    comparisonEvidence: 'not_assessed',
    candidateComparison:
      selectedParking === true && directionsDialog === true
        ? sanitizeCandidateComparison(facts?.candidateComparison)
        : null,
  };
  if (duration !== 'unavailable' && duration !== (oneHour ? 'one_hour' : 'two_hours'))
    return {
      verification: 'not_met',
      verificationReason: oneHour ? 'duration_not_one_hour' : 'duration_not_two_hours',
      evidence,
    };
  if (
    facts?.knownEarlyScreen === true ||
    (facts?.recommendScreen === true && directionsDialog === false)
  )
    return { verification: 'not_met', verificationReason: 'task_incomplete', evidence };
  if (
    facts?.recommendScreen === true &&
    duration === (oneHour ? 'one_hour' : 'two_hours') &&
    searchSelection === true &&
    (!oneHour || evidence.destinationMatch === true) &&
    selectedParking === true &&
    directionsDialog === true
  )
    return { verification: 'passed', verificationReason: 'goal_observed', evidence };
  return { verification: 'unavailable', verificationReason: 'insufficient_evidence', evidence };
}
