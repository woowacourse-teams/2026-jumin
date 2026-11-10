import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import { ToggleButton } from '../src/shared/components/ui/ToggleButton';
import { figmaDesign } from './figma';

const meta = {
  title: 'Components/ToggleButton',
  component: ToggleButton,
  parameters: figmaDesign('293:235'),
  args: { children: '토글 버튼', pressed: false, onPressedChange: fn(), variant: 'outline' },
  argTypes: {
    variant: { control: 'select', options: ['outline'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    icon: { control: false },
    className: { control: false },
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <ToggleButton
        {...args}
        onPressedChange={(pressed) => {
          args.onPressedChange(pressed);
          updateArgs({ pressed });
        }}
      />
    );
  },
} satisfies Meta<typeof ToggleButton>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { parameters: figmaDesign('293:236') };
export const Selected: Story = {
  args: { pressed: true },
  parameters: figmaDesign('293:239'),
};
export const Disabled: Story = { args: { disabled: true } };
