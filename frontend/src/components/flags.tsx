const SUN_RAYS = Array.from({ length: 12 }, (_, index) => index * 30)

export function TaiwanFlag() {
  return (
    <svg
      className="speaker-flag"
      viewBox="0 0 72 48"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="72" height="48" fill="#fe0000" />
      <rect width="36" height="24" fill="#000095" />
      <g fill="#fff">
        {SUN_RAYS.map((rotation) => (
          <path
            key={rotation}
            data-sun-ray=""
            d="M18 1.5 16.7 7.1 19.3 7.1Z"
            transform={`rotate(${rotation} 18 12)`}
          />
        ))}
        <circle cx="18" cy="12" r="5.2" />
      </g>
    </svg>
  )
}

export function IndonesiaFlag() {
  return (
    <svg
      className="speaker-flag"
      viewBox="0 0 3 2"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="3" height="1" fill="#ff0000" />
      <rect y="1" width="3" height="1" fill="#fff" />
    </svg>
  )
}
