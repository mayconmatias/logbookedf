import { Platform } from 'react-native';
import { MusicTrackInfo, MusicProvider } from '../types/music';

// Mock de dados para simular diferentes apps tocando e dados ricos
const MOCK_SCENARIOS: Omit<MusicTrackInfo, 'capturedAt'>[] = [
  {
    track: "Till I Collapse",
    artist: "Eminem",
    album: "The Eminem Show",
    albumArt: "https://i.scdn.co/image/ab67616d0000b2736ca5c90113b30c3c43ffb8f4",
    provider: 'spotify',
    genre: "Hip-Hop",
    bpm: 171,
    year: 2002
  },
  {
    track: "Numb",
    artist: "Linkin Park",
    album: "Meteora",
    albumArt: "https://e-cdns-images.dzcdn.net/images/cover/4d0937a0903333f90278703c3983272e/500x500-000000-80-0-0.jpg",
    provider: 'deezer',
    genre: "Alternative Rock",
    bpm: 110,
    year: 2003
  },
  {
    track: "Believer",
    artist: "Imagine Dragons",
    album: "Evolve",
    albumArt: "https://music.youtube.com/img/W_a3j5X8Q4s/800.jpg", // URL ilustrativa
    provider: 'youtube_music',
    genre: "Pop Rock",
    bpm: 125,
    year: 2017
  },
  {
    track: "Humble",
    artist: "Kendrick Lamar",
    album: "DAMN.",
    albumArt: "https://i.scdn.co/image/ab67616d0000b273d28d2ebdedb220e4797437c7",
    provider: 'spotify',
    genre: "Hip-Hop",
    bpm: 150,
    year: 2017
  },
  {
    track: "Eye of the Tiger",
    artist: "Survivor",
    album: "Eye of the Tiger",
    albumArt: "https://i.scdn.co/image/ab67616d0000b27358d1b4f4c94747970d74067c",
    provider: 'apple_music',
    genre: "Rock",
    bpm: 109,
    year: 1982
  }
];

/**
 * Tenta capturar a música tocando no dispositivo.
 * OBS: No Expo Go, usamos Mock. No Build Nativo, usaremos NativeModules.
 */
export const getCurrentMusicTrack = async (): Promise<MusicTrackInfo | null> => {
  try {
    // TODO: Implementação Nativa Real (Requer Eject/Prebuild)
    // Exemplo lógico futuro:
    // const status = await MusicInfo.getCurrentTrack();
    // return { ...status, provider: detectApp(status.packageName) };

    // --- MOCK ATUAL PARA VALIDAÇÃO DE UI/DB ---
    // Simula 20% de chance de não estar ouvindo nada (silêncio)
    // [DEBUG] Removido temporariamente para o usuário ver a feature funcionando 100% das vezes
    // const isSilence = Math.random() > 0.8;
    // if (isSilence) return null;

    // Escolhe um cenário aleatório
    const random = MOCK_SCENARIOS[Math.floor(Math.random() * MOCK_SCENARIOS.length)];

    console.log(`🎵 Música detectada (${random.provider}):`, random.track);

    return {
      ...random,
      capturedAt: new Date().toISOString()
    };

  } catch (error) {
    console.log('Erro ao ler música:', error);
    return null;
  }
};