function normalizePlaceIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isSafeInteger)
    .filter((id) => id > 0))];
}

export function defaultAiCourseCandidateSelection(proposal) {
  return normalizePlaceIds(proposal?.candidatePlaceIds);
}

export function aiCourseProposalPlaceIds(proposal) {
  return normalizePlaceIds([
    ...(proposal?.requiredPlaceIds || []),
    ...(proposal?.candidatePlaceIds || []),
  ]);
}

export function missingAiCourseProposalPlaceIds(proposal, places) {
  const knownPlaceIds = new Set(normalizePlaceIds((Array.isArray(places) ? places : [])
    .map((place) => place?.id)));
  return aiCourseProposalPlaceIds(proposal).filter((placeId) => !knownPlaceIds.has(placeId));
}

export function mergeAiGuideRecommendedPlaces(existingPlaces, loadedPlaces) {
  const placesById = new Map();
  for (const place of [...(Array.isArray(existingPlaces) ? existingPlaces : []),
    ...(Array.isArray(loadedPlaces) ? loadedPlaces : [])]) {
    const placeId = Number(place?.id);
    if (Number.isSafeInteger(placeId) && placeId > 0) placesById.set(placeId, place);
  }
  return [...placesById.values()];
}

export function createSelectedAiCourseProposal(proposal, selectedCandidatePlaceIds) {
  if (!proposal) return null;

  const selectedIds = new Set(normalizePlaceIds(selectedCandidatePlaceIds));
  return {
    ...proposal,
    candidatePlaceIds: defaultAiCourseCandidateSelection(proposal)
      .filter((placeId) => selectedIds.has(placeId)),
  };
}

export function resolveAiCourseCandidateSelection(proposal, messageId, selectionState) {
  const candidatePlaceIds = defaultAiCourseCandidateSelection(proposal);
  if (selectionState?.messageId !== messageId) return candidatePlaceIds;

  const selectedIds = new Set(normalizePlaceIds(selectionState?.candidatePlaceIds));
  return candidatePlaceIds.filter((placeId) => selectedIds.has(placeId));
}
