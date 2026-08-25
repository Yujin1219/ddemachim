export const LIVE_TALK_PLACE_OPTIONS = Object.freeze([
  '런던베이글뮤지엄 안국점',
  '도토리가든',
  '국립현대미술관 서울',
  '카페레이어드 안국',
]);

export const INITIAL_LIVE_TALK_MESSAGES = Object.freeze([
  { id: 'talk-1', author: '현우', time: '2분 전', minutesAgo: 2, place: '런던베이글뮤지엄 안국점', text: '지금 대기 20분 정도예요. 생각보다 줄 빨리 빠져요.', kind: 'report' },
  { id: 'talk-2', author: '지민', time: '4분 전', minutesAgo: 4, place: '도토리가든', text: '2인 자리도 지금 바로 들어갈 수 있나요?', kind: 'question' },
  { id: 'talk-3', author: '민서', time: '3분 전', minutesAgo: 3, place: '도토리가든', text: '방금 들어왔는데 2인 자리는 바로 앉았어요.', kind: 'reply', replyTo: '지민' },
  { id: 'talk-4', author: '준호', time: '6분 전', minutesAgo: 6, place: '국립현대미술관 서울', text: '1층 전시는 지금 사람 꽤 적어요.', kind: 'report' },
  { id: 'talk-5', author: '수아', time: '8분 전', minutesAgo: 8, place: '카페레이어드 안국', text: '창가 자리 하나 방금 났어요 👀', kind: 'report' },
  { id: 'talk-6', author: '나', time: '10분 전', minutesAgo: 10, place: '경복궁', text: '광화문 쪽 지금도 많이 붐비나요?', kind: 'question', mine: true },
  { id: 'talk-7', author: '유나', time: '9분 전', minutesAgo: 9, place: '경복궁', text: '단체 관광객 많아요. 건춘문 쪽이 훨씬 여유로워요.', kind: 'reply', replyTo: '나' },
  { id: 'talk-8', author: '재현', time: '12분 전', minutesAgo: 12, place: '아티스트베이커리', text: '소금빵 방금 다시 나왔어요.', kind: 'report' },
  { id: 'talk-9', author: '하은', time: '14분 전', minutesAgo: 14, place: '북촌한옥마을', text: '메인 골목보다 안쪽 골목이 훨씬 한적해요.', kind: 'report' },
]);

export function orderLiveTalkMessages(messages) {
  return [...messages].sort((left, right) => (right.minutesAgo ?? 0) - (left.minutesAgo ?? 0));
}

export function createLiveTalkMessage({ text, place, id = `mine-${Date.now()}` }) {
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  if (!normalizedText) return null;

  return {
    id,
    author: '나',
    time: '방금',
    place: typeof place === 'string' ? place.trim() : '',
    text: normalizedText,
    mine: true,
    kind: 'report',
  };
}
