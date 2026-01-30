import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    cancelAnimation
} from 'react-native-reanimated';

interface Props {
    text: string;
    style?: any;
}

export const MusicMarquee: React.FC<Props> = ({ text, style }) => {
    const [textWidth, setTextWidth] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);
    const translateX = useSharedValue(0);

    useEffect(() => {
        if (textWidth > containerWidth && containerWidth > 0) {
            // Pequeno reset antes de começar
            translateX.value = 0;

            const duration = 10000; // 10 segundos para rolar

            translateX.value = withRepeat(
                withTiming(-textWidth, {
                    duration: duration,
                    easing: Easing.linear,
                }),
                -1, // Infinito
                false // Reinicia do 0
            );
        } else {
            cancelAnimation(translateX);
            translateX.value = 0;
        }
    }, [textWidth, containerWidth, text]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: translateX.value }],
        };
    });

    return (
        <View
            style={[styles.container, style]}
            onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
        >
            <View style={{ flexDirection: 'row' }}>
                <Animated.Text
                    style={[styles.text, style, animatedStyle]}
                    numberOfLines={1}
                    onLayout={(e: LayoutChangeEvent) => setTextWidth(e.nativeEvent.layout.width)}
                >
                    {text} {textWidth > containerWidth ? `   ${text}   ` : ''}
                </Animated.Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
        width: '100%',
    },
    text: {
        // Estilos base devem vir via prop 'style', mas garantimos nowrap
    }
});
