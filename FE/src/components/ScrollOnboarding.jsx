import { useEffect, useRef } from 'react';
import { animate, createScope } from 'animejs';
import {
  motion,
  useInView,
  useMotionTemplate,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { ArrivalMotion, MapPlacePulse, RouteMotion } from './MotionAssets';

const enterTransition = {
  duration: 0.58,
  ease: [0.23, 1, 0.32, 1],
};

function StorySection({ title, copy, children, reduceMotion, className = '' }) {
  const initial = reduceMotion ? false : { opacity: 0, transform: 'translateY(24px)' };
  const visible = { opacity: 1, transform: 'translateY(0px)' };

  return (
    <motion.section
      className={`story-section ${className}`}
      initial={initial}
      whileInView={visible}
      viewport={{ once: true, amount: 0.24 }}
      transition={enterTransition}
    >
      <div className="story-section-copy">
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      {children}
    </motion.section>
  );
}

export default function ScrollOnboarding({ go }) {
  const scrollRef = useRef(null);
  const sceneRef = useRef(null);
  const animeScope = useRef(null);
  const routeStageRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const routeStageInView = useInView(routeStageRef, { once: true, amount: 0.45, root: scrollRef });
  const { scrollYProgress } = useScroll({ container: scrollRef });
  const softenedProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.55 });
  const heroY = useTransform(softenedProgress, [0, 0.24], ['0%', '12%']);
  const heroScale = useTransform(softenedProgress, [0, 0.24], [1, 1.055]);
  const heroRotateX = useTransform(softenedProgress, [0, 0.24], [0, 5]);
  const heroRotateY = useTransform(softenedProgress, [0, 0.24], [0, -2.5]);
  const heroTransform = useMotionTemplate`perspective(1200px) translateY(${heroY}) scale(${heroScale}) rotateX(${heroRotateX}deg) rotateY(${heroRotateY}deg)`;
  const progressTransform = useMotionTemplate`scaleX(${softenedProgress})`;

  useEffect(() => {
    if (reduceMotion) return undefined;

    animeScope.current = createScope({ root: sceneRef }).add(() => {
      animate('.story-pulse-one', {
        scale: 1.26,
        opacity: 0,
        duration: 1800,
        ease: 'out(4)',
        loop: true,
      });
      animate('.story-pulse-two', {
        scale: 1.26,
        opacity: 0,
        duration: 1800,
        delay: 680,
        ease: 'out(4)',
        loop: true,
      });
    });

    return () => animeScope.current?.revert();
  }, [reduceMotion]);

  const revealInitial = reduceMotion ? false : { opacity: 0, transform: 'translateY(18px)' };
  const revealVisible = { opacity: 1, transform: 'translateY(0px)' };
  const stageInitial = reduceMotion ? false : { opacity: 0, transform: 'perspective(1100px) translateY(26px) rotateX(5deg) rotateY(-2deg) translateZ(-20px) scale(.985)' };
  const stageVisible = { opacity: 1, transform: 'perspective(1100px) translateY(0px) rotateX(0deg) rotateY(0deg) translateZ(0px) scale(1)' };

  return (
    <section className="phone auth-screen story-onboarding-screen" ref={sceneRef}>
      <main className="story-scroll" ref={scrollRef}>
        <header className="story-topbar">
          <strong>때마침</strong>
          <button type="button" onClick={() => go('map')}>건너뛰기</button>
        </header>
        <motion.i className="story-progress" style={{ transform: progressTransform }} aria-hidden="true" />

        <section className="story-hero">
          <motion.div
            className="story-hero-copy"
            initial={revealInitial}
            animate={revealVisible}
            transition={enterTransition}
          >
            <h1>오늘 서울을, 때마침</h1>
            <p>지금 가기 좋은 장소를 발견하고 하루의 흐름으로 자연스럽게 이어드려요.</p>
          </motion.div>
          <motion.div className="story-hero-scene" style={reduceMotion ? undefined : { transform: heroTransform }}>
            <img src="/assets/figma/intro-visual.png" alt="안국동 궁궐 연못 풍경" />
          </motion.div>
          <motion.div className="story-hero-summary" initial={stageInitial} animate={stageVisible} transition={{ ...enterTransition, delay: 0.14 }}>
            <span>오늘의 코스</span>
            <strong>안국에서 성수까지</strong>
            <small>4곳 · 5시간 10분</small>
          </motion.div>
        </section>

        <StorySection
          title={<>지금 눈앞의<br />서울을 먼저 찾아요</>}
          copy="사진과 후기, 운영 정보가 만나는 순간을 모아 지금 가기 좋은 곳부터 보여줘요."
          reduceMotion={reduceMotion}
          className="story-discover"
        >
          <motion.div
            className="story-map-stage"
            initial={stageInitial}
            whileInView={stageVisible}
            viewport={{ once: true, amount: 0.36 }}
            transition={{ ...enterTransition, delay: 0.08 }}
          >
            <img src="/assets/figma/map-background.png" alt="안국동 주변 지도" />
            <span className="story-map-label">안국동 · 내 주변</span>
            <span className="story-pulse story-pulse-one" />
            <span className="story-pulse story-pulse-two" />
            <MapPlacePulse />
            <div className="story-map-place"><b>도토리가든</b><small>도보 8분 · 지금 여유</small></div>
          </motion.div>
        </StorySection>

        <StorySection
          title={<>흩어진 장소를<br />하루의 흐름으로 엮어요</>}
          copy="예약 시간과 운영 마감, 걷는 거리까지 살펴 가장 자연스러운 이동 순서를 만들어요."
          reduceMotion={reduceMotion}
          className="story-route-section"
        >
          <motion.div
            ref={routeStageRef}
            className={`story-route-stage ${routeStageInView ? 'is-route-revealed' : ''}`}
            initial={stageInitial}
            whileInView={stageVisible}
            viewport={{ once: true, amount: 0.34 }}
            transition={{ ...enterTransition, delay: 0.08 }}
          >
            <img src="/assets/figma/navigation-map.png" alt="안국동에서 성수까지 이동 경로 지도" />
            <RouteMotion />
            <i className={`story-route-traveller ${reduceMotion ? 'is-static' : ''}`} aria-hidden="true" />
            <div className="story-route-summary"><span>추천 동선</span><strong>4곳 · 5시간 10분</strong><small>이동 52분 · 걷기 2.4km</small></div>
          </motion.div>
          <div className="story-route-list" aria-label="추천 이동 순서">
            <span><b>1</b>창덕궁 후원</span>
            <i />
            <span><b>2</b>런던 베이글 뮤지엄</span>
            <i />
            <span><b>3</b>블루 모먼트</span>
          </div>
        </StorySection>

        <StorySection
          title={<>도착한 순간부터<br />여행은 더 선명해져요</>}
          copy="혼잡도와 현장 이야기, 촬영 포인트를 먼저 확인하고 나만의 기록으로 남겨보세요."
          reduceMotion={reduceMotion}
          className="story-arrival-section"
        >
          <motion.div
            className="story-arrival-stage"
            initial={stageInitial}
            whileInView={stageVisible}
            viewport={{ once: true, amount: 0.32 }}
            transition={{ ...enterTransition, delay: 0.08 }}
          >
            <img src="/assets/figma/onsite-media.png" alt="운현궁 현장 풍경" />
            <ArrivalMotion />
            <div className="story-arrival-card"><span>위치 확인 완료</span><strong>운현궁에 도착했어요</strong><small>이곳의 이야기와 장면을 열어볼까요?</small></div>
          </motion.div>
        </StorySection>

        <motion.section
          className="story-finish"
          initial={revealInitial}
          whileInView={revealVisible}
          viewport={{ once: true, amount: 0.28 }}
          transition={enterTransition}
        >
          <p>나만의 서울을 만나는 순간</p>
          <h2>걷기 좋은 오늘을<br />지금 시작해요</h2>
          <button type="button" className="story-primary-action" onClick={() => go('login')}>때마침 시작하기</button>
          <button type="button" className="story-secondary-action" onClick={() => go('map')}>먼저 둘러보기</button>
        </motion.section>
      </main>
    </section>
  );
}
