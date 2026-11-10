import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { fn } from 'storybook/test';
import { HiOutlineMagnifyingGlass } from 'react-icons/hi2';
import { Button } from '../src/shared/components/ui/Button';
import { Stack } from '../src/shared/components/ui/Stack';
import { figmaDesign } from './figma';

const meta = {
  title: 'Components/Button',
  component: Button,
  parameters: figmaDesign('293:244'),
  args: {
    children: '버튼',
    variant: 'brand',
    size: 'md',
    disabled: false,
    isLoading: false,
    isFullWidth: false,
    onClick: fn(),
  },
  argTypes: {
    variant: { control: 'select', options: ['brand', 'subtle', 'outline', 'ghost'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    icon: { control: false },
    className: { control: false },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Brand: Story = {};
export const Subtle: Story = { args: { variant: 'subtle' } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = { args: { isLoading: true } };
export const FullWidth: Story = { args: { isFullWidth: true } };
export const WithIcon: Story = {
  args: { icon: <HiOutlineMagnifyingGlass size="100%" />, children: '검색' },
};
export const Sizes: Story = {
  render: (args) => (
    <Stack align="start" gap={16}>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <Button {...args} size={size} key={size}>
          {size} 버튼
        </Button>
      ))}
    </Stack>
  ),
};
