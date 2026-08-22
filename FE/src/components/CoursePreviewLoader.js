import React from 'react';

const ROUTE_PATH = 'M72 286 C104 262 115 224 145 217 C175 209 169 167 207 163 C240 160 260 126 314 113';

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function Waypoint({ className, x, y, number, finish = false }) {
  return h(
    'g',
    { className: `course-preview-loader-waypoint ${className}` },
    h('circle', {
      cx: x,
      cy: y,
      r: finish ? 20 : number ? 18 : 17,
      fill: '#ffffff',
      stroke: '#d9e6fa',
      strokeWidth: 3,
    }),
    h('circle', {
      cx: x,
      cy: y,
      r: finish ? 12 : number ? 11 : 8,
      fill: '#2465e8',
    }),
    number && h('text', {
      x,
      y: y + 4,
      textAnchor: 'middle',
      fontSize: 10.5,
      fontWeight: 700,
      fill: '#ffffff',
      className: 'course-preview-loader-type',
    }, number),
    finish && h('path', {
      d: 'M310 120V105M311 106C316 103 319 108 324 105V113C319 116 316 111 311 114',
      stroke: '#ffffff',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  );
}

function RailNode({ x, className }) {
  return h(
    'g',
    null,
    h('circle', { cx: x, cy: 466, r: 11, fill: '#ffffff', stroke: '#d8e4f7', strokeWidth: 2 }),
    h('circle', { cx: x, cy: 466, r: 7, fill: '#2465e8', className }),
    h('path', {
      d: `M${x - 3.5} 466L${x - 0.8} 468.7L${x + 4} 463.8`,
      stroke: '#ffffff',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className,
    }),
  );
}

export default function CoursePreviewLoader() {
  return h(
    'div',
    {
      className: 'course-preview-loader-status',
      role: 'status',
      'aria-live': 'polite',
      'aria-busy': true,
    },
    h('span', { className: 'course-preview-loader-announcement' },
      '최적화된 코스를 만들고 있어요. 코스 미리보기를 준비하고 있습니다.',
    ),
    h(
      'svg',
      {
        className: 'course-preview-loader-art',
        viewBox: '0 0 390 560',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': true,
        focusable: false,
      },
      h(
        'defs',
        null,
        h(
          'linearGradient',
          {
            id: 'course-preview-loader-route-blue',
            x1: 74,
            y1: 280,
            x2: 314,
            y2: 112,
            gradientUnits: 'userSpaceOnUse',
          },
          h('stop', { stopColor: '#1f5fd1' }),
          h('stop', { offset: 1, stopColor: '#76a8ff' }),
        ),
        h(
          'linearGradient',
          {
            id: 'course-preview-loader-soft-blue',
            x1: 80,
            y1: 80,
            x2: 310,
            y2: 300,
            gradientUnits: 'userSpaceOnUse',
          },
          h('stop', { stopColor: '#edf4ff' }),
          h('stop', { offset: 1, stopColor: '#f7faff' }),
        ),
        h(
          'filter',
          { id: 'course-preview-loader-dot-glow', x: '-100%', y: '-100%', width: '300%', height: '300%' },
          h('feGaussianBlur', { stdDeviation: 5, result: 'course-preview-loader-blur' }),
          h(
            'feMerge',
            null,
            h('feMergeNode', { in: 'course-preview-loader-blur' }),
            h('feMergeNode', { in: 'SourceGraphic' }),
          ),
        ),
      ),
      h('circle', { cx: 195, cy: 214, r: 145, fill: 'url(#course-preview-loader-soft-blue)' }),
      h('circle', { cx: 91, cy: 121, r: 4, fill: '#c8dafa', className: 'course-preview-loader-spark' }),
      h('circle', { cx: 302, cy: 171, r: 3.5, fill: '#d6e4fc', className: 'course-preview-loader-spark course-preview-loader-spark-delay' }),
      h('circle', { cx: 94, cy: 291, r: 3, fill: '#d6e4fc', className: 'course-preview-loader-spark course-preview-loader-spark-delay' }),
      h('circle', { cx: 286, cy: 298, r: 4, fill: '#c8dafa', className: 'course-preview-loader-spark' }),
      h('path', {
        d: ROUTE_PATH,
        stroke: '#e3ebf8',
        strokeWidth: 14,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
      h('path', {
        pathLength: 1,
        className: 'course-preview-loader-route',
        d: ROUTE_PATH,
        stroke: 'url(#course-preview-loader-route-blue)',
        strokeWidth: 7.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
      h('path', {
        pathLength: 1,
        className: 'course-preview-loader-route course-preview-loader-route-highlight',
        d: ROUTE_PATH,
        stroke: 'rgba(255,255,255,.82)',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
      }),
      h(
        'circle',
        {
          r: 6.5,
          fill: '#ffffff',
          filter: 'url(#course-preview-loader-dot-glow)',
          className: 'course-preview-loader-tracer',
        },
        h('animateMotion', { dur: '9.6s', repeatCount: 'indefinite', path: ROUTE_PATH }),
      ),
      h(Waypoint, { className: 'course-preview-loader-waypoint-start', x: 72, y: 286 }),
      h(Waypoint, { className: 'course-preview-loader-waypoint-one', x: 145, y: 217, number: '1' }),
      h(Waypoint, { className: 'course-preview-loader-waypoint-two', x: 207, y: 163, number: '2' }),
      h(Waypoint, { className: 'course-preview-loader-waypoint-finish', x: 314, y: 113, finish: true }),
      h('circle', {
        cx: 195,
        cy: 214,
        r: 126,
        fill: 'none',
        stroke: '#80afff',
        strokeWidth: 1.5,
        className: 'course-preview-loader-halo',
      }),
      h('text', {
        x: 195,
        y: 383,
        textAnchor: 'middle',
        fontSize: 21,
        fontWeight: 700,
        fill: '#17263d',
        className: 'course-preview-loader-type',
      }, '최적화된 코스를 만들고 있어요'),
      h(
        'g',
        { className: 'course-preview-loader-type', textAnchor: 'middle', fontSize: 14, fill: '#71829c' },
        h('text', { x: 195, y: 414, className: 'course-preview-loader-message course-preview-loader-message-one' }, '장소 사이 이동 시간을 비교하고 있어요'),
        h('text', { x: 195, y: 414, className: 'course-preview-loader-message course-preview-loader-message-two' }, '오르막 부담이 적은 길을 찾고 있어요'),
        h('text', { x: 195, y: 414, className: 'course-preview-loader-message course-preview-loader-message-three' }, '붐비는 시간대를 피해 순서를 조정하고 있어요'),
        h('text', { x: 195, y: 414, className: 'course-preview-loader-message course-preview-loader-message-four' }, '운영시간과 전체 일정을 확인하고 있어요'),
      ),
      h('line', { x1: 86, y1: 466, x2: 194, y2: 466, stroke: '#e3ebf8', strokeWidth: 3, strokeLinecap: 'round' }),
      h('line', { x1: 196, y1: 466, x2: 304, y2: 466, stroke: '#e3ebf8', strokeWidth: 3, strokeLinecap: 'round' }),
      h('line', { x1: 306, y1: 466, x2: 360, y2: 466, stroke: '#e3ebf8', strokeWidth: 3, strokeLinecap: 'round' }),
      h('line', { x1: 86, y1: 466, x2: 194, y2: 466, stroke: '#6d9cf7', strokeWidth: 3, strokeLinecap: 'round', className: 'course-preview-loader-progress-one' }),
      h('line', { x1: 196, y1: 466, x2: 304, y2: 466, stroke: '#6d9cf7', strokeWidth: 3, strokeLinecap: 'round', className: 'course-preview-loader-progress-two' }),
      h('line', { x1: 306, y1: 466, x2: 360, y2: 466, stroke: '#6d9cf7', strokeWidth: 3, strokeLinecap: 'round', className: 'course-preview-loader-progress-three' }),
      h(RailNode, { x: 86, className: 'course-preview-loader-step-one' }),
      h(RailNode, { x: 195, className: 'course-preview-loader-step-two' }),
      h(RailNode, { x: 304, className: 'course-preview-loader-step-three' }),
      h(RailNode, { x: 360, className: 'course-preview-loader-step-four' }),
      h(
        'g',
        { className: 'course-preview-loader-type', fontSize: 12.5, fill: '#52657f', textAnchor: 'middle' },
        h('text', { x: 86, y: 495 }, '빠른 길'),
        h('text', { x: 195, y: 495 }, '편한 길'),
        h('text', { x: 304, y: 495 }, '한적한 길'),
        h('text', { x: 360, y: 495 }, '완성'),
      ),
      h('text', {
        x: 195,
        y: 532,
        textAnchor: 'middle',
        fontSize: 12,
        fill: '#9aa8ba',
        className: 'course-preview-loader-type',
      }, '세 가지 코스를 차례대로 확인하고 있어요'),
    ),
  );
}
