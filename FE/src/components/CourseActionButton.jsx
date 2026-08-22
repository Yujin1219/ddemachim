export default function CourseActionButton({ children, className = '', type = 'button', ...props }) {
  return <button type={type} className={`course-action-button ${className}`.trim()} {...props}>{children}</button>;
}
