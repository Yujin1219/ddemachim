import { createElement as h } from 'react';
import { ArrowRight, Clock3, MapPin } from 'lucide-react';

function formatMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ''}` : `${rest}분`;
}

export default function AiGuideCourseProposal({ proposal, busy = false, onConfirm }) {
  if (!proposal) return null;
  const count = new Set([
    ...(proposal.requiredPlaceIds || []),
    ...(proposal.candidatePlaceIds || []),
  ]).size;
  return h('section', { className: 'ai-guide-course-proposal', 'aria-label': 'AI 추천 코스 생성 확인' },
    h('div', { className: 'ai-guide-course-proposal-meta' },
      h('span', null, h(MapPin, { 'aria-hidden': true, size: 14 }), proposal.startLocation?.name || '출발지'),
      h('span', null, h(Clock3, { 'aria-hidden': true, size: 14 }),
        [proposal.startTime, formatMinutes(proposal.availableMinutes)].filter(Boolean).join(' · ')),
      h('span', null, `${count}곳 후보`),
    ),
    h('p', null, '추천 장소와 조건을 확인했어요. 이대로 코스를 생성할까요?'),
    h('button', {
      className: 'ai-guide-course-confirm',
      type: 'button',
      disabled: busy,
      onClick: onConfirm,
    }, busy ? '코스를 계산하고 있어요…' : '이대로 코스 생성',
    !busy && h(ArrowRight, { 'aria-hidden': true, size: 16, strokeWidth: 2.2 })),
  );
}
