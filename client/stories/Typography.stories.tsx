import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { typography } from '../src/theme/typography';
import { fontSize, fontWeight, lineHeight } from '../src/theme/font';
import { Stack } from '../src/shared/components/ui/Stack';
import { color } from '../src/theme/color';
import { figmaDesign } from './figma';

const meta = {
  title: 'Foundations/Typography',
  parameters: {
    ...figmaDesign('129:454'),
    controls: { disable: true },
    docs: {
      description: {
        component:
          '크기·행간·굵기는 theme 코드를 직접 참조합니다. 글꼴 가족은 현재 토큰에 없으므로 서비스처럼 브라우저에서 상속합니다.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Semantic: Story = {
  render: () => (
    <Stack gap={24}>
      {Object.entries(typography).map(([name, token]) => (
        <section key={name}>
          <code>
            {name} · {token.fontSize} / {token.lineHeight} / {token.fontWeight}
          </code>
          <p style={{ ...token, margin: '8px 0 0', color: color.text.primary }}>
            주차의 민족에서 목적지 주변 주차장을 찾아보세요.
          </p>
        </section>
      ))}
    </Stack>
  ),
};

export const FontSizes: Story = {
  render: () => (
    <Stack gap={16}>
      {Object.entries(fontSize).map(([px, value]) => (
        <p key={px} style={{ fontSize: value, margin: 0 }}>
          {px}px ({value}) · 글자 크기
        </p>
      ))}
    </Stack>
  ),
};

export const LineHeights: Story = {
  render: () => (
    <Stack gap={24}>
      {Object.entries(lineHeight).map(([percent, value]) => (
        <section key={percent}>
          <code>
            {percent}% ({value})
          </code>
          <p
            style={{
              fontSize: fontSize[16],
              lineHeight: value,
              margin: '8px 0 0',
              background: color.background.brandSubtle,
            }}
          >
            첫 번째 줄의 안내 문구입니다.
            <br />두 번째 줄의 안내 문구입니다.
            <br />세 번째 줄에서 행간을 비교해보세요.
          </p>
        </section>
      ))}
    </Stack>
  ),
};

export const FontWeights: Story = {
  render: () => (
    <Stack gap={16}>
      {Object.entries(fontWeight).map(([name, value]) => (
        <p key={name} style={{ fontWeight: value, fontSize: fontSize[18], margin: 0 }}>
          {name} · 글자 굵기를 비교해보세요.
        </p>
      ))}
    </Stack>
  ),
};
