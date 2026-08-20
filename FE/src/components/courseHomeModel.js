const immutableCourses = (courses) => Object.freeze(
  courses.map((course) => Object.freeze({ ...course })),
);

export const scheduledCourses = immutableCourses([
  {
    id: 'scheduled-anguk-slow-morning',
    title: '안국동 느린 오전',
    dateLabel: '8월 16일 일요일',
    district: '종로구',
    area: '안국·북촌',
    placeCount: 4,
    duration: '3시간 10분',
    image: '/assets/figma/my-map.png',
    status: 'scheduled',
  },
  {
    id: 'scheduled-seongsu-gallery-walk',
    title: '성수 전시와 서울숲',
    dateLabel: '8월 23일 일요일',
    district: '성동구',
    area: '성수동',
    placeCount: 3,
    duration: '2시간 40분',
    image: '/assets/figma/explore-scene.jpeg',
    status: 'scheduled',
  },
]);

export const completedCourses = immutableCourses([
  {
    id: 'completed-seochon-green',
    title: '비 온 뒤 서촌의 초록',
    dateLabel: '8월 9일 일요일',
    district: '종로구',
    area: '서촌·경복궁',
    placeCount: 4,
    duration: '2시간 50분',
    image: '/assets/figma/complete-photo.png',
    status: 'completed',
  },
  {
    id: 'completed-bukchon-gardens',
    title: '북촌 정원과 궁궐 산책',
    dateLabel: '8월 2일 일요일',
    district: '종로구',
    area: '북촌·창덕궁',
    placeCount: 5,
    duration: '4시간 5분',
    image: '/assets/palace-garden.png',
    status: 'completed',
  },
]);

export const publicCourses = immutableCourses([
  {
    id: 'public-garden-and-coffee',
    author: '다정한 산책자',
    title: '정원 사이로 걷는 오후',
    placeCount: 4,
    duration: '3시간 20분',
    image: '/assets/cafe-garden.png',
    places: ['창덕궁', '북촌한옥마을', '카페 어니언 안국', '운현궁'],
  },
  {
    id: 'public-palace-light',
    author: '서울 느린생활',
    title: '궁궐에 머무는 맑은 날',
    placeCount: 3,
    duration: '2시간 30분',
    image: '/assets/palace-garden.png',
    places: ['경복궁', '국립고궁박물관', '통인시장'],
  },
  {
    id: 'public-seochon-film-walk',
    author: '오늘도 걷기',
    title: '서촌 장면을 따라 걷기',
    placeCount: 5,
    duration: '4시간',
    image: '/assets/figma/explore-cafe.jpeg',
    places: ['경복궁', '서촌마을', '대오서점', '이상의집', '통인시장'],
  },
]);
