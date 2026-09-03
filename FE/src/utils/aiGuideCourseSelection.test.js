import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiCourseProposalPlaceIds,
  createSelectedAiCourseProposal,
  defaultAiCourseCandidateSelection,
  mergeAiGuideRecommendedPlaces,
  missingAiCourseProposalPlaceIds,
  resolveAiCourseCandidateSelection,
} from './aiGuideCourseSelection.js';

test('finds every unique proposal place and only returns details that are still missing', () => {
  const proposal = {
    requiredPlaceIds: [3, '7'],
    candidatePlaceIds: [7, 8, 0, 'invalid'],
  };

  assert.deepEqual(aiCourseProposalPlaceIds(proposal), [3, 7, 8]);
  assert.deepEqual(missingAiCourseProposalPlaceIds(proposal, [{ id: 7 }]), [3, 8]);
});

test('merges newly loaded proposal details without duplicating an existing place', () => {
  assert.deepEqual(mergeAiGuideRecommendedPlaces(
    [{ id: 7, name: '기존 이름' }],
    [{ id: 8, name: '새 장소' }, { id: 7, name: '갱신된 이름' }],
  ), [
    { id: 7, name: '갱신된 이름' },
    { id: 8, name: '새 장소' },
  ]);
});

test('defaults to every valid unique candidate place in the proposal', () => {
  assert.deepEqual(defaultAiCourseCandidateSelection({
    candidatePlaceIds: [12, '7', 12, 0, 'invalid'],
  }), [12, 7]);
});

test('creates a course proposal containing only selected candidate places', () => {
  const proposal = {
    startTime: '10:00',
    availableMinutes: 240,
    requiredPlaceIds: [3],
    candidatePlaceIds: [7, 8, 9],
  };

  assert.deepEqual(createSelectedAiCourseProposal(proposal, [9, 7, 99]), {
    startTime: '10:00',
    availableMinutes: 240,
    requiredPlaceIds: [3],
    candidatePlaceIds: [7, 9],
  });
});

test('uses saved selection only for its proposal message and defaults a new proposal to all candidates', () => {
  const proposal = { candidatePlaceIds: [7, 8, 9] };

  assert.deepEqual(resolveAiCourseCandidateSelection(proposal, 'response-1', {
    messageId: 'response-1',
    candidatePlaceIds: [9, 99],
  }), [9]);
  assert.deepEqual(resolveAiCourseCandidateSelection(proposal, 'response-2', {
    messageId: 'response-1',
    candidatePlaceIds: [9],
  }), [7, 8, 9]);
});
