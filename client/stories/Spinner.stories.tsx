import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { Spinner } from '../src/shared/components/ui/Spinner';
import { color } from '../src/theme/color';
import { figmaDesign } from './figma';

const meta = {
  title: 'Components/Spinner',
  component: Spinner,
  parameters: figmaDesign('328:57'),
  args: { size: 'lg', variant: 'brand' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'lg'] },
    variant: { control: 'select', options: ['brand', 'inverse'] },
    className: { control: false },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Small: Story = { args: { size: 'sm' } };
export const Inverse: Story = {
  args: { variant: 'inverse' },
  decorators: [
    (Story) => (
      <div style={{ padding: 24, background: color.background.brand }}>
        <Story />
      </div>
    ),
  ],
};
