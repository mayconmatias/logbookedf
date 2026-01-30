import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface CardioSummary {
    monthly_count: number;
    weekly_avg: number;
    total_km: number;
    total_kcal: number;
    total_minutes: number;
}

export const CardioWidget = ({ summary }: { summary?: CardioSummary }) => {
    if (!summary || summary.monthly_count === 0) return null;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.titleContainer}>
                    <Feather name="wind" size={20} color="#FC4C02" />
                    <Text style={styles.title}>Atividades Cardio (Strava)</Text>
                </View>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>Últimos 30 dias</Text>
                </View>
            </View>

            <View style={styles.grid}>
                <View style={styles.statBox}>
                    <Text style={styles.label}>Frequência</Text>
                    <Text style={styles.value}>{summary.weekly_avg}</Text>
                    <Text style={styles.subLabel}>sessões/sem</Text>
                </View>

                <View style={styles.statBox}>
                    <Text style={styles.label}>Volume Total</Text>
                    <Text style={styles.value}>{summary.total_km}</Text>
                    <Text style={styles.subLabel}>quilômetros</Text>
                </View>

                <View style={styles.statBox}>
                    <Text style={styles.label}>Calorias</Text>
                    <Text style={styles.value}>{Math.round(summary.total_kcal)}</Text>
                    <Text style={styles.subLabel}>kcal estimadas</Text>
                </View>

                <View style={styles.statBox}>
                    <Text style={styles.label}>Tempo Total</Text>
                    <Text style={styles.value}>{summary.total_minutes}</Text>
                    <Text style={styles.subLabel}>minutos ativos</Text>
                </View>
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    Total de {summary.monthly_count} atividades no último mês.
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FFF',
        marginHorizontal: 20,
        marginBottom: 20,
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
    },
    badge: {
        backgroundColor: '#FFF5F2',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#FC4C02',
        textTransform: 'uppercase',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    statBox: {
        flex: 1,
        minWidth: '45%',
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: 12,
    },
    label: {
        fontSize: 12,
        color: '#64748B',
        marginBottom: 4,
    },
    value: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
    },
    subLabel: {
        fontSize: 10,
        color: '#94A3B8',
        marginTop: 2,
    },
    footer: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    footerText: {
        fontSize: 12,
        color: '#64748B',
        textAlign: 'center',
    }
});
