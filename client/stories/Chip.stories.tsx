import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import { HiOutlineAdjustmentsHorizontal } from 'react-icons/hi2';
import { Chip } from '../src/shared/components/ui/Chip';
import { figmaDesign } from './figma';

const meta = {
  title: 'Components/Chip',
  component: Chip,
  parameters: figmaDesign('293:358'),
  args: { children: '필터', selected: false, onSelectedChange: fn() },
  argTypes: { icon: { control: false }, className: { control: false } },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <Chip
        {...args}
        onSelectedChange={(selected) => {
          args.onSelectedChange(selected);
          updateArgs({ selected });
        }}
      />
    );
  },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Selected: Story = {
  args: { selected: true },
  parameters: figmaDesign('293:359'),
};
export const WithIcon: Story = { args: { icon: <HiOutlineAdjustmentsHorizontal /> } };
