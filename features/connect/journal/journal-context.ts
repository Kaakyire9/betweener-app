import { createContext, useContext } from 'react';
import type { JournalStore } from './journal-store';
export const JournalContext = createContext<JournalStore | null>(null);
export const JournalStoreProvider = JournalContext.Provider;
export const useJournalStore = () => useContext(JournalContext);
