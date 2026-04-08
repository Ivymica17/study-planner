import metisLogo from '../assets/metis-logo.png';

export default function BrandLogo({
  className = '',
  imageClassName = '',
  showWordmark = true,
  titleClassName = '',
  subtitleClassName = '',
  subtitle = 'Study Planner & Exam Prep'
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <img
        src={metisLogo}
        alt="Metis logo"
        className={`h-14 w-14 rounded-full object-cover shadow-[0_14px_28px_rgba(15,23,42,0.22)] ${imageClassName}`.trim()}
      />
      {showWordmark && (
        <div className="min-w-0">
          <div className={`text-xl font-bold tracking-[0.12em] text-[#1E3A8A] ${titleClassName}`.trim()}>Metis AI</div>
          <div className={`text-xs text-slate-500 ${subtitleClassName}`.trim()}>{subtitle}</div>
        </div>
      )}
    </div>
  );
}
