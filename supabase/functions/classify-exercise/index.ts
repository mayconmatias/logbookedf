import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- WHITELIST DE GRUPOS MUSCULARES ---
const VALID_MUSCLES = [
  'Peito', 'Costas', 'Ombros', 'Quadríceps', 'Posterior', 
  'Glúteos', 'Bíceps', 'Tríceps', 'Panturrilhas', 'Abdômen', 
  'Antebraço', 'Trapézio', 'Adutores', 'Abdutores', 'Cardio', 'Full Body'
];

// Mapa de correção para garantir consistência caso a IA alucine
const TAG_MAPPING: Record<string, string> = {
  'chest': 'Peito', 'peitoral': 'Peito',
  'back': 'Costas', 'dorsal': 'Costas',
  'shoulders': 'Ombros', 'deltoides': 'Ombros', 'ombro': 'Ombros',
  'legs': 'Quadríceps', 'pernas': 'Quadríceps', 'quadriceps': 'Quadríceps',
  'hamstrings': 'Posterior', 'isquiotibiais': 'Posterior',
  'glutes': 'Glúteos', 'bumbum': 'Glúteos',
  'biceps': 'Bíceps', 'arms': 'Bíceps',
  'triceps': 'Tríceps',
  'calves': 'Panturrilhas', 'panturrilha': 'Panturrilhas',
  'abs': 'Abdômen', 'core': 'Abdômen', 'abdominal': 'Abdômen'
};

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text) {
      throw new Error("Texto do exercício não fornecido.");
    }

    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiKey) throw new Error("Chave da OpenAI não configurada.");

    // Prompt Otimizado
    const systemPrompt = `
      Você é um especialista em biomecânica de musculação.
      Sua tarefa é classificar o exercício fornecido identificando APENAS os grupos musculares principais trabalhados.
      
      REGRAS RÍGIDAS:
      1. Retorne APENAS um JSON no formato: {"tags": ["Tag1", "Tag2"]}.
      2. Use APENAS estas tags exatas: ${VALID_MUSCLES.join(', ')}.
      3. Se o exercício for composto (ex: Agachamento), foque no motor primário (ex: Quadríceps) e secundário relevante.
      4. NUNCA retorne tags como "Máquina", "Barra", "Halter", "Isolado", "Composto". Apenas anatomia.
      5. Se não identificar, retorne {"tags": []}.
    `;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo', // Rápido e suficiente para classificação
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Classifique este exercício: "${text}"` }
        ],
        temperature: 0.1, // Baixa criatividade para garantir precisão
      }),
    });

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Falha na resposta da IA.");
    }

    // Parse do JSON da IA
    let parsed;
    try {
      // Tenta limpar caso a IA mande texto extra
      const jsonStr = content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1);
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Erro parse JSON IA:", content);
      parsed = { tags: [] };
    }

    // Sanitização e Validação final (Camada de Segurança)
    let finalTags: string[] = [];
    
    if (parsed.tags && Array.isArray(parsed.tags)) {
      finalTags = parsed.tags.map((t: string) => {
        // Remove acentos e lower case para verificar no mapa
        const normalized = t.toLowerCase().trim();
        
        // 1. Verifica se está no mapa de correção
        if (TAG_MAPPING[normalized]) return TAG_MAPPING[normalized];
        
        // 2. Verifica se já é válido (case insensitive)
        const match = VALID_MUSCLES.find(vm => vm.toLowerCase() === normalized);
        if (match) return match;

        return null;
      }).filter((t: string | null) => t !== null);
    }

    // Remove duplicatas
    finalTags = [...new Set(finalTags)];

    // Retorna a estrutura que o front-end espera
    return new Response(JSON.stringify({
      tags: finalTags,
      standardized_name: text.trim(), // Devolve o nome limpo
      audit: { // Mantém a estrutura para compatibilidade, mas simplificada
        risk_score: 0,
        merit_score: 100,
        red_flags: [],
        green_flags: []
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});