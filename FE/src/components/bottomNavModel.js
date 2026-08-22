export const bottomNavItems = [
  { id: 'map', label: '지도' },
  { id: 'explore', label: '탐색' },
  { id: 'assistant', label: 'AI 가이드' },
  { id: 'course', label: '코스' },
  { id: 'my', label: 'MY' },
];

export function getBottomNavActiveIndex(active) {
  const index = bottomNavItems.findIndex((item) => item.id === active);
  return index < 0 ? 0 : index;
}

export function getBottomNavNotchCenter(index) {
  return (index * 200) + 100;
}
