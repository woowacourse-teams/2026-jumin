import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-webpack5';
import { fn } from 'storybook/test';
import { Button } from '../src/shared/components/ui/Button';
import { Modal } from '../src/shared/components/ui/Modal';
import { figmaDesign } from './figma';

const meta = {
  title: 'Components/Modal',
  component: Modal,
  parameters: figmaDesign('293:242'),
  args: {
    label: '모달 제목',
    description: '설명 문구가 들어가는 영역입니다.',
    children: '사용처에서 전달한 콘텐츠',
    onClose: fn(),
  },
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>모달 열기</Button>
        {open && (
          <Modal
            {...args}
            onClose={() => {
              args.onClose();
              setOpen(false);
            }}
          />
        )}
      </>
    );
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;
export const WithDescription: Story = {};
export const TitleOnly: Story = { args: { description: undefined } };
