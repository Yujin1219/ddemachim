import { withBasePath } from '../utils/appPath.js';
const immutableCourses = (courses) => Object.freeze(
  courses.map((course) => Object.freeze({
    ...course,
    places: Array.isArray(course.places)
      ? Object.freeze(course.places.map((place) => Object.freeze({ ...place })))
      : course.places,
    routeCoordinates: Array.isArray(course.routeCoordinates)
      ? Object.freeze(course.routeCoordinates.map((coordinate) => Object.freeze([...coordinate])))
      : course.routeCoordinates,
  })),
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
    image: withBasePath('/assets/figma/my-map.png'),
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
    image: withBasePath('/assets/figma/explore-scene.jpeg'),
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
    image: withBasePath('/assets/figma/complete-photo.png'),
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
    image: withBasePath('/assets/palace-garden.png'),
    status: 'completed',
  },
]);

export const publicCourses = immutableCourses([
  {
    id: 'public-garden-and-coffee',
    visibility: 'PUBLIC',
    author: '다정한 산책자',
    title: '정원 사이로 걷는 오후',
    placeCount: 4,
    duration: '3시간 20분',
    distance: '4.8km',
    places: [
      { name: '창덕궁', category: '궁궐' },
      { name: '북촌한옥마을', category: '산책' },
      { name: '카페 어니언 안국', category: '카페' },
      { name: '운현궁', category: '궁궐' },
    ],
    routeCoordinates: [
      [126.99105, 37.57943],
      [126.98492, 37.58261],
      [126.98618, 37.57748],
      [126.98705, 37.57608],
    ],
  },
  {
    id: 'public-palace-light',
    visibility: 'PUBLIC',
    author: '서울 느린생활',
    title: '궁궐에 머무는 맑은 날',
    placeCount: 3,
    duration: '2시간 30분',
    distance: '3.1km',
    places: [
      { name: '경복궁', category: '궁궐' },
      { name: '국립고궁박물관', category: '전시' },
      { name: '통인시장', category: '시장' },
    ],
    routeCoordinates: [
      [126.97697, 37.57882],
      [126.97498, 37.57665],
      [126.97017, 37.58073],
    ],
  },
  {
    id: 'public-seochon-film-walk',
    visibility: 'PUBLIC',
    author: '오늘도 걷기',
    title: '서촌 장면을 따라 걷기',
    placeCount: 5,
    duration: '4시간',
    distance: '5.6km',
    places: [
      { name: '경복궁', category: '궁궐' },
      { name: '서촌한옥마을', category: '산책' },
      { name: '대오서점', category: '촬영지' },
      { name: '이상의 집', category: '전시' },
      { name: '통인시장', category: '시장' },
    ],
    routeCoordinates: [
      [126.97697, 37.57882],
      [126.97072, 37.57905],
      [126.96961, 37.58066],
      [126.97024, 37.58173],
      [126.97017, 37.58073],
    ],
  },
  {
    id: 'private-night-museum',
    visibility: 'PRIVATE',
    author: '고요한 수집가',
    title: '박물관을 잇는 저녁',
    placeCount: 3,
    duration: '2시간 10분',
    distance: '2.7km',
    places: [
      { name: '국립민속박물관', category: '전시' },
      { name: '서울공예박물관', category: '전시' },
      { name: '운현궁', category: '궁궐' },
    ],
    routeCoordinates: [
      [126.97891, 37.58164],
      [126.98374, 37.57653],
      [126.98705, 37.57608],
    ],
  },
]);

export function visiblePublicCourses(courses = publicCourses) {
  return courses.filter((course) => course.visibility === 'PUBLIC');
}
