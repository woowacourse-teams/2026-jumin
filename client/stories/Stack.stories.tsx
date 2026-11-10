import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { Stack } from '../src/shared/components/ui/Stack';
import { Button } from '../src/shared/components/ui/Button';

const meta = {
  title: 'Layout/Stack',
  component: Stack,
  args: {
    gap: 16,
    align: 'start',
    children: (
      <>
        <Button>첫 번째</Button>
        <Button variant="outline">두 번째</Button>
      </>
    ),
  },
  argTypes: {
    as: { control: false },
    children: { control: false },
    className: { control: false },
    align: { control: 'select', options: ['start', 'center', 'end', 'stretch', 'baseline'] },
    justify: { control: 'select', options: ['start', 'center', 'end', 'between'] },
  },
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Stretch: Story = { args: { align: 'stretch' } };
