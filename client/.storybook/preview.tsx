import { injectGlobal } from '@emotion/css';
import type { Preview } from '@storybook/react-webpack5';
import { applyGlobalStyles } from '../src/shared/styles/globalStyle';
import { color } from '../src/theme/color';

applyGlobalStyles();

// 서비스의 스크롤 잠금·앱 프레임은 문서 화면에 적용하지 않는다.
injectGlobal({
  body: {
    display: 'block',
    overflow: 'auto',
    color: color.text.primary,
    background: color.background.default,
  },
});

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    controls: { matchers: { color: /(background|color)$/i } },
    options: { storySort: { order: ['Foundations', 'Components', 'Layout'] } },
  },
};

export default preview;
