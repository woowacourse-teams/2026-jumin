import Clarity from '@microsoft/clarity';

let initialized = false;

export const initClarity = (projectId: string) => {
  if (!projectId || initialized) return;

  Clarity.init(projectId);
  initialized = true;
};
