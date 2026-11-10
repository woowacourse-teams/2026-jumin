import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import BottomSheet from '../src/shared/components/ui/BottomSheet';
import { Stack } from '../src/shared/components/ui/Stack';
import { color } from '../src/theme/color';
import { figmaDesign } from './figma';

const meta = {
  title: 'Components/BottomSheet',
  component: BottomSheet,
  parameters: figmaDesign('293:243'),
  args: {
    open: true,
    snap: 'medium',
    onSnapChange: fn(),
    children: '핸들을 드래그하거나, 핸들에 초점을 두고 방향키·Home·End를 사용해보세요.',
  },
  argTypes: {
    snap: { control: 'select', options: ['collapsed', 'medium', 'full'] },
    header: { control: false },
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <div
        style={{
          position: 'relative',
          width: 390,
          maxWidth: '100%',
          height: 640,
          background: color.background.brandSubtle,
          overflow: 'hidden',
        }}
      >
        <BottomSheet
          {...args}
          onSnapChange={(snap) => {
            args.onSnapChange(snap);
            updateArgs({ snap });
          }}
        />
      </div>
    );
  },
} satisfies Meta<typeof BottomSheet>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Collapsed: Story = { args: { snap: 'collapsed' } };
export const Medium: Story = {};
export const Full: Story = { args: { snap: 'full' } };
export const Closed: Story = { args: { open: false } };
export const Scrollable: Story = {
  args: {
    snap: 'medium',
    children: (
      <Stack gap={16} style={{ height: '100%', minHeight: 0, overflowY: 'auto' }}>
        {Array.from({ length: 20 }, (_, index) => (
          <p key={index}>스크롤 콘텐츠 {index + 1}</p>
        ))}
      </Stack>
    ),
  },
};
