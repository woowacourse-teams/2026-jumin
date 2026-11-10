import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { palette } from '../src/theme/palette';
import { color } from '../src/theme/color';
import { figmaDesign } from './figma';

const meta = {
  title: 'Foundations/Colors',
  parameters: {
    ...figmaDesign('129:2'),
    controls: { disable: true },
    docs: {
      description: {
        component:
          '팔레트와 의미별 색상을 실제 theme 코드에서 읽습니다. Figma의 값은 Design 패널에서 별도로 비교합니다.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const colorEntries = (tokens: Record<string, unknown>, prefix = ''): [string, string][] =>
  Object.entries(tokens).flatMap(([name, value]) => {
    const path = prefix ? `${prefix}.${name}` : name;
    if (typeof value === 'string') return [[path, value] as [string, string]];
    if (value && typeof value === 'object')
      return colorEntries(value as Record<string, unknown>, path);
    return [];
  });

const Swatches = ({ entries }: { entries: [string, string][] }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: 16,
    }}
  >
    {entries.map(([name, value]) => (
      <figure
        key={name}
        style={{
          margin: 0,
          padding: 12,
          border: `1px solid ${color.border.default}`,
          borderRadius: 12,
        }}
      >
        <div
          style={{
            height: 64,
            background: value,
            border: `1px solid ${color.border.default}`,
            borderRadius: 8,
          }}
        />
        <figcaption style={{ marginTop: 12, overflowWrap: 'anywhere' }}>
          <strong>{name}</strong>
          <code style={{ display: 'block', marginTop: 8 }}>{value}</code>
        </figcaption>
      </figure>
    ))}
  </div>
);

export const Palette: Story = {
  render: () => <Swatches entries={Object.entries(palette)} />,
};
export const SemanticAndDomain: Story = {
  parameters: figmaDesign('129:224'),
  render: () => <Swatches entries={colorEntries(color)} />,
};
