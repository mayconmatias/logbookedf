import React, { useState, useCallback, useMemo } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Image,
  TextInput,
  Keyboard
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMarketplaceProducts } from '@/services/marketplace.service';
import { MarketplaceProduct, ProductType } from '@/types/marketplace';
import { Feather } from '@expo/vector-icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Marketplace'>;

// Tipos de abas para organizar a visualização
type TabType = 'programs' | 'libraries' | 'coach';

export default function MarketplaceScreen({ navigation }: Props) {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados de Controle
  const [activeTab, setActiveTab] = useState<TabType>('programs');
  const [searchText, setSearchText] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Define quais tipos de produto buscar baseado na aba
      let types: ProductType[] = [];

      switch (activeTab) {
        case 'programs':
          types = ['program_user']; // Apenas programas para usuários finais
          break;
        case 'libraries':
          types = ['library_user']; // Apenas bibliotecas para usuários finais
          break;
        case 'coach':
          types = ['template_coach', 'library_coach']; // Tudo que é para Coach
          break;
      }
        
      // @ts-ignore
      const data = await fetchMarketplaceProducts(types);
      setProducts(data);
    } catch (e) { 
      console.log(e); 
    } finally { 
      setLoading(false); 
    }
  }, [activeTab]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Lógica de Filtragem (Busca Local)
  const filteredProducts = useMemo(() => {
    if (!searchText.trim()) return products;
    
    const lowerSearch = searchText.toLowerCase();
    return products.filter(p => 
      p.title.toLowerCase().includes(lowerSearch) || 
      (p.description && p.description.toLowerCase().includes(lowerSearch))
    );
  }, [products, searchText]);

  const renderItem = ({ item }: { item: MarketplaceProduct }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => navigation.navigate('ProductDetails', { product: item })}
      activeOpacity={0.8}
    >
      <View style={styles.imagePlaceholder}>
        {item.cover_image ? (
           <Image source={{uri: item.cover_image}} style={{flex: 1, width: '100%'}} resizeMode="cover" />
        ) : (
           <Feather 
             name={item.product_type.includes('coach') ? "briefcase" : "package"} 
             size={32} 
             color="#CBD5E0" 
           />
        )}
        
        {/* Badges */}
        <View style={styles.badgesContainer}>
          {item.is_owned && (
            <View style={styles.ownedBadge}>
              <Text style={styles.badgeText}>ADQUIRIDO</Text>
            </View>
          )}
          {/* Badge extra para diferenciar na aba de Coach */}
          {activeTab === 'coach' && (
            <View style={[styles.typeBadge, { backgroundColor: item.product_type === 'template_coach' ? '#805AD5' : '#319795' }]}>
              <Text style={styles.badgeText}>
                {item.product_type === 'template_coach' ? 'TEMPLATE' : 'LISTA'}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.cardInfo}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        
        {/* Metadados resumidos no Card */}
        <View style={styles.metaRow}>
           {item.meta_level && <Text style={styles.metaText}>{item.meta_level}</Text>}
           {item.meta_duration && <Text style={styles.metaText}>• {item.meta_duration}</Text>}
        </View>

        <Text style={styles.price}>{item.price > 0 ? `R$ ${item.price}` : 'GRÁTIS'}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      
      {/* HEADER DE BUSCA */}
      <View style={styles.searchHeader}>
        <View style={styles.searchBar}>
          <Feather name="search" size={20} color="#A0AEC0" />
          <TextInput 
            style={styles.searchInput}
            placeholder={
              activeTab === 'coach' ? "Buscar templates, listas..." : 
              activeTab === 'programs' ? "Buscar hipertrofia, emagrecimento..." : 
              "Buscar exercícios..."
            }
            placeholderTextColor="#A0AEC0"
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Feather name="x" size={18} color="#A0AEC0" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ABAS */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === 'programs' && styles.activeTab]} onPress={() => setActiveTab('programs')}>
          <Text style={[styles.tabText, activeTab === 'programs' && styles.activeTabText]}>Programas</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.tab, activeTab === 'libraries' && styles.activeTab]} onPress={() => setActiveTab('libraries')}>
          <Text style={[styles.tabText, activeTab === 'libraries' && styles.activeTabText]}>Bibliotecas</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, styles.coachTab, activeTab === 'coach' && styles.activeCoachTab]} 
          onPress={() => setActiveTab('coach')}
        >
          <Feather name="briefcase" size={14} color={activeTab === 'coach' ? '#FFF' : '#805AD5'} style={{marginRight: 4}} />
          <Text style={[styles.tabText, styles.coachTabText, activeTab === 'coach' && styles.activeTabText]}>Sou Treinador</Text>
        </TouchableOpacity>
      </View>

      {/* LISTA */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#007AFF" />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="search" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>
                {searchText ? `Nenhum resultado para "${searchText}"` : "Nenhum item disponível nesta categoria."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  
  // Search Styles
  searchHeader: { padding: 16, paddingBottom: 8, backgroundColor: '#FFF' },
  searchBar: { 
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#E2E8F0', 
    borderRadius: 12, paddingHorizontal: 12, height: 48 
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16, color: '#2D3748', height: '100%' },

  // Tabs Styles
  tabsContainer: { 
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8, 
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' 
  },
  tab: { 
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, 
    backgroundColor: '#EDF2F7', alignItems: 'center', justifyContent: 'center' 
  },
  activeTab: { backgroundColor: '#007AFF' },
  
  // Estilo específico para a aba de Coach
  coachTab: { backgroundColor: '#FAF5FF', borderWidth: 1, borderColor: '#E9D8FD', flexDirection: 'row' },
  activeCoachTab: { backgroundColor: '#805AD5', borderColor: '#805AD5' },
  coachTabText: { color: '#805AD5' },

  tabText: { fontWeight: '600', color: '#718096', fontSize: 13 },
  activeTabText: { color: '#FFF' },
  
  // Card Styles
  card: { 
    width: '48%', backgroundColor: '#FFF', borderRadius: 12, marginBottom: 16, 
    overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2
  },
  imagePlaceholder: { height: 110, backgroundColor: '#F0F4F8', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  
  badgesContainer: { position: 'absolute', top: 8, right: 8, alignItems: 'flex-end', gap: 4 },
  ownedBadge: { backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },

  cardInfo: { padding: 12 },
  title: { fontSize: 14, fontWeight: '700', color: '#2D3748', marginBottom: 4, height: 36, lineHeight: 18 },
  metaRow: { flexDirection: 'row', marginBottom: 8 },
  metaText: { fontSize: 11, color: '#A0AEC0' },
  price: { fontSize: 13, fontWeight: '700', color: '#38A169' },
  
  emptyContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyText: { textAlign: 'center', marginTop: 16, color: '#A0AEC0', fontSize: 16 }
});