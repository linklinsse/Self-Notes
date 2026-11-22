import { useEffect, useState, useSyncExternalStore } from 'react';
import type { NoteBase } from '../../api/types';
import { DraftController, type NoteSaver } from './draft';

/** Bind a DraftController to a component: autosave, save on hide/leave, adopt newer server versions. */
export function useDraft(server: NoteBase, saver: NoteSaver) {
  const [ctrl] = useState(() => new DraftController(server, saver));
  const state = useSyncExternalStore(ctrl.subscribe, ctrl.getState);

  useEffect(() => {
    ctrl.activate();
    return () => ctrl.dispose();
  }, [ctrl]);

  useEffect(() => {
    ctrl.receiveServer(server);
  }, [ctrl, server]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void ctrl.save();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (ctrl.isDirty()) {
        void ctrl.save();
        e.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [ctrl]);

  return { state, ctrl };
}
