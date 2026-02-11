import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type TutorialContextType = {
  hasSeenTutorial: (key: string) => boolean;
  markAsSeen: (key: string) => Promise<void>;
  resetTutorials: () => Promise<void>;
  tutorialsActive: boolean;
};

const TutorialContext = createContext<TutorialContextType>({} as TutorialContextType);

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [seenKeys, setSeenKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Carrega chaves salvas ao iniciar
  useEffect(() => {
    loadTutorials();
  }, []);

  const loadTutorials = async () => {
    try {
      const stored = await AsyncStorage.getItem('@logbook_tutorials_seen');
      if (stored) {
        setSeenKeys(new Set(JSON.parse(stored)));
      }
    } catch (e) {
      console.error('Erro ao carregar tutoriais', e);
    } finally {
      setLoading(false);
    }
  };

  const markAsSeen = async (key: string) => {
    const newSet = new Set(seenKeys);
    newSet.add(key);
    setSeenKeys(newSet);
    await AsyncStorage.setItem('@logbook_tutorials_seen', JSON.stringify(Array.from(newSet)));
  };

  const hasSeenTutorial = (key: string) => {
    return seenKeys.has(key);
  };

  const resetTutorials = async () => {
    setSeenKeys(new Set());
    await AsyncStorage.removeItem('@logbook_tutorials_seen');
  };

  return (
    <TutorialContext.Provider value={{ 
      hasSeenTutorial, 
      markAsSeen, 
      resetTutorials,
      tutorialsActive: !loading 
    }}>
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => useContext(TutorialContext);
