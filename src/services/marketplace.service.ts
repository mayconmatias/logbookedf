import { supabase } from '@/lib/supabaseClient';
import { MarketplaceProduct, ProductType } from '@/types/marketplace';

export const fetchMarketplaceProducts = async (typeFilter?: ProductType[]): Promise<MarketplaceProduct[]> => {
  let query = supabase
    .from('marketplace_products')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (typeFilter && typeFilter.length > 0) {
    query = query.in('product_type', typeFilter);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Verifica o que o usuário já comprou para marcar "is_owned"
  const { data: purchases } = await supabase.from('user_purchases').select('product_id').eq('user_id', (await supabase.auth.getUser()).data.user?.id);
  const ownedIds = new Set(purchases?.map(p => p.product_id));

  return data.map((item: any) => ({
    ...item,
    is_owned: ownedIds.has(item.id)
  }));
};

export const purchaseProduct = async (productId: string) => {
  const { data, error } = await supabase.rpc('purchase_marketplace_item', {
    p_product_id: productId
  });

  if (error) throw error;
  return data;
};