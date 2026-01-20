// src/types/marketplace.ts

export type ProductType = 'program_user' | 'library_user' | 'template_coach' | 'library_coach';

export interface MarketplaceProduct {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  price: number;
  product_type: ProductType;
  
  // Metadados
  meta_duration?: string;   // "45 min"
  meta_equipment?: string;  // "Halteres"
  meta_level?: string;      // "Iniciante"
  
  // Controle
  linked_program_id?: string;
  linked_library_id?: string;
  
  // UI Auxiliar (calculado no front ou join)
  is_owned?: boolean;
}