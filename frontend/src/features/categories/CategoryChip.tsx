import { readableTextOn } from '../../themes/contrast';

/** CAT-2: the chip text switches between black and white to stay readable on the category color. */
export function CategoryChip({ name, color, small }: { name: string; color: string; small?: boolean }) {
  return (
    <span className={`chip ${small ? 'chip-small' : ''}`} style={{ background: color, color: readableTextOn(color) }}>
      {name}
    </span>
  );
}

export function ColorDot({ color }: { color: string }) {
  return <span className="color-dot" style={{ background: color }} aria-hidden />;
}
