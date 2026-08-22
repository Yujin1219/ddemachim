import { createElement } from 'react';

export default function CourseActionButton({ children, className = '', type = 'button', ...props }) {
  return createElement('button', {
    type,
    className: `course-action-button ${className}`.trim(),
    ...props,
  }, children);
}
