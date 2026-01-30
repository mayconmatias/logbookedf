export type MusicProvider = 'spotify' | 'deezer' | 'youtube_music' | 'apple_music' | 'system';

export interface MusicTrackInfo {
    track: string;
    artist: string;
    album?: string;
    albumArt?: string;
    provider: MusicProvider;
    capturedAt: string; // ISO Date
    genre?: string;
    bpm?: number;
    year?: number;
}
