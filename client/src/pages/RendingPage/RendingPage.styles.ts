import { css, injectGlobal } from '@emotion/css';

const applyRendingRootStyles = () => injectGlobal`
  #root:has([data-rending-page]) {
    width: 100%;
    max-width: none;
    height: 100dvh;
    margin: 0;
    border-radius: 0;
  }
`;

applyRendingRootStyles();

export const styles = {
  page: css`
    --rending-primary: #4356d8;
    --rending-ink: #18233d;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
    color: var(--rending-ink);
    background: #fff;
    font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
    word-break: keep-all;

    h1,
    h2,
    p,
    figure {
      margin: 0;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
    button {
      font-family: inherit;
    }
    a:focus-visible,
    button:focus-visible {
      outline: 3px solid #99a6ff;
      outline-offset: 6px;
    }

    @media (prefers-reduced-motion: reduce) {
      scroll-behavior: auto;
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
      }
    }
  `,
  skipLink: css`
    position: absolute;
    top: 12px;
    left: 16px;
    z-index: 5;
    padding: 12px 18px;
    color: #18233d !important;
    background: #fff;
    border-radius: 8px;
    transform: translateY(-180%);
    &:focus {
      transform: translateY(0);
    }
  `,
  hero: css`
    position: relative;
    display: flex;
    min-height: max(700px, 100svh);
    flex-direction: column;
    color: #fff;
    background: #161d25;
    isolation: isolate;

    &::after {
      position: absolute;
      inset: 0;
      z-index: -1;
      content: '';
      background:
        linear-gradient(90deg, rgb(9 17 29 / 84%), rgb(9 17 29 / 42%) 68%, rgb(9 17 29 / 28%)),
        linear-gradient(0deg, rgb(9 17 29 / 28%), transparent 30%);
    }

    @media (max-width: 700px) {
      min-height: max(640px, 100svh);
      &::after {
        background: rgb(9 17 29 / 72%);
      }
    }
  `,
  heroPhoto: css`
    position: absolute;
    inset: 0;
    z-index: -2;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  `,
  header: css`
    display: flex;
    width: min(100% - 112px, 1240px);
    min-height: 100px;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin: 0 auto;
    padding-top: env(safe-area-inset-top, 0px);

    @media (max-width: 700px) {
      width: calc(100% - 48px);
      min-height: 86px;
      gap: 12px;
    }
  `,
  brand: css`
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    font-size: 25px;
    font-weight: 800;
    letter-spacing: -1.1px;
    img {
      filter: brightness(0) invert(1);
    }

    @media (max-width: 700px) {
      gap: 8px;
      font-size: 21px;
      img {
        width: 23px;
        height: 26px;
      }
    }
  `,
  navigation: css`
    display: flex;
    align-items: center;
    gap: 36px;
    font-size: 15px;
    font-weight: 600;
    a {
      padding: 12px 0;
    }
    a:hover {
      color: #c9d0ff;
    }
    span {
      margin-left: 8px;
    }

    @media (max-width: 700px) {
      font-size: 13px;
      a:not(:last-child) {
        display: none;
      }
      span {
        margin-left: 3px;
      }
    }
  `,
  heroContent: css`
    width: min(100% - 112px, 1240px);
    margin: auto;
    padding: 110px 0 150px;
    animation: rending-appear 700ms ease both;

    h1 {
      margin: 24px 0 28px;
      font-size: clamp(44px, 4.7vw, 70px);
      font-weight: 800;
      line-height: 1.23;
      letter-spacing: -2.8px;
    }

    @keyframes rending-appear {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 700px) {
      width: calc(100% - 48px);
      padding: 64px 0 100px;
      h1 {
        margin: 20px 0 22px;
        font-size: clamp(31px, 7.7vw, 50px);
        line-height: 1.3;
        letter-spacing: -1.4px;
      }
    }
  `,
  heroEyebrow: css`
    color: #d6dbed;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.2px;
    @media (max-width: 700px) {
      font-size: 13px;
    }
  `,
  heroDescription: css`
    color: #e0e4ee;
    font-size: 19px;
    line-height: 1.7;
    letter-spacing: -0.4px;
    @media (max-width: 700px) {
      max-width: 300px;
      font-size: 15px;
    }
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 42px;

    @media (max-width: 700px) {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      max-width: 360px;
      margin-top: 32px;
    }
  `,
  button: css`
    display: inline-flex;
    min-height: 62px;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: 0 28px;
    font-size: 16px;
    font-weight: 700;
    border: 1px solid transparent;
    border-radius: 10px;
    cursor: pointer;
    transition:
      background 160ms ease,
      transform 160ms ease;
    span {
      font-size: 21px;
      font-weight: 400;
    }
    &:hover {
      transform: translateY(-2px);
    }
    &:disabled {
      cursor: default;
      transform: none;
    }
    @media (max-width: 700px) {
      min-height: 56px;
      font-size: 15px;
    }
  `,
  primaryButton: css`
    min-width: 250px;
    color: #fff;
    background: var(--rending-primary);
    &:hover {
      background: #3548c8;
    }
  `,
  installButton: css`
    min-width: 190px;
    color: #fff;
    background: rgb(255 255 255 / 8%);
    border-color: rgb(255 255 255 / 65%);
    &:hover {
      background: rgb(255 255 255 / 18%);
    }
    &:disabled {
      color: #e0e4ee;
      border-color: rgb(255 255 255 / 30%);
    }
  `,
  installMessage: css`
    max-width: 450px;
    margin-top: 14px !important;
    color: #fff;
    font-size: 14px;
    line-height: 1.6;
    &:empty {
      display: none;
    }
  `,
  scrollLink: css`
    position: absolute;
    bottom: max(34px, env(safe-area-inset-bottom, 0px));
    left: 50%;
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    color: #e0e4ee !important;
    font-size: 12px;
    transform: translateX(-50%);
    span {
      font-size: 22px;
    }
    @media (max-width: 700px) {
      bottom: max(20px, env(safe-area-inset-bottom, 0px));
    }
  `,
  intro: css`
    max-width: 1240px;
    margin: 0 auto;
    padding: 120px 56px 64px;
    text-align: center;
    h2 {
      margin: 20px 0 24px;
      font-size: clamp(32px, 3.8vw, 48px);
      font-weight: 800;
      line-height: 1.3;
      letter-spacing: -1.8px;
    }
    @media (max-width: 700px) {
      padding: 80px 24px 44px;
    }
  `,
  eyebrow: css`
    color: var(--rending-primary);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.6;
  `,
  description: css`
    color: #667086;
    font-size: 17px;
    line-height: 1.85;
    letter-spacing: -0.4px;
    @media (max-width: 700px) {
      font-size: 15px;
    }
  `,
  features: css`
    max-width: 1240px;
    margin: 0 auto;
    padding: 0 56px 100px;
    @media (max-width: 700px) {
      padding: 0 24px 70px;
    }
  `,
  feature: css`
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 80px;
    padding: 48px 0;

    @media (max-width: 900px) {
      gap: 36px;
    }
    @media (max-width: 700px) {
      grid-template-columns: 1fr;
      gap: 28px;
      padding: 36px 0;
    }
  `,
  reversedFeature: css`
    > div {
      order: 2;
    }
    > figure {
      order: 1;
    }
    @media (max-width: 700px) {
      > div,
      > figure {
        order: initial;
      }
    }
  `,
  featureCopy: css`
    h2 {
      margin: 18px 0 22px;
      font-size: clamp(27px, 2.8vw, 38px);
      font-weight: 800;
      line-height: 1.4;
      letter-spacing: -1.4px;
    }
    > p:last-child {
      max-width: 380px;
    }
    @media (max-width: 700px) {
      h2 {
        margin: 14px 0 16px;
        font-size: 28px;
        letter-spacing: -1px;
      }
    }
  `,
  preview: css`
    display: grid;
    min-height: 460px;
    justify-items: center;
    align-content: center;
    gap: 20px;
    padding: 40px;
    background: #f3f4f9;
    border-radius: 24px;
    img {
      display: block;
      width: min(100%, 280px);
      height: auto;
      border: 6px solid #fff;
      border-radius: 24px;
      box-shadow: 0 16px 32px rgb(24 35 61 / 10%);
    }
    figcaption {
      color: #747d90;
      font-size: 11px;
    }
    @media (max-width: 900px) {
      padding: 28px;
    }
    @media (max-width: 700px) {
      min-height: 380px;
      padding: 32px;
    }
  `,
  closing: css`
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 36px;
    padding: 96px 24px;
    color: #fff;
    background: var(--rending-primary);
    text-align: center;
    h2 {
      font-size: clamp(30px, 3.6vw, 46px);
      font-weight: 800;
      line-height: 1.35;
      letter-spacing: -1.5px;
    }
    @media (max-width: 700px) {
      padding: 72px 24px;
    }
  `,
  closingButton: css`
    color: var(--rending-primary) !important;
    background: #fff;
    &:hover {
      background: #f0f2ff;
    }
  `,
  footer: css`
    display: flex;
    max-width: 1352px;
    align-items: center;
    flex-wrap: wrap;
    gap: 24px;
    margin: 0 auto;
    padding: 44px 56px calc(44px + env(safe-area-inset-bottom, 0px));
    color: #7a8292;
    font-size: 12px;
    > a:last-child {
      margin-left: auto;
      font-size: 11px;
    }
    > a:last-child:hover {
      text-decoration: underline;
    }
    @media (max-width: 700px) {
      align-items: flex-start;
      flex-direction: column;
      gap: 14px;
      padding: 36px 24px calc(36px + env(safe-area-inset-bottom, 0px));
      > a:last-child {
        margin-left: 0;
      }
    }
  `,
  footerBrand: css`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--rending-ink) !important;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.7px;
  `,
};
