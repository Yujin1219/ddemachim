import { createElement as h } from 'react';
import { ArrowRight, Clock3, MapPin } from 'lucide-react';

function formatMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ''}` : `${rest}분`;
}

export default function AiGuideCourseProposal({
  proposal,
  selectedCandidatePlaceIds = [],
  busy = false,
  onConfirm,
}) {
  if (!proposal) return null;
  const requiredPlaceIds = [...new Set((proposal.requiredPlaceIds || []).map(Number)
    .filter(Number.isSafeInteger).filter((placeId) => placeId > 0))];
  const candidatePlaceIds = [...new Set((proposal.candidatePlaceIds || []).map(Number)
    .filter(Number.isSafeInteger).filter((placeId) => placeId > 0))]
    .filter((placeId) => !requiredPlaceIds.includes(placeId));
  const selectedCandidateIds = new Set(selectedCandidatePlaceIds.map(Number));
  const count = requiredPlaceIds.length + candidatePlaceIds.filter((placeId) => selectedCandidateIds.has(placeId)).length;

  return h('section', { className: 'ai-guide-course-proposal', 'aria-label': 'AI 추천 코스 생성 확인' },
    h('div', { className: 'ai-guide-course-proposal-meta' },
      h('span', null, h(MapPin, { 'aria-hidden': true, size: 14 }), proposal.startLocation?.name || '출발지'),
      h('span', null, h(Clock3, { 'aria-hidden': true, size: 14 }),
        [proposal.startTime, formatMinutes(proposal.availableMinutes)].filter(Boolean).join(' · ')),
      h('span', null, `${count}곳 선택`),
    ),
    h('p', null, '위 추천 장소에서 선택한 항목으로 코스를 생성합니다.'),
    h('button', {
      className: 'ai-guide-course-confirm',
      type: 'button',
      disabled: busy || count === 0,
      onClick: onConfirm,
    }, busy ? '코스를 계산하고 있어요…' : `선택한 ${count}곳으로 코스 만들기`,
    !busy && h(ArrowRight, { 'aria-hidden': true, size: 16, strokeWidth: 2.2 })),
  );
}
