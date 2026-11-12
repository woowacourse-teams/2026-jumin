import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { color } from '../src/theme/color';
import { duration, easing } from '../src/theme/motion';
import { radius } from '../src/theme/radius';
import { shadow } from '../src/theme/shadow';
import { typography } from '../src/theme/typography';

const meta = {
  title: 'Foundations/Shape and Motion',
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        component:
          '모서리·그림자·전환 토큰을 실제 theme 코드에서 읽습니다. 전환 예시는 상자에 포인터를 올리거나 포커스를 주면 움직입니다.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 24,
} as const;

const captionStyle = { ...typography.bodySmall, marginTop: 12, color: color.text.secondary };

const Sample = ({ name, value, style }: { name: string; value: string; style: object }) => (
  <figure style={{ margin: 0 }}>
    <div
      style={{
        height: 88,
        background: color.background.default,
        border: `1px solid ${color.border.default}`,
        ...style,
      }}
    />
    <figcaption style={captionStyle}>
      <strong style={{ color: color.text.primary }}>{name}</strong>
      <code style={{ display: 'block', marginTop: 4, overflowWrap: 'anywhere' }}>{value}</code>
    </figcaption>
  </figure>
);

export const Radius: Story = {
  render: () => (
    <div style={gridStyle}>
      {Object.entries(radius).map(([name, value]) => (
        <Sample key={name} name={`radius.${name}`} value={value} style={{ borderRadius: value }} />
      ))}
    </div>
  ),
};

export const Shadow: Story = {
  render: () => (
    <div style={{ ...gridStyle, padding: 32, background: color.background.subtle }}>
      {Object.entries(shadow).map(([name, value]) => (
        <Sample
          key={name}
          name={`shadow.${name}`}
          value={value}
          style={{ border: 0, borderRadius: radius.md, boxShadow: value }}
        />
      ))}
    </div>
  ),
};

export const Motion: Story = {
  render: () => (
    <div style={gridStyle}>
      {Object.entries(duration).flatMap(([durationName, durationValue]) =>
        Object.entries(easing).map(([easingName, easingValue]) => (
          <figure key={`${durationName}-${easingName}`} style={{ margin: 0 }}>
            <button
              type="button"
              aria-label={`${durationName} ${easingName} 전환 예시`}
              className="motion-sample"
              style={{
                display: 'block',
                width: '100%',
                height: 56,
                padding: 0,
                background: color.background.subtle,
                border: 0,
                borderRadius: radius.pill,
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'block',
                  width: 56,
                  height: 56,
                  background: color.background.brand,
                  borderRadius: radius.pill,
                  transition: `transform ${durationValue} ${easingValue}`,
                }}
              />
            </button>
            <figcaption style={captionStyle}>
              <strong style={{ color: color.text.primary }}>
                duration.{durationName} + easing.{easingName}
              </strong>
              <code style={{ display: 'block', marginTop: 4 }}>
                {durationValue} {easingValue}
              </code>
            </figcaption>
          </figure>
        )),
      )}
      <style>{`.motion-sample:hover > span, .motion-sample:focus-visible > span { transform: translateX(calc(100cqw - 56px)); } .motion-sample { container-type: inline-size; }`}</style>
    </div>
  ),
};
