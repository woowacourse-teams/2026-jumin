import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { Notice } from '../src/shared/components/ui/Notice';
import { figmaDesign } from './figma';

const meta = {
  title: 'Components/Notice',
  component: Notice,
  parameters: figmaDesign('293:360'),
  args: { children: '안내 문구를 확인해주세요.' },
  argTypes: { className: { control: false } },
} satisfies Meta<typeof Notice>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const LongMessage: Story = {
  args: { children: '내용이 길어지면 문구가 어떻게 줄바꿈되는지 확인할 수 있습니다.' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 280 }}>
        <Story />
      </div>
    ),
  ],
};
