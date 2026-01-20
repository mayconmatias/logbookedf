import React from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/types/navigation';
import { ExerciseFeedbackModal } from '@/components/ExerciseFeedbackModal';

type Props = NativeStackScreenProps<RootStackParamList, 'ExerciseFeedback'>;

export default function ExerciseFeedbackScreen({ navigation, route }: Props) {
  const { definitionId, exerciseName, userId } = route.params;

  return (
    <View style={styles.container}>
      {/* O Modal é renderizado visível e o onClose volta a navegação */}
      <ExerciseFeedbackModal
        visible={true}
        onClose={() => navigation.goBack()}
        definitionId={definitionId}
        exerciseName={exerciseName}
        userId={userId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent', // Importante para manter o efeito de modal
  },
});