import { useCallback, useState } from 'react';

export const useModal = (initialIsOpen: boolean | (() => boolean) = false) => {
  const [isOpen, setIsOpen] = useState(initialIsOpen);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return { isOpen, open, close };
};
