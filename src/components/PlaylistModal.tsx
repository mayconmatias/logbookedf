import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { MusicTrackInfo } from '@/types/music';

interface Props {
    visible: boolean;
    onClose: () => void;
    tracks: MusicTrackInfo[];
}

export const PlaylistModal: React.FC<Props> = ({ visible, onClose, tracks }) => {
    const handlePlay = (track: MusicTrackInfo) => {
        const query = encodeURIComponent(`${track.track} ${track.artist}`);
        let url = '';

        switch (track.provider) {
            case 'spotify':
                url = `spotify:search:${query}`;
                break;
            case 'youtube_music':
                url = `https://music.youtube.com/search?q=${query}`;
                break;
            case 'deezer':
                url = `deezer://www.deezer.com/search/${query}`;
                break;
            case 'apple_music':
                url = `https://music.apple.com/us/search?term=${query}`;
                break;
            default:
                url = `https://www.google.com/search?q=${query}`;
        }

        Linking.openURL(url).catch(err => {
            Linking.openURL(`https://www.google.com/search?q=${query}`);
        });
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Playlist do Treino</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="x" size={24} color="#000" />
                    </TouchableOpacity>
                </View>

                {tracks.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Feather name="music" size={48} color="#CBD5E0" />
                        <Text style={styles.emptyText}>Nenhuma música registrada neste treino ainda.</Text>
                    </View>
                ) : (
                    <FlatList
                        data={tracks}
                        keyExtractor={(item, index) => `${item.capturedAt}-${index}`}
                        contentContainerStyle={styles.list}
                        renderItem={({ item }) => (
                            <View style={styles.trackItem}>
                                {item.albumArt ? (
                                    <Image source={{ uri: item.albumArt }} style={styles.art} />
                                ) : (
                                    <View style={[styles.art, styles.placeholderArt]}>
                                        <Feather name="music" size={20} color="#FFF" />
                                    </View>
                                )}

                                <View style={styles.info}>
                                    <Text style={styles.trackName} numberOfLines={1}>{item.track}</Text>
                                    <Text style={styles.artistName} numberOfLines={1}>{item.artist}</Text>
                                    <View style={styles.metaRow}>
                                        <Feather name={getProviderIcon(item.provider)} size={10} color="#718096" />
                                        <Text style={styles.metaText}>{formatTime(item.capturedAt)}</Text>
                                        {item.bpm && (
                                            <Text style={styles.bpmText}> • {item.bpm} BPM</Text>
                                        )}
                                    </View>
                                </View>

                                <TouchableOpacity style={styles.playBtn} onPress={() => handlePlay(item)}>
                                    <Feather name="external-link" size={20} color="#CBD5E0" />
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
};

const getProviderIcon = (provider: string): any => {
    switch (provider) {
        case 'spotify': return 'headphones'; // Feather doesnt have spotify
        case 'youtube_music': return 'play-circle';
        default: return 'music';
    }
}

const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFF' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#EDF2F7'
    },
    title: { fontSize: 20, fontWeight: 'bold' },
    closeBtn: { padding: 4 },
    list: { padding: 20 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.7 },
    emptyText: { marginTop: 16, fontSize: 16, color: '#718096' },

    trackItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        backgroundColor: '#F7FAFC',
        padding: 10,
        borderRadius: 12
    },
    art: { width: 48, height: 48, borderRadius: 8, marginRight: 12 },
    placeholderArt: { backgroundColor: '#A0AEC0', justifyContent: 'center', alignItems: 'center' },
    info: { flex: 1 },
    trackName: { fontWeight: 'bold', fontSize: 15, color: '#2D3748' },
    artistName: { color: '#718096', fontSize: 13 },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
    metaText: { fontSize: 11, color: '#A0AEC0' },
    bpmText: { fontSize: 11, color: '#1DB954', fontWeight: 'bold' },
    playBtn: { padding: 8 }
});
